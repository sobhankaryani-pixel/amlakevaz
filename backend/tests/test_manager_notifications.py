from uuid import uuid4
import base64,hashlib,hmac,json,time
from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest
from backend.tests.test_agency_integration import system,must
from backend.tests.test_seller_revisions import seller_case
from backend.app import manager_notifications as module,notification_transport as transport,main

SUB={'endpoint':'https://web.push.apple.com/test-token','keys':{'p256dh':'B'+'A'*86,'auth':'A'*22}}

def setup_push(c,owner):
 pub=must(c.post('/api/admin/notifications/push/initialize',headers=owner))['public_key'];assert len(pub)==87
 must(c.post('/api/admin/notifications/push/subscribe',headers=owner,json={'subscription':SUB}))
 return pub

def test_owner_only_subscriptions_keys_and_durable_inbox(system,monkeypatch):
 c,db,owner,password=system
 assert c.get('/api/admin/notifications').status_code==401
 setup_push(c,owner)
 config=must(c.get('/api/admin/notifications/push/config',headers=owner));assert config['devices']==1 and 'private' not in json.dumps(config)
 with db.connection() as conn:
  keys=module.vapid_keys(conn);again=module.vapid_keys(conn);assert keys==again
  stored=conn.execute("SELECT after_data FROM app.audit_logs WHERE entity_type='manager_push_key'").fetchone()['after_data']
  assert keys['private'] not in json.dumps(stored)
  first=module.enqueue(conn,'inquiry',key='same-request');second=module.enqueue(conn,'inquiry',key='same-request');assert first==second
 assert must(c.get('/api/admin/notifications',headers=owner))['unread']==1
 send=MagicMock();monkeypatch.setattr(module,'send_push_notice',send);monkeypatch.setattr(module,'sms_ready',lambda _:False)
 assert module.process_one();assert not module.process_one();assert send.call_count==1
 assert send.call_args.args[2]['url']=='/management/' and 'phone' not in json.dumps(send.call_args.args[2])
 must(c.post('/api/admin/notifications/'+first+'/read',headers=owner,json={}))
 assert must(c.get('/api/admin/notifications',headers=owner))['unread']==0
 export=c.post('/api/admin/notifications/push/operations-export',headers=owner)
 assert export.status_code==200 and 'no-store' in export.headers['cache-control'] and export.json()['ingest_key']
 must(c.post('/api/admin/notifications/push/unsubscribe',headers=owner,json={'subscription':SUB}))
 assert must(c.get('/api/admin/notifications/push/config',headers=owner))['devices']==0
 # Non-owner roles cannot read/export/register endpoints.
 from backend.app.auth import create_token,hash_password
 uid=str(uuid4());pwd=hash_password('Notification-1234')
 with db.connection() as conn:conn.execute("INSERT INTO app.users(id,username,password_hash,role) VALUES (%s,'notifadmin',%s,'admin')",(uid,pwd));conn.commit()
 admin={'Authorization':'Bearer '+create_token(uid,'admin',pwd)}
 assert c.get('/api/admin/notifications',headers=admin).status_code==403
 assert c.post('/api/admin/notifications/push/operations-export',headers=admin).status_code==403

@pytest.mark.parametrize('endpoint',['http://web.push.apple.com/x','https://127.0.0.1/x','https://web.push.apple.com.evil.test/x','https://web.push.apple.com:8443/x','https://user:secret@web.push.apple.com/x','https://fcm.googleapis.com/x#secret'])
def test_push_endpoint_rejects_ssrf(endpoint):
 with pytest.raises(ValueError):transport.validate_subscription({**SUB,'endpoint':endpoint})

def test_delivery_failure_is_not_retried_and_expired_device_removed(system,monkeypatch):
 c,db,owner,_=system;setup_push(c,owner)
 with db.connection() as conn:module.enqueue(conn,'contact');conn.commit()
 expired=Exception();expired.response=SimpleNamespace(status_code=410)
 sender=MagicMock(side_effect=expired);monkeypatch.setattr(module,'send_push_notice',sender);monkeypatch.setattr(module,'sms_ready',lambda _:False)
 assert module.process_one();assert not module.process_one();assert sender.call_count==1
 assert must(c.get('/api/admin/notifications/push/config',headers=owner))['devices']==0
 assert must(c.get('/api/admin/notifications',headers=owner))['delivery']['expired']==1


def test_all_business_events_record_without_network_on_request(system,monkeypatch):
 c,db,owner,_=system
 sender=MagicMock(side_effect=AssertionError('No network in customer request'));monkeypatch.setattr(module,'send_push_notice',sender)
 for category in ['property','inquiry','contact','agency','security']:
  with db.connection() as conn:module.enqueue(conn,category,uuid4());conn.commit()
 assert len(must(c.get('/api/admin/notifications',headers=owner))['items'])==5;sender.assert_not_called()
 for _ in range(2):must(c.post('/api/public/contact-requests',json={'name':'آزمایش','phone':'09120000001','description':'پیام خصوصی آزمون'}),201)
 items=must(c.get('/api/admin/notifications',headers=owner))['items'];assert len(items)==6
 assert 'پیام خصوصی' not in json.dumps(items,ensure_ascii=False)


def test_signed_operations_ingest_rejects_replay_age_and_is_idempotent(system):
 c,db,owner,_=system
 from backend.app.config import settings
 secret=hmac.new(settings.jwt_secret.encode(),b'evaz-operations-ingest',hashlib.sha256).hexdigest()
 body=json.dumps({'category':'outage','event_id':'12:failed'}).encode();stamp=str(int(time.time()));sig=hmac.new(secret.encode(),stamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
 path='/api/admin/notifications/operations/ingest';headers={'X-Evaz-Timestamp':stamp,'X-Evaz-Signature':sig,'Content-Type':'application/json'}
 assert c.post(path,content=body).status_code==401
 must(c.post(path,content=body,headers=headers));must(c.post(path,content=body,headers=headers))
 assert must(c.get('/api/admin/notifications',headers=owner))['unread']==1
 assert c.post(path,content=body,headers={**headers,'X-Evaz-Timestamp':'1'}).status_code==401
 with db.connection() as conn:assert conn.execute("SELECT action FROM app.audit_logs WHERE entity_type='manager_notice'").fetchone()['action']=='notice_external'


def test_sms_categories_use_distinct_template_and_only_manager_number(monkeypatch):
 monkeypatch.setenv('ADMIN_NOTIFICATION_PHONE','09120000000');monkeypatch.setenv('SMSIR_API_KEY','test');monkeypatch.setenv('SMSIR_ADMIN_INQUIRY_TEMPLATE_ID','123')
 response=MagicMock();response.__enter__.return_value.read.return_value=b'{"status":1,"data":{"messageId":42}}'
 sender=MagicMock(return_value=response);monkeypatch.setattr(transport,'urlopen',sender)
 assert transport.send_sms_notice('inquiry')=='42'
 payload=json.loads(sender.call_args.args[0].data);assert payload['mobile']=='09120000000' and payload['templateId']==123
 assert transport.sms_ready('inquiry') and not transport.sms_ready('contact')


def test_actual_seller_and_admin_change_hooks(seller_case):
 c,db,owner,user,body=seller_case
 first=must(c.post('/api/seller/property-submissions',json=body),201)
 must(c.post('/api/seller/property-submissions',json=body),201)
 notices=must(c.get('/api/admin/notifications',headers=owner))['items'];assert [n['category'] for n in notices]==['property']
 account=must(c.post('/api/admin/accounts',headers=owner,json={'username':'notifyadmin','password':'New-admin-1234','role':'admin'}),201)['item']
 must(c.put('/api/admin/accounts/'+account['id'],headers=owner,json={'is_active':False}))
 notices=must(c.get('/api/admin/notifications',headers=owner))['items'];assert sum(n['category']=='security' for n in notices)==2


def test_external_sender_alerts_phone_even_if_backend_is_down(monkeypatch,capsys):
 import importlib.util
 from pathlib import Path
 spec=importlib.util.spec_from_file_location('ops_sender_test',Path('backend/scripts/send_operations_notice.py'));script=importlib.util.module_from_spec(spec);spec.loader.exec_module(script)
 monkeypatch.setenv('NOTICE_CATEGORY','outage');monkeypatch.setenv('NOTICE_EVENT_ID','12:failed')
 monkeypatch.setenv('OPERATIONS_PUSH_CONFIG',json.dumps({'subscriptions':[SUB],'vapid_private_key':'fake-key','ingest_key':'fake-ingest'}))
 send=MagicMock();monkeypatch.setattr(script,'send_push_notice',send);monkeypatch.setattr(script,'sms_ready',lambda _:False);monkeypatch.setattr(script,'urlopen',MagicMock(side_effect=TimeoutError()))
 assert script.main()==0;send.assert_called_once();output=capsys.readouterr().out
 assert 'fake-key' not in output and 'fake-ingest' not in output and 'test-token' not in output
 assert json.loads(output)['recorded_in_panel'] is False


def test_real_webpush_encryption_uses_no_redirect_and_bounded_timeout(monkeypatch):
 from cryptography.hazmat.primitives.asymmetric import ec
 from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
 import requests
 enc=lambda data:base64.urlsafe_b64encode(data).rstrip(b'=').decode()
 sender_key=ec.generate_private_key(ec.SECP256R1());recipient_key=ec.generate_private_key(ec.SECP256R1())
 private=enc(sender_key.private_numbers().private_value.to_bytes(32,'big'))
 sub={'endpoint':'https://web.push.apple.com/test','keys':{'p256dh':enc(recipient_key.public_key().public_bytes(Encoding.X962,PublicFormat.UncompressedPoint)),'auth':enc(b'1234567890123456')}}
 response=requests.Response();response.status_code=201
 call=MagicMock(return_value=response);monkeypatch.setattr(requests.Session,'request',call)
 assert transport.send_push_notice(sub,private,{'title':'آزمایش'}) is True
 assert call.call_args.kwargs['allow_redirects'] is False and call.call_args.kwargs['timeout']==12
 assert 'آزمایش'.encode() not in call.call_args.kwargs['data']


def test_push_can_replace_manager_sms_without_disabling_customer_otp(monkeypatch):
 from backend.app import sms_gateway
 monkeypatch.setenv('ADMIN_SMS_NOTIFICATIONS_ENABLED','false')
 monkeypatch.setenv('ADMIN_NOTIFICATION_PHONE','09120000000');monkeypatch.setenv('SMSIR_API_KEY','test');monkeypatch.setenv('SMS_PROVIDER','smsir');monkeypatch.setenv('SMSIR_TEMPLATE_ID','999');monkeypatch.setenv('SMSIR_ADMIN_NOTIFICATION_TEMPLATE_ID','123');monkeypatch.setenv('SMSIR_ADMIN_INQUIRY_TEMPLATE_ID','456')
 assert sms_gateway.otp_configured() is True
 assert sms_gateway.owner_notification_configured() is False
 assert transport.sms_ready('inquiry') is False
