"""Optional per-account TOTP; environment-only secrets and atomic replay protection."""
import base64,hashlib,hmac,json,os,struct,time
from fastapi import HTTPException
from .db import pool

def code_for(secret,step):
    data=hmac.new(secret,struct.pack('>Q',step),hashlib.sha1).digest();offset=data[-1]&15
    return str((int.from_bytes(data[offset:offset+4],'big')&0x7fffffff)%1000000).zfill(6)

def verify_admin_mfa(identifier,user,code,now=None):
    if user['role'] not in ('owner','admin'):return
    try:
        mappings=json.loads(os.getenv('ADMIN_TOTP_SECRETS','{}'))
        if not isinstance(mappings,dict):raise ValueError()
        raw=mappings.get(identifier)
        if raw is None:return
        secret=base64.b32decode(str(raw).replace(' ','').upper(),casefold=True)
        if len(secret)<20:raise ValueError()
    except Exception:raise HTTPException(503,'تنظیم رمزساز مدیریت معتبر نیست؛ با مالک سامانه تماس بگیرید.') from None
    code=''.join(str(int(c)) if c.isdecimal() else c for c in code)
    def invalid(message):raise HTTPException(401,message,headers={'X-Admin-MFA':'required'})
    if not code:invalid('کد برنامهٔ رمزساز را وارد کنید.')
    if len(code)!=6 or not code.isascii() or not code.isdigit():invalid('کد دومرحله‌ای شش‌رقمی معتبر نیست.')
    step=int((time.time() if now is None else now)//30)
    matched=next((n for n in (step,step-1,step+1) if hmac.compare_digest(code_for(secret,n),code)),None)
    if matched is None:invalid('کد دومرحله‌ای معتبر نیست؛ ساعت گوشی را بررسی کنید.')
    key=hmac.new(secret,('admin-totp:'+str(user['id'])+':'+str(matched)).encode(),hashlib.sha256).hexdigest()
    with pool.connection() as conn:
        used=conn.execute("""INSERT INTO app.request_limits(key,hits,expires_at) VALUES (%s,1,now()+interval '2 minutes')
          ON CONFLICT(key) DO NOTHING RETURNING key""",(key,)).fetchone();conn.commit()
    if not used:invalid('این کد قبلاً استفاده شده؛ کد بعدی را وارد کنید.')
