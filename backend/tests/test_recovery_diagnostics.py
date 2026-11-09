"""Offline diagnostics: no database, S3 connection or real backup is accessed."""
import contextlib,importlib.util,io,json,os,types,unittest
from pathlib import Path
from unittest.mock import MagicMock,patch

class BackupError(Exception):pass

def load():
 backup=types.ModuleType('cloud_backup');backup.BackupError=BackupError
 backup.required=lambda name:os.environ[name]
 def env(dsn):
  from urllib.parse import urlsplit
  x=urlsplit(dsn);return {'PGHOST':x.hostname,'PGPORT':str(x.port or 5432),'PGDATABASE':x.path.strip('/')}
 backup.pg_environment=env;backup.verify_backup=MagicMock(return_value=Path('/isolated/test.dump'));backup.pg_run=MagicMock()
 pg=types.ModuleType('psycopg');pg.connect=MagicMock()
 path=Path(__file__).resolve().parents[1]/'scripts/recovery_rehearsal.py'
 spec=importlib.util.spec_from_file_location('isolated_recovery_diagnostics',path);module=importlib.util.module_from_spec(spec)
 with patch.dict('sys.modules',{'cloud_backup':backup,'psycopg':pg}):spec.loader.exec_module(module)
 return module,backup,pg

class RecoveryDiagnostics(unittest.TestCase):
 def test_sensitive_error_message_is_never_logged(self):
  module,_,_=load();module.PHASE='select_backup';capture=io.StringIO()
  with contextlib.redirect_stdout(capture):module.report_failure(RuntimeError('postgresql://secret-user:secret-pass@private-host/database'))
  result=json.loads(capture.getvalue());self.assertEqual(result['stage'],'select_backup');self.assertNotIn('secret-',capture.getvalue());self.assertFalse(result['production_modified'])
 def test_known_code_is_reported(self):
  module,_,_=load();capture=io.StringIO()
  with contextlib.redirect_stdout(capture):module.report_failure(BackupError('no_completed_backup'))
  self.assertEqual(json.loads(capture.getvalue())['error_code'],'no_completed_backup')
 def test_missing_settings_names_only(self):
  module,_,pg=load();capture=io.StringIO()
  with patch.dict(os.environ,{},clear=True),contextlib.redirect_stdout(capture):self.assertEqual(module.cli(),1)
  result=json.loads(capture.getvalue());self.assertIn('DATABASE_URL',result['missing_names']);pg.connect.assert_not_called()
 def test_production_restore_guard_remains(self):
  module,_,_=load()
  for target in ('postgresql://x:x@production/evaz_restore_test','postgresql://x:x@localhost/live'):
   with self.assertRaises(BackupError):module.validate_target('postgresql://x:x@production/live',target)
  with self.assertRaises(BackupError):module.validate_target('postgresql://x:x@localhost/evaz_restore_test','postgresql://x:x@localhost/evaz_restore_test')
 def test_source_failure_identifies_phase_without_connection_details(self):
  module,_,pg=load();pg.connect.side_effect=RuntimeError('sensitive-connection-details');capture=io.StringIO()
  settings={'DATABASE_URL':'postgresql://x:x@production/live','RESTORE_DATABASE_URL':'postgresql://x:x@restore-db/evaz_restore_test','S3_ACCESS_KEY_ID':'test','S3_SECRET_ACCESS_KEY':'test','BACKUP_ENCRYPTION_PASSWORD':'test'}
  with patch.dict(os.environ,settings,clear=True),contextlib.redirect_stdout(capture):self.assertEqual(module.cli(),1)
  result=json.loads(capture.getvalue());self.assertEqual(result['stage'],'select_backup');self.assertNotIn('sensitive',capture.getvalue())
 def test_full_isolated_flow_still_checks_empty_target_and_all_tables(self):
  module,backup,pg=load();module.restore_app=MagicMock();conn=pg.connect.return_value.__enter__.return_value
  conn.execute.return_value.fetchone.side_effect=[('backup-key',),(0,),(0,),(1,),(2,),(2,),(2,),(3,),(0,)]
  settings={'DATABASE_URL':'postgresql://x:x@production/live','RESTORE_DATABASE_URL':'postgresql://x:x@restore-db/evaz_restore_test','S3_ACCESS_KEY_ID':'test','S3_SECRET_ACCESS_KEY':'test','BACKUP_ENCRYPTION_PASSWORD':'test'}
  capture=io.StringIO()
  with patch.dict(os.environ,settings,clear=True),contextlib.redirect_stdout(capture):self.assertEqual(module.cli(),0)
  self.assertTrue(json.loads(capture.getvalue().splitlines()[-1])['ok']);backup.verify_backup.assert_called_once();module.restore_app.assert_called_once()
  self.assertIn('CREATE SCHEMA app',[call.args[0] for call in conn.execute.call_args_list]);self.assertEqual(module.restore_app.call_args.args[1],settings['RESTORE_DATABASE_URL'])

class RestoreNamespaceTests(unittest.TestCase):
 def test_restore_options_and_environment_remain_target_only(self):
  module,_,_=load();target='postgresql://test:private-password@restore-db/evaz_restore_test'
  result=types.SimpleNamespace(returncode=0,stderr=b'')
  with patch.object(module.subprocess,'run',return_value=result) as run:
   module.restore_app(Path('/temporary/private.dump'),target,{'PGDATABASE':'evaz_restore_test'})
  args=run.call_args.args[0];self.assertIn('--schema=app',args);self.assertIn('--single-transaction',args);self.assertNotIn(private_password:='private-password',' '.join(args));self.assertEqual(run.call_args.kwargs['env']['PGHOST'],'restore-db')
 def test_restore_error_never_exposes_copy_data_or_private_identifiers(self):
  module,_,_=load()
  cases=[(b'ERROR: schema "app" does not exist','missing_schema'),(b'ERROR: role "private-person" does not exist','missing_role'),(b'ERROR: function extensions.some_private_name() does not exist','missing_function'),(b'ERROR: duplicate key value violates unique constraint "secret"\nDETAIL: Key (phone)=(09123456789) already exists.','data_constraint_failure'),(b'ERROR: unrecognized configuration parameter "transaction_timeout"','version_mismatch')]
  for error,code in cases:
   self.assertEqual(module.restore_error_code(error),code)
   result=types.SimpleNamespace(returncode=1,stderr=error);capture=io.StringIO()
   with patch.object(module.subprocess,'run',return_value=result),contextlib.redirect_stdout(capture):
    try:module.restore_app(Path('/tmp/secret.dump'),'postgresql://x:x@restore-db/evaz_restore_test',{'PGDATABASE':'evaz_restore_test'})
    except module.RestoreError as exc:module.report_failure(exc)
   self.assertEqual(json.loads(capture.getvalue())['error_code'],code);self.assertNotIn('09123456789',capture.getvalue());self.assertNotIn('private-person',capture.getvalue())
 def test_existing_target_is_rejected_before_namespace_creation(self):
  module,_,pg=load();conn=pg.connect.return_value.__enter__.return_value
  conn.execute.return_value.fetchone.side_effect=[('backup-key',),(1,),(0,)]
  settings={'DATABASE_URL':'postgresql://x:x@production/live','RESTORE_DATABASE_URL':'postgresql://x:x@restore-db/evaz_restore_test','S3_ACCESS_KEY_ID':'test','S3_SECRET_ACCESS_KEY':'test','BACKUP_ENCRYPTION_PASSWORD':'test'}
  capture=io.StringIO()
  with patch.dict(os.environ,settings,clear=True),contextlib.redirect_stdout(capture):self.assertEqual(module.cli(),1)
  self.assertNotIn('CREATE SCHEMA app',[call.args[0] for call in conn.execute.call_args_list]);self.assertEqual(json.loads(capture.getvalue().splitlines()[-1])['error_code'],'restore_target_must_be_empty')

if __name__=='__main__':unittest.main()
