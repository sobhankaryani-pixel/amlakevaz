"""No live storage: access controls must run before opening any file."""
import os
os.environ.setdefault('DATABASE_URL','postgresql://test:test@127.0.0.1/test')
os.environ.setdefault('JWT_SECRET','test-secret-only')
from contextlib import contextmanager
from types import SimpleNamespace
from uuid import uuid4
import jwt,pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.app import private_media as pm,launch,main
from backend.app.config import settings
from backend.app.auth import current_user
from backend.app.seller_auth import require_seller
from backend.app.agency import agency_user

NAME=str(uuid4())+'.webp'
class DB:
 def __init__(self,row):self.row=row
 @contextmanager
 def connection(self):yield self
 def execute(self,*args):return self
 def fetchone(self):return self.row

@pytest.fixture
def env(monkeypatch):
 row={'owner_id':str(uuid4()),'owner_role':'seller','cleanup_state':'active'}
 db=DB(row);monkeypatch.setattr(pm,'pool',db)
 calls=[]
 monkeypatch.setattr(pm,'serve_media',lambda filename,request,private=False:calls.append((filename,private)) or {'ok':True})
 main.app.dependency_overrides.clear()
 yield row,db,calls,TestClient(main.app)
 main.app.dependency_overrides.clear()

def test_seller_owns_file_role_and_account_are_both_required(env):
 row,db,calls,c=env
 assert c.get('/api/seller/media/view/'+NAME).status_code==401
 main.app.dependency_overrides[require_seller]=lambda:{'id':row['owner_id']}
 assert c.get('/api/seller/media/view/'+NAME).status_code==200
 assert calls==[(NAME,True)]
 row['owner_role']='agency'
 assert c.get('/api/seller/media/view/'+NAME).status_code==404
 row['owner_role']='seller';row['owner_id']=str(uuid4())
 # Pin the identity so a different owner's file cannot be opened.
 main.app.dependency_overrides[require_seller]=lambda:{'id':'someone-else'}
 assert c.get('/api/seller/media/view/'+NAME).status_code==404
 assert len(calls)==1

def test_agency_isolation_and_deleted_files(env):
 row,db,calls,c=env
 main.app.dependency_overrides[agency_user]=lambda:{'id':row['owner_id'],'role':'agency'}
 assert c.get('/api/agency/media/view/'+NAME).status_code==404
 row['owner_role']='agency'
 assert c.head('/api/agency/media/view/'+NAME).status_code==200
 row['cleanup_state']='deleting'
 assert c.get('/api/agency/media/view/'+NAME).status_code==404
 assert len(calls)==1

def test_admin_cookie_is_scoped_not_a_regular_login_token(env,monkeypatch):
 row,db,calls,c=env
 raw={'sub':str(uuid4()),'exp':4102444800,'session_stamp':'a'*64}
 main.app.dependency_overrides[current_user]=lambda:{'sub':raw['sub'],'role':'owner'}
 bearer=jwt.encode(raw,settings.jwt_secret,algorithm='HS256')
 c=TestClient(main.app,base_url='https://testserver')
 response=c.post('/api/admin/media/session',headers={'Authorization':'Bearer '+bearer})
 assert response.status_code==200
 cookie=response.headers['set-cookie']
 assert 'HttpOnly' in cookie and 'Secure' in cookie and 'Path=/api/admin/media/view' in cookie
 signed=c.cookies.get(pm.COOKIE)
 with pytest.raises(jwt.InvalidAudienceError):jwt.decode(signed,settings.jwt_secret,algorithms=['HS256'])
 seen=[]
 monkeypatch.setattr(pm,'current_user',lambda credentials:seen.append(credentials.credentials) or {'sub':raw['sub'],'role':'owner'})
 assert c.get('/api/admin/media/view/'+NAME).status_code==200
 assert seen and calls==[(NAME,True)]
 monkeypatch.setattr(pm,'current_user',lambda credentials:(_ for _ in ()).throw(HTTPException(401)))
 assert c.get('/api/admin/media/view/'+NAME).status_code==401

@pytest.mark.parametrize('role',['viewer','analyst','editor'])
def test_unprivileged_admin_cannot_create_preview_session(env,role):
 row,db,calls,c=env
 main.app.dependency_overrides[current_user]=lambda:{'sub':str(uuid4()),'role':role}
 assert c.post('/api/admin/media/session').status_code==403
 assert not calls

def test_private_errors_are_not_cacheable_and_paths_cannot_traverse(env):
 row,db,calls,c=env
 r=c.get('/api/admin/media/view/'+NAME)
 assert r.status_code==401 and 'no-store' in r.headers['cache-control']
 main.app.dependency_overrides[require_seller]=lambda:{'id':row['owner_id']}
 assert c.get('/api/seller/media/view/not-a-uuid.webp').status_code==404
 assert not calls

def test_data_entry_sees_only_own_upload(env):
 row,db,calls,c=env
 main.app.dependency_overrides[pm.preview_admin]=lambda:{'sub':row['owner_id'],'role':'data_entry'}
 assert c.get('/api/admin/media/view/'+NAME).status_code==404
 row['owner_role']='data_entry'
 assert c.get('/api/admin/media/view/'+NAME).status_code==200

def test_public_access_denied_before_storage_and_allows_revalidation(monkeypatch):
 calls=[];monkeypatch.setattr(launch,'public_media_allowed',lambda name:False)
 monkeypatch.setattr(launch,'serve_media',lambda *args:calls.append(args))
 with pytest.raises(HTTPException) as error:launch.media_file(NAME,SimpleNamespace())
 assert error.value.status_code==404 and not calls

def test_publication_sql_against_postgres_engine(monkeypatch):
 import json,subprocess
 module=os.getenv('PGLITE_MODULE')
 if not module:pytest.skip('PGLITE_MODULE not configured')
 captured=[]
 class Capture(DB):
  def execute(self,sql,params):captured.append((sql,params));return self
 monkeypatch.setattr(launch,'pool',Capture(None))
 launch.public_media_allowed(NAME)
 script="""
 import {pathToFileURL} from 'node:url';
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
 let input='';for await(const c of process.stdin)input+=c;
 const {sql,params}=JSON.parse(input);const db=new PGlite();
 await db.exec(`CREATE SCHEMA app;
 CREATE TABLE app.properties(id int,status text,cover_photo_url text,media jsonb);
 CREATE TABLE app.listings(market_record_id int,is_public bool,status text);
 CREATE TABLE app.market_records(id int,property_id int);
 CREATE TABLE app.homepage_promotions(is_active bool,image_url text);`);
 const query=sql.replace(/%s/g,(()=>{let i=0;return()=>'$'+(++i)})());
 const allowed=async()=>Boolean((await db.query(query,params)).rows.length);
 const assert=(x)=>{if(!x)throw Error('Publication boundary failed')};
 assert(!await allowed());
 await db.query(`INSERT INTO app.properties VALUES(1,'آگهی فروش',$1,'[]')`,[params[0]]);
 await db.exec(`INSERT INTO app.market_records VALUES(1,1);INSERT INTO app.listings VALUES(1,false,'draft')`);
 assert(!await allowed());
 await db.exec(`UPDATE app.listings SET is_public=true,status='published'`);assert(await allowed());
 await db.exec(`UPDATE app.properties SET status='فروخته شد'`);assert(!await allowed());
 await db.exec(`UPDATE app.properties SET status='آگهی فروش';UPDATE app.listings SET is_public=false`);assert(!await allowed());
 await db.query(`INSERT INTO app.homepage_promotions VALUES(false,$1)`,[params[0]]);assert(!await allowed());
 await db.exec(`UPDATE app.homepage_promotions SET is_active=true`);assert(await allowed());
 await db.exec(`DELETE FROM app.homepage_promotions;UPDATE app.listings SET is_public=true;UPDATE app.properties SET cover_photo_url=NULL`);
 await db.query(`UPDATE app.properties SET media=$1`,[JSON.stringify([{url:params[0]+'extra'}])]);assert(!await allowed());
 await db.query(`UPDATE app.properties SET media=$1`,[JSON.stringify([{url:params[0]}])]);assert(await allowed());
 await db.close();
 """
 result=subprocess.run(['node','--input-type=module','-e',script],input=json.dumps({'sql':captured[0][0],'params':captured[0][1]}),text=True,capture_output=True,timeout=45)
 assert result.returncode==0,result.stderr

def test_logout_removes_preview_cookie(env):
 row,db,calls,c=env
 c=TestClient(main.app,base_url='https://testserver')
 c.cookies.set(pm.COOKIE,'old-preview',domain='testserver.local',path='/api/admin/media/view')
 r=c.delete('/api/admin/media/session')
 assert r.status_code==200 and 'Max-Age=0' in r.headers['set-cookie']
 assert c.get('/api/admin/media/view/'+NAME).status_code==401
 assert not calls
