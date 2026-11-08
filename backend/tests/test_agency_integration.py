"""Optional isolated PostgreSQL/PGlite integration. Never point this at production.
Run with AGENCY_TEST_DATABASE_URL for a disposable database migrated through 0021.
"""
import os
from uuid import uuid4
import pytest
os.environ.setdefault('DATABASE_URL','postgresql://test:test@127.0.0.1/test')
os.environ.setdefault('JWT_SECRET','integration-only-secret')
from fastapi.testclient import TestClient
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row
from backend.app import main,agency,inquiries,auth,launch,media_cleanup,seller_auth,property_codes

@pytest.fixture
def system(monkeypatch):
 url=os.getenv('AGENCY_TEST_DATABASE_URL')
 if os.getenv('AGENCY_TEST_PGLITE'):
  from backend.tests.pglite_rpc import Database
  db=Database()
 elif url:db=ConnectionPool(url,min_size=1,max_size=1,kwargs={'row_factory':dict_row},open=True)
 else:pytest.skip('Disposable integration database not configured')
 for mod in (main,agency,inquiries,auth,launch,media_cleanup,seller_auth,property_codes):monkeypatch.setattr(mod,'pool',db)
 owner_id=str(uuid4());password='Agency-test-1234';hashed=auth.hash_password(password)
 with db.connection() as c:
  c.execute("INSERT INTO app.users(id,email,password_hash,role) VALUES (%s,%s,%s,'owner')",(owner_id,owner_id+'@example.invalid',hashed))
  for code in ('raw_land','villa_house','apartment','mehr_housing','national_housing','shop','urban_garden'):
   c.execute('INSERT INTO app.property_types(code,name,category) VALUES (%s,%s,%s) ON CONFLICT(code) DO NOTHING',(code,code,'test'))
  c.execute("INSERT INTO app.regions(name,slug) VALUES ('منطقه آزمایشی','R-QA') ON CONFLICT(slug) DO NOTHING");c.commit()
 token=auth.create_token(owner_id,'owner',hashed)
 client=TestClient(main.app,base_url='https://api.evazmelk.ir',raise_server_exceptions=True)
 yield client,db,{'Authorization':'Bearer '+token},password
 client.close();db.close()

def must(r,status=200):
 assert r.status_code==status,(r.status_code,r.text)
 return r.json()

def test_complete_agency_buyer_workflow(system):
 c,db,owner,password=system
 # Authentication and authorization do not depend on hidden frontend navigation.
 assert c.get('/api/agency/files').status_code==401
 suffix=uuid4().hex[:10];username='qa_'+suffix
 aid=must(c.post('/api/admin/agencies',headers=owner,json={'name':'بنگاه آزمایشی','username':username,'phone':'09123456789','password':password}),201)['id']
 assert c.post('/api/agency/login',json={'username':username,'password':'wrong'}).status_code==401
 must(c.post('/api/agency/login',json={'username':username,'password':password}))
 assert c.cookies.get('evaz_agency_session')
 assert c.get('/api/admin/agencies').status_code==401
 assert must(c.get('/api/agency/me'))['user']['id']==aid
 file_id=str(uuid4());details={'kind':'land','region_key':'R-QA','usage_type':'مسکونی','area_m2':200,'asking_price_toman':5000000000,'extra_details':'مشخصات عمومی','media':[]}
 save=must(c.put('/api/agency/files/'+file_id,json={'details':details,'expected_version':0}));assert save['version']==1
 assert c.put('/api/agency/files/'+file_id,json={'details':details,'expected_version':0}).status_code==409
 rid=must(c.post('/api/agency/files/'+file_id+'/submit',json={'expected_version':1}))['id']
 assert c.put('/api/agency/files/'+file_id,json={'details':details,'expected_version':1}).status_code==409
 with db.connection() as conn:assert conn.execute('SELECT property_id FROM app.agency_files WHERE id=%s',(file_id,)).fetchone()['property_id'] is None
 must(c.post('/api/admin/agency-requests/'+rid+'/review',headers=owner,json={'decision':'approved','latitude':27.75,'longitude':54.0}))
 assert c.post('/api/admin/agency-requests/'+rid+'/review',headers=owner,json={'decision':'approved'}).status_code==409
 f=next(x for x in must(c.get('/api/agency/files'))['items'] if x['id']==file_id);code=f['public_code'];assert code
 public=must(c.get('/api/public/property-detail?code='+code))['item'];assert public['asking_price_toman']==5000000000
 assert 'agency_phone' not in public and 'seller_phone' not in public
 assert any(x['public_code']==code for x in must(c.get('/api/public/map-listings'))['items'])
 # Draft/new review cannot overwrite the already published advertisement.
 details['asking_price_toman']=6000000000
 must(c.put('/api/agency/files/'+file_id,json={'details':details,'expected_version':1}))
 rid=must(c.post('/api/agency/files/'+file_id+'/submit',json={'expected_version':2}))['id']
 assert must(c.get('/api/public/property-detail?code='+code))['item']['asking_price_toman']==5000000000
 assert c.post('/api/admin/agency-requests/'+rid+'/review',headers=owner,json={'decision':'rejected'}).status_code==422
 must(c.post('/api/admin/agency-requests/'+rid+'/review',headers=owner,json={'decision':'approved'}))
 assert must(c.get('/api/public/property-detail?code='+code))['item']['asking_price_toman']==6000000000
 # Successful callback writes one inquiry + CRM consent + one conversion; retry is idempotent.
 iid=str(uuid4());buyer={'id':iid,'property_code':code,'phone':'09120000123','name':'خریدار آزمایشی','purpose':'visit','marketing_consent':True}
 # A callback does not require marketing consent.
 declined={**buyer,'id':str(uuid4()),'phone':'09120000124','marketing_consent':False}
 must(c.post('/api/public/property-inquiries',json=declined),201)
 with db.connection() as conn:
  row=conn.execute('SELECT marketing_opt_in,consent_at,consent_source FROM app.customer_contacts WHERE phone=%s',(declined['phone'],)).fetchone()
  assert not row['marketing_opt_in'] and row['consent_at'] is None and row['consent_source'] is None
 must(c.post('/api/public/property-inquiries',json=buyer),201);must(c.post('/api/public/property-inquiries',json=buyer),201)
 with db.connection() as conn:
  assert conn.execute('SELECT count(*) AS n FROM app.property_inquiries WHERE id=%s',(iid,)).fetchone()['n']==1
  contact=conn.execute('SELECT marketing_opt_in,consent_at,consent_source FROM app.customer_contacts WHERE phone=%s',(buyer['phone'],)).fetchone();assert contact['marketing_opt_in'] and contact['consent_at'] and contact['consent_source']=='property_inquiry_notice_v2'
 # Omitting a new opt-in must preserve previously granted consent.
 must(c.post('/api/public/property-inquiries',json={**buyer,'id':str(uuid4()),'marketing_consent':False}),201)
 with db.connection() as conn:
  row=conn.execute('SELECT marketing_opt_in,consent_source FROM app.customer_contacts WHERE phone=%s',(buyer['phone'],)).fetchone()
  assert row['marketing_opt_in'] and row['consent_source']=='property_inquiry_notice_v2'
 assert c.get('/api/admin/property-inquiries').status_code==401
 rows=must(c.get('/api/admin/property-inquiries',headers=owner))['items'];assert any(x['id']==iid and x['property_code']==code and x['phone']==buyer['phone'] for x in rows)
 must(c.put('/api/admin/property-inquiries/'+iid,headers=owner,json={'status':'followed_up'}))
 # Another agency cannot read or mutate the first one's files.
 other='other_'+suffix
 must(c.post('/api/admin/agencies',headers=owner,json={'name':'بنگاه دوم','username':other,'phone':'09123456788','password':password}),201)
 must(c.post('/api/agency/login',json={'username':other,'password':password}))
 assert not must(c.get('/api/agency/files'))['items']
 assert c.put('/api/agency/files/'+file_id,json={'details':details,'expected_version':2}).status_code==404
 assert c.post('/api/agency/files/'+file_id+'/submit',json={'expected_version':2}).status_code==404
 # Account suspension invalidates an already issued cookie.
 must(c.post('/api/agency/login',json={'username':username,'password':password}))
 must(c.put('/api/admin/agencies/'+aid,headers=owner,json={'is_active':False}))
 assert c.get('/api/agency/me').status_code==401
 must(c.put('/api/admin/agencies/'+aid,headers=owner,json={'is_active':True}))
 must(c.post('/api/agency/login',json={'username':username,'password':password}))
 rid=must(c.post('/api/agency/files/'+file_id+'/submit',json={'expected_version':2,'action':'remove'}))['id']
 assert c.get('/api/public/property-detail?code='+code).status_code==200
 must(c.post('/api/admin/agency-requests/'+rid+'/review',headers=owner,json={'decision':'approved'}))
 assert c.get('/api/public/property-detail?code='+code).status_code==404
 assert not any(x['public_code']==code for x in must(c.get('/api/public/map-listings'))['items'])
 assert c.post('/api/public/property-inquiries',json={**buyer,'id':str(uuid4())}).status_code==404
 must(c.post('/api/agency/logout'));assert c.get('/api/agency/me').status_code==401

def test_media_privacy_roles_rejection_and_conflicting_review(system):
 c,db,owner,password=system;suffix=uuid4().hex[:10];username='safe_'+suffix
 aid=must(c.post('/api/admin/agencies',headers=owner,json={'name':'بنگاه ایمن','username':username,'phone':'09123456789','password':password}),201)['id']
 must(c.post('/api/agency/login',json={'username':username,'password':password}))
 fid=str(uuid4());base={'kind':'land','region_key':'R-QA','usage_type':'مسکونی','area_m2':100,'asking_price_toman':1000000000,'media':[]}
 filename=str(uuid4())+'.webp';url=launch.MEDIA_BASE+'/'+filename
 with db.connection() as conn:
  conn.execute("INSERT INTO app.uploaded_media(id,owner_id,owner_role,filename,kind,size_bytes) VALUES (gen_random_uuid(),%s,'agency',%s,'image',100)",(str(uuid4()),filename));conn.commit()
 assert c.put('/api/agency/files/'+fid,json={'expected_version':0,'details':{**base,'media':[{'url':url,'kind':'image'}]}}).status_code==403
 # Own media is protected from cleanup while referenced by draft/review.
 with db.connection() as conn:
  conn.execute('UPDATE app.uploaded_media SET owner_id=%s WHERE filename=%s',(aid,filename));conn.commit()
 base['media']=[{'url':url,'kind':'image'}]
 must(c.put('/api/agency/files/'+fid,json={'expected_version':0,'details':base}))
 with db.connection() as conn:
  assert conn.execute('SELECT '+media_cleanup.REFERENCES+' AS orphan FROM app.uploaded_media u WHERE filename=%s',(filename,)).fetchone()['orphan'] is False
  conn.execute("UPDATE app.uploaded_media SET cleanup_state='deleting' WHERE filename=%s",(filename,));conn.commit()
 assert c.post('/api/agency/files/'+fid+'/submit',json={'expected_version':1}).status_code==409
 with db.connection() as conn:conn.execute("UPDATE app.uploaded_media SET cleanup_state='active' WHERE filename=%s",(filename,));conn.commit()
 # Public notes cannot advertise a private phone; failed validation leaves file editable.
 private={**base,'extra_details':'تماس ۰۹۱۲۳۴۵۶۷۸۹'}
 must(c.put('/api/agency/files/'+fid,json={'expected_version':1,'details':private}))
 assert c.post('/api/agency/files/'+fid+'/submit',json={'expected_version':2}).status_code==422
 must(c.put('/api/agency/files/'+fid,json={'expected_version':2,'details':base}))
 rid=must(c.post('/api/agency/files/'+fid+'/submit',json={'expected_version':3}))['id']
 with db.connection() as conn:
  uid=str(uuid4());ph=auth.hash_password(password);conn.execute("INSERT INTO app.users(id,email,password_hash,role) VALUES (%s,%s,%s,'admin')",(uid,uid+'@example.invalid',ph));conn.commit()
 limited={'Authorization':'Bearer '+auth.create_token(uid,'admin',ph)}
 assert c.get('/api/admin/agency-requests',headers=limited).status_code==403
 assert c.post('/api/admin/agency-requests/'+rid+'/review',headers=limited,json={'decision':'approved'}).status_code==403
 must(c.post('/api/admin/agency-requests/'+rid+'/review',headers=owner,json={'decision':'rejected','note':'عکس واضح‌تر لازم است.'}))
 assert next(x for x in must(c.get('/api/agency/files'))['items'] if x['id']==fid)['review_note']=='عکس واضح‌تر لازم است.'
 rid=must(c.post('/api/agency/files/'+fid+'/submit',json={'expected_version':3}))['id']
 must(c.post('/api/admin/agency-requests/'+rid+'/review',headers=owner,json={'decision':'approved'}))
 f=next(x for x in must(c.get('/api/agency/files'))['items'] if x['id']==fid)
 must(c.put('/api/agency/files/'+fid,json={'expected_version':3,'details':{**base,'asking_price_toman':2000000000}}))
 rid=must(c.post('/api/agency/files/'+fid+'/submit',json={'expected_version':4}))['id']
 with db.connection() as conn:conn.execute("UPDATE app.properties SET public_notes='ویرایش مدیریت' WHERE id=%s",(f['property_id'],));conn.commit()
 assert c.post('/api/admin/agency-requests/'+rid+'/review',headers=owner,json={'decision':'approved'}).status_code==409
 assert must(c.get('/api/public/property-detail?code='+f['public_code']))['item']['asking_price_toman']==1000000000
 # Password reset revokes a previously issued agency cookie.
 must(c.put('/api/admin/agencies/'+aid,headers=owner,json={'password':password+'new'}))
 assert c.get('/api/agency/me').status_code==401
 assert c.post('/api/agency/login',json={'username':username,'password':password}).status_code==401
 must(c.post('/api/agency/login',json={'username':username,'password':password+'new'}))

def test_all_seven_agency_property_types_publish_without_transaction_data(system):
 c,db,owner,password=system;username='types_'+uuid4().hex[:10]
 must(c.post('/api/admin/agencies',headers=owner,json={'name':'انواع املاک','username':username,'phone':'09123456789','password':password}),201)
 must(c.post('/api/agency/login',json={'username':username,'password':password}))
 variants=[('land',{'area_m2':100,'usage_type':'مسکونی'}),('villa',{'area_m2':150,'building_area_m2':120,'house_condition':'نوساز'}),('apartment',{'building_area_m2':80}),('mehr',{'building_area_m2':90,'mehr_section':'محلی','mehr_level':'بالا'}),('national',{'building_area_m2':90,'national_phase':'1','national_block':'2','national_level':'بالا','national_stage':'کامل‌شده'}),('shop',{'commercial_area_m2':30}),('garden',{'area_m2':500})]
 codes=[]
 for kind,fields in variants:
  fid=str(uuid4());details={'kind':kind,'region_key':'R-QA','asking_price_toman':5000000000,**fields}
  must(c.put('/api/agency/files/'+fid,json={'details':details,'expected_version':0}))
  rid=must(c.post('/api/agency/files/'+fid+'/submit',json={'expected_version':1}))['id']
  must(c.post('/api/admin/agency-requests/'+rid+'/review',headers=owner,json={'decision':'approved'}))
  f=next(x for x in must(c.get('/api/agency/files'))['items'] if x['id']==fid);codes.append(f['public_code'])
  assert must(c.get('/api/public/property-detail?code='+f['public_code']))['item']['asking_price_toman']==5000000000
 assert len(set(codes))==7
 with db.connection() as conn:assert conn.execute('SELECT count(*) AS n FROM app.transactions').fetchone()['n']==0


def test_seller_submission_retries_return_one_receipt(system):
 c,db,owner,password=system
 with db.connection() as conn:
  seller=conn.execute("INSERT INTO app.customer_contacts(phone,name,account_enabled) VALUES ('09120000125','فروشنده آزمایشی',true) RETURNING id,phone,name").fetchone()
 main.app.dependency_overrides[seller_auth.require_seller]=lambda:seller
 try:
  payload={'request_id':str(uuid4()),'seller_name':seller['name'],'seller_phone':seller['phone'],'kind':'garden','area_m2':100,'asking_price_toman':3000000000}
  first=must(c.post('/api/seller/property-submissions',json=payload),201)
  again=must(c.post('/api/seller/property-submissions',json=payload),201)
  assert first['id']==again['id']
  assert c.post('/api/seller/property-submissions',json={**payload,'area_m2':101}).status_code==409
  with db.connection() as conn:
   assert conn.execute("SELECT count(*) AS n FROM app.property_submissions WHERE seller_id=%s AND details->>'request_id'=%s",(seller['id'],payload['request_id'])).fetchone()['n']==1
  second=must(c.post('/api/seller/property-submissions',json={**payload,'request_id':str(uuid4()),'area_m2':101}),201)
  assert second['id']!=first['id']
 finally:main.app.dependency_overrides.pop(seller_auth.require_seller,None)
