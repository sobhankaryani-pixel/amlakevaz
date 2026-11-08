"""Authenticated previews; original canonical URLs remain the only stored URLs."""
from datetime import datetime,timezone
from types import SimpleNamespace
import re
import jwt
from fastapi import APIRouter,Depends,HTTPException,Request,Response
from .auth import current_user,require_roles
from .seller_auth import require_seller
from .agency import agency_user
from .config import settings
from .db import pool
from .launch import serve_media
router=APIRouter()
COOKIE='evaz_media_preview'
FILENAME=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|mp4|webm)')

@router.post('/api/admin/media/session')
def preview_session(request:Request,response:Response,user=Depends(require_roles('owner','admin','data_entry'))):
    token=request.headers.get('authorization','').split(' ',1)[-1].strip()
    claims=jwt.decode(token,settings.jwt_secret,algorithms=['HS256'])
    claims['aud']='media-preview'
    claims['exp']=min(claims['exp'],int(datetime.now(timezone.utc).timestamp())+600)
    response.set_cookie(COOKIE,jwt.encode(claims,settings.jwt_secret,algorithm='HS256'),
      max_age=600,httponly=True,secure=True,samesite='lax',path='/api/admin/media/view')
    response.headers['Cache-Control']='no-store'
    return {'ok':True}

@router.delete('/api/admin/media/session')
def end_preview_session(response:Response):
    response.delete_cookie(COOKIE,path='/api/admin/media/view',secure=True,httponly=True,samesite='lax')
    response.headers['Cache-Control']='no-store'
    return {'ok':True}

def preview_admin(request:Request):
    try:
        claims=jwt.decode(request.cookies.get(COOKIE,''),settings.jwt_secret,algorithms=['HS256'],audience='media-preview')
        claims.pop('aud',None)
        token=jwt.encode(claims,settings.jwt_secret,algorithm='HS256')
        user=current_user(SimpleNamespace(credentials=token))
    except (jwt.PyJWTError,ValueError,TypeError):raise HTTPException(401,headers={'Cache-Control':'no-store'}) from None
    if user['role'] not in ('owner','admin','data_entry'):raise HTTPException(403,headers={'Cache-Control':'no-store'})
    return user

def private_file(filename,request,user,audience):
    if not FILENAME.fullmatch(filename):raise HTTPException(404,headers={'Cache-Control':'no-store'})
    with pool.connection() as conn:
        row=conn.execute('SELECT owner_id,owner_role,cleanup_state FROM app.uploaded_media WHERE filename=%s',(filename,)).fetchone()
    if not row or row.get('cleanup_state','active')!='active':raise HTTPException(404,headers={'Cache-Control':'no-store'})
    if (audience!='admin' and (str(row['owner_id'])!=str(user['id']) or row['owner_role']!=audience)) or (audience=='admin' and user['role']=='data_entry' and (str(row['owner_id'])!=str(user['sub']) or row['owner_role']!='data_entry')):
        raise HTTPException(404,headers={'Cache-Control':'no-store'})
    return serve_media(filename,request,private=True)

@router.api_route('/api/seller/media/view/{filename}',methods=['GET','HEAD'])
def seller_preview(filename:str,request:Request,user=Depends(require_seller)):
    return private_file(filename,request,user,'seller')

@router.api_route('/api/agency/media/view/{filename}',methods=['GET','HEAD'])
def agency_preview(filename:str,request:Request,user=Depends(agency_user)):
    return private_file(filename,request,user,'agency')

@router.api_route('/api/admin/media/view/{filename}',methods=['GET','HEAD'])
def admin_preview(filename:str,request:Request,user=Depends(preview_admin)):
    return private_file(filename,request,user,'admin')
