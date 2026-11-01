"""Independent agency credentials and owner-moderated listing revisions."""
from datetime import datetime,timedelta,timezone
from uuid import UUID
from typing import Literal
import re,json,hmac
import jwt
from fastapi import APIRouter,Depends,Cookie,HTTPException,Request,Response,UploadFile,File
from pydantic import BaseModel,Field,ValidationError
from psycopg.types.json import Jsonb
from .auth import require_roles,hash_password,verify_password,_session_stamp
from .config import settings
from .db import pool
from .seller_auth import normalize_phone
from .launch import limit_request,store_upload,validate_media,MediaItem
from .media_cleanup import retain_files,RetainIn
from .property_codes import allocate_code

router=APIRouter();owner=Depends(require_roles('owner'));COOKIE='evaz_agency_session'
USERNAME=r'^[A-Za-z0-9][A-Za-z0-9_.-]{2,39}$'
class AgencyIn(BaseModel):
 name:str=Field(min_length=2,max_length=120)
 username:str=Field(pattern=USERNAME)
 phone:str=Field(max_length=20)
 password:str=Field(min_length=10,max_length=128)
class AgencyChange(BaseModel):
 is_active:bool|None=None
 password:str|None=Field(default=None,min_length=10,max_length=128)
class LoginIn(BaseModel):
 username:str=Field(max_length=40)
 password:str=Field(max_length=128)
class DraftIn(BaseModel):
 details:dict
 expected_version:int=Field(ge=0)
class SubmitIn(BaseModel):
 expected_version:int=Field(ge=1)
 action:Literal['publish','remove']='publish'
class ReviewIn(BaseModel):
 decision:Literal['approved','rejected']
 note:str=Field(default='',max_length=1000)
 latitude:float|None=Field(default=None,ge=-90,le=90)
 longitude:float|None=Field(default=None,ge=-180,le=180)

def agency_user(session:str|None=Cookie(default=None,alias=COOKIE)):
 if not session:raise HTTPException(401,'ابتدا وارد پنل بنگاه شوید.')
 try:
  claims=jwt.decode(session,settings.jwt_secret,algorithms=['HS256'],audience='agency',options={'require':['sub','exp','stamp']})
  account_id=str(UUID(claims['sub']))
  with pool.connection() as conn:row=conn.execute('SELECT * FROM app.agencies WHERE id=%s',(account_id,)).fetchone()
  if not row or not row['is_active'] or not hmac.compare_digest(claims['stamp'],_session_stamp(account_id,row['password_hash'],row['session_version'])):raise ValueError()
 except (jwt.PyJWTError,ValueError,TypeError,KeyError):raise HTTPException(401,'ورود شما منقضی یا باطل شده است؛ دوباره وارد شوید.') from None
 return {'id':str(row['id']),'name':row['name'],'phone':row['phone'],'role':'agency','username':row['username']}

@router.post('/api/agency/login')
def login(payload:LoginIn,request:Request,response:Response):
 limit_request(request,'agency-login-ip',30,900)
 limit_request(request,'agency-login-user',15,900,payload.username.lower())
 with pool.connection() as conn:row=conn.execute('SELECT * FROM app.agencies WHERE username=%s',(payload.username.lower(),)).fetchone()
 if not row or not row['is_active'] or not verify_password(payload.password,row['password_hash']):raise HTTPException(401,'نام کاربری یا رمز عبور صحیح نیست.')
 token=jwt.encode({'sub':str(row['id']),'aud':'agency','stamp':_session_stamp(str(row['id']),row['password_hash'],row['session_version']),'exp':datetime.now(timezone.utc)+timedelta(hours=8)},settings.jwt_secret,algorithm='HS256')
 response.set_cookie(COOKIE,token,max_age=28800,secure=True,httponly=True,samesite='lax',domain='.evazmelk.ir',path='/api/agency')
 return {'user':{key:str(row[key]) for key in ['id','name','username','phone']}}

@router.post('/api/agency/logout')
def logout(response:Response,user=Depends(agency_user)):
 # Invalidate a copied token too, not only this browser's cookie.
 with pool.connection() as conn:conn.execute('UPDATE app.agencies SET session_version=session_version+1 WHERE id=%s',(user['id'],));conn.commit()
 response.delete_cookie(COOKIE,domain='.evazmelk.ir',path='/api/agency');return {'ok':True}
@router.get('/api/agency/me')
def me(user=Depends(agency_user)):return {'user':user}
@router.get('/api/admin/agencies')
def accounts(user=owner):
 with pool.connection() as conn:rows=conn.execute('SELECT id,name,username,phone,is_active,created_at FROM app.agencies ORDER BY created_at DESC LIMIT 500').fetchall()
 return {'items':[dict(r) for r in rows]}
@router.post('/api/admin/agencies',status_code=201)
def create(payload:AgencyIn,user=owner):
 phone=normalize_phone(payload.phone)
 try:
  with pool.connection() as conn:
   row=conn.execute('INSERT INTO app.agencies(name,username,phone,password_hash) VALUES (%s,%s,%s,%s) RETURNING id',(payload.name.strip(),payload.username.lower(),phone,hash_password(payload.password))).fetchone();conn.commit()
 except Exception as exc:
  if getattr(exc,'sqlstate',None)=='23505':raise HTTPException(409,'این نام کاربری قبلاً ثبت شده است.') from None
  raise
 return {'id':str(row['id'])}
@router.put('/api/admin/agencies/{account_id}')
def change(account_id:UUID,payload:AgencyChange,user=owner):
 with pool.connection() as conn:
  row=conn.execute('UPDATE app.agencies SET is_active=COALESCE(%s,is_active),password_hash=COALESCE(%s,password_hash),session_version=session_version+1 WHERE id=%s RETURNING id',(payload.is_active,hash_password(payload.password) if payload.password else None,account_id)).fetchone()
  if not row:raise HTTPException(404,'بنگاه پیدا نشد.')
  conn.commit()
 return {'ok':True}
@router.post('/api/agency/media')
async def upload(request:Request,file:UploadFile=File(...),user=Depends(agency_user)):return await store_upload(file,request,user)
@router.post('/api/agency/media/retain')
def retain(payload:RetainIn,request:Request,user=Depends(agency_user)):
 limit_request(request,'agency-retain',120,3600,user['id']);return retain_files(payload,user)
@router.get('/api/agency/files')
def files(offset:int=0,user=Depends(agency_user)):
 if offset<0:raise HTTPException(422,'صفحه معتبر نیست.')
 with pool.connection() as conn:
  rows=conn.execute('''SELECT f.id,f.details,f.version,f.property_id,f.updated_at,p.public_code,p.status AS property_status,
   r.status AS review_status,r.action AS review_action,r.review_note,r.file_version AS review_version FROM app.agency_files f
   LEFT JOIN app.properties p ON p.id=f.property_id LEFT JOIN LATERAL
    (SELECT status,action,review_note,file_version FROM app.agency_requests WHERE file_id=f.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true
   WHERE f.agency_id=%s ORDER BY f.updated_at DESC,f.id LIMIT 50 OFFSET %s''',(user['id'],offset)).fetchall()
 return {'items':[dict(r) for r in rows]}

def locked_file(conn,file_id,user):
 row=conn.execute('SELECT * FROM app.agency_files WHERE id=%s AND agency_id=%s FOR UPDATE',(file_id,user['id'])).fetchone()
 if not row:raise HTTPException(404,'فایل پیدا نشد.')
 return row

def no_pending(conn,file_id):
 if conn.execute("SELECT 1 FROM app.agency_requests WHERE file_id=%s AND status='pending'",(file_id,)).fetchone():raise HTTPException(409,'درخواست قبلی در انتظار بررسی است.')

def validated_details(details,model,user):
 try:payload=model.model_validate({**details,'seller_name':user['name'],'seller_phone':user['phone'],'website':'','analytics':None})
 except ValidationError:raise HTTPException(422,'اطلاعات نوع ملک، متراژ، قیمت و منطقه را کامل و معتبر وارد کنید.') from None
 if not payload.region_key:raise HTTPException(422,'منطقه را برای انتشار انتخاب کنید.')
 # Seller/agency numbers must never become public notes.
 normalized=''.join(str(int(c)) if c.isdecimal() else c for c in (payload.extra_details or ''))
 if re.search(r'(?:09\d{9}|(?:\+98|0098)9\d{9})',re.sub(r'[\s\-()]','',normalized)):raise HTTPException(422,'شماره تماس را در توضیحات عمومی وارد نکنید؛ ارتباط خریدار از طریق خودمونی است.')
 validate_media(payload.media,user,payload.kind in ('villa','apartment','mehr','national'))
 return payload.model_dump(exclude={'seller_name','seller_phone','analytics','website'})

def mount_listing_routes(model):
 @router.put('/api/agency/files/{file_id}')
 def save_draft(file_id:UUID,payload:DraftIn,request:Request,user=Depends(agency_user)):
  limit_request(request,'agency-draft',120,3600,user['id'])
  if len(json.dumps(payload.details))>50000:raise HTTPException(422,'حجم مشخصات بیش از حد مجاز است.')
  # Drafts may be incomplete; media ownership is still always enforced.
  try:media=[MediaItem.model_validate(m) for m in payload.details.get('media',[])]
  except (ValidationError,TypeError):raise HTTPException(422,'فایل معتبر نیست.') from None
  validate_media(media,user,payload.details.get('kind') in ('villa','apartment','mehr','national'))
  with pool.connection() as conn:
   with conn.transaction():
    conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(str(file_id),))
    row=conn.execute('SELECT * FROM app.agency_files WHERE id=%s FOR UPDATE',(file_id,)).fetchone()
    if row and str(row['agency_id'])!=user['id']:raise HTTPException(404,'فایل پیدا نشد.')
    no_pending(conn,file_id)
    if (row and row['version']!=payload.expected_version) or (not row and payload.expected_version!=0):raise HTTPException(409,'نسخه فایل تغییر کرده است؛ فهرست را تازه کنید.')
    if row:result=conn.execute('UPDATE app.agency_files SET details=%s,version=version+1,updated_at=now() WHERE id=%s RETURNING id,version',(Jsonb(payload.details),file_id)).fetchone()
    else:result=conn.execute('INSERT INTO app.agency_files(id,agency_id,details) VALUES (%s,%s,%s) RETURNING id,version',(file_id,user['id'],Jsonb(payload.details))).fetchone()
  return dict(result)
 @router.post('/api/agency/files/{file_id}/submit')
 def submit(file_id:UUID,payload:SubmitIn,request:Request,user=Depends(agency_user)):
  limit_request(request,'agency-submit',30,3600,user['id'])
  with pool.connection() as conn:
   with conn.transaction():
    row=locked_file(conn,file_id,user);no_pending(conn,file_id)
    if row['version']!=payload.expected_version:raise HTTPException(409,'نسخه فایل تغییر کرده است؛ فهرست را تازه کنید.')
    if payload.action=='remove' and not row['property_id']:raise HTTPException(422,'فقط آگهی منتشرشده درخواست حذف دارد.')
    details=validated_details(row['details'],model,user) if payload.action=='publish' else {}
    target=conn.execute('SELECT updated_at FROM app.properties WHERE id=%s FOR SHARE',(row['property_id'],)).fetchone() if row['property_id'] else None
    item=conn.execute('''INSERT INTO app.agency_requests(file_id,agency_id,action,details,base_updated_at,file_version)
     VALUES (%s,%s,%s,%s,%s,%s) RETURNING id''',(file_id,user['id'],payload.action,Jsonb(details),target['updated_at'] if target else None,row['version'])).fetchone()
  return {'id':str(item['id']),'message':'درخواست برای بررسی مالک اصلی ارسال شد.'}

@router.get('/api/admin/agency-requests')
def requests(offset:int=0,user=owner):
 if offset<0:raise HTTPException(422,'صفحه معتبر نیست.')
 with pool.connection() as conn:rows=conn.execute('''SELECT r.*,a.name AS agency_name,a.phone AS agency_phone,p.public_code FROM app.agency_requests r
  JOIN app.agencies a ON a.id=r.agency_id JOIN app.agency_files f ON f.id=r.file_id LEFT JOIN app.properties p ON p.id=f.property_id
  WHERE r.status='pending' ORDER BY r.created_at,r.id LIMIT 50 OFFSET %s''',(offset,)).fetchall()
 return {'items':[dict(r) for r in rows]}

@router.post('/api/admin/agency-requests/{request_id}/review')
def review(request_id:UUID,payload:ReviewIn,user=owner):
 if (payload.latitude is None)!=(payload.longitude is None):raise HTTPException(422,'هر دو مختصات را با هم وارد کنید.')
 if payload.decision=='rejected' and not payload.note.strip():raise HTTPException(422,'دلیل رد را وارد کنید.')
 with pool.connection() as conn:
  with conn.transaction():
   hint=conn.execute('SELECT file_id FROM app.agency_requests WHERE id=%s',(request_id,)).fetchone()
   if not hint:raise HTTPException(404,'درخواست پیدا نشد.')
   file=conn.execute('SELECT * FROM app.agency_files WHERE id=%s FOR UPDATE',(hint['file_id'],)).fetchone()
   row=conn.execute('SELECT * FROM app.agency_requests WHERE id=%s FOR UPDATE',(request_id,)).fetchone()
   if row['status']!='pending':raise HTTPException(409,'این درخواست قبلاً بررسی شده است.')
   if payload.decision=='approved':
    agency=conn.execute('SELECT id,name,phone,is_active FROM app.agencies WHERE id=%s',(row['agency_id'],)).fetchone()
    if not agency or not agency['is_active']:raise HTTPException(409,'حساب بنگاه غیرفعال است.')
    if file['property_id']:
     current=conn.execute('SELECT id,updated_at,status FROM app.properties WHERE id=%s FOR UPDATE',(file['property_id'],)).fetchone()
     if not current or current['updated_at']!=row['base_updated_at'] or current['status'] not in ('آگهی فروش','غیرفعال'):raise HTTPException(409,'ملک توسط مدیریت تغییر کرده است؛ درخواست را رد کنید تا بنگاه نسخه جدید بفرستد.')
    if row['action']=='remove':
     conn.execute("UPDATE app.properties SET status='غیرفعال' WHERE id=%s",(file['property_id'],))
     conn.execute("UPDATE app.listings SET is_public=false,status='closed',closed_at=now() WHERE market_record_id IN (SELECT id FROM app.market_records WHERE property_id=%s)",(file['property_id'],))
    else:
     details=validated_details(row['details'],SUBMISSION_MODEL,{'id':str(agency['id']),'name':agency['name'],'phone':agency['phone'],'role':'agency'})
     property_id=publish(conn,file,details,user)
     if payload.latitude is not None:conn.execute('UPDATE app.properties SET latitude=%s,longitude=%s WHERE id=%s',(payload.latitude,payload.longitude,property_id))
     conn.execute('UPDATE app.agency_files SET property_id=%s WHERE id=%s',(property_id,file['id']))
   conn.execute('UPDATE app.agency_requests SET status=%s,review_note=%s,reviewed_by=%s,reviewed_at=now() WHERE id=%s',(payload.decision,payload.note.strip(),user['sub'],request_id))
   conn.execute("INSERT INTO app.audit_logs(user_id,action,entity_type,entity_id) VALUES (%s,%s,'agency_request',%s)",(user['sub'],'agency_'+payload.decision,request_id))
 return {'status':payload.decision}

SUBMISSION_MODEL=None

def configure(model):
 global SUBMISSION_MODEL
 SUBMISSION_MODEL=model;mount_listing_routes(model)

def publish(conn,file,data,user):
 kinds={'land':'commercial_land' if data.get('usage_type')=='تجاری' else 'raw_land','villa':'villa_house','apartment':'apartment','mehr':'mehr_housing','national':'national_housing','shop':'shop','garden':'urban_garden'}
 kind=conn.execute('SELECT id FROM app.property_types WHERE code=%s',(kinds[data['kind']],)).fetchone()
 region=conn.execute('SELECT id,name FROM app.regions WHERE slug=%s AND is_public=true AND slug LIKE %s',(data.get('region_key') or '','R-%')).fetchone()
 if not kind or not region:raise HTTPException(422,'نوع ملک و منطقه را کامل کنید؛ منطقه برای انتشار لازم است.')
 fields={'property_type_id':kind['id'],'region_id':region['id'],'general_area':data.get('neighborhood'),'area_m2':data.get('area_m2'),'building_area_m2':data.get('building_area_m2'),'commercial_area_m2':data.get('commercial_area_m2'),'usage_type':data.get('usage_type'),'public_notes':data.get('extra_details'),'land_length_m':data.get('land_length_m'),'land_width_m':data.get('land_width_m'),'street_frontage_m':data.get('street_frontage_m'),'house_condition':data.get('house_condition'),'bedrooms':data.get('bedrooms'),'floor_count':data.get('floor_count'),'build_year':data.get('build_year'),'mehr_section':data.get('mehr_section'),'mehr_level':data.get('mehr_level'),'national_phase':data.get('national_phase'),'national_block':data.get('national_block'),'national_level':data.get('national_level'),'national_stage':data.get('national_stage'),'media':Jsonb(data.get('media',[])),'cover_photo_url':next((m['url'] for m in data.get('media',[]) if m['kind']=='image'),None),'status':'آگهی فروش'}
 property_id=file['property_id']
 if not property_id:
  fields={'public_code':allocate_code(conn),**fields}
  property_id=conn.execute('INSERT INTO app.properties('+','.join(fields)+') VALUES ('+','.join(['%s']*len(fields))+') RETURNING id',tuple(fields.values())).fetchone()['id']
 else:conn.execute('UPDATE app.properties SET '+','.join(k+'=%s' for k in fields)+' WHERE id=%s',(*fields.values(),property_id))
 record=conn.execute('SELECT id FROM app.market_records WHERE property_id=%s ORDER BY created_at DESC LIMIT 1 FOR UPDATE',(property_id,)).fetchone()
 if not record:record=conn.execute("INSERT INTO app.market_records(property_id,record_month,property_type_id,region_id,region_name_snapshot,status,is_public) VALUES (%s,CURRENT_DATE,%s,%s,%s,'verified',true) RETURNING id",(property_id,kind['id'],region['id'],region['name'])).fetchone()
 else:conn.execute('UPDATE app.market_records SET property_type_id=%s,region_id=%s,region_name_snapshot=%s,is_public=true WHERE id=%s',(kind['id'],region['id'],region['name'],record['id']))
 listing=conn.execute('SELECT id,asking_price_toman FROM app.listings WHERE market_record_id=%s ORDER BY published_at DESC NULLS LAST LIMIT 1 FOR UPDATE',(record['id'],)).fetchone()
 if listing:
  if listing['asking_price_toman']!=data['asking_price_toman']:conn.execute("INSERT INTO app.listing_price_history(listing_id,old_price_toman,new_price_toman,changed_by,reason) VALUES (%s,%s,%s,%s,'تأیید ویرایش بنگاه')",(listing['id'],listing['asking_price_toman'],data['asking_price_toman'],user['sub']))
  conn.execute("UPDATE app.listings SET asking_price_toman=%s,status='published',is_public=true,closed_at=NULL,published_at=COALESCE(published_at,now()) WHERE id=%s",(data['asking_price_toman'],listing['id']))
 else:conn.execute("INSERT INTO app.listings(market_record_id,asking_price_toman,status,is_public,published_at) VALUES (%s,%s,'published',true,now())",(record['id'],data['asking_price_toman']))
 return property_id
