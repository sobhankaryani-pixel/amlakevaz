"""Owner-only notification inbox and durable, at-most-once delivery claims."""
import base64,hashlib,json,logging,os,re
from uuid import UUID,uuid4
from fastapi import APIRouter,Depends,HTTPException,Request
from pydantic import BaseModel,Field
from psycopg.types.json import Jsonb
from .db import pool
from .auth import require_roles
from .config import settings
from .notification_transport import CATEGORIES,validate_subscription,sms_ready,send_sms_notice,send_push_notice
router=APIRouter(prefix='/api/admin/notifications');owner=Depends(require_roles('owner'))

def enqueue(conn,category,entity_id=None,key=None):
 if category not in CATEGORIES:raise ValueError('unknown_category')
 identifier=key or category+':'+str(entity_id or uuid4())
 conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('manager_notice:'+identifier,))
 found=conn.execute("SELECT entity_id FROM app.audit_logs WHERE entity_type='manager_notice' AND after_data->>'key'=%s LIMIT 1",(identifier,)).fetchone()
 if found:return str(found['entity_id'])
 nid=uuid4();data={'key':identifier,'category':category,'title':CATEGORIES[category][0],'url':'/management/','read_by':[]}
 conn.execute("INSERT INTO app.audit_logs(action,entity_type,entity_id,after_data) VALUES ('notice_pending','manager_notice',%s,%s)",(nid,Jsonb(data)))
 return str(nid)

def vapid_keys(conn,create=False):
 from cryptography.hazmat.primitives.asymmetric import ec
 from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
 from cryptography.hazmat.primitives.ciphers.aead import AESGCM
 cipher=AESGCM(hashlib.sha256(('webpush:'+settings.jwt_secret).encode()).digest())
 conn.execute('SELECT pg_advisory_xact_lock(862710093)')
 row=conn.execute("SELECT after_data FROM app.audit_logs WHERE entity_type='manager_push_key' AND action='active' ORDER BY created_at DESC LIMIT 1").fetchone()
 if row:
  data=row['after_data'];raw=base64.urlsafe_b64decode(data['encrypted'])
  private=cipher.decrypt(raw[:12],raw[12:],b'evaz-webpush').decode()
  return {'private':private,'public':data['public']}
 if not create:return None
 key=ec.generate_private_key(ec.SECP256R1());enc=lambda b:base64.urlsafe_b64encode(b).rstrip(b'=').decode()
 private=enc(key.private_numbers().private_value.to_bytes(32,'big'));public=enc(key.public_key().public_bytes(Encoding.X962,PublicFormat.UncompressedPoint))
 nonce=os.urandom(12);encrypted=enc(nonce+cipher.encrypt(nonce,private.encode(),b'evaz-webpush'))
 # Store padded cipher text for deterministic base64 decoding.
 encrypted=encrypted+'='*((-len(encrypted))%4)
 conn.execute("INSERT INTO app.audit_logs(action,entity_type,entity_id,after_data) VALUES ('active','manager_push_key',%s,%s)",(uuid4(),Jsonb({'public':public,'encrypted':encrypted})))
 return {'private':private,'public':public}

def subscriptions(conn):
 return conn.execute("""SELECT a.entity_id,a.user_id,a.after_data FROM app.audit_logs a JOIN app.users u ON u.id=a.user_id
 WHERE a.entity_type='manager_push_subscription' AND a.action='active' AND u.role='owner' AND u.is_active=true ORDER BY a.created_at""").fetchall()

def process_one():
 with pool.connection() as conn:
  with conn.transaction():
   conn.execute("UPDATE app.audit_logs SET action='unconfirmed' WHERE entity_type='manager_delivery' AND action='sending' AND created_at<now()-interval '10 minutes'")
   subs=subscriptions(conn);keys=vapid_keys(conn) if subs else None
   ready=[k for k in CATEGORIES if k!='property' and sms_ready(k)]
   if not ready and not (subs and keys):return False
   row=conn.execute("""SELECT id,entity_id,after_data FROM app.audit_logs WHERE entity_type='manager_notice' AND action='notice_pending'
    AND (after_data->>'category'=ANY(%s) OR %s) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED""",(ready,bool(subs and keys))).fetchone()
   if not row:return False
   data=row['after_data'];category=data['category'];deliveries=[]
   if category in ready:deliveries.append(('sms',None))
   if keys:deliveries.extend(('push',s) for s in subs)
   claims=[]
   for channel,sub in deliveries:
    did=uuid4();meta={'notice':str(row['entity_id']),'channel':channel,'subscription':str(sub['entity_id']) if sub else None,'owner':str(sub['user_id']) if sub else None}
    conn.execute("INSERT INTO app.audit_logs(action,entity_type,entity_id,after_data) VALUES ('sending','manager_delivery',%s,%s)",(did,Jsonb(meta)));claims.append((did,channel,sub))
   conn.execute("UPDATE app.audit_logs SET action='notice_dispatched' WHERE id=%s",(row['id'],))
 for did,channel,sub in claims:
  state='accepted'
  try:
   if channel=='sms':send_sms_notice(category)
   else:send_push_notice(sub['after_data']['subscription'],keys['private'],{'title':data['title'],'body':'اعلان جدید دارید؛ جزئیات را در پنل مدیریت ببینید.','url':'/management/','tag':str(row['entity_id'])})
  except Exception as exc:
   status=getattr(getattr(exc,'response',None),'status_code',None);state='expired' if status in (404,410) else 'unconfirmed'
  with pool.connection() as conn:
   conn.execute('UPDATE app.audit_logs SET action=%s WHERE entity_type=\'manager_delivery\' AND entity_id=%s',(state,did))
   if state=='expired' and sub:conn.execute("UPDATE app.audit_logs SET action='expired' WHERE entity_type='manager_push_subscription' AND entity_id=%s",(sub['entity_id'],))
   conn.commit()
 return True

@router.get('')
def inbox(offset:int=0,user=owner):
 if offset<0 or offset>100000:raise HTTPException(422,'صفحه معتبر نیست')
 with pool.connection() as conn:
  rows=conn.execute("""SELECT entity_id AS id,created_at,after_data->>'title' AS title,after_data->>'category' AS category,
    COALESCE((after_data->'read_by') ? %s,false) AS is_read,action FROM app.audit_logs WHERE entity_type='manager_notice' ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET %s""",(user['sub'],offset)).fetchall()
  count=conn.execute("SELECT count(*) AS n FROM app.audit_logs WHERE entity_type='manager_notice' AND NOT COALESCE((after_data->'read_by') ? %s,false)",(user['sub'],)).fetchone()['n']
  delivery=conn.execute("SELECT action,count(*) AS n FROM app.audit_logs WHERE entity_type='manager_delivery' AND created_at>now()-interval '7 days' GROUP BY action").fetchall()
 return {'items':[dict(r) for r in rows],'unread':count,'delivery':{r['action']:r['n'] for r in delivery}}
@router.post('/{notice_id}/read')
def mark_read(notice_id:UUID,user=owner):
 with pool.connection() as conn:
  row=conn.execute("SELECT id,after_data FROM app.audit_logs WHERE entity_type='manager_notice' AND entity_id=%s FOR UPDATE",(notice_id,)).fetchone()
  if not row:raise HTTPException(404,'اعلان پیدا نشد')
  data=row['after_data'];data['read_by']=list(set(data.get('read_by',[])+[user['sub']]))
  conn.execute('UPDATE app.audit_logs SET after_data=%s WHERE id=%s',(Jsonb(data),row['id']));conn.commit()
 return {'ok':True}
@router.get('/push/config')
def push_config(user=owner):
 with pool.connection() as conn:
  keys=vapid_keys(conn);subs=[s for s in subscriptions(conn) if str(s['user_id'])==user['sub']]
 return {'public_key':keys['public'] if keys else None,'devices':len(subs),'sms':{k:sms_ready(k) for k in CATEGORIES}}
@router.post('/push/initialize')
def initialize(user=owner):
 with pool.connection() as conn:keys=vapid_keys(conn,True);conn.commit()
 return {'public_key':keys['public']}
class SubscriptionIn(BaseModel):
 subscription:dict
@router.post('/push/subscribe')
def subscribe(payload:SubscriptionIn,user=owner):
 try:sub=validate_subscription(payload.subscription)
 except (ValueError,TypeError):raise HTTPException(422,'اشتراک اعلان معتبر نیست') from None
 key=hashlib.sha256(sub['endpoint'].encode()).hexdigest()
 with pool.connection() as conn:
  conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('push-owner:'+user['sub'],))
  conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('push:'+key,))
  rows=conn.execute("SELECT entity_id,user_id FROM app.audit_logs WHERE entity_type='manager_push_subscription' AND after_data->>'endpoint_hash'=%s",(key,)).fetchall()
  if rows and str(rows[0]['user_id'])!=user['sub']:raise HTTPException(409,'این دستگاه به حساب دیگری متصل است')
  conn.execute("DELETE FROM app.audit_logs WHERE entity_type='manager_push_subscription' AND user_id=%s AND after_data->>'endpoint_hash'=%s",(user['sub'],key))
  n=conn.execute("SELECT count(*) AS n FROM app.audit_logs WHERE entity_type='manager_push_subscription' AND action='active' AND user_id=%s",(user['sub'],)).fetchone()['n']
  if n>=10:raise HTTPException(422,'حداکثر ۱۰ دستگاه؛ ابتدا دستگاه قدیمی را قطع کنید')
  conn.execute("INSERT INTO app.audit_logs(user_id,action,entity_type,entity_id,after_data) VALUES (%s,'active','manager_push_subscription',%s,%s)",(user['sub'],uuid4(),Jsonb({'endpoint_hash':key,'subscription':sub})));conn.commit()
 return {'ok':True}
@router.post('/push/unsubscribe')
def unsubscribe(payload:SubscriptionIn,user=owner):
 endpoint=payload.subscription.get('endpoint','');key=hashlib.sha256(str(endpoint).encode()).hexdigest()
 with pool.connection() as conn:conn.execute("UPDATE app.audit_logs SET action='disabled' WHERE entity_type='manager_push_subscription' AND user_id=%s AND after_data->>'endpoint_hash'=%s",(user['sub'],key));conn.commit()
 return {'ok':True}
@router.post('/push/test')
def test_push(request:Request,user=owner):
 from .launch import limit_request
 limit_request(request,'manager-push-test',3,3600,user['sub'])
 with pool.connection() as conn:nid=enqueue(conn,'test');conn.commit()
 return {'ok':True,'id':nid,'message':'اعلان آزمایشی در صف قرار گرفت؛ دریافت روی گوشی باید بررسی شود.'}
@router.post('/push/operations-export')
def operations_export(user=owner):
 with pool.connection() as conn:
  keys=vapid_keys(conn);subs=[s['after_data']['subscription'] for s in subscriptions(conn) if str(s['user_id'])==user['sub']]
 if not keys or not subs:raise HTTPException(422,'ابتدا اعلان این گوشی را فعال کنید')
 # Explicit owner-only download. Never included in an inbox response or logs.
 from fastapi.responses import JSONResponse
 import hmac
 ingest_key=hmac.new(settings.jwt_secret.encode(),b'evaz-operations-ingest',hashlib.sha256).hexdigest()
 return JSONResponse({'ingest_key':ingest_key,'vapid_private_key':keys['private'],'subject':'https://evazmelk.ir','subscriptions':subs},headers={'Cache-Control':'no-store','Content-Disposition':'attachment; filename="operations-push-secret.json"'})

@router.post('/operations/ingest')
async def operations_ingest(request:Request):
 import hmac,time
 from starlette.concurrency import run_in_threadpool
 raw=await request.body()
 if len(raw)>2048:raise HTTPException(413,'درخواست بیش از حد بزرگ است')
 stamp=request.headers.get('X-Evaz-Timestamp','');signature=request.headers.get('X-Evaz-Signature','')
 secret=hmac.new(settings.jwt_secret.encode(),b'evaz-operations-ingest',hashlib.sha256).hexdigest()
 try:fresh=abs(time.time()-int(stamp))<=300
 except ValueError:fresh=False
 expected=hmac.new(secret.encode(),stamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
 if not fresh or not re.fullmatch(r'[0-9a-f]{64}',signature) or not hmac.compare_digest(signature,expected):raise HTTPException(401,'امضای معتبر لازم است')
 try:
  data=json.loads(raw);category=data['category'];event_id=data['event_id']
  if category not in ('outage','recovery','backup','backup_recovery') or not re.fullmatch(r'[A-Za-z0-9:_-]{1,100}',event_id):raise ValueError()
 except (ValueError,KeyError,TypeError):raise HTTPException(422,'رویداد معتبر نیست') from None
 def record():
  with pool.connection() as conn:
   nid=enqueue(conn,category,key='operations:'+event_id)
   conn.execute("UPDATE app.audit_logs SET action='notice_external' WHERE entity_type='manager_notice' AND entity_id=%s",(nid,));conn.commit()
  return {'ok':True}
 return await run_in_threadpool(record)
