"""Offline API contract tests. Database calls are isolated; no live records/SMS are used."""
import os,re,io,tarfile,json,hashlib,importlib.util
from pathlib import Path
from uuid import uuid4
from datetime import datetime,timezone
from PIL import Image
import pytest
os.environ.setdefault('DATABASE_URL','postgresql://test:test@127.0.0.1/test')
os.environ.setdefault('JWT_SECRET','test-secret-only')
from fastapi.testclient import TestClient
from pglast import parse_sql
from backend.app import main,launch
from backend.app.auth import current_user
from backend.app.seller_auth import require_seller

USER={'sub':str(uuid4()),'role':'owner'}
PROPERTY={'public_code':'EV-101','property_code':'villa_house','property_type':'خانهٔ ویلایی','region':'بردسپی','region_key':'R-1','neighborhood':'بردسپی','asking_price_toman':15555000000,'updated_at':datetime(2026,10,29,tzinfo=timezone.utc),'published_at':datetime(2026,10,28,tzinfo=timezone.utc),'area_m2':200,'building_area_m2':120,'media':[],'public_notes':'توضیحات عمومی'}
class Cursor:
 def __init__(self,rows):self.rows=rows
 def fetchone(self):return self.rows[0] if self.rows else None
 def fetchall(self):return self.rows
class DB:
 def __init__(self):self.calls=[];self.hits=1;self.media={};self.missing=False
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def connection(self):return self
 def transaction(self):return self
 def commit(self):pass
 def rollback(self):pass
 def execute(self,sql,params=()):
  parse_sql(re.sub(r'%s','NULL',sql));self.calls.append((sql,params))
  if 'RETURNING hits' in sql:return Cursor([{'hits':self.hits}])
  if 'INSERT INTO app.uploaded_media' in sql:
   self.media[params[3]]={'owner_id':params[1],'owner_role':params[2],'kind':params[4]};return Cursor([])
  if 'FROM app.uploaded_media' in sql:return Cursor([self.media[params[0]]]) if params[0] in self.media else Cursor([])
  if 'SELECT code FROM app.property_types' in sql:return Cursor([{'code':'villa_house'}])
  if 'SELECT id FROM app.property_types' in sql:return Cursor([{'id':USER['sub']}])
  if 'SELECT id,name FROM app.regions' in sql:return Cursor([{'id':USER['sub'],'name':'اوز'}])
  if 'INSERT INTO app.properties' in sql:return Cursor([{'id':USER['sub'],'public_code':params[0]}])
  if 'INSERT INTO app.market_records' in sql:return Cursor([{'id':USER['sub']}])
  if 'SELECT id,status FROM app.properties' in sql:return Cursor([{'id':USER['sub'],'status':'آگهی فروش'}])
  if 'SELECT l.id,l.asking_price_toman' in sql:return Cursor([{'id':USER['sub'],'asking_price_toman':15000000000}])
  if 'SELECT q.*' in sql:return Cursor([{**PROPERTY,'total':1}])
  if 'JOIN LATERAL' in sql:return Cursor([] if self.missing else [PROPERTY])
  if 'SELECT * FROM app.contact_requests' in sql:return Cursor([])
  if 'UPDATE app.contact_requests' in sql:return Cursor([{'id':str(uuid4())}])
  if 'count(DISTINCT session_id)' in sql and 'GROUP BY' not in sql:return Cursor([{'count':2}])
  if 'average_seconds' in sql:return Cursor([{'average_seconds':15}])
  if 'SELECT count(*) AS count' in sql:return Cursor([{'count':0}])
  return Cursor([])
@pytest.fixture
def env(monkeypatch,tmp_path):
 db=DB();monkeypatch.setenv('MEDIA_DIR',str(tmp_path/'media'));monkeypatch.setattr(launch,'pool',db);monkeypatch.setattr(main,'pool',db);monkeypatch.setattr(launch,'MEDIA_ROOT',tmp_path/'media');main.app.dependency_overrides.clear()
 yield db,TestClient(main.app,raise_server_exceptions=False)
 main.app.dependency_overrides.clear()
def admin():main.app.dependency_overrides[current_user]=lambda:USER

def test_public_detail_exact_price_and_timestamp(env):
 db,client=env;r=client.get('/api/public/property-detail?code=EV-101');assert r.status_code==200
 assert r.json()['item']['asking_price_toman']==15555000000
 assert r.json()['item']['updated_at'].startswith('2026-10-29')
 assert 'private_address' not in launch.PUBLIC_SELECT and 'seller_phone' not in launch.PUBLIC_SELECT
 assert any(params==('EV-101',) for _,params in db.calls)
 db.missing=True;assert client.get('/api/public/property-detail?code=missing').status_code==404

def test_search_parameterized_multiple_regions_and_boundaries(env):
 db,c=env;r=c.get('/api/public/search?kind=land&regions=R-1,R-2&min_price=1000000000&max_price=100000000000&min_area=50&max_area=1000&sort=price_asc')
 assert r.status_code==200 and r.json()['total']==1
 sql,params=next(x for x in db.calls if 'SELECT q.*' in x[0]);assert ['R-1','R-2'] in params and 'asking_price_toman ASC' in sql
 for query in ['min_price=0','max_area=1001','kind=invalid','sort=DROP','min_area=800&max_area=60']:
  assert c.get('/api/public/search?'+query).status_code==422

def test_contact_request_normalizes_phone_and_does_not_add_marketing(env):
 db,c=env;r=c.post('/api/public/contact-requests',json={'name':'علی احمدی','phone':'۰۹۲۱۲۷۴۵۷۵۵','description':'درخواست مشاوره'})
 assert r.status_code==201
 sql,params=next(x for x in db.calls if 'INSERT INTO app.contact_requests' in x[0]);assert params[1]=='09212745755'
 assert not any('customer_contacts' in sql for sql,_ in db.calls)
 assert c.post('/api/public/contact-requests',json={'name':'علی','phone':'1234567890'}).status_code==422

def test_admin_reports_private_and_role_checked(env):
 _,c=env
 for path in ['/analytics','/operations','/contact-requests']:
  assert c.get('/api/admin'+path).status_code==401
 admin()
 assert c.get('/api/admin/analytics?days=7').json()['sessions']==2
 assert c.get('/api/admin/analytics?days=999').status_code==422
 assert c.get('/api/admin/operations').status_code==200
 main.app.dependency_overrides[current_user]=lambda:{**USER,'role':'viewer'}
 assert c.get('/api/admin/analytics').status_code==403

def test_event_fields_are_whitelisted_and_no_form_content_collected(env):
 db,c=env;r=c.post('/api/public/events',json={'event':'search_empty','session_id':str(uuid4()),'path':'/search','details':{'kind':'land','results':0,'phone':'09212745755','description':'secret'}})
 assert r.status_code==202
 params=next(p for sql,p in db.calls if 'INSERT INTO app.site_events' in sql)
 assert params[-1].obj=={'kind':'land','results':0}
 assert c.post('/api/public/events',json={'event':'anything','session_id':str(uuid4()),'path':'/'}).status_code==422

def test_upload_auth_content_limits_and_ownership(env):
 db,c=env;assert c.post('/api/admin/media',files={'file':('a.png',b'x','image/png')}).status_code==401
 admin();assert c.post('/api/admin/media',files={'file':('a.svg',b'<svg/>','image/svg+xml')}).status_code==422
 photo=io.BytesIO();Image.new('RGB',(4,4),'red').save(photo,format='PNG')
 r=c.post('/api/admin/media',files={'file':('a.png',photo.getvalue(),'image/png')});assert r.status_code==200
 data=r.json();filename=data['url'].split('/')[-1]
 assert c.get('/api/public/media/'+filename).headers['content-type']=='image/webp'
 item=launch.MediaItem(**data)
 with pytest.raises(Exception):launch.validate_media([item],{'id':str(uuid4()),'role':'seller'})
 launch.validate_media([item],USER)
 video=launch.MediaItem(url=data['url'],kind='video')
 with pytest.raises(Exception):launch.validate_media([video],USER,False)
 assert c.post('/api/admin/media',files={'file':('big.png',b'\x89PNG\r\n\x1a\n'+b'x'*(8*1024*1024),'image/png')}).status_code==413

def test_rate_limits_and_cross_origin_posts(env):
 db,c=env
 r=c.post('/api/public/contact-requests',headers={'Origin':'https://untrusted.example'},json={'name':'علی','phone':'09212745755'});assert r.status_code==403
 db.hits=11
 assert c.post('/api/public/contact-requests',json={'name':'علی','phone':'09212745755'}).status_code==429
 assert c.post('/api/auth/login',json={'email':'a@example.com','password':'12345678'}).status_code==429

def test_migration_and_backup_archive_guards(tmp_path):
 parse_sql(Path('database/migrations/0013_launch_features.sql').read_text())
 spec=importlib.util.spec_from_file_location('maintenance','backend/scripts/maintenance.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 archive=tmp_path/'bad.tar.gz'
 with tarfile.open(archive,'w:gz') as tar:
  info=tarfile.TarInfo('../escape');info.size=1;tar.addfile(info,io.BytesIO(b'x'))
 with pytest.raises(ValueError):
  with tarfile.open(archive) as tar:module.archive_members(tar)
 with pytest.raises(RuntimeError):module.restore(archive,'')


def test_admin_create_and_edit_store_gallery_in_same_transaction(env):
 db,c=env;admin()
 filename=str(uuid4())+'.webp'
 db.media[filename]={'owner_id':USER['sub'],'owner_role':'owner','kind':'image'}
 media={'url':launch.MEDIA_BASE+'/'+filename,'kind':'image'}
 payload={'public_code':'EV-101','property_type_id':USER['sub'],'region_id':USER['sub'],'status':'آگهی فروش','asking_price_toman':15555000000,'media':[media],'notes':'توضیحات عمومی'}
 assert c.post('/api/admin/properties/direct',json=payload).status_code==200
 assert any('UPDATE app.properties SET media=' in sql and params[0].obj==[media] for sql,params in db.calls)
 db.calls.clear()
 assert c.put('/api/admin/properties/EV-101/direct',json=payload).status_code==200
 assert any('UPDATE app.properties SET media=' in sql for sql,_ in db.calls)
 assert any('listing_price_history' in sql for sql,_ in db.calls)
