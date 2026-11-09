"""Restore app only into an empty isolated database; diagnostics never print secrets."""
import json,os,tempfile
from pathlib import Path
import psycopg
from cloud_backup import BackupError,required,pg_environment,verify_backup,pg_run

PHASE='configuration'
SAFE_CODES={
 'invalid_database_url','target_must_be_isolated_rehearsal_database',
 'refusing_production_database','no_completed_backup','restore_target_must_be_empty',
 'invalid_backup_key','encrypted_backup_checksum_failed','decrypted_backup_checksum_failed',
 'postgres_command_failed_check_client_version_and_connection','restored_users_missing',
 'unvalidated_constraints','invalid_backup_header','backup_too_large','invalid_encryption_password',
}
HINTS={
 'configuration':'Check the named GitHub Secrets and the isolated target configuration.',
 'select_backup':'Check read-only source connectivity and app.backup_runs; a completed backup is required.',
 'check_empty_target':'Check the temporary restore-db service and ensure the target is empty.',
 'download_verify_backup':'Check backup storage access, encryption password, checksum and pg_restore compatibility.',
 'restore_app_schema':'Check PostgreSQL client/server versions and app schema dependencies.',
 'validate_restored_data':'Check required app tables, user records and constraint validation.',
}

def validate_target(source,target):
 a,b=pg_environment(source),pg_environment(target)
 if b['PGHOST'] not in ('restore-db','127.0.0.1','localhost') or not b['PGDATABASE'].startswith('evaz_restore_'):
  raise BackupError('target_must_be_isolated_rehearsal_database')
 if all(a[k]==b[k] for k in ('PGHOST','PGPORT','PGDATABASE')):raise BackupError('refusing_production_database')
 return b

def report_failure(exc):
 # Never print str(exc), traceback, SQL, DSNs, filenames or provider response bodies.
 code=str(exc) if isinstance(exc,BackupError) and str(exc) in SAFE_CODES else 'operation_failed'
 kind=type(exc).__name__
 if kind not in ('BackupError','OperationalError','ProgrammingError','IntegrityError','InvalidTag','FileNotFoundError','TimeoutExpired','PermissionError','ValueError','RuntimeError'):
  kind='Exception'
 sqlstate=getattr(exc,'sqlstate',None)
 if not isinstance(sqlstate,str) or len(sqlstate)!=5 or not sqlstate.isascii() or not sqlstate.isalnum():sqlstate=None
 print(json.dumps({'ok':False,'stage':PHASE,'error_code':code,'error_type':kind,'sqlstate':sqlstate,'hint':HINTS.get(PHASE,HINTS['configuration']),'production_modified':False}))

def main():
 global PHASE
 PHASE='configuration'
 names=('DATABASE_URL','RESTORE_DATABASE_URL','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','BACKUP_ENCRYPTION_PASSWORD')
 missing=[name for name in names if not os.getenv(name,'').strip()]
 if missing:
  print(json.dumps({'ok':False,'stage':PHASE,'error_code':'missing_configuration','missing_names':missing,'production_modified':False}))
  return 1
 source,target=required('DATABASE_URL'),required('RESTORE_DATABASE_URL');env=validate_target(source,target)
 key=os.getenv('REHEARSAL_BACKUP_KEY','').strip()
 PHASE='select_backup'
 if not key:
  with psycopg.connect(source,connect_timeout=20) as conn:
   conn.execute('SET TRANSACTION READ ONLY')
   row=conn.execute("SELECT filename FROM app.backup_runs WHERE status='completed_database_only' ORDER BY created_at DESC LIMIT 1").fetchone()
   if not row:raise BackupError('no_completed_backup')
   key=row[0]
 print('Recovery stage completed: select_backup')
 PHASE='check_empty_target'
 with psycopg.connect(target,connect_timeout=20) as conn:
  schemas=conn.execute("SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%'").fetchone()[0]
  objects=conn.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')").fetchone()[0]
  if schemas or objects:raise BackupError('restore_target_must_be_empty')
 print('Recovery stage completed: check_empty_target')
 with tempfile.TemporaryDirectory(prefix='evaz-rehearsal-') as folder:
  PHASE='download_verify_backup'
  plain=verify_backup(key,Path(folder))
  print('Recovery stage completed: download_verify_backup')
  PHASE='restore_app_schema'
  pg_run(['pg_restore','--schema=app','--no-owner','--no-acl','--exit-on-error','--single-transaction','--dbname',env['PGDATABASE'],str(plain)],target)
 print('Recovery stage completed: restore_app_schema')
 PHASE='validate_restored_data'
 with psycopg.connect(target,connect_timeout=20) as conn:
  counts={}
  for table in ('users','properties','listings','property_submissions','uploaded_media'):
   counts[table]=conn.execute('SELECT count(*) FROM app.'+table).fetchone()[0]
  if not counts['users']:raise BackupError('restored_users_missing')
  invalid=conn.execute("SELECT count(*) FROM pg_constraint WHERE connamespace='app'::regnamespace AND NOT convalidated").fetchone()[0]
  if invalid:raise BackupError('unvalidated_constraints')
 print(json.dumps({'ok':True,'scope':'app schema only; media and provider infrastructure excluded','counts':counts}))
 return 0

def cli():
 try:return main()
 except Exception as exc:
  report_failure(exc)
  return 1
if __name__=='__main__':raise SystemExit(cli())
