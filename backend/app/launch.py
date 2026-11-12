"""Launch features: public details, leads, anonymous aggregate analytics and operations."""
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4
from typing import Literal
import hashlib,hmac,os,re,logging,tempfile
from fastapi import APIRouter,Depends,HTTPException,Request,UploadFile,File,Query
from fastapi.responses import FileResponse,Response,StreamingResponse
from pydantic import BaseModel,Field
from psycopg.types.json import Jsonb
from PIL import Image,ImageOps,UnidentifiedImageError
from starlette.concurrency import run_in_threadpool
from .attribution import clean_attribution, record_conversion, CAMPAIGN_REPORT_SQL
from .auth import require_roles
from .db import pool
from .manager_notifications import enqueue as notify_manager
from .config import settings
from . import media_storage
from .seller_auth import require_seller,normalize_phone

launch=APIRouter()
manager=Depends(require_roles('owner','admin'))
MEDIA_ROOT=Path(os.getenv('MEDIA_DIR','./data/media')).resolve()
MEDIA_BASE=os.getenv('PUBLIC_MEDIA_BASE_URL','https://api.evazmelk.ir/api/public/media').rstrip('/')


def limit_request(request:Request,scope:str,maximum:int,seconds:int,identity:str=''):
    # request.client is the trusted ASGI peer; forwarded headers are not trusted here.
    peer=request.client.host if request.client else 'unknown'
    expected=os.getenv('PROXY_SHARED_SECRET','')
    if expected and hmac.compare_digest(request.headers.get('x-evaz-proxy-secret',''),expected):
        peer=request.headers.get('x-evaz-client-ip',peer)[:100]
    value=f'{scope}:{identity or peer}'
    key=hmac.new(settings.jwt_secret.encode(),value.encode(),hashlib.sha256).hexdigest()
    with pool.connection() as conn:
        row=conn.execute('''INSERT INTO app.request_limits(key,hits,expires_at)
          VALUES (%s,1,now()+(%s * interval '1 second')) ON CONFLICT(key) DO UPDATE SET
          hits=CASE WHEN app.request_limits.expires_at<=now() THEN 1 ELSE app.request_limits.hits+1 END,
          expires_at=CASE WHEN app.request_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE app.request_limits.expires_at END
          RETURNING hits''',(key,seconds)).fetchone()
        conn.commit()
    if row['hits']>maximum:raise HTTPException(429,'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.',headers={'Retry-After':str(seconds)})

class MediaItem(BaseModel):
    url:str=Field(max_length=2048)
    kind:Literal['image','video']


def validate_media(items:list[MediaItem],user:dict,house:bool=True):
    if sum(x.kind=='image' for x in items)>12 or sum(x.kind=='video' for x in items)>2:
        raise HTTPException(422,'حداکثر ۱۲ عکس و ۲ فیلم مجاز است')
    if not house and any(x.kind=='video' for x in items):raise HTTPException(422,'فیلم فقط برای خانه مجاز است')
    with pool.connection() as conn:
        for item in items:
            if not item.url.startswith(MEDIA_BASE+'/'):raise HTTPException(422,'فایل را از بخش بارگذاری انتخاب کنید')
            filename=item.url.removeprefix(MEDIA_BASE+'/')
            row=conn.execute('SELECT owner_id,owner_role,kind,cleanup_state FROM app.uploaded_media WHERE filename=%s',(filename,)).fetchone()
            if not row or row['kind']!=item.kind:raise HTTPException(422,'فایل بارگذاری‌شده معتبر نیست')
            if row.get('cleanup_state','active')!='active':raise HTTPException(409,'فایل در حال حذف است یا قبلاً حذف شده؛ دوباره بارگذاری کنید.')
            if user.get('role') in ('seller','agency') and (str(row['owner_id'])!=str(user['id']) or row['owner_role']!=user['role']):
                raise HTTPException(403,'فایل متعلق به حساب شما نیست')


def file_kind(head:bytes):
    if head.startswith(b'\xff\xd8\xff'):return ('jpg','image','image/jpeg')
    if head.startswith(b'\x89PNG\r\n\x1a\n'):return ('png','image','image/png')
    if head.startswith(b'RIFF') and head[8:12]==b'WEBP':return ('webp','image','image/webp')
    if len(head)>=12 and head[4:8]==b'ftyp':
        brands={head[i:i+4] for i in [8,*range(16,min(len(head),128),4)]}
        if brands & {b'heic',b'heix',b'hevc',b'hevx',b'mif1',b'msf1',b'avif',b'avis'}:
            raise HTTPException(422,'عکس HEIC یا AVIF را به JPG تبدیل کنید؛ در آیفون می‌توانید عکس سازگار JPEG انتخاب کنید.')
        if not brands & {b'isom',b'iso2',b'iso5',b'iso6',b'mp41',b'mp42',b'avc1',b'M4V '}:
            raise HTTPException(422,'این قالب ویدیو پشتیبانی نمی‌شود؛ ویدیو MP4 با کدک H.264 انتخاب کنید.')
        return ('mp4','video','video/mp4')
    if head.startswith(b'\x1aE\xdf\xa3') and b'webm' in head[:128]:return ('webm','video','video/webm')
    raise HTTPException(422,'فرمت مجاز: JPG، PNG، WebP، MP4 و WebM')

def normalize_image(path):
    try:
        with Image.open(path) as source:
            if source.width*source.height>40000000:raise HTTPException(422,'ابعاد عکس بیش از حد بزرگ است')
            source.load()
            image=ImageOps.exif_transpose(source)
            image.thumbnail((2400,2400))
            target=path.with_suffix('.webp')
            # Strip EXIF/GPS and optimize photos before serving them publicly.
            image.convert('RGBA' if 'A' in image.getbands() else 'RGB').save(target,format='WEBP',quality=86,exif=b'')
        if path!=target:path.unlink()
        return target
    except HTTPException:raise
    except (UnidentifiedImageError,OSError,ValueError,Image.DecompressionBombError) as error:
        raise HTTPException(422,'عکس سالم و معتبر نیست؛ عکس دیگری انتخاب کنید') from error

async def store_upload(file:UploadFile,request:Request,user:dict):
    temporary=None;path=None;cloud_attempted=False;filename=None
    try:
        if not media_storage.configured():
            raise HTTPException(503,'فضای نگهداری دائمی عکس و فیلم هنوز تنظیم نشده است')
        await run_in_threadpool(limit_request,request,'media',40,3600,str(user.get('sub') or user.get('id')))
        first=await file.read(256)
        ext,kind,mime=file_kind(first)
        maximum=8*1024*1024 if kind=='image' else 50*1024*1024
        if media_storage.mode()=='s3':
            temporary=tempfile.TemporaryDirectory(prefix='evaz-upload-')
            root=Path(temporary.name)
        else:
            root=MEDIA_ROOT;root.mkdir(parents=True,exist_ok=True)
        media_id=uuid4();filename=f'{media_id}.{ext}';path=root/filename
        size=len(first)
        with path.open('xb') as out:
            await run_in_threadpool(out.write,first)
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>maximum:raise HTTPException(413,'حداکثر حجم عکس ۸ و فیلم ۵۰ مگابایت است')
                await run_in_threadpool(out.write,chunk)
        if kind=='image':
            path=await run_in_threadpool(normalize_image,path);filename=path.name;size=path.stat().st_size;mime='image/webp'
        if media_storage.mode()=='s3':
            cloud_attempted=True
            await run_in_threadpool(media_storage.put_file,path,filename,mime)
        def record_upload():
            with pool.connection() as conn:
                conn.execute('INSERT INTO app.uploaded_media(id,owner_id,owner_role,filename,kind,size_bytes) VALUES (%s,%s,%s,%s,%s,%s)',
                  (media_id,user.get('sub') or user['id'],user.get('role','seller'),filename,kind,size));conn.commit()
        await run_in_threadpool(record_upload)
    except Exception:
        if cloud_attempted:
            try:await run_in_threadpool(media_storage.delete_file,filename)
            except Exception:logging.getLogger('evaz.media').warning('Cloud upload rollback cleanup failed')
        if path:path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
        if temporary:temporary.cleanup()
    return {'url':MEDIA_BASE+'/'+filename,'kind':kind}

@launch.post('/api/seller/media')
async def seller_upload(request:Request,file:UploadFile=File(...),user=Depends(require_seller)):
    return await store_upload(file,request,{**user,'role':'seller'})

@launch.post('/api/admin/media')
async def admin_upload(request:Request,file:UploadFile=File(...),user=Depends(require_roles('owner','admin','data_entry'))):
    return await store_upload(file,request,user)

@launch.api_route('/api/public/media/{filename}',methods=['GET','HEAD'])
def media_file(filename:str,request:Request):
    if not public_media_allowed(filename):raise HTTPException(404,headers={'Cache-Control':'no-store'})
    return serve_media(filename,request)

def public_media_allowed(filename:str):
    if not re.fullmatch(r'[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)',filename):return False
    with pool.connection() as conn:
        return bool(conn.execute("""SELECT 1 WHERE EXISTS(
          SELECT 1 FROM app.properties p WHERE p.status='آگهی فروش'
          AND (p.cover_photo_url=%s OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p.media,'[]'::jsonb)) m WHERE m->>'url'=%s))
          AND EXISTS(SELECT 1 FROM app.listings l JOIN app.market_records mr ON mr.id=l.market_record_id
             WHERE mr.property_id=p.id AND l.is_public=true AND l.status='published'))
          OR EXISTS(SELECT 1 FROM app.homepage_promotions h WHERE h.is_active=true AND h.image_url=%s)
          """,(MEDIA_BASE+'/'+filename,)*3).fetchone())

def serve_media(filename:str,request:Request,private:bool=False):
    if not re.fullmatch(r'[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)',filename):raise HTTPException(404)
    mime={'.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm'}[Path(filename).suffix]
    headers={'Cache-Control':'private,no-store' if private else 'public,max-age=0,must-revalidate','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'}
    if media_storage.mode()=='s3':
        # SDK signs the request server-side. No public bucket, expiring URL or browser CORS setup needed.
        byte_range=request.headers.get('range')
        if byte_range and not re.fullmatch(r'bytes=(?:[0-9]+-[0-9]*|-[0-9]+)',byte_range):
            raise HTTPException(416,'بازهٔ درخواستی فایل معتبر نیست')
        result=media_storage.get_file(filename,byte_range,request.method=='HEAD')
        headers['Content-Length']=str(result['ContentLength'])
        if result.get('ContentRange'):headers['Content-Range']=result['ContentRange']
        status=206 if result.get('ContentRange') else 200
        if request.method=='HEAD':return Response(status_code=status,media_type=mime,headers=headers)
        body=result['Body']
        def chunks():
            try:
                while chunk:=body.read(256*1024):yield chunk
            finally:body.close()
        return StreamingResponse(chunks(),status_code=status,media_type=mime,headers=headers)
    if media_storage.mode()!='local':raise HTTPException(503,'نوع فضای نگهداری فایل معتبر نیست')
    path=MEDIA_ROOT/filename
    if not path.is_file():raise HTTPException(404,'فایل پیدا نشد')
    return FileResponse(path,media_type=mime,headers=headers)

@launch.post('/api/admin/media/test')
def test_media_storage(request:Request,user=manager):
    limit_request(request,'media-test',6,3600,str(user.get('sub') or user.get('id')))
    if media_storage.mode()!='s3':raise HTTPException(422,'ابتدا MEDIA_STORAGE را روی s3 تنظیم کنید')
    client,bucket=media_storage.connection()
    key='connection-tests/'+str(uuid4())+'.txt'
    payload=b'evazmelk-storage-check'
    error=None
    try:
        client.put_object(Bucket=bucket,Key=key,Body=payload,ContentType='text/plain')
        result=client.get_object(Bucket=bucket,Key=key)
        try:
            if result['Body'].read()!=payload:raise HTTPException(503,'محتوای فایل آزمایشی تأیید نشد')
        finally:result['Body'].close()
    except media_storage.STORAGE_ERRORS as exc:error=media_storage.storage_error(exc)
    except HTTPException as exc:error=exc
    finally:
        try:client.delete_object(Bucket=bucket,Key=key)
        except media_storage.STORAGE_ERRORS:
            if error is None:error=HTTPException(503,'پاک‌کردن فایل آزمایشی ممکن نشد؛ دسترسی حذف فایل در آروان را بررسی کنید')
    if error:raise error
    return {'ok':True,'message':'اتصال آروان تأیید شد؛ نوشتن، خواندن و حذف فایل آزمایشی موفق بود.'}

# Deliberately excludes private_address, seller phones, internal notes and exact unit identifiers.
PUBLIC_SELECT='''SELECT p.public_code,t.code AS property_code,t.name AS property_type,
 r.name AS region,r.slug AS region_key,p.general_area AS neighborhood,p.area_m2,p.building_area_m2,
 p.commercial_area_m2,p.bedrooms,p.mehr_section,p.mehr_level,p.usage_type,p.house_condition,
 p.floor_count,p.national_phase,p.national_block,p.national_level,p.national_stage,
 p.latitude,p.longitude,p.cover_photo_url,p.media,p.public_notes,p.build_year,p.street_width,
 p.street_frontage_m,p.floor,p.land_length_m,p.land_width_m,p.registration_month,p.updated_at,
 l.asking_price_toman,l.published_at,
 (SELECT max(a.created_at) FROM app.audit_logs a WHERE a.entity_type='property' AND a.entity_id=p.id AND a.action='availability_checked') AS availability_checked_at
 FROM app.properties p JOIN app.property_types t ON t.id=p.property_type_id
 LEFT JOIN app.regions r ON r.id=p.region_id
 JOIN (SELECT DISTINCT ON (m.property_id) m.property_id,l.asking_price_toman,l.published_at
 FROM app.listings l JOIN app.market_records m ON m.id=l.market_record_id
 WHERE l.is_public=true AND l.status='published'
 ORDER BY m.property_id,l.published_at DESC NULLS LAST,l.id DESC) l ON l.property_id=p.id
 WHERE p.status='آگهی فروش' '''

@launch.get('/api/public/properties/{code}')
def public_property(code:str):
    if len(code)>80:raise HTTPException(404,'آگهی پیدا نشد')
    with pool.connection() as conn:row=conn.execute(PUBLIC_SELECT+' AND p.public_code=%s',(code,)).fetchone()
    if not row:
        with pool.connection() as conn:
            previous=conn.execute("""SELECT p.status FROM app.properties p WHERE p.public_code=%s
              AND EXISTS(SELECT 1 FROM app.listings l JOIN app.market_records m ON m.id=l.market_record_id
              WHERE m.property_id=p.id AND l.published_at IS NOT NULL)""",(code,)).fetchone()
        message={'فروخته شده':'این ملک فروخته شده و آگهی آن بسته شده است.','غیرفعال':'نمایش این آگهی فعلاً متوقف شده است.'}.get(previous['status'] if previous else '', 'این آگهی موجود نیست یا دیگر فعال نیست.')
        raise HTTPException(404,message)
    return {'item':dict(row)}

@launch.get('/api/public/sitemap-data')
def sitemap_data():
    with pool.connection() as conn:
        rows=conn.execute("""SELECT DISTINCT p.public_code,p.updated_at FROM app.properties p
          JOIN app.market_records m ON m.property_id=p.id JOIN app.listings l ON l.market_record_id=m.id
          WHERE p.status='آگهی فروش' AND l.status='published' AND l.is_public=true ORDER BY p.public_code""").fetchall()
    return {'items':[dict(r) for r in rows]}

class ContactIn(BaseModel):
    analytics:dict|None=None
    name:str=Field(min_length=2,max_length=120)
    phone:str=Field(min_length=10,max_length=20)
    description:str=Field(default='',max_length=3000)
    website:str=Field(default='',max_length=200)

@launch.post('/api/public/contact-requests',status_code=201)
def contact_request(payload:ContactIn,request:Request):
    limit_request(request,'contact',10,3600)
    if payload.website:return {'message':'پیام شما دریافت شد.'}
    if len(payload.name.strip())<2:raise HTTPException(422,'نام معتبر نیست')
    phone=normalize_phone(payload.phone)
    with pool.connection() as conn:
        conn.execute('INSERT INTO app.contact_requests(name,phone,description) VALUES (%s,%s,%s)',(payload.name.strip(),phone,payload.description.strip()))
        import time
        notice_key='contact:'+hashlib.sha256((phone+payload.description.strip()).encode()).hexdigest()+':'+str(int(time.time())//300)
        notify_manager(conn,'contact',key=notice_key)
        record_conversion(conn,'contact_submit','/contact',payload.analytics)
        conn.commit()
    return {'message':'پیام شما ثبت شد؛ در ساعت پاسخ‌گویی با شما تماس می‌گیریم.'}

@launch.get('/api/admin/contact-requests')
def contact_requests(user=manager):
    with pool.connection() as conn:rows=conn.execute('SELECT * FROM app.contact_requests ORDER BY created_at DESC LIMIT 300').fetchall()
    return {'items':[dict(r) for r in rows]}

class ContactStatus(BaseModel):status:Literal['new','contacted','closed']
@launch.put('/api/admin/contact-requests/{id}')
def contact_status(id:UUID,payload:ContactStatus,user=manager):
    with pool.connection() as conn:
        row=conn.execute('UPDATE app.contact_requests SET status=%s,updated_at=now() WHERE id=%s RETURNING id',(payload.status,id)).fetchone();conn.commit()
    if not row:raise HTTPException(404)
    return {'status':payload.status}

EVENTS={'page_view','property_view','phone_click','whatsapp_click','instagram_click','search_filter','search_empty','share','map_open','scroll_depth','engaged_time','client_error'}
class EventIn(BaseModel):
    event:str=Field(max_length=40)
    session_id:UUID
    path:str=Field(max_length=600)
    property_code:str|None=Field(default=None,max_length=80)
    details:dict=Field(default_factory=dict)

def clean_details(details:dict):
    result={}
    for key in ('kind','regions','min_price','max_price','min_area','max_area','results','depth','seconds','device','sort','error_kind'):
        value=details.get(key)
        if isinstance(value,(int,float)) and abs(value)<1e15:result[key]=value
        elif isinstance(value,str):result[key]=value[:120]
        elif key=='regions' and isinstance(value,list):result[key]=[str(x)[:30] for x in value[:30]]
    result.update(clean_attribution(details))
    return result

@launch.post('/api/public/events',status_code=202)
def collect_event(payload:EventIn,request:Request):
    if payload.event not in EVENTS:raise HTTPException(422,'رویداد معتبر نیست')
    limit_request(request,'events-ip',6000,3600)
    limit_request(request,'events',600,3600,str(payload.session_id))
    if not re.fullmatch(r'/(?:properties/[^/?#]{1,590}|search|map|index|areas|register|account|about|contact)?',payload.path):raise HTTPException(422,'مسیر معتبر نیست')
    with pool.connection() as conn:
        if payload.event=='property_view' and (not payload.property_code or payload.path!='/properties/'+payload.property_code or not conn.execute(PUBLIC_SELECT+' AND p.public_code=%s',(payload.property_code,)).fetchone()):raise HTTPException(422,'آگهی معتبر نیست')
        conn.execute('INSERT INTO app.site_events(event,session_id,path,property_code,details) VALUES (%s,%s,%s,%s,%s)',
          (payload.event,payload.session_id,payload.path,payload.property_code,Jsonb(clean_details(payload.details))))
        if payload.event=='client_error':conn.execute('INSERT INTO app.site_errors(kind,path) VALUES (%s,%s)',('client_runtime',payload.path))
        conn.commit()
    return {'accepted':True}

@launch.get('/api/admin/analytics')
def analytics(days:int=7,user=manager):
    if days not in (1,7,30,90):raise HTTPException(422)
    cutoff="created_at >= now() - (%s * interval '1 day')"
    with pool.connection() as conn:
        counts=conn.execute(f'SELECT event,count(*) AS count FROM app.site_events WHERE {cutoff} GROUP BY event ORDER BY count DESC',(days,)).fetchall()
        sessions=conn.execute(f'SELECT count(DISTINCT session_id) AS count FROM app.site_events WHERE {cutoff}',(days,)).fetchone()['count']
        daily=conn.execute(f"SELECT (created_at AT TIME ZONE 'Asia/Tehran')::date AS day,count(*) FILTER(WHERE event='page_view') AS views,count(DISTINCT session_id) AS sessions FROM app.site_events WHERE {cutoff} GROUP BY day ORDER BY day",(days,)).fetchall()
        properties=conn.execute(f"SELECT property_code,count(*) FILTER(WHERE event='property_view') AS views,count(*) FILTER(WHERE event IN ('phone_click','whatsapp_click')) AS contacts FROM app.site_events WHERE {cutoff} AND property_code IS NOT NULL GROUP BY property_code ORDER BY views DESC LIMIT 30",(days,)).fetchall()
        searches=conn.execute(f"SELECT details,count(*) AS count FROM app.site_events WHERE {cutoff} AND event IN ('search_filter','search_empty') GROUP BY details ORDER BY count DESC LIMIT 20",(days,)).fetchall()
        sources=conn.execute(CAMPAIGN_REPORT_SQL,(days,)).fetchall()
        pages=conn.execute(f"SELECT path,count(*) FILTER(WHERE event='page_view') AS views,avg((details->>'seconds')::numeric) FILTER(WHERE event='engaged_time' AND jsonb_typeof(details->'seconds')='number') AS seconds,count(*) FILTER(WHERE event='scroll_depth' AND details->>'depth'='100') AS completed_scrolls FROM app.site_events WHERE {cutoff} GROUP BY path ORDER BY views DESC LIMIT 30",(days,)).fetchall()
        devices=conn.execute(f"SELECT details->>'device' AS device,count(DISTINCT session_id) AS sessions FROM app.site_events WHERE {cutoff} AND event='page_view' GROUP BY 1",(days,)).fetchall()
        engagement=conn.execute(f"SELECT avg((details->>'seconds')::numeric) AS average_seconds FROM app.site_events WHERE {cutoff} AND event='engaged_time' AND jsonb_typeof(details->'seconds')='number'",(days,)).fetchone()
    return {'sessions':sessions,'counts':[dict(r) for r in counts],'daily':[dict(r) for r in daily],'properties':[dict(r) for r in properties],'searches':[dict(r) for r in searches],'sources':[dict(r) for r in sources],'pages':[dict(r) for r in pages],'devices':[dict(r) for r in devices],'engagement':dict(engagement),'as_of':datetime.now(timezone.utc)}

@launch.get('/api/admin/operations')
def operations(user=manager):
    with pool.connection() as conn:
        backups=conn.execute('SELECT * FROM app.backup_runs ORDER BY created_at DESC LIMIT 10').fetchall()
        errors=conn.execute('SELECT kind,path,count(*) AS count,max(created_at) AS last_seen FROM app.site_errors WHERE created_at>now()-interval \'7 days\' GROUP BY kind,path ORDER BY last_seen DESC LIMIT 30').fetchall()
        blocked=conn.execute('SELECT count(*) AS count FROM app.request_limits WHERE expires_at>now() AND hits>10').fetchone()['count']
    return {'backups':[dict(r) for r in backups],'errors':[dict(r) for r in errors],'media_directory_configured':bool(os.getenv('MEDIA_DIR')),'media_storage':media_storage.mode(),'media_storage_configured':media_storage.configured(),'recent_busy_limit_buckets':blocked}

CARD_COLUMNS='public_code,property_code,property_type,region,region_key,neighborhood,area_m2,building_area_m2,commercial_area_m2,bedrooms,mehr_section,mehr_level,usage_type,house_condition,floor_count,national_phase,national_block,national_level,national_stage,latitude,longitude,cover_photo_url,asking_price_toman,published_at'

def public_page(where,params,offset,limit,order='published_at DESC NULLS LAST,public_code',columns=CARD_COLUMNS):
    # All SQL fragments are internal constants; visitor values stay bound parameters.
    base=' FROM ('+PUBLIC_SELECT+') q WHERE '+where
    with pool.connection() as conn:
        total=conn.execute('SELECT count(*) AS total'+base,params).fetchone()['total']
        rows=conn.execute('SELECT '+columns+base+' ORDER BY '+order+' LIMIT %s OFFSET %s',(*params,limit,offset)).fetchall()
    return {'items':[dict(row) for row in rows],'total':total,'offset':offset,'limit':limit,'has_more':offset+len(rows)<total}

@launch.get('/api/public/search')
def search_properties(kind:str='all',regions:str='',min_price:int=1000000000,max_price:int=100000000000,min_area:int=50,max_area:int=1000,sort:str='newest',offset:int=0):
    if kind not in ('all','land','house','garden','mehr','national','shop') or sort not in ('newest','price_asc','price_desc') or not (1000000000<=min_price<=max_price<=100000000000) or not(50<=min_area<=max_area<=1000) or offset<0 or offset>2000000000:
        raise HTTPException(422,'فیلترها معتبر نیستند')
    selected=list(dict.fromkeys(x for x in regions.split(',') if x))
    if len(selected)>40 or any(len(x)>30 for x in selected):raise HTTPException(422,'مناطق معتبر نیستند')
    codes={'land':['raw_land','commercial_land','land'],'house':['villa_house','villa','apartment'],'garden':['urban_garden'],'mehr':['mehr_housing'],'national':['national_housing'],'shop':['shop','commercial']}
    clauses=['asking_price_toman BETWEEN %s AND %s',"CASE WHEN property_code IN ('raw_land','commercial_land','land','urban_garden') THEN area_m2 WHEN property_code IN ('shop','commercial') THEN commercial_area_m2 ELSE building_area_m2 END BETWEEN %s AND %s"]
    params=[min_price,max_price,min_area,max_area]
    if kind!='all':clauses.append('property_code=ANY(%s)');params.append(codes[kind])
    if selected:clauses.append('region_key=ANY(%s)');params.append(selected)
    order={'newest':'COALESCE(updated_at,published_at) DESC NULLS LAST,public_code','price_asc':'asking_price_toman ASC,public_code','price_desc':'asking_price_toman DESC,public_code'}[sort]
    return public_page(' AND '.join(clauses),tuple(params),offset,24,order)

@launch.get('/api/public/property-detail')
def public_property_query(code:str):
    return public_property(code)

# Public counters are aggregate-only; no visitor identifiers leave the API.
@launch.get('/api/public/visit-counts')
def public_visit_counts(code:str|None=Query(default=None,max_length=80)):
    from datetime import datetime,timedelta
    from zoneinfo import ZoneInfo
    now=datetime.now(ZoneInfo('Asia/Tehran'));today=now.replace(hour=0,minute=0,second=0,microsecond=0)
    week=today-timedelta(days=(today.weekday()+2)%7)
    month=today-timedelta(days=persian_day(today.year,today.month,today.day)-1)
    with pool.connection() as conn:
        row=conn.execute("""SELECT count(DISTINCT (session_id,(created_at AT TIME ZONE 'Asia/Tehran')::date)) FILTER(WHERE created_at>=%s) AS today,
          count(DISTINCT (session_id,(created_at AT TIME ZONE 'Asia/Tehran')::date)) FILTER(WHERE created_at>=%s) AS week,
          count(DISTINCT (session_id,(created_at AT TIME ZONE 'Asia/Tehran')::date)) FILTER(WHERE created_at>=%s) AS month
          FROM app.site_events WHERE event='page_view' AND session_id IS NOT NULL AND created_at>=%s""",tuple(d.isoformat() for d in (today,week,month,min(week,month)))).fetchone()
        views=None
        if code:
            if not conn.execute(PUBLIC_SELECT+' AND p.public_code=%s',(code,)).fetchone():raise HTTPException(404,'آگهی پیدا نشد')
            views=conn.execute("SELECT count(DISTINCT (session_id,(created_at AT TIME ZONE 'Asia/Tehran')::date)) AS n FROM app.site_events WHERE event='property_view' AND property_code=%s AND session_id IS NOT NULL",(code,)).fetchone()['n']
    base={'today':100,'week':1200,'month':51000};actual={k:int(row[k]) for k in base}
    return {'actual':actual,'base':base,'display':{k:base[k]+actual[k] for k in base},'property_views':views,'timezone':'Asia/Tehran','week_start':'Saturday','month_calendar':'persian','includes_base':True}

def persian_day(gy,gm,gd):
    """Gregorian date to Persian day-of-month (33-year arithmetic calendar)."""
    cumulative=[0,31,59,90,120,151,181,212,243,273,304,334]
    gy2=gy+1 if gm>2 else gy
    days=355666+365*gy+(gy2+3)//4-(gy2+99)//100+(gy2+399)//400+gd+cumulative[gm-1]
    days%=12053;days%=1461
    if days>365:days=(days-1)%365
    return 1+(days%31 if days<186 else (days-186)%30)
