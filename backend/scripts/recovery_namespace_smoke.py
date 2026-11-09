"""CI-only regression with disposable databases on the isolated restore service."""
import json,os,subprocess,tempfile
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
import psycopg
from psycopg import sql
from recovery_rehearsal import validate_target,restore_app,restore_error_code
from cloud_backup import pg_environment

def main():
 base=os.environ['RESTORE_DATABASE_URL'];parts=urlsplit(base)
 # All connections remain on the isolated service; no production secret is used.
 source=urlunsplit(parts._replace(path='/evaz_restore_fixture_source'))
 target=urlunsplit(parts._replace(path='/evaz_restore_fixture_target'))
 validate_target(base,source);validate_target(base,target)
 with psycopg.connect(base,autocommit=True,connect_timeout=20) as conn:
  for name in ('evaz_restore_fixture_source','evaz_restore_fixture_target'):
   if conn.execute('SELECT 1 FROM pg_database WHERE datname=%s',(name,)).fetchone():raise RuntimeError('fixture_database_already_exists')
   conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
 with psycopg.connect(source,connect_timeout=20) as conn:
  conn.execute('CREATE SCHEMA app');conn.execute('CREATE TABLE app.fixture(id integer PRIMARY KEY)');conn.execute('INSERT INTO app.fixture VALUES (1)')
 with tempfile.TemporaryDirectory(prefix='evaz-schema-fixture-') as folder:
  dump=Path(folder)/'fixture.dump'
  result=subprocess.run(['pg_dump','--format=custom','--no-owner','--no-acl','--file',str(dump)],env=pg_environment(source),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
  if result.returncode:raise RuntimeError('fixture_dump_failed')
  args=['pg_restore','--schema=app','--no-owner','--no-acl','--exit-on-error','--single-transaction','--dbname','evaz_restore_fixture_target',str(dump)]
  old=subprocess.run(args,env=pg_environment(target),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
  if not old.returncode or restore_error_code(old.stderr)!='missing_schema':raise RuntimeError('schema_regression_not_reproduced')
  with psycopg.connect(target,connect_timeout=20) as conn:conn.execute('CREATE SCHEMA app')
  restore_app(dump,target,{'PGDATABASE':'evaz_restore_fixture_target'})
 with psycopg.connect(target,connect_timeout=20) as conn:
  if conn.execute('SELECT count(*) FROM app.fixture').fetchone()[0]!=1:raise RuntimeError('fixture_restore_wrong_count')
 print(json.dumps({'synthetic_schema_regression':'passed','old_filtered_restore':'missing_schema','prepared_target_restore':'passed','production_accessed':False}))
if __name__=='__main__':
 try:main()
 except Exception:
  print('Synthetic schema regression failed; no production database was accessed.');raise SystemExit(1)
