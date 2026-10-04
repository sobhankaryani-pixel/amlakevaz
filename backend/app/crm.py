"""Private customer/contact directory and staged SMS campaigns."""
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field
from .auth import require_roles
from .db import pool
from .seller_auth import normalize_phone
from .sms_gateway import configured,send_sms,SmsUnavailable

crm=APIRouter(prefix='/api/admin/crm',tags=['crm'])
manager=Depends(require_roles('owner','admin'))

@crm.get('/overview')
def overview(user=manager):
    with pool.connection() as conn:
        stats=conn.execute('''SELECT count(*) AS total,
          count(*) FILTER (WHERE account_enabled) AS accounts,
          count(*) FILTER (WHERE marketing_opt_in AND is_active) AS opted_in,
          count(*) FILTER (WHERE source='manual') AS manual
          FROM app.customer_contacts''').fetchone()
        pending=conn.execute("SELECT count(*) AS n FROM app.property_submissions WHERE status='pending'").fetchone()['n']
    return {'stats':dict(stats),'pending_submissions':pending,'sms_configured':configured()}

@crm.get('/contacts')
def contacts(q:str='',offset:int=0,user=manager):
    if len(q)>100 or offset<0: raise HTTPException(422,'جست‌وجو معتبر نیست')
    with pool.connection() as conn:
        rows=conn.execute('''SELECT id,phone,name,source,account_enabled,marketing_opt_in,
          consent_at,consent_source,notes,created_at,last_login_at,is_active
          FROM app.customer_contacts WHERE (phone LIKE %s OR name ILIKE %s)
          ORDER BY created_at DESC LIMIT 100 OFFSET %s''',('%'+q+'%','%'+q+'%',offset)).fetchall()
    return {'items':[dict(r) for r in rows]}

class ContactIn(BaseModel):
    phone:str
    name:str=Field(min_length=2,max_length=120)
    notes:str|None=Field(default=None,max_length=1000)
    marketing_opt_in:bool=False
    consent_evidence:str|None=Field(default=None,max_length=300)

@crm.post('/contacts')
def add_contact(payload:ContactIn,user=manager):
    phone=normalize_phone(payload.phone)
    if payload.marketing_opt_in and not (payload.consent_evidence or '').strip():
        raise HTTPException(422,'برای ثبت رضایت پیامک، منبع رضایت را وارد کنید')
    with pool.connection() as conn:
        try:
            row=conn.execute('''INSERT INTO app.customer_contacts
              (phone,name,notes,source,marketing_opt_in,consent_at,consent_source)
              VALUES (%s,%s,%s,'manual',%s,CASE WHEN %s THEN now() END,%s) RETURNING id''',
              (phone,payload.name.strip(),payload.notes,payload.marketing_opt_in,payload.marketing_opt_in,payload.consent_evidence if payload.marketing_opt_in else None)).fetchone()
            conn.commit()
        except Exception as exc:
            conn.rollback()
            if getattr(exc,'sqlstate',None)=='23505': raise HTTPException(409,'این شماره قبلاً در مخاطبان ثبت شده است') from exc
            raise
    return {'id':str(row['id'])}

class ConsentIn(BaseModel):
    marketing_opt_in:bool
    consent_evidence:str|None=Field(default=None,max_length=300)

@crm.put('/contacts/{contact_id}/consent')
def update_consent(contact_id:str,payload:ConsentIn,user=manager):
    if payload.marketing_opt_in and not (payload.consent_evidence or '').strip():
        raise HTTPException(422,'منبع رضایت لازم است')
    with pool.connection() as conn:
        row=conn.execute('''UPDATE app.customer_contacts SET marketing_opt_in=%s,
          consent_at=CASE WHEN %s THEN now() ELSE NULL END,
          consent_source=CASE WHEN %s THEN %s ELSE NULL END WHERE id=%s RETURNING id''',
          (payload.marketing_opt_in,payload.marketing_opt_in,payload.marketing_opt_in,payload.consent_evidence,contact_id)).fetchone()
        conn.commit()
    if not row:raise HTTPException(404,'مخاطب پیدا نشد')
    return {'marketing_opt_in':payload.marketing_opt_in}

@crm.get('/campaigns')
def campaigns(user=manager):
    with pool.connection() as conn:
        rows=conn.execute('''SELECT c.id,c.title,c.body,c.status,c.created_at,
           count(r.contact_id) AS total,
           count(*) FILTER (WHERE r.status='pending') AS pending,
           count(*) FILTER (WHERE r.status='sent') AS sent,
           count(*) FILTER (WHERE r.status='failed') AS failed,
           count(*) FILTER (WHERE r.status='skipped') AS skipped
           FROM app.sms_campaigns c LEFT JOIN app.sms_campaign_recipients r ON r.campaign_id=c.id
           GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100''').fetchall()
    return {'items':[dict(r) for r in rows]}

class CampaignIn(BaseModel):
    title:str=Field(min_length=2,max_length=120)
    body:str=Field(min_length=3,max_length=500)

@crm.post('/campaigns')
def create_campaign(payload:CampaignIn,user=manager):
    with pool.connection() as conn:
        row=conn.execute('''INSERT INTO app.sms_campaigns(title,body,created_by)
          VALUES (%s,%s,%s) RETURNING id''',(payload.title.strip(),payload.body.strip(),user['sub'])).fetchone()
        conn.commit()
    return {'id':str(row['id'])}

@crm.post('/campaigns/{campaign_id}/start')
def start_campaign(campaign_id:str,user=manager):
    if not configured():raise HTTPException(503,'درگاه پیامک هنوز تنظیم نشده است')
    with pool.connection() as conn:
        with conn.transaction():
            row=conn.execute('SELECT status FROM app.sms_campaigns WHERE id=%s FOR UPDATE',(campaign_id,)).fetchone()
            if not row:raise HTTPException(404,'کمپین پیدا نشد')
            if row['status']!='draft':raise HTTPException(409,'این کمپین قبلاً شروع شده است')
            conn.execute('''INSERT INTO app.sms_campaign_recipients(campaign_id,contact_id)
              SELECT %s,id FROM app.customer_contacts WHERE is_active=true AND marketing_opt_in=true''',(campaign_id,))
            count=conn.execute('SELECT count(*) AS n FROM app.sms_campaign_recipients WHERE campaign_id=%s',(campaign_id,)).fetchone()['n']
            if not count:raise HTTPException(422,'مخاطبی با رضایت ثبت‌شده برای پیامک وجود ندارد')
            conn.execute("UPDATE app.sms_campaigns SET status='sending' WHERE id=%s",(campaign_id,))
    return {'total':count}

@crm.post('/campaigns/{campaign_id}/send-next')
def send_next(campaign_id:str,user=manager):
    if not configured():raise HTTPException(503,'درگاه پیامک هنوز تنظیم نشده است')
    with pool.connection() as conn:
        with conn.transaction():
            campaign=conn.execute('SELECT status,body FROM app.sms_campaigns WHERE id=%s FOR UPDATE',(campaign_id,)).fetchone()
            if not campaign or campaign['status']!='sending':raise HTTPException(409,'کمپین در حال ارسال نیست')
            rows=conn.execute('''SELECT r.contact_id,c.phone,c.marketing_opt_in,c.is_active
              FROM app.sms_campaign_recipients r JOIN app.customer_contacts c ON c.id=r.contact_id
              WHERE r.campaign_id=%s AND r.status='pending' ORDER BY c.created_at LIMIT 3
              FOR UPDATE OF r SKIP LOCKED''',(campaign_id,)).fetchall()
            for row in rows:
                conn.execute("UPDATE app.sms_campaign_recipients SET status='sending' WHERE campaign_id=%s AND contact_id=%s",(campaign_id,row['contact_id']))
    for row in rows:
        state='sent';reference='';error=None
        if not row['marketing_opt_in'] or not row['is_active']:state='skipped'
        else:
            try:reference=send_sms(row['phone'],campaign['body'])
            except SmsUnavailable as exc:state='failed';error=str(exc)
        with pool.connection() as conn:
            conn.execute('''UPDATE app.sms_campaign_recipients SET status=%s,provider_reference=%s,
              error_message=%s,sent_at=CASE WHEN %s='sent' THEN now() END
              WHERE campaign_id=%s AND contact_id=%s''',
              (state,reference,error,state,campaign_id,row['contact_id']))
            conn.commit()
    with pool.connection() as conn:
        counts=conn.execute('''SELECT count(*) FILTER (WHERE status='pending') AS pending,
          count(*) FILTER (WHERE status='sent') AS sent,
          count(*) FILTER (WHERE status='failed') AS failed,
          count(*) FILTER (WHERE status='sending') AS sending
          FROM app.sms_campaign_recipients WHERE campaign_id=%s''',(campaign_id,)).fetchone()
        if not counts['pending'] and not counts['sending']:
            conn.execute("UPDATE app.sms_campaigns SET status='completed' WHERE id=%s",(campaign_id,));conn.commit()
    return dict(counts)
