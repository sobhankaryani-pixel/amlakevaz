"""Real PostgreSQL semantics through disposable PGlite, never production."""
from uuid import uuid4
import pytest
from backend.tests.test_agency_integration import system,must
from backend.app import main
from backend.app.seller_auth import require_seller

@pytest.fixture
def seller_case(system):
 c,db,owner,password=system;sid=str(uuid4());phone='0912'+str(int(uuid4().hex[:8],16)%10000000).zfill(7)
 with db.connection() as conn:
  conn.execute("INSERT INTO app.customer_contacts(id,phone,name,account_enabled) VALUES (%s,%s,'فروشنده تست',true)",(sid,phone));conn.commit()
 user={'id':sid,'phone':phone,'name':'فروشنده تست'}
 main.app.dependency_overrides.clear();main.app.dependency_overrides[require_seller]=lambda:user
 body={'seller_name':'فروشنده تست','seller_phone':phone,'kind':'garden','area_m2':200,'region_key':'R-QA','asking_price_toman':5000000000,'media':[],'request_id':str(uuid4())}
 yield c,db,owner,user,body
 main.app.dependency_overrides.clear()

def test_rejection_reason_and_same_receipt_resubmission(seller_case):
 c,db,owner,user,body=seller_case
 sid=must(c.post('/api/seller/property-submissions',json=body),201)['id']
 path='/api/seller/property-submissions/'+sid
 assert c.get(path).status_code==409
 decision='/api/admin/property-submissions/'+sid+'/decision'
 for note in ['', '  ','ab']:
  assert c.post(decision,headers=owner,json={'status':'rejected','note':note}).status_code==422
 must(c.post(decision,headers=owner,json={'status':'rejected','note':'عکس واضح‌تر و قیمت صحیح ثبت کنید.'}))
 mine=must(c.get('/api/seller/my-submissions'))['items'][0]
 assert mine['review_note']=='عکس واضح‌تر و قیمت صحیح ثبت کنید.' and mine['status']=='rejected'
 details=must(c.get(path));assert details['revision']==0 and details['review_note']==mine['review_note']
 assert not any(k.startswith('_') for k in details['details'])
 corrected={**body,'area_m2':220,'request_id':str(uuid4()),'expected_revision':0}
 result=must(c.put(path+'/resubmit',json=corrected));assert result['id']==sid
 result=must(c.put(path+'/resubmit',json=corrected));assert result['id']==sid
 with db.connection() as conn:
  row=conn.execute('SELECT status,details,reviewed_at,reviewed_by FROM app.property_submissions WHERE id=%s',(sid,)).fetchone()
  assert row['status']=='pending' and row['details']['_revision']==1 and row['details']['area_m2']==220
  assert row['reviewed_at'] is None and row['reviewed_by'] is None
  assert conn.execute('SELECT count(*) AS n FROM app.property_submissions WHERE seller_id=%s',(user['id'],)).fetchone()['n']==1
  assert conn.execute("SELECT count(*) AS n FROM app.audit_logs WHERE entity_type='seller_submission' AND entity_id=%s",(sid,)).fetchone()['n']==1
 assert c.put(path+'/resubmit',json={**corrected,'area_m2':230}).status_code==409
 assert c.put(path+'/resubmit',json={**corrected,'request_id':str(uuid4())}).status_code==409
 must(c.post(decision,headers=owner,json={'status':'rejected','note':'یک بار دیگر بررسی کنید'}))
 assert c.put(path+'/resubmit',json={**corrected,'request_id':str(uuid4())}).status_code==409
 must(c.put(path+'/resubmit',json={**corrected,'request_id':str(uuid4()),'expected_revision':1}))

def test_other_seller_cannot_read_or_change_request(seller_case):
 c,db,owner,user,body=seller_case;sid=must(c.post('/api/seller/property-submissions',json=body),201)['id']
 must(c.post('/api/admin/property-submissions/'+sid+'/decision',headers=owner,json={'status':'rejected','note':'اصلاح مشخصات'}))
 main.app.dependency_overrides[require_seller]=lambda:{'id':str(uuid4()),'phone':'09120000000'}
 path='/api/seller/property-submissions/'+sid
 assert c.get(path).status_code==404
 assert c.put(path+'/resubmit',json={**body,'request_id':str(uuid4()),'expected_revision':0}).status_code==404
 assert must(c.get('/api/seller/my-submissions'))['items']==[]
 main.app.dependency_overrides.clear()
 assert c.get(path).status_code==401
 assert c.put(path+'/resubmit',json={**body,'expected_revision':0}).status_code==401

def test_approved_request_and_foreign_media_cannot_be_resubmitted(seller_case):
 c,db,owner,user,body=seller_case;sid=must(c.post('/api/seller/property-submissions',json=body),201)['id'];path='/api/seller/property-submissions/'+sid
 with db.connection() as conn:conn.execute("UPDATE app.property_submissions SET status='approved' WHERE id=%s",(sid,));conn.commit()
 assert c.put(path+'/resubmit',json={**body,'request_id':str(uuid4()),'expected_revision':0}).status_code==409
 with db.connection() as conn:conn.execute("UPDATE app.property_submissions SET status='rejected' WHERE id=%s",(sid,));conn.commit()
 assert c.put(path+'/resubmit',json={**body,'request_id':str(uuid4()),'expected_revision':0,'media':[{'url':'https://api.evazmelk.ir/api/public/media/'+str(uuid4())+'.webp','kind':'image'}]}).status_code==422
