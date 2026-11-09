"""Local database and files only; this is not a production/phone test."""
import io,json,time,subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4
from PIL import Image
from backend.tests.test_agency_integration import system,must
from backend.tests.test_seller_revisions import seller_case
from backend.app import launch,admin_mfa

def test_seller_upload_review_publish_and_bounded_reads(seller_case,monkeypatch,tmp_path):
 c,db,owner,user,body=seller_case
 monkeypatch.setenv('MEDIA_STORAGE','local');monkeypatch.setenv('MEDIA_DIR',str(tmp_path));monkeypatch.setattr(launch,'MEDIA_ROOT',tmp_path)
 photo=io.BytesIO();image=Image.new('RGB',(64,32),'orange');exif=image.getexif();exif[274]=6;exif[315]='private';image.save(photo,format='JPEG',exif=exif)
 media=must(c.post('/api/seller/media',files={'file':('iphone.jpeg',photo.getvalue(),'image/jpeg')}))
 filename=media['url'].split('/')[-1]
 with Image.open(tmp_path/filename) as normalized:assert normalized.size==(32,64) and not normalized.getexif()
 assert c.get('/api/public/media/'+filename).status_code==404
 # Actual H.264/MP4 and VP8/WebM fixtures; neither claims to be phone hardware.
 for ext,codec in [('mp4','libx264'),('webm','libvpx')]:
  target=tmp_path/('fixture.'+ext)
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=32x32:d=0.2','-c:v',codec,'-pix_fmt','yuv420p','-y',str(target)],check=True)
  video=must(c.post('/api/seller/media',files={'file':(target.name,target.read_bytes(),'video/'+ext)}));assert video['kind']=='video'
  assert c.get('/api/public/media/'+video['url'].split('/')[-1]).status_code==404
 sid=must(c.post('/api/seller/property-submissions',json={**body,'media':[media]}),201)['id']
 assert must(c.post('/api/seller/property-submissions',json={**body,'media':[media]}),201)['id']==sid
 must(c.post('/api/admin/property-submissions/'+sid+'/decision',headers=owner,json={'status':'rejected','note':'عکس و مشخصات بررسی شد؛ توضیح کامل شود.'}))
 must(c.put('/api/seller/property-submissions/'+sid+'/resubmit',json={**body,'media':[media],'request_id':str(uuid4()),'expected_revision':0}))
 with db.connection() as conn:
  tid=conn.execute("SELECT id FROM app.property_types WHERE code='urban_garden'").fetchone()['id'];rid=conn.execute("SELECT id FROM app.regions WHERE slug='R-QA'").fetchone()['id']
 created=must(c.post('/api/admin/properties/direct',headers=owner,json={'property_type_id':str(tid),'region_id':str(rid),'status':'آگهی فروش','area_m2':200,'asking_price_toman':5000000000,'media':[media],'latitude':27.75,'longitude':54.0}))
 code=created['public_code']
 must(c.post('/api/admin/property-submissions/'+sid+'/decision',headers=owner,json={'status':'approved','approved_property_code':code}))
 assert must(c.get('/api/seller/my-submissions'))['items'][0]['approved_property_code']==code
 assert must(c.get('/api/public/property-detail?code='+code))['item']['public_code']==code
 assert c.get('/api/public/media/'+filename).status_code==200
 assert c.get('/api/public/media/'+filename+'/thumbnail').status_code==200
 def read(_):
  start=time.monotonic();response=c.get('/api/public/property-cards?limit=24');assert response.status_code==200
  return round((time.monotonic()-start)*1000,2)
 with ThreadPoolExecutor(max_workers=5) as workers:timings=list(workers.map(read,range(100)))
 timings.sort();print('LOCAL_ONLY_LOAD',json.dumps({'requests':100,'concurrency':5,'p50_ms':timings[49],'p95_ms':timings[94],'errors':0}))
 must(c.put('/api/admin/properties/'+code+'/visibility?active=false',headers=owner))
 assert c.get('/api/public/property-detail?code='+code).status_code==404
 assert c.get('/api/public/media/'+filename).status_code==404

def test_admin_logout_revokes_copied_token(system):
 c,db,owner,password=system
 assert c.get('/api/admin/operations',headers=owner).status_code==200
 assert c.post('/api/admin/logout',headers=owner).status_code==200
 assert c.get('/api/admin/operations',headers=owner).status_code==401


def test_mfa_login_with_database_replay_protection(system,monkeypatch):
 import base64
 c,db,owner,password=system
 monkeypatch.setattr(admin_mfa,'pool',db)
 with db.connection() as conn:row=conn.execute("SELECT email FROM app.users WHERE role='owner' LIMIT 1").fetchone()
 identifier=row['email'];secret=bytes(range(20))
 monkeypatch.setenv('ADMIN_TOTP_SECRETS',json.dumps({identifier:base64.b32encode(secret).decode()}))
 payload={'email':identifier,'password':password}
 response=c.post('/api/auth/login',json=payload)
 assert response.status_code==401 and response.headers['X-Admin-MFA']=='required'
 code=admin_mfa.code_for(secret,int(time.time()//30))
 good=c.post('/api/auth/login',json={**payload,'otp':code});assert good.status_code==200
 assert c.post('/api/auth/login',json={**payload,'otp':code}).status_code==401
 copied={'Authorization':'Bearer '+good.json()['access_token']}
 assert c.get('/api/admin/operations',headers=copied).status_code==200
 assert c.post('/api/admin/logout',headers=copied).status_code==200
 assert c.get('/api/admin/operations',headers=copied).status_code==401
