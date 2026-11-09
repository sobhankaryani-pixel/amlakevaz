"""Restore the application schema only into an isolated, empty CI database."""
import json,os,tempfile
from pathlib import Path
import psycopg
from cloud_backup import BackupError,required,pg_environment,verify_backup,pg_run

def validate_target(source,target):
 a,b=pg_environment(source),pg_environment(target)
 if b['PGHOST'] not in ('restore-db','127.0.0.1','localhost') or not b['PGDATABASE'].startswith('evaz_restore_'):
  raise BackupError('target_must_be_isolated_rehearsal_database')
 if all(a[k]==b[k] for k in ('PGHOST','PGPORT','PGDATABASE')):raise BackupError('refusing_production_database')
 return b

def main():
 source,target=required('DATABASE_URL'),required('RESTORE_DATABASE_URL');env=validate_target(source,target)
 key=os.getenv('REHEARSAL_BACKUP_KEY','').strip()
 if not key:
  with psycopg.connect(source,connect_timeout=20) as conn:
   conn.execute('SET TRANSACTION READ ONLY')
   row=conn.execute("SELECT filename FROM app.backup_runs WHERE status='completed_database_only' ORDER BY created_at DESC LIMIT 1").fetchone()
   if not row:raise BackupError('no_completed_backup')
   key=row[0]
 with psycopg.connect(target,connect_timeout=20) as conn:
  schemas=conn.execute("SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%'").fetchone()[0]
  objects=conn.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')").fetchone()[0]
  if schemas or objects:raise BackupError('restore_target_must_be_empty')
 with tempfile.TemporaryDirectory(prefix='evaz-rehearsal-') as folder:
  plain=verify_backup(key,Path(folder))
  pg_run(['pg_restore','--schema=app','--no-owner','--no-acl','--exit-on-error','--single-transaction','--dbname',env['PGDATABASE'],str(plain)],target)
 with psycopg.connect(target,connect_timeout=20) as conn:
  counts={}
  for table in ('users','properties','listings','property_submissions','uploaded_media'):
   counts[table]=conn.execute('SELECT count(*) FROM app.'+table).fetchone()[0]
  if not counts['users']:raise BackupError('restored_users_missing')
  invalid=conn.execute("SELECT count(*) FROM pg_constraint WHERE connamespace='app'::regnamespace AND NOT convalidated").fetchone()[0]
  if invalid:raise BackupError('unvalidated_constraints')
 print(json.dumps({'ok':True,'scope':'app schema only; media and provider infrastructure excluded','counts':counts}))
if __name__=='__main__':
 try:main()
 except Exception:
  print('Recovery rehearsal failed; no production database was modified.');raise SystemExit(1)
