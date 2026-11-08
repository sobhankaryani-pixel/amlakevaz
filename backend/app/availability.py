"""A real manual availability check, separate from editing or publication dates."""
from fastapi import APIRouter,Depends,HTTPException
from .auth import require_roles
from .db import pool
router=APIRouter()
@router.post('/api/admin/properties/{public_code}/availability-check')
def check_availability(public_code:str,user=Depends(require_roles('owner','admin','data_entry'))):
    if not public_code or len(public_code)>80:raise HTTPException(422,'کد ملک معتبر نیست')
    with pool.connection() as conn:
        with conn.transaction():
            row=conn.execute('SELECT id,status FROM app.properties WHERE public_code=%s FOR UPDATE',(public_code,)).fetchone()
            if not row:raise HTTPException(404,'ملک پیدا نشد')
            if row['status']!='آگهی فروش':raise HTTPException(409,'فقط موجودبودن آگهی فعال قابل تأیید است')
            listing=conn.execute("""SELECT l.id FROM app.listings l JOIN app.market_records m ON m.id=l.market_record_id
              WHERE m.property_id=%s AND l.status='published' AND l.is_public=true LIMIT 1""",(row['id'],)).fetchone()
            if not listing:raise HTTPException(409,'این ملک آگهی عمومی فعال ندارد')
            result=conn.execute("""INSERT INTO app.audit_logs(user_id,action,entity_type,entity_id)
              VALUES (%s,'availability_checked','property',%s) RETURNING created_at""",(user['sub'],row['id'])).fetchone()
    return {'public_code':public_code,'availability_checked_at':result['created_at']}
