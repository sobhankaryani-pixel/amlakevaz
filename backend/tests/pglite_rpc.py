"""Tiny synchronous test adapter; runs actual PostgreSQL SQL in isolated PGlite."""
import json,os,subprocess,threading
from pathlib import Path
class Cursor:
 def __init__(self,rows):self.rows=rows
 def fetchone(self):return self.rows[0] if self.rows else None
 def fetchall(self):return self.rows
class Database:
 def __init__(self):
  self.lock=threading.RLock();self.depth=0
  self.child=subprocess.Popen(['node',str(Path(__file__).with_suffix('.mjs'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,env=os.environ.copy())
  assert json.loads(self.child.stdout.readline())['ready']
 def connection(self):return self
 def __enter__(self):self.lock.acquire();return self
 def __exit__(self,*args):self.lock.release()
 def execute(self,sql,params=()):
  with self.lock:
   number=0
   def placeholder(_):
    nonlocal number
    number+=1;return '$'+str(number)
   import re
   sql=re.sub('%s',placeholder,sql)
   params=[p.obj if hasattr(p,'obj') else str(p) if p.__class__.__name__ in ('UUID','Decimal') else p for p in params]
   self.child.stdin.write(json.dumps({'sql':sql,'params':params})+'\n');self.child.stdin.flush()
   result=json.loads(self.child.stdout.readline())
   if 'error' in result:raise RuntimeError(result['error'])
   return Cursor(result['rows'])
 def transaction(self):
  db=self
  class Transaction:
   def __enter__(self):db.execute('BEGIN');return db
   def __exit__(self,t,*args):db.execute('ROLLBACK' if t else 'COMMIT')
  return Transaction()
 def commit(self):pass
 def close(self):self.child.stdin.close();self.child.wait(timeout=10)
