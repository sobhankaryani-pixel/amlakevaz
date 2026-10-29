"""Offline backup/recovery contracts; no live database, keys or media are used."""
import importlib.util
import io
from pathlib import Path
from unittest.mock import Mock

import pytest
import yaml
from cryptography.exceptions import InvalidTag

spec = importlib.util.spec_from_file_location('cloud_backup', 'backend/scripts/cloud_backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
PASSWORD = 'offline-test-password-' * 3


class Store:
    def __init__(self):
        self.objects = {}
        self.calls = []
        self.deleted = []
        self.body = None
        self.corrupt = False
        self.fail_delete = False

    def put_object(self, **kwargs):
        self.calls.append(('put', kwargs['Bucket'], kwargs['Key']))
        assert kwargs['Bucket'] == 'evazmelk-backups'
        self.objects[kwargs['Key']] = (kwargs['Body'].read(), kwargs['Metadata'])

    def get_object(self, **kwargs):
        self.calls.append(('get', kwargs['Bucket'], kwargs['Key']))
        payload, metadata = self.objects[kwargs['Key']]
        if self.corrupt:
            payload = payload[:-1] + bytes([payload[-1] ^ 1])
        self.body = io.BytesIO(payload)
        return {'ContentLength': len(payload), 'Body': self.body, 'Metadata': metadata}

    def delete_object(self, **kwargs):
        if self.fail_delete:
            raise RuntimeError('delete failed')
        self.deleted.append(kwargs['Key'])
        del self.objects[kwargs['Key']]

    def get_paginator(self, name):
        assert name == 'list_objects_v2'
        return self

    def paginate(self, **kwargs):
        self.calls.append(('list', kwargs['Bucket'], kwargs['Prefix']))
        keys = [key for key in self.objects if key.startswith(kwargs['Prefix'])]
        # Multiple pages ensure retention does not silently stop at 1000 objects.
        yield {'Contents': [{'Key': key} for key in keys[:4]]}
        yield {'Contents': [{'Key': key} for key in keys[4:]]}


def key(day):
    return f'database/evaz-db-202610{day:02}T004700000000Z-' + 'a'*32 + '.dump.enc'


@pytest.fixture
def setup(monkeypatch):
    store = Store()
    records = []
    pg_calls = []
    monkeypatch.setenv('DATABASE_URL', 'postgresql://user:private-password@db.test/site?sslmode=require')
    monkeypatch.setattr(backup, 'options', lambda: (store, 'evazmelk-backups', PASSWORD, 7, 104857600))
    monkeypatch.setattr(backup, 'record', lambda *args: records.append(args))
    monkeypatch.setattr(backup, 'completed_keys', lambda dsn: set(store.objects))

    def pg_run(args, dsn):
        pg_calls.append(args)
        if args[0] == 'pg_dump':
            Path(args[args.index('--file') + 1]).write_bytes(b'PGDMP' + b'compressed-database-only')
        return Mock(returncode=0)

    monkeypatch.setattr(backup, 'pg_run', pg_run)
    return store, records, pg_calls


def test_encryption_authentication_and_temporary_plaintext_cleanup(tmp_path):
    source, encrypted, restored = tmp_path/'plain', tmp_path/'encrypted', tmp_path/'restored'
    source.write_bytes(b'database-private-information' * 80000)
    backup.encrypt(source, encrypted, PASSWORD)
    assert b'database-private-information' not in encrypted.read_bytes()
    backup.decrypt(encrypted, restored, PASSWORD)
    assert backup.digest(source) == backup.digest(restored)
    restored.unlink()
    with pytest.raises(InvalidTag):
        backup.decrypt(encrypted, restored, 'wrong-password')
    assert not restored.exists()
    data = bytearray(encrypted.read_bytes()); data[backup.HEADER_SIZE+100] ^= 1
    encrypted.write_bytes(data)
    with pytest.raises(InvalidTag):
        backup.decrypt(encrypted, restored, PASSWORD)
    assert not restored.exists()


def test_decrypt_refuses_overwrite_without_deleting_existing_file(tmp_path):
    source, encrypted, target = tmp_path/'plain', tmp_path/'enc', tmp_path/'existing'
    source.write_bytes(b'PGDMPdata'); target.write_bytes(b'keep this')
    backup.encrypt(source, encrypted, PASSWORD)
    with pytest.raises(FileExistsError):
        backup.decrypt(encrypted, target, PASSWORD)
    assert target.read_bytes() == b'keep this'


def test_database_only_backup_verified_before_retention(setup):
    store, records, pg_calls = setup
    for day in range(1, 10):
        store.objects[key(day)] = (b'old-encrypted-file', {})
    store.objects['media/photo.webp'] = (b'not touched', {})
    store.objects['database/evaz-db-unrelated.txt'] = (b'not touched', {})
    backup.backup()
    assert len([k for k in store.objects if __import__('re').fullmatch(backup.KEY_PATTERN, k)]) == 7
    assert store.objects['media/photo.webp'][0] == b'not touched'
    assert 'database/evaz-db-unrelated.txt' in store.objects
    assert all(call[1] == 'evazmelk-backups' for call in store.calls)
    assert records[-1][2] == 'completed_database_only' and records[-1][3] > 0
    assert '--compress=gzip:9' in pg_calls[0]
    assert pg_calls[-1][:2] == ['pg_restore', '--list']
    assert not any('media' in str(call) for call in store.calls)
    assert store.body.closed


def test_failed_upload_verification_never_deletes_old_backups(setup):
    store, records, _ = setup; store.corrupt = True
    store.objects[key(1)] = (b'old-file', {})
    with pytest.raises(backup.BackupError, match='checksum'):
        backup.backup()
    assert not store.deleted and key(1) in store.objects
    assert records[-1][2] == 'failed_database_only'


def test_size_limit_fails_before_upload_and_retention(setup, monkeypatch):
    store, records, _ = setup
    monkeypatch.setattr(backup, 'options', lambda: (store, 'evazmelk-backups', PASSWORD, 7, 8))
    with pytest.raises(backup.BackupError, match='limit'):
        backup.backup()
    assert not store.calls and records[-1][2] == 'failed_database_only'


def test_retention_failure_is_visible_without_claiming_backup_lost(setup):
    store, records, _ = setup
    for day in range(1, 10):
        store.objects[key(day)] = (b'old-file', {})
    store.fail_delete = True
    with pytest.raises(RuntimeError):
        backup.backup()
    assert records[-2][2] == 'completed_database_only'
    assert records[-1][2] == 'retention_failed_database_only'


def test_restore_requires_explicit_confirmation_and_separate_empty_database(setup, monkeypatch):
    _, _, pg_calls = setup
    with pytest.raises(backup.BackupError, match='confirmation'):
        backup.restore_test(key(1), '')
    monkeypatch.setenv('RESTORE_DATABASE_URL', 'postgresql://other:password@db.test/site')
    with pytest.raises(backup.BackupError, match='production'):
        backup.restore_test(key(1), 'RESTORE-TO-EMPTY-TEST-DATABASE')
    monkeypatch.setenv('RESTORE_DATABASE_URL', 'postgresql://user:password@db.test/test_restore')
    monkeypatch.setattr(backup, 'verify_backup', lambda *args: Path('/temporary/verified.dump'))
    conn = Mock(); conn.__enter__ = Mock(return_value=conn); conn.__exit__ = Mock(return_value=None)
    conn.execute.return_value.fetchone.return_value = (1,)
    monkeypatch.setattr(backup.psycopg, 'connect', lambda *args, **kwargs: conn)
    with pytest.raises(backup.BackupError, match='empty'):
        backup.restore_test(key(1), 'RESTORE-TO-EMPTY-TEST-DATABASE')
    assert not pg_calls
    conn.execute.return_value.fetchone.side_effect = [(0,), (0,), ('app.properties',)]
    backup.restore_test(key(1), 'RESTORE-TO-EMPTY-TEST-DATABASE')
    assert '--single-transaction' in pg_calls[-1] and '--clean' not in pg_calls[-1]


def test_configuration_blocks_public_media_destination_and_missing_password(monkeypatch):
    for name, value in {'S3_ENDPOINT_URL':'https://s3.ir-central1.arvanstorage.ir',
                        'BACKUP_S3_BUCKET':'evazmelk-media'}.items():
        monkeypatch.setenv(name, value)
    with pytest.raises(backup.BackupError, match='differ'):
        backup.options()
    monkeypatch.setenv('BACKUP_S3_BUCKET', 'evazmelk-backups')
    monkeypatch.delenv('BACKUP_ENCRYPTION_PASSWORD', raising=False)
    with pytest.raises(backup.BackupError, match='missing'):
        backup.options()


def test_credentials_are_only_in_environment_not_pg_arguments_or_output(setup, monkeypatch, capsys):
    env = backup.pg_environment('postgresql://a:p%40ss@db.test/site?sslmode=require&channel_binding=require')
    assert env['PGPASSWORD'] == 'p@ss' and env['PGSSLMODE'] == 'require'
    monkeypatch.setattr(backup, 'backup', lambda: (_ for _ in ()).throw(RuntimeError('private-password')))
    monkeypatch.setattr('sys.argv', ['cloud_backup.py', 'backup'])
    assert backup.main() == 1
    output = capsys.readouterr().err
    assert 'private-password' not in output and 'RuntimeError' in output


def test_workflow_schedule_and_no_public_artifact_or_media_transfer():
    source = Path('.github/workflows/database-backup.yml').read_text()
    data = yaml.safe_load(source)
    trigger = data.get('on', data.get(True))
    assert trigger['schedule'][0]['cron'] == '47 0 * * *'
    assert 'workflow_dispatch' in trigger
    assert data['permissions'] == {'contents':'read'}
    assert data['concurrency']['cancel-in-progress'] is False
    assert 'upload-artifact' not in source and 'pull_request' not in trigger
    assert 'secrets.DATABASE_URL' in source and 'secrets.BACKUP_ENCRYPTION_PASSWORD' in source
    assert 'cloud_backup.py backup' in source and 'BACKUP_KEEP' in source


def test_unverified_files_do_not_displace_successful_backups():
    store = Store()
    good = {key(day) for day in range(1, 8)}
    for name in good | {key(8), key(9)}:
        store.objects[name] = (b'file', {})
    backup.prune(store, 'evazmelk-backups', 7, key(7), good)
    assert set(store.objects) == good
    assert set(store.deleted) == {key(8), key(9)}
