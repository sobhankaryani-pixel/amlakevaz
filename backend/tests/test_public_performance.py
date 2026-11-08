import os
os.environ.setdefault('DATABASE_URL','postgresql://test:test@127.0.0.1/test')
os.environ.setdefault('JWT_SECRET','test-secret-only')
import io
from uuid import uuid4
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from backend.app import main,launch,thumbnails,media_storage
from backend.tests.test_agency_integration import system,must

@pytest.fixture
def thumbs(monkeypatch,tmp_path):
 thumbnails.thumbnail_bytes.cache_clear();monkeypatch.setenv('MEDIA_STORAGE','local');monkeypatch.setattr(launch,'MEDIA_ROOT',tmp_path)
 flag={'published':True};monkeypatch.setattr(launch,'public_media_allowed',lambda name:flag['published'])
 name=str(uuid4())+'.jpg';source=Image.new('RGB',(1800,1200),'orange');exif=source.getexif();exif[315]='private photographer';source.save(tmp_path/name,quality=95,exif=exif)
 yield TestClient(main.app),name,flag,tmp_path
 thumbnails.thumbnail_bytes.cache_clear()

def test_thumbnail_is_small_and_strips_metadata(thumbs):
 c,name,flag,path=thumbs;r=c.get('/api/public/media/'+name+'/thumbnail')
 assert r.status_code==200 and r.headers['content-type']=='image/webp'
 with Image.open(io.BytesIO(r.content)) as image:
  assert image.width<=640 and image.height<=480 and not image.getexif()
 assert len(r.content)<(path/name).stat().st_size
 assert 'must-revalidate' in r.headers['cache-control']
 head=c.head('/api/public/media/'+name+'/thumbnail');assert head.status_code==200 and not head.content and int(head.headers['content-length'])==len(r.content)
 assert thumbnails.thumbnail_bytes.cache_info().hits>=1
 assert c.get('/api/public/media/'+name+'/thumbnail',headers={'If-None-Match':r.headers['etag']}).status_code==304

def test_cached_thumbnail_is_not_a_backdoor_after_unpublish(thumbs):
 c,name,flag,path=thumbs;assert c.get('/api/public/media/'+name+'/thumbnail').status_code==200
 flag['published']=False
 for method in [c.get,c.head]:
  r=method('/api/public/media/'+name+'/thumbnail');assert r.status_code==404 and r.headers['cache-control']=='no-store'

def test_thumbnail_rejects_video_bad_name_and_oversized_content(thumbs):
 c,name,flag,path=thumbs
 assert c.get('/api/public/media/'+str(uuid4())+'.mp4/thumbnail').status_code==404
 assert c.get('/api/public/media/nope.jpg/thumbnail').status_code==404
 (path/name).write_bytes(b'x'*(thumbnails.MAX_SOURCE+1))
 assert c.get('/api/public/media/'+name+'/thumbnail').status_code==413

def test_s3_body_is_closed_and_failure_is_not_cached(thumbs,monkeypatch):
 c,name,flag,path=thumbs;monkeypatch.setenv('MEDIA_STORAGE','s3');bodies=[]
 def get(*args):
  body=io.BytesIO((path/name).read_bytes());bodies.append(body);return {'Body':body,'ContentLength':len(body.getvalue())}
 monkeypatch.setattr(media_storage,'get_file',get)
 assert c.get('/api/public/media/'+name+'/thumbnail').status_code==200
 assert bodies[0].closed
 assert c.get('/api/public/media/'+name+'/thumbnail').status_code==200 and len(bodies)==1

def test_pagination_beyond_previous_1000_ceiling_and_lean_payload(system):
 c,db,owner,password=system
 with db.connection() as conn:
  conn.execute("""INSERT INTO app.properties(public_code,property_type_id,region_id,general_area,area_m2,status,latitude,longitude,public_notes,media)
   SELECT 'PERF-'||lpad(n::text,5,'0'),t.id,r.id,'محله تست',200,'آگهی فروش',27.76,54.0,'unneeded-long-description','[]'::jsonb
   FROM generate_series(1,1105) n CROSS JOIN app.property_types t CROSS JOIN app.regions r
   WHERE t.code='raw_land' AND r.slug='R-QA'""")
  conn.execute("""INSERT INTO app.market_records(property_id,record_month,property_type_id,region_id,region_name_snapshot,status,is_public)
   SELECT id,'2026-11-01',property_type_id,region_id,'محله تست','published',true FROM app.properties WHERE public_code LIKE 'PERF-%'""")
  conn.execute("""INSERT INTO app.listings(market_record_id,asking_price_toman,status,is_public,published_at)
   SELECT m.id,5000000000,'published',true,'2026-11-08' FROM app.market_records m JOIN app.properties p ON p.id=m.property_id WHERE p.public_code LIKE 'PERF-%'""")
  conn.commit()
 cards=must(c.get('/api/public/property-cards?offset=1000&limit=100'));assert cards['total']==1105 and len(cards['items'])==100 and cards['has_more']
 assert 'media' not in cards['items'][0] and 'public_notes' not in cards['items'][0]
 seen=[]
 for offset in range(0,1200,200):
  page=must(c.get('/api/public/map-listings?offset='+str(offset)));seen.extend(x['public_code'] for x in page['items']);assert page['total']==1105
 assert len(seen)==len(set(seen))==1105
 empty=must(c.get('/api/public/search?offset=100008'));assert not empty['items'] and empty['total']==1105 and not empty['has_more']
 assert must(c.get('/api/public/map-listings?kind=house'))['total']==0
 for path in ['/api/public/map-listings?limit=201','/api/public/property-cards?limit=101','/api/public/map-listings?offset=-1']:
  assert c.get(path).status_code==422
 with db.connection() as conn:conn.execute("UPDATE app.properties SET status='غیرفعال' WHERE public_code='PERF-00001'");conn.commit()
 assert must(c.get('/api/public/map-listings'))['total']==1104
