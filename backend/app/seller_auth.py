"""Mobile OTP sign-in for sellers. Separate from administrator accounts."""
from datetime import datetime,timedelta,timezone
import hashlib,hmac,os,secrets
import jwt
from fastapi import APIRouter,Cookie,Depends,HTTPException,Request,Response
from pydantic import BaseModel,Field
from .db import pool
from .config import settings
from .sms_gateway import send_sms,SmsUnavailable,configured

seller=APIRouter(prefix='/api/seller',tags=['seller'])
COOKIE='evaz_seller_session'

def normalize_phone(value:str)->str:
    digits=''.join(str(int(c)) if c.isdecimal() else c for c in value if c.isdecimal() or c=='+')
    if digits.startswith('+98'): digits='0'+digits[3:]
    elif digits.startswith('0098'): digits='0'+digits[4:]
    elif digits.startswith('98') and len(digits)==12: digits='0'+digits[2:]
    if len(digits)!=11 or not digits.startswith('09') or not digits.isascii():
        raise HTTPException(422,'شمارهٔ موبایل معتبر نیست')
    return digits

def digest(value:str)->str:
    return hmac.new(settings.jwt_secret.encode(),value.encode(),hashlib.sha256).hexdigest()

def require_seller(session:str|None=Cookie(default=None,alias=COOKIE)):
    if not session: raise HTTPException(401,'ابتدا وارد حساب خود شوید')
    try: claims=jwt.decode(session,settings.jwt_secret,algorithms=['HS256'])
    except jwt.PyJWTError as exc: raise HTTPException(401,'نشست معتبر نیست؛ دوباره وارد شوید') from exc
    if claims.get('role')!='seller' or not claims.get('sid'):
        raise HTTPException(401,'نشست معتبر نیست')
    with pool.connection() as conn:
        row=conn.execute('''SELECT c.id,c.phone,c.name,c.marketing_opt_in FROM app.seller_sessions s
          JOIN app.customer_contacts c ON c.id=s.contact_id
          WHERE s.id=%s AND c.id=%s AND s.revoked_at IS NULL AND s.expires_at>now()
          AND c.is_active=true AND c.account_enabled=true''',(claims['sid'],claims['sub'])).fetchone()
    if not row: raise HTTPException(401,'نشست منقضی شده است')
    return dict(row)

class PhoneIn(BaseModel):
    phone:str=Field(min_length=10,max_length=20)

@seller.post('/auth/request-code')
def request_code(payload:PhoneIn,request:Request):
    phone=normalize_phone(payload.phone)
    if not configured(): raise HTTPException(503,'ورود با پیامک هنوز فعال نشده است')
    ip=digest(request.client.host if request.client else 'unknown')
    code=f'{secrets.randbelow(1000000):06d}'
    with pool.connection() as conn:
        with conn.transaction():
            conn.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(phone,))
            recent=conn.execute('''SELECT count(*) AS n,max(created_at) AS last FROM app.seller_otp_codes
              WHERE phone=%s AND created_at>now()-interval '1 hour' ''',(phone,)).fetchone()
            if recent['n']>=5 or (recent['last'] and recent['last']>datetime.now(timezone.utc)-timedelta(seconds=60)):
                raise HTTPException(429,'برای دریافت دوبارهٔ کد کمی صبر کنید')
            ip_count=conn.execute('''SELECT count(*) AS n FROM app.seller_otp_codes
              WHERE ip_hash=%s AND created_at>now()-interval '1 hour' ''',(ip,)).fetchone()['n']
            if ip_count>=300: raise HTTPException(429,'تعداد درخواست‌ها زیاد است')
            row=conn.execute('''INSERT INTO app.seller_otp_codes(phone,ip_hash,code_hash,expires_at)
              VALUES (%s,%s,%s,now()+interval '5 minutes') RETURNING id''',
              (phone,ip,digest(phone+':'+code))).fetchone()
            try: send_sms(phone,f'کد ورود خودمونی: {code}\nاعتبار: ۵ دقیقه')
            except SmsUnavailable as exc: raise HTTPException(503,str(exc)) from exc
    return {'message':'کد ورود برای شما ارسال شد. اعتبار آن ۵ دقیقه است.'}

class VerifyIn(PhoneIn):
    code:str=Field(pattern=r'^[0-9]{6}$')

@seller.post('/auth/verify-code')
def verify_code(payload:VerifyIn,response:Response):
    phone=normalize_phone(payload.phone)
    verified=False;contact=None;session_id=None
    with pool.connection() as conn:
        with conn.transaction():
            conn.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(phone,))
            row=conn.execute('''SELECT id,code_hash,attempts,expires_at,consumed_at FROM app.seller_otp_codes
              WHERE phone=%s ORDER BY created_at DESC LIMIT 1 FOR UPDATE''',(phone,)).fetchone()
            if row and not row['consumed_at'] and row['expires_at']>datetime.now(timezone.utc) and row['attempts']<5:
                conn.execute('UPDATE app.seller_otp_codes SET attempts=attempts+1 WHERE id=%s',(row['id'],))
                if hmac.compare_digest(row['code_hash'],digest(phone+':'+payload.code)):
                    conn.execute('UPDATE app.seller_otp_codes SET consumed_at=now() WHERE id=%s',(row['id'],))
                    contact=conn.execute('''INSERT INTO app.customer_contacts(phone,source,account_enabled,last_login_at)
                      VALUES (%s,'signup',true,now()) ON CONFLICT(phone) DO UPDATE SET
                      account_enabled=true,last_login_at=now()
                      RETURNING id,phone,name,marketing_opt_in''',(phone,)).fetchone()
                    session=conn.execute('''INSERT INTO app.seller_sessions(contact_id,expires_at)
                      VALUES (%s,now()+interval '30 days') RETURNING id''',(contact['id'],)).fetchone()
                    session_id=str(session['id']);verified=True
    if not verified: raise HTTPException(401,'کد نامعتبر یا منقضی شده است')
    token=jwt.encode({'sub':str(contact['id']),'sid':session_id,'role':'seller','exp':datetime.now(timezone.utc)+timedelta(days=30)},settings.jwt_secret,algorithm='HS256')
    response.set_cookie(COOKIE,token,max_age=30*24*3600,httponly=True,secure=True,samesite='lax',domain='.evazmelk.ir',path='/api/seller')
    return {'user':dict(contact)}

@seller.get('/me')
def me(user=Depends(require_seller)):
    return {'user':user}

class ProfileIn(BaseModel):
    name:str=Field(min_length=2,max_length=120)
    marketing_opt_in:bool=False

@seller.put('/me')
def update_me(payload:ProfileIn,user=Depends(require_seller)):
    with pool.connection() as conn:
        row=conn.execute('''UPDATE app.customer_contacts SET name=%s,marketing_opt_in=%s,
          consent_at=CASE WHEN %s THEN COALESCE(consent_at,now()) ELSE NULL END,
          consent_source=CASE WHEN %s THEN 'seller_profile' ELSE NULL END
          WHERE id=%s RETURNING id,phone,name,marketing_opt_in''',
          (payload.name.strip(),payload.marketing_opt_in,payload.marketing_opt_in,payload.marketing_opt_in,user['id'])).fetchone()
        conn.commit()
    return {'user':dict(row)}

@seller.post('/auth/logout')
def logout(response:Response,session:str|None=Cookie(default=None,alias=COOKIE)):
    if session:
        try:
            claims=jwt.decode(session,settings.jwt_secret,algorithms=['HS256'])
            with pool.connection() as conn:
                conn.execute('UPDATE app.seller_sessions SET revoked_at=now() WHERE id=%s',(claims['sid'],));conn.commit()
        except (jwt.PyJWTError,KeyError): pass
    response.delete_cookie(COOKIE,path='/api/seller',domain='.evazmelk.ir')
    return {'message':'از حساب خارج شدید'}

@seller.get('/my-submissions')
def my_submissions(user=Depends(require_seller)):
    with pool.connection() as conn:
        rows=conn.execute('''SELECT id,kind,status,created_at,approved_property_code
          FROM app.property_submissions WHERE seller_id=%s ORDER BY created_at DESC LIMIT 100''',(user['id'],)).fetchall()
    return {'items':[dict(r) for r in rows]}
