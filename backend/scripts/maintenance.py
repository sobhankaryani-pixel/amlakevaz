#!/usr/bin/env python3
"""Server-side backups with hashes, media, retention and an explicit restore guard."""
import argparse,hashlib,json,os,subprocess,tarfile,tempfile
from datetime import datetime,timezone,timedelta
from pathlib import Path
import psycopg
from urllib.parse import urlsplit,unquote,parse_qs


def archive_members(archive):
    members=archive.getmembers()
    for member in members:
        path=Path(member.name)
        if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk() or not(member.isfile() or member.isdir()):
            raise ValueError('Unsafe backup archive member')
        if path.parts[0] not in ('database.dump','media','manifest.json'):raise ValueError('Unknown backup content')
    return members


def pg_env():
    env=os.environ.copy();parsed=urlsplit(env['DATABASE_URL'])
    env.update(PGHOST=parsed.hostname or 'localhost',PGPORT=str(parsed.port or 5432),PGUSER=unquote(parsed.username or ''),PGPASSWORD=unquote(parsed.password or ''),PGDATABASE=unquote(parsed.path.lstrip('/')))
    query=parse_qs(parsed.query)
    for key in ('sslmode','sslrootcert','sslcert','sslkey','channel_binding'):
        if key in query:env['PG'+key.upper()]=query[key][0]
    return env


def sha256(path):
    result=hashlib.sha256()
    with path.open('rb') as stream:
        while chunk:=stream.read(1024*1024):result.update(chunk)
    return result.hexdigest()


def backup():
    if os.getenv('MEDIA_STORAGE','local').strip().lower()!='local':
        raise RuntimeError('This backup command supports local media only. Configure off-host database and S3 media backups before scheduling it.')
    folder=Path(os.getenv('BACKUP_DIR','./data/backups')).resolve();folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    media=Path(os.environ['MEDIA_DIR']).resolve()
    if not media.is_dir():raise RuntimeError('MEDIA_DIR must exist on a persistent disk')
    name=datetime.now(timezone.utc).strftime('evaz-%Y%m%dT%H%M%S%fZ.tar.gz');target=folder/name
    with tempfile.TemporaryDirectory(dir=folder) as temp:
        temp=Path(temp);dump=temp/'database.dump'
        subprocess.run(['pg_dump','--format=custom','--file',str(dump),'--no-owner','--no-acl'],env=pg_env(),check=True)
        checksums={'database.dump':sha256(dump)}
        # Copy media first, so the archived bytes match the hash manifest even during uploads.
        import shutil
        snapshot=temp/'media';shutil.copytree(media,snapshot)
        for file in snapshot.rglob('*'):
            if file.is_file():checksums[str(file.relative_to(temp))]=sha256(file)
        manifest=temp/'manifest.json';manifest.write_text(json.dumps({'version':1,'created_at':datetime.now(timezone.utc).isoformat(),'sha256':checksums},indent=2))
        with tarfile.open(target.with_suffix('.partial'),'w:gz') as archive:
            archive.add(dump,arcname='database.dump');archive.add(snapshot,arcname='media');archive.add(manifest,arcname='manifest.json')
        target.with_suffix('.partial').replace(target);target.chmod(0o600)
    digest=sha256(target)
    with psycopg.connect(os.environ['DATABASE_URL']) as conn:
        conn.execute('INSERT INTO app.backup_runs(filename,size_bytes,sha256) VALUES (%s,%s,%s)',(name,target.stat().st_size,digest))
    print(json.dumps({'backup':str(target),'sha256':digest,'bytes':target.stat().st_size}))


def verify(path:Path,temp:Path):
    with tarfile.open(path,'r:gz') as archive:archive.extractall(temp,members=archive_members(archive),filter='data')
    manifest=json.loads((temp/'manifest.json').read_text())
    for name,digest in manifest['sha256'].items():
        member=Path(name)
        if member.is_absolute() or '..' in member.parts:raise ValueError('Unsafe manifest path')
        file=temp/member
        if sha256(file)!=digest:raise ValueError('Backup checksum mismatch')
    if 'database.dump' not in manifest['sha256']:raise ValueError('Database missing from manifest')
    return manifest


def restore(path:Path,confirm:str):
    if confirm!='RESTORE-EVAZMELK':raise RuntimeError('Pass --confirm RESTORE-EVAZMELK after stopping writes and making a fresh backup')
    if os.getenv('MEDIA_STORAGE','local').strip().lower()!='local':
        raise RuntimeError('Cloud media restore requires a separate S3 recovery procedure; this local restore was not run.')
    media=Path(os.environ['MEDIA_DIR']).resolve()
    with tempfile.TemporaryDirectory() as tmp:
        temp=Path(tmp);verify(path,temp)
        # Restore is atomic at database level. Existing media is retained and restored files are merged.
        subprocess.run(['pg_restore','--clean','--if-exists','--no-owner','--no-acl','--single-transaction','--dbname',pg_env()['PGDATABASE'],str(temp/'database.dump')],env=pg_env(),check=True)
        import shutil
        shutil.copytree(temp/'media',media,dirs_exist_ok=True)
    print('Database and media restored. Check health, property details and media before reopening writes.')


def cleanup():
    with psycopg.connect(os.environ['DATABASE_URL']) as conn:
        conn.execute("DELETE FROM app.site_events WHERE created_at<now()-interval '90 days'")
        conn.execute("DELETE FROM app.site_errors WHERE created_at<now()-interval '30 days'")
        conn.execute('DELETE FROM app.request_limits WHERE expires_at<now()')
    # Backup deletion is intentionally not automatic; move verified copies off-host first.
    print('Expired analytics, errors and request-limit buckets removed.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['backup','verify','restore','cleanup']);parser.add_argument('--file',type=Path);parser.add_argument('--confirm',default='');args=parser.parse_args()
    if args.action=='backup':backup()
    elif args.action=='cleanup':cleanup()
    elif args.action=='restore':restore(args.file,args.confirm)
    else:
        with tempfile.TemporaryDirectory() as tmp:verify(args.file,Path(tmp))
        print('Backup checksums verified.')
