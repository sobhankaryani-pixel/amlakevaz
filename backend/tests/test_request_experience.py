from uuid import uuid4
from datetime import date
from backend.tests.test_seller_revisions import seller_case
from backend.tests.test_agency_integration import system,must
from backend.app.launch import persian_day

def test_receipts_pending_edits_and_atomic_publication(seller_case):
 c,db,owner,user,body=seller_case
 one=must(c.post('/api/seller/property-submissions',json=body),201)
 assert 100000<=one['tracking_code']<=999999
 assert must(c.post('/api/seller/property-submissions',json=body),201)['tracking_code']==one['tracking_code']
 two=must(c.post('/api/seller/property-submissions',json={**body,'request_id':str(uuid4())}),201)
 assert two['tracking_code']!=one['tracking_code']
 path='/api/seller/property-submissions/'+one['id']
 assert must(c.get(path))['revision']==0
 changed={**body,'asking_price_toman':6000000000,'expected_revision':0,'request_id':str(uuid4())}
 must(c.put(path+'/resubmit',json=changed))
 must(c.put(path+'/resubmit',json=changed))
 assert must(c.get(path))['revision']==1
 assert c.put(path+'/resubmit',json={**changed,'request_id':str(uuid4())}).status_code==409
 with db.connection() as conn:
  kind=conn.execute("SELECT id FROM app.property_types WHERE code='urban_garden'").fetchone()['id']
  region=conn.execute("SELECT id FROM app.regions WHERE slug='R-QA'").fetchone()['id']
 payload={'source_submission_id':one['id'],'expected_submission_revision':0,'property_type_id':str(kind),'region_id':str(region),'area_m2':200,'status':'آگهی فروش','asking_price_toman':6000000000}
 # A stale admin form cannot publish an old copy after a seller edit.
 assert c.post('/api/admin/properties/direct',headers=owner,json=payload).status_code==409
 with db.connection() as conn:assert conn.execute('SELECT count(*) AS n FROM app.properties').fetchone()['n']==0
 assert c.post('/api/admin/property-submissions/'+one['id']+'/decision',headers=owner,json={'status':'rejected','note':'توضیح آزمایشی','expected_revision':0}).status_code==409
 published=must(c.post('/api/admin/properties/direct',headers=owner,json={**payload,'expected_submission_revision':1}))
 assert published['submission_approved']
 # Retry is atomic and cannot make a second ad.
 again=must(c.post('/api/admin/properties/direct',headers=owner,json={**payload,'expected_submission_revision':1}))
 assert again['public_code']==published['public_code']
 assert c.get(path).status_code==409
 assert c.put(path+'/resubmit',json={**changed,'expected_revision':1,'request_id':str(uuid4())}).status_code==409
 mine=must(c.get('/api/seller/my-submissions'))['items']
 assert next(x for x in mine if x['id']==one['id'])['status']=='approved'
 code=published['public_code'];session=str(uuid4())
 for _ in range(2):
  must(c.post('/api/public/events',json={'event':'property_view','session_id':session,'path':'/properties/'+code,'property_code':code}),202)
  must(c.post('/api/public/events',json={'event':'page_view','session_id':session,'path':'/'}),202)
 counts=must(c.get('/api/public/visit-counts?code='+code))
 assert counts['actual']=={'today':1,'week':1,'month':1}
 assert counts['display']=={'today':101,'week':1201,'month':51001}
 assert counts['property_views']==1 and counts['includes_base'] is True
 assert must(c.get('/api/seller/my-submissions'))['items'][1]['view_count'] in (0,1)
 assert c.post('/api/public/events',json={'event':'property_view','session_id':session,'path':'/','property_code':code}).status_code==422
 assert c.get('/api/public/visit-counts?code=missing').status_code==404
 # Another seller cannot read or mutate the request.
 from backend.app import main
 from backend.app.seller_auth import require_seller
 main.app.dependency_overrides[require_seller]=lambda:{**user,'id':str(uuid4())}
 assert c.get(path).status_code==404
 assert c.put(path+'/resubmit',json={**changed,'expected_revision':1}).status_code==404

def test_persian_month_boundaries():
 assert persian_day(2026,3,21)==1
 assert persian_day(2026,4,20)==31
 assert persian_day(2026,4,21)==1
 assert persian_day(2026,11,9)==18
