"""Server-issued codes, stable reservations and safe retries of property creation."""
import hashlib,json
from uuid import UUID
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel
from .auth import require_roles
from .db import pool

property_codes=APIRouter()
class ReserveIn(BaseModel):request_id:UUID

def allocate_code(conn):return conn.execute('SELECT app.allocate_property_code() AS code').fetchone()['code']

@property_codes.post('/api/admin/properties/reserve-code')
def reserve_code(payload:ReserveIn,user=Depends(require_roles('owner','admin','data_entry'))):
    with pool.connection() as conn:
        # Idempotent even when a response is lost or two copies arrive together.
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(str(payload.request_id),))
        row=conn.execute('SELECT * FROM app.property_code_reservations WHERE request_id=%s',(payload.request_id,)).fetchone()
        if row and str(row['owner_id'])!=str(user['sub']):raise HTTPException(403,'رزرو کد متعلق به حساب دیگری است')
        if not row:
            code=allocate_code(conn)
            row=conn.execute('INSERT INTO app.property_code_reservations(request_id,owner_id,public_code) VALUES (%s,%s,%s) RETURNING *',(payload.request_id,user['sub'],code)).fetchone()
        conn.commit()
    return {'reservation_id':str(row['id']),'public_code':row['public_code']}

def creation_code(conn,payload,user):
    if not payload.code_reservation_id:return allocate_code(conn),None,None
    row=conn.execute('SELECT * FROM app.property_code_reservations WHERE id=%s FOR UPDATE',(payload.code_reservation_id,)).fetchone()
    if not row or str(row['owner_id'])!=str(user['sub']):raise HTTPException(403,'رزرو کد معتبر نیست')
    value=payload.model_dump(mode='json',exclude={'public_code','code_reservation_id'})
    digest=hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    if row['consumed_at']:
        if row['request_hash']!=digest:raise HTTPException(409,f"این درخواست قبلاً با کد {row['public_code']} ذخیره شده؛ از املاک ثبت‌شده ویرایشش کنید.")
        return row['public_code'],row,{'id':str(row['property_id']),'public_code':row['public_code'],'status':'آگهی فروش','already_created':True}
    return row['public_code'],{**dict(row),'digest':digest},None

def finish_reservation(conn,reservation,property_id):
    if reservation:
        conn.execute('UPDATE app.property_code_reservations SET consumed_at=now(),property_id=%s,request_hash=%s WHERE id=%s',(property_id,reservation['digest'],reservation['id']))
