"""Strict transports shared with the independent GitHub monitor. Never log secrets."""
import json,os,re
from urllib.parse import urlsplit
from urllib.request import Request,urlopen

CATEGORIES={
 'property':('درخواست جدید فروش ملک','SMSIR_ADMIN_NOTIFICATION_TEMPLATE_ID'),
 'inquiry':('درخواست جدید خرید یا مشاوره','SMSIR_ADMIN_INQUIRY_TEMPLATE_ID'),
 'contact':('پیام جدید تماس با ما','SMSIR_ADMIN_CONTACT_TEMPLATE_ID'),
 'agency':('درخواست جدید بنگاه','SMSIR_ADMIN_AGENCY_TEMPLATE_ID'),
 'security':('تغییر حساس در حساب مدیریت','SMSIR_ADMIN_SECURITY_TEMPLATE_ID'),
 'outage':('اختلال در دسترسی سایت','SMSIR_ADMIN_OUTAGE_TEMPLATE_ID'),
 'recovery':('دسترسی سایت برقرار شد','SMSIR_ADMIN_RECOVERY_TEMPLATE_ID'),
 'backup':('خطا یا تأخیر در بکاپ','SMSIR_ADMIN_BACKUP_TEMPLATE_ID'),
 'backup_recovery':('بررسی بکاپ دوباره موفق شد','SMSIR_ADMIN_BACKUP_RECOVERY_TEMPLATE_ID'),
 'test':('اعلان آزمایشی مدیریت','SMSIR_ADMIN_TEST_TEMPLATE_ID'),
}
def validate_subscription(sub):
 if not isinstance(sub,dict):raise ValueError('invalid_subscription')
 endpoint=sub.get('endpoint','');url=urlsplit(endpoint)
 hosts={'web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com'}
 if url.scheme!='https' or url.hostname not in hosts or url.port not in (None,443) or url.username or url.password or url.fragment or not url.path or len(endpoint)>4096:raise ValueError('invalid_push_endpoint')
 keys=sub.get('keys',{})
 if not isinstance(keys,dict) or not re.fullmatch(r'[A-Za-z0-9_-]{80,150}={0,2}',keys.get('p256dh','')) or not re.fullmatch(r'[A-Za-z0-9_-]{20,30}={0,2}',keys.get('auth','')):raise ValueError('invalid_push_keys')
 return {'endpoint':endpoint,'keys':{'p256dh':keys['p256dh'],'auth':keys['auth']}}
def sms_ready(category):
 if os.getenv('ADMIN_SMS_NOTIFICATIONS_ENABLED','true').lower() in ('false','0','off'):return False
 return bool(category in CATEGORIES and re.fullmatch(r'09[0-9]{9}',os.getenv('ADMIN_NOTIFICATION_PHONE','').strip()) and os.getenv('SMSIR_API_KEY','').strip() and re.fullmatch(r'[1-9][0-9]*',os.getenv(CATEGORIES[category][1],'')))
def send_sms_notice(category):
 if not sms_ready(category):raise ValueError('sms_not_configured')
 payload={'mobile':os.environ['ADMIN_NOTIFICATION_PHONE'].strip(),'templateId':int(os.environ[CATEGORIES[category][1]]),'parameters':[{'name':'COUNT','value':'1'}]}
 req=Request('https://api.sms.ir/v1/send/verify',data=json.dumps(payload).encode(),headers={'x-api-key':os.environ['SMSIR_API_KEY'].strip(),'Content-Type':'application/json'},method='POST')
 with urlopen(req,timeout=12) as response:data=json.loads(response.read(16384))
 reference=data.get('data',{}).get('messageId') if isinstance(data.get('data'),dict) else None
 if data.get('status')!=1 or type(data.get('status')) is not int or not re.fullmatch(r'[1-9][0-9]*',str(reference)):raise ValueError('sms_unconfirmed')
 return str(reference)
def send_push_notice(subscription,private_key,payload,subject='https://evazmelk.ir'):
 from pywebpush import webpush
 import requests
 sub=validate_subscription(subscription)
 class NoRedirectSession(requests.Session):
  def request(self,*args,**kwargs):kwargs['allow_redirects']=False;return super().request(*args,**kwargs)
 with NoRedirectSession() as session:
  result=webpush(subscription_info=sub,data=json.dumps(payload,ensure_ascii=False),vapid_private_key=private_key,vapid_claims={'sub':subject},ttl=3600,timeout=12,requests_session=session,headers={'Urgency':'high'})
 if result.status_code not in (200,201,202):raise ValueError('push_unconfirmed')
 return True
