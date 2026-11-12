"""Runs on GitHub, independently of the site's availability. Prints no secrets."""
import hashlib,hmac,json,os,sys,time
from pathlib import Path
from urllib.request import Request,urlopen
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.notification_transport import CATEGORIES,send_push_notice,send_sms_notice,sms_ready

def main():
 category=os.environ['NOTICE_CATEGORY']
 if category not in ('outage','recovery','backup','backup_recovery','test'):raise ValueError('invalid category')
 raw=os.getenv('OPERATIONS_PUSH_CONFIG','').strip();config=json.loads(raw) if raw else {};results=[]
 for sub in config.get('subscriptions',[]):
  try:send_push_notice(sub,config['vapid_private_key'],{'title':CATEGORIES[category][0],'body':'جزئیات بررسی را در پنل یا GitHub ببینید.','url':'/management/','tag':'operations-'+os.environ['NOTICE_EVENT_ID']},config.get('subject','https://evazmelk.ir'));state='accepted'
  except Exception:state='unconfirmed'
  results.append({'channel':'push','state':state})
 if sms_ready(category):
  try:send_sms_notice(category);state='accepted'
  except Exception:state='unconfirmed'
  results.append({'channel':'sms','state':state})
 # Recording is independent of delivery; a failed server cannot prevent direct phone alerts.
 recorded=False
 if config.get('ingest_key') and category!='test':
  body=json.dumps({'category':category,'event_id':os.environ['NOTICE_EVENT_ID']},separators=(',',':')).encode();stamp=str(int(time.time()))
  signature=hmac.new(config['ingest_key'].encode(),stamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
  req=Request('https://backend.evazmelk.ir/api/admin/notifications/operations/ingest',data=body,headers={'Content-Type':'application/json','X-Evaz-Timestamp':stamp,'X-Evaz-Signature':signature},method='POST')
  try:
   with urlopen(req,timeout=12) as response:recorded=response.status==200
  except Exception:pass
 print(json.dumps({'channels':results,'recorded_in_panel':recorded,'github_issue_is_persistent_record':category!='test'}))
 return 0 if results and all(x['state']=='accepted' for x in results) else 1
if __name__=='__main__':raise SystemExit(main())
