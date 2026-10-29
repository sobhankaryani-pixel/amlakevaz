#!/usr/bin/env python3
"""Database-only encrypted S3 backups. Never reads or copies media objects.

Run from GitHub Actions. Credentials/passwords are environment-only. The encrypted
format is versioned: magic + salt(16) + nonce(12) + AES-256-GCM ciphertext + tag(16).
The entire header is authenticated; plaintext is not used until tag verification.
"""
import argparse
import hashlib
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
from uuid import uuid4

import boto3
import psycopg
from botocore.config import Config
from botocore.exceptions import ClientError
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

MAGIC = b'EVDBBK01'
HEADER_SIZE = len(MAGIC) + 28
CHUNK = 1024 * 1024
KEY_PATTERN = r'database/evaz-db-\d{8}T\d{12}Z-[0-9a-f]{32}\.dump\.enc'


class BackupError(Exception):
    """Only fixed, non-sensitive codes are printed to CI logs."""


def required(name):
    value = os.getenv(name, '').strip()
    if not value:
        raise BackupError('missing_' + name)
    return value


def options():
    endpoint = required('S3_ENDPOINT_URL').rstrip('/')
    url = urlsplit(endpoint)
    if not (url.scheme == 'https' and url.hostname and not url.username and not url.password
            and not url.query and not url.fragment and url.path in ('', '/')):
        raise BackupError('invalid_s3_endpoint')
    bucket = required('BACKUP_S3_BUCKET')
    if bucket == os.getenv('S3_BUCKET', 'evazmelk-media').strip():
        raise BackupError('backup_bucket_must_differ_from_media_bucket')
    password = required('BACKUP_ENCRYPTION_PASSWORD')
    if len(password) < 40:
        raise BackupError('backup_password_requires_40_characters')
    keep = int(os.getenv('BACKUP_KEEP', '7'))
    maximum = int(os.getenv('BACKUP_MAX_BYTES', str(100 * 1024 * 1024)))
    if not 1 <= keep <= 30 or not 1024 <= maximum <= 1024 * 1024 * 1024:
        raise BackupError('invalid_retention_or_size_limit')
    client = boto3.client('s3', endpoint_url=endpoint,
                          aws_access_key_id=required('S3_ACCESS_KEY_ID'),
                          aws_secret_access_key=required('S3_SECRET_ACCESS_KEY'),
                          region_name=os.getenv('S3_REGION', 'us-east-1'),
                          config=Config(signature_version='s3v4', s3={'addressing_style': 'path'},
                                        request_checksum_calculation='when_required',
                                        response_checksum_validation='when_required',
                                        connect_timeout=10, read_timeout=60,
                                        retries={'mode': 'standard', 'total_max_attempts': 3}))
    return client, bucket, password, keep, maximum


def pg_environment(dsn):
    parsed = urlsplit(dsn)
    if parsed.scheme not in ('postgres', 'postgresql') or not parsed.hostname or not parsed.path.lstrip('/'):
        raise BackupError('invalid_database_url')
    env = os.environ.copy()
    env.update(PGHOST=parsed.hostname, PGPORT=str(parsed.port or 5432),
               PGUSER=unquote(parsed.username or ''), PGPASSWORD=unquote(parsed.password or ''),
               PGDATABASE=unquote(parsed.path.lstrip('/')), PGCONNECT_TIMEOUT='20', PGSSLMODE='require')
    query = parse_qs(parsed.query)
    for key in ('sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'channel_binding'):
        if key in query:
            env['PG' + key.upper()] = query[key][0]
    return env


def pg_run(args, dsn):
    result = subprocess.run(args, env=pg_environment(dsn), stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=1200)
    if result.returncode:
        raise BackupError('postgres_command_failed_check_client_version_and_connection')
    return result


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        while block := source.read(CHUNK):
            value.update(block)
    return value.hexdigest()


def derive(password, salt):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt,
                      iterations=600000).derive(password.encode('utf-8'))


def encrypt(source, target, password):
    salt, nonce = os.urandom(16), os.urandom(12)
    header = MAGIC + salt + nonce
    cipher = Cipher(algorithms.AES(derive(password, salt)), modes.GCM(nonce)).encryptor()
    cipher.authenticate_additional_data(header)
    with source.open('rb') as src, target.open('xb') as out:
        target.chmod(0o600)
        out.write(header)
        while block := src.read(CHUNK):
            out.write(cipher.update(block))
        out.write(cipher.finalize())
        out.write(cipher.tag)


def decrypt(source, target, password):
    # Unauthenticated plaintext is temporary and removed on *any* failure.
    created = False
    try:
        with source.open('rb') as src:
            header = src.read(HEADER_SIZE)
            remaining = source.stat().st_size - HEADER_SIZE - 16
            if not header.startswith(MAGIC) or len(header) != HEADER_SIZE or remaining < 1:
                raise BackupError('invalid_encrypted_backup')
            src.seek(-16, 2)
            tag = src.read(16)
            src.seek(HEADER_SIZE)
            cipher = Cipher(algorithms.AES(derive(password, header[8:24])),
                            modes.GCM(header[24:36], tag)).decryptor()
            cipher.authenticate_additional_data(header)
            with target.open('xb') as out:
                created = True
                target.chmod(0o600)
                while remaining:
                    block = src.read(min(CHUNK, remaining))
                    if not block:
                        raise BackupError('truncated_backup')
                    remaining -= len(block)
                    out.write(cipher.update(block))
                out.write(cipher.finalize())
    except Exception:
        if created:
            target.unlink(missing_ok=True)
        raise


def download(client, bucket, key, target, maximum):
    result = client.get_object(Bucket=bucket, Key=key)
    body = result['Body']
    try:
        if result['ContentLength'] > maximum:
            raise BackupError('backup_exceeds_size_limit')
        total = 0
        with target.open('xb') as out:
            target.chmod(0o600)
            while block := body.read(CHUNK):
                total += len(block)
                if total > maximum:
                    raise BackupError('backup_exceeds_size_limit')
                out.write(block)
        if total != result['ContentLength']:
            raise BackupError('incomplete_download')
    finally:
        body.close()
    return result.get('Metadata', {})


def record(dsn, key, status, size=0, sha=''):
    with psycopg.connect(dsn, connect_timeout=20) as conn:
        conn.execute('INSERT INTO app.backup_runs(filename,size_bytes,sha256,status) VALUES (%s,%s,%s,%s)',
                     (key, size, sha, status))


def completed_keys(dsn):
    with psycopg.connect(dsn, connect_timeout=20) as conn:
        return {row[0] for row in conn.execute(
            "SELECT filename FROM app.backup_runs WHERE status='completed_database_only'").fetchall()}


def prune(client, bucket, keep, current, successful):
    # Limited to this application's exact database-only key format. Never media/.
    objects = []
    for page in client.get_paginator('list_objects_v2').paginate(Bucket=bucket, Prefix='database/evaz-db-'):
        objects.extend(x for x in page.get('Contents', []) if re.fullmatch(KEY_PATTERN, x['Key']))
    if not any(x['Key'] == current for x in objects):
        raise BackupError('new_backup_not_listed_retention_skipped')
    valid = sorted((x['Key'] for x in objects if x['Key'] in successful and x['Key'] != current), reverse=True)
    retained = {current} | set(valid[:keep-1])
    for item in objects:
        if item['Key'] not in retained:
            client.delete_object(Bucket=bucket, Key=item['Key'])


def backup():
    dsn = required('DATABASE_URL')
    key = 'database/evaz-db-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '-' + uuid4().hex + '.dump.enc'
    verified = False
    try:
        client, bucket, password, keep, maximum = options()
        with tempfile.TemporaryDirectory(prefix='evaz-db-backup-') as folder:
            folder = Path(folder)
            plain, encrypted = folder/'database.dump', folder/'database.dump.enc'
            # pg_dump provides a consistent snapshot; no media bucket API calls exist here.
            pg_run(['pg_dump', '--format=custom', '--compress=gzip:9', '--no-owner',
                    '--no-acl', '--file', str(plain)], dsn)
            plain.chmod(0o600)
            with plain.open('rb') as stream:
                header = stream.read(5)
            if header != b'PGDMP':
                raise BackupError('invalid_pg_dump_output')
            plain_hash = digest(plain)
            encrypt(plain, encrypted, password)
            size, sha = encrypted.stat().st_size, digest(encrypted)
            if size > maximum:
                raise BackupError('backup_exceeds_100mb_limit_or_configured_limit')
            with encrypted.open('rb') as stream:
                client.put_object(Bucket=bucket, Key=key, Body=stream, ContentLength=size,
                                  ContentType='application/octet-stream', CacheControl='no-store',
                                  Metadata={'sha256': sha, 'dump-sha256': plain_hash,
                                            'scope': 'database-only', 'format': 'EVDBBK01'})
            copied, checked = folder/'download.enc', folder/'checked.dump'
            metadata = download(client, bucket, key, copied, maximum)
            if digest(copied) != sha or metadata.get('sha256') != sha or metadata.get('scope') != 'database-only':
                raise BackupError('uploaded_backup_checksum_failed')
            decrypt(copied, checked, password)
            if digest(checked) != plain_hash:
                raise BackupError('decrypted_backup_checksum_failed')
            pg_run(['pg_restore', '--list', str(checked)], dsn)
            verified = True
            record(dsn, key, 'completed_database_only', size, sha)
            prune(client, bucket, keep, key, completed_keys(dsn))
        print('Database-only encrypted backup verified. Media excluded. Retained copies:', keep)
        print('Encrypted size (MiB):', round(size / 1024 / 1024, 3))
    except Exception:
        try:
            record(dsn, key, 'retention_failed_database_only' if verified else 'failed_database_only')
        except Exception:
            pass  # CI remains failed even if the database cannot record the failure.
        raise


def verify_backup(key, folder):
    if not re.fullmatch(KEY_PATTERN, key):
        raise BackupError('invalid_backup_key')
    client, bucket, password, _, maximum = options()
    encrypted, plain = folder/'download.enc', folder/'verified.dump'
    metadata = download(client, bucket, key, encrypted, maximum)
    if (metadata.get('scope') != 'database-only' or digest(encrypted) != metadata.get('sha256')):
        raise BackupError('encrypted_backup_checksum_failed')
    decrypt(encrypted, plain, password)
    if digest(plain) != metadata.get('dump-sha256'):
        raise BackupError('decrypted_backup_checksum_failed')
    pg_run(['pg_restore', '--list', str(plain)], required('DATABASE_URL'))
    return plain


def restore_test(key, confirmation):
    # No destructive restore or automatic production restore command is provided.
    if confirmation != 'RESTORE-TO-EMPTY-TEST-DATABASE':
        raise BackupError('explicit_test_restore_confirmation_required')
    source, target = required('DATABASE_URL'), required('RESTORE_DATABASE_URL')
    source_env, target_env = pg_environment(source), pg_environment(target)
    if all(source_env[k] == target_env[k] for k in ('PGHOST', 'PGPORT', 'PGDATABASE')):
        raise BackupError('refusing_production_database')
    with tempfile.TemporaryDirectory(prefix='evaz-restore-test-') as folder:
        plain = verify_backup(key, Path(folder))
        with psycopg.connect(target, connect_timeout=20) as conn:
            exists = conn.execute("SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%'").fetchone()[0]
            tables = conn.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')").fetchone()[0]
            if exists or tables:
                raise BackupError('restore_target_must_be_empty')
        pg_run(['pg_restore', '--no-owner', '--no-acl', '--exit-on-error',
                '--single-transaction', '--dbname', target_env['PGDATABASE'], str(plain)], target)
        with psycopg.connect(target, connect_timeout=20) as conn:
            if conn.execute("SELECT to_regclass('app.properties')").fetchone()[0] is None:
                raise BackupError('restored_application_table_missing')
    print('Database restored to the empty test database. Media was not included or changed.')


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['backup', 'verify', 'restore-test'])
    parser.add_argument('--key', default='')
    parser.add_argument('--confirm', default='')
    args = parser.parse_args()
    try:
        if args.action == 'backup':
            backup()
        elif args.action == 'restore-test':
            restore_test(args.key, args.confirm)
        else:
            with tempfile.TemporaryDirectory(prefix='evaz-verify-') as folder:
                verify_backup(args.key, Path(folder))
            print('Stored database backup downloaded, authenticated and verified.')
        return 0
    except BackupError as error:
        print('Backup failed:', str(error), file=sys.stderr)
    except ClientError as error:
        code = error.response.get('Error', {}).get('Code', 'S3Error')
        code = re.sub(r'[^A-Za-z0-9_]', '', str(code))[:60]
        print('Backup failed: S3_' + code, file=sys.stderr)
    except Exception as error:
        print('Backup failed:', type(error).__name__, '(details withheld to protect credentials)', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
