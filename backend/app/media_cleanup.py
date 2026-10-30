"""Owner-reviewed orphan media cleanup. No scheduled deletion or bucket-wide scan."""
from datetime import datetime,timedelta,timezone
from pathlib import Path
from uuid import UUID
import os,re
import jwt
from fastapi import APIRouter,Depends,HTTPException,Request
from pydantic import BaseModel,Field
from .auth import require_roles
from .seller_auth import require_seller
from .config import settings
from .db import pool
from .launch import MEDIA_BASE,limit_request
from . import media_storage

media_cleanup=APIRouter()
owner=Depends(require_roles('owner'))
FILENAME=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|mp4|webm)')
REFERENCES="""NOT EXISTS(SELECT 1 FROM app.properties p WHERE strpos(to_jsonb(p)::text,u.filename)>0)
 AND NOT EXISTS(SELECT 1 FROM app.property_submissions s WHERE strpos(to_jsonb(s)::text,u.filename)>0)
 AND NOT EXISTS(SELECT 1 FROM app.homepage_promotions h WHERE strpos(to_jsonb(h)::text,u.filename)>0)"""
ELIGIBLE="""u.cleanup_state IN ('active','deleting') AND u.created_at<now()-interval '30 days' AND u.retain_until<now()
 AND u.filename ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp|mp4|webm)$'"""

def identity(user):return str(user.get('sub') or user['id'])

def preview_token(row,user):
    return jwt.encode({'sub':identity(user),'media_id':str(row['id']),'filename':row['filename'],
                       'aud':'media-cleanup','exp':datetime.now(timezone.utc)+timedelta(minutes=10)},settings.jwt_secret,algorithm='HS256')

@media_cleanup.get('/api/admin/media/cleanup-preview')
def preview(offset:int=0,user=owner):
    if offset<0 or offset>100000:raise HTTPException(422,'صفحه معتبر نیست')
    with pool.connection() as conn:
        totals=conn.execute("SELECT count(*) AS files,COALESCE(sum(size_bytes),0) AS bytes FROM app.uploaded_media WHERE cleanup_state<>'deleted'").fetchone()
        candidates=conn.execute(f'SELECT count(*) AS files,COALESCE(sum(u.size_bytes),0) AS bytes FROM app.uploaded_media u WHERE {ELIGIBLE} AND {REFERENCES}').fetchone()
        rows=conn.execute(f'SELECT u.id,u.filename,u.kind,u.size_bytes,u.created_at,u.retain_until,u.cleanup_state FROM app.uploaded_media u WHERE {ELIGIBLE} AND {REFERENCES} ORDER BY u.created_at,u.id LIMIT 30 OFFSET %s',(offset,)).fetchall()
    return {'registered':dict(totals),'candidates':dict(candidates),'offset':offset,'items':[
        {**dict(row),'url':MEDIA_BASE+'/'+row['filename'],'preview_token':preview_token(row,user)} for row in rows if FILENAME.fullmatch(row['filename'])]}

class RetainIn(BaseModel):urls:list[str]=Field(max_length=14)

def retain_files(payload,user):
    names=[]
    for url in payload.urls:
        if not url.startswith(MEDIA_BASE+'/') or not FILENAME.fullmatch(url.removeprefix(MEDIA_BASE+'/')):
            raise HTTPException(422,'آدرس فایل معتبر نیست')
        names.append(url.removeprefix(MEDIA_BASE+'/'))
    names=sorted(set(names))
    with pool.connection() as conn:
        rows=conn.execute('SELECT id,filename,owner_id,owner_role,cleanup_state FROM app.uploaded_media WHERE filename=ANY(%s) ORDER BY id FOR UPDATE',(names,)).fetchall()
        if len(rows)!=len(names):raise HTTPException(409,'بعضی فایل‌های پیش‌نویس موجود نیستند؛ دوباره بارگذاری کنید.')
        for row in rows:
            if user.get('role')=='seller' and (str(row['owner_id'])!=identity(user) or row['owner_role']!='seller'):
                raise HTTPException(403,'فایل متعلق به حساب شما نیست')
            if row['cleanup_state']!='active':raise HTTPException(409,'فایل در حال حذف است؛ آن را دوباره بارگذاری کنید.')
        if rows:conn.execute("UPDATE app.uploaded_media SET retain_until=GREATEST(retain_until,now()+interval '30 days') WHERE filename=ANY(%s)",(names,))
        conn.commit()
    return {'retained':len(rows)}

@media_cleanup.post('/api/seller/media/retain')
def seller_retain(payload:RetainIn,request:Request,user=Depends(require_seller)):
    limit_request(request,'media-retain',120,3600,identity(user))
    return retain_files(payload,{**user,'role':'seller'})

@media_cleanup.post('/api/admin/media/retain')
def admin_retain(payload:RetainIn,request:Request,user=Depends(require_roles('owner','admin','data_entry'))):
    limit_request(request,'media-retain',120,3600,identity(user))
    return retain_files(payload,user)

class DeleteIn(BaseModel):
    id:UUID
    preview_token:str=Field(max_length=1200)
    confirm:str=Field(max_length=30)

@media_cleanup.post('/api/admin/media/cleanup-delete')
def delete_one(payload:DeleteIn,request:Request,user=owner):
    if payload.confirm!='حذف دائمی':raise HTTPException(422,'برای حذف، عبارت «حذف دائمی» لازم است')
    try:
        claims=jwt.decode(payload.preview_token,settings.jwt_secret,algorithms=['HS256'],audience='media-cleanup',options={'require':['sub','exp','media_id','filename']})
        if claims['sub']!=identity(user) or claims['media_id']!=str(payload.id):raise ValueError()
    except (jwt.PyJWTError,ValueError,KeyError):raise HTTPException(409,'فهرست منقضی شده؛ دوباره بررسی فایل‌ها را بزنید.') from None
    limit_request(request,'media-cleanup',60,3600,identity(user))
    if not media_storage.configured():raise HTTPException(503,'فضای نگهداری فایل تنظیم نشده است')
    # Commit the reservation BEFORE touching storage. Triggers forbid later
    # attachments. A crash or ambiguous storage timeout leaves a retryable tombstone.
    with pool.connection() as conn:
        row=conn.execute('SELECT * FROM app.uploaded_media WHERE id=%s FOR UPDATE',(payload.id,)).fetchone()
        if not row or row['filename']!=claims['filename'] or not FILENAME.fullmatch(row['filename']):raise HTTPException(409,'فایل معتبر نیست')
        if row['cleanup_state']=='deleted':return {'deleted':True,'already_deleted':True,'size_bytes':0}
        safe=conn.execute(f'SELECT u.id FROM app.uploaded_media u WHERE u.id=%s AND {ELIGIBLE} AND {REFERENCES}',(payload.id,)).fetchone()
        if not safe:raise HTTPException(409,'فایل استفاده شده یا مهلت نگهداری آن تمدید شده است؛ حذف نشد.')
        conn.execute("UPDATE app.uploaded_media SET cleanup_state='deleting' WHERE id=%s",(payload.id,));conn.commit()
    try:
        if media_storage.mode()=='s3':media_storage.delete_for_cleanup(row['filename'])
        elif media_storage.mode()=='local':
            root=Path(os.getenv('MEDIA_DIR','./data/media')).resolve();path=root/row['filename']
            if path.is_symlink():raise OSError('Symlink is not managed media')
            path.unlink(missing_ok=True)
        else:raise OSError('Unsupported storage')
    except Exception:
        raise HTTPException(503,'حذف از فضای فایل تأیید نشد. فایل در وضعیت حذف ناتمام باقی ماند؛ فهرست را تازه و دوباره تلاش کنید.') from None
    with pool.connection() as conn:
        conn.execute("UPDATE app.uploaded_media SET cleanup_state='deleted',deleted_at=now() WHERE id=%s AND cleanup_state='deleting'",(payload.id,));conn.commit()
    return {'deleted':True,'already_deleted':False,'size_bytes':row['size_bytes']}
