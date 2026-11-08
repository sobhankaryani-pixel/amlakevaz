import os,re
os.environ.setdefault('DATABASE_URL','postgresql://test:test@127.0.0.1/test')
os.environ.setdefault('JWT_SECRET','test-secret-only')
from contextlib import contextmanager
from datetime import datetime,timezone
from uuid import uuid4
import pytest
from pglast import parse_sql
from fastapi.testclient import TestClient
from backend.app import main,launch,availability
from backend.app.auth import current_user

class DB:
 def __init__(self):self.status='آگهی فروش';self.listed=True;self.exists=True;self.calls=[];self.row=None;self.checked=datetime(2026,11,8,tzinfo=timezone.utc);self.id=str(uuid4())
 @contextmanager
 def connection(self):yield self
 @contextmanager
 def transaction(self):yield self
 def execute(self,sql,params=()):
  parse_sql(re.sub(r'%s','NULL',sql));self.calls.append((sql,params));self.row=None
  if sql.startswith('SELECT id,status'):self.row={'id':self.id,'status':self.status} if self.exists else None
  elif sql.startswith('SELECT l.id'):self.row={'id':self.id} if self.listed else None
  elif 'INSERT INTO app.audit_logs' in sql:self.row={'created_at':self.checked}
  elif sql.startswith('SELECT p.status'):self.row={'status':self.status} if self.exists else None
  return self
 def fetchone(self):return self.row
@pytest.fixture
def env(monkeypatch):
 db=DB();monkeypatch.setattr(availability,'pool',db);monkeypatch.setattr(launch,'pool',db)
 main.app.dependency_overrides.clear()
 yield db,TestClient(main.app)
 main.app.dependency_overrides.clear()
def login(role):main.app.dependency_overrides[current_user]=lambda:{'sub':str(uuid4()),'role':role}

def test_manual_check_requires_login_and_allowed_role(env):
 db,c=env;path='/api/admin/properties/01/availability-check'
 assert c.post(path).status_code==401
 for role in ['viewer','analyst','editor']:
  login(role);assert c.post(path).status_code==403
 assert not db.calls
 for role in ['owner','admin','data_entry']:
  login(role);r=c.post(path);assert r.status_code==200 and r.json()['availability_checked_at'].startswith('2026-11-08')
 writes=[sql for sql,_ in db.calls if 'INSERT INTO' in sql]
 assert len(writes)==3 and all('availability_checked' in sql for sql in writes)
 assert not any('UPDATE app.properties' in sql or 'UPDATE app.listings' in sql for sql,_ in db.calls)

@pytest.mark.parametrize('status',['غیرفعال','فروخته شده'])
def test_check_does_not_reactivate_unavailable_property(env,status):
 db,c=env;db.status=status;login('owner')
 assert c.post('/api/admin/properties/01/availability-check').status_code==409
 assert not any('INSERT INTO' in sql for sql,_ in db.calls)

def test_no_public_listing_or_missing_property_cannot_get_check_date(env):
 db,c=env;login('owner');db.listed=False
 assert c.post('/api/admin/properties/01/availability-check').status_code==409
 db.exists=False
 assert c.post('/api/admin/properties/01/availability-check').status_code==404
 assert not any('INSERT INTO' in sql for sql,_ in db.calls)

@pytest.mark.parametrize('status,message',[('فروخته شده','فروخته شده'),('غیرفعال','متوقف شده')])
def test_unavailable_page_explains_state_without_exposing_private_details(env,status,message):
 db,c=env;db.status=status;r=c.get('/api/public/property-detail?code=01')
 assert r.status_code==404 and message in r.json()['detail']
 assert list(r.json())==['detail']
 assert not any('INSERT INTO' in sql for sql,_ in db.calls)

def test_check_query_uses_audit_event_not_update_or_publish_timestamp():
 assert "a.action='availability_checked'" in launch.PUBLIC_SELECT
 assert 'AS availability_checked_at' in launch.PUBLIC_SELECT
 assert 'last_checked=now' not in launch.PUBLIC_SELECT
