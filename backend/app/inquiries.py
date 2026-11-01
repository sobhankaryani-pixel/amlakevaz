"""Buyer requests, explicitly consented marketing contacts and private follow-up."""
from uuid import UUID
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException,Request
from pydantic import BaseModel,Field
from .auth import require_roles
from .seller_auth import normalize_phone
from .launch import limit_request
from .db import pool
from .attribution import record_conversion
router=APIRouter()
class InquiryIn(BaseModel):
 id:UUID
 property_code:str=Field(min_length=1,max_length=40)
 phone:str=Field(max_length=25)
 name:str=Field(default='',max_length=120)
 purpose:Literal['consultation','visit']='consultation'
 marketing_consent:Literal[True]
 website:str=Field(default='',max_length=200)
 analytics:dict|None=None
class StatusIn(BaseModel):
 status:Literal['new','followed_up','closed']
@router.post('/api/public/property-inquiries',status_code=201)
def create(payload:InquiryIn,request:Request):
 if payload.website:raise HTTPException(422,'درخواست معتبر نیست.')
 phone=normalize_phone(payload.phone)
 limit_request(request,'buyer-inquiry-ip',12,3600)
 limit_request(request,'buyer-inquiry-phone',6,3600,phone)
 with pool.connection() as conn:
  with conn.transaction():
   conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(str(payload.id),))
   existing=conn.execute('SELECT i.id,c.phone,i.property_code FROM app.property_inquiries i JOIN app.customer_contacts c ON c.id=i.contact_id WHERE i.id=%s',(payload.id,)).fetchone()
   if existing:
    if existing['phone']!=phone or existing['property_code']!=payload.property_code:raise HTTPException(409,'شناسه درخواست تکراری است.')
    return {'ok':True,'message':'درخواست شما ثبت شد؛ برای هماهنگی با شما تماس می‌گیریم.'}
   target=conn.execute('''SELECT p.id FROM app.properties p WHERE p.public_code=%s AND p.status='آگهی فروش'
    AND EXISTS(SELECT 1 FROM app.market_records m JOIN app.listings l ON l.market_record_id=m.id
    WHERE m.property_id=p.id AND m.is_public AND l.is_public AND l.status='published') FOR SHARE''',(payload.property_code,)).fetchone()
   if not target:raise HTTPException(404,'این آگهی دیگر برای درخواست مشاوره فعال نیست.')
   contact=conn.execute('''INSERT INTO app.customer_contacts AS c(phone,name,source,marketing_opt_in,consent_at,consent_source)
    VALUES (%s,%s,'manual',true,now(),'property_inquiry_notice_v1') ON CONFLICT(phone) DO UPDATE SET
    name=CASE WHEN c.name='' THEN EXCLUDED.name ELSE c.name END,marketing_opt_in=true,consent_at=now(),consent_source='property_inquiry_notice_v1' RETURNING id''',(phone,payload.name.strip())).fetchone()
   conn.execute('INSERT INTO app.property_inquiries(id,property_id,property_code,contact_id,purpose) VALUES (%s,%s,%s,%s,%s)',(payload.id,target['id'],payload.property_code,contact['id'],payload.purpose))
   record_conversion(conn,'contact_submit','/properties/'+payload.property_code,payload.analytics)
 return {'ok':True,'message':'درخواست شما ثبت شد؛ برای هماهنگی با شما تماس می‌گیریم.'}
@router.get('/api/admin/property-inquiries')
def items(offset:int=0,user=Depends(require_roles('owner','admin'))):
 if offset<0:raise HTTPException(422,'صفحه معتبر نیست.')
 with pool.connection() as conn:rows=conn.execute('''SELECT i.*,c.name,c.phone FROM app.property_inquiries i JOIN app.customer_contacts c ON c.id=i.contact_id
  ORDER BY i.created_at DESC,i.id LIMIT 50 OFFSET %s''',(offset,)).fetchall()
 return {'items':[dict(r) for r in rows]}
@router.put('/api/admin/property-inquiries/{inquiry_id}')
def update(inquiry_id:UUID,payload:StatusIn,user=Depends(require_roles('owner','admin'))):
 with pool.connection() as conn:
  row=conn.execute('UPDATE app.property_inquiries SET status=%s,updated_at=now() WHERE id=%s RETURNING id',(payload.status,inquiry_id)).fetchone()
  if not row:raise HTTPException(404,'درخواست پیدا نشد.')
  conn.execute("INSERT INTO app.audit_logs(user_id,action,entity_type,entity_id) VALUES (%s,%s,'property_inquiry',%s)",(user['sub'],'inquiry_'+payload.status,inquiry_id));conn.commit()
 return {'ok':True}
