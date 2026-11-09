"""No SMS is sent: durable queue, idempotence, recipient and template contracts."""
import json
from unittest.mock import MagicMock
import pytest
from backend.tests.test_agency_integration import system,must
from backend.tests.test_seller_revisions import seller_case
from backend.app import main,owner_notifications as module,sms_gateway

def test_queue_only_once_and_admin_badge_counts_pending(seller_case,monkeypatch):
 c,db,owner,user,body=seller_case;monkeypatch.setattr(module,'pool',db)
 assert c.get('/api/admin/submission-notifications').status_code==401
 sid=must(c.post('/api/seller/property-submissions',json=body),201)['id']
 assert must(c.post('/api/seller/property-submissions',json=body),201)['id']==sid
 notice=must(c.get('/api/admin/submission-notifications',headers=owner));assert notice['count']==1 and notice['latest']
 with db.connection() as conn:assert conn.execute("SELECT count(*) AS n FROM app.audit_logs WHERE entity_type='owner_notification'").fetchone()['n']==1
 monkeypatch.setattr(module,'owner_notification_configured',lambda:True);send=MagicMock(return_value='isolated-provider-reference');monkeypatch.setattr(module,'send_owner_submission_notice',send)
 assert module.process_one() is True;assert module.process_one() is False;send.assert_called_once_with()
 notice=must(c.get('/api/admin/submission-notifications',headers=owner));assert notice['sms_states']['owner_sms_accepted']==1
 # Reviewing closes the badge; a later correction creates a fresh pending notification.
 must(c.post('/api/admin/property-submissions/'+sid+'/decision',headers=owner,json={'status':'rejected','note':'اطلاعات اصلاح شود'}))
 assert must(c.get('/api/admin/submission-notifications',headers=owner))['count']==0
 must(c.put('/api/seller/property-submissions/'+sid+'/resubmit',json={**body,'request_id':__import__('uuid').uuid4().__str__(),'expected_revision':0}))
 assert must(c.get('/api/admin/submission-notifications',headers=owner))['count']==1
 assert module.process_one() is True;assert send.call_count==2

def test_unconfirmed_sms_never_duplicates_and_submission_is_not_lost(seller_case,monkeypatch):
 c,db,owner,user,body=seller_case;monkeypatch.setattr(module,'pool',db)
 sid=must(c.post('/api/seller/property-submissions',json=body),201)['id']
 monkeypatch.setattr(module,'owner_notification_configured',lambda:True);send=MagicMock(side_effect=TimeoutError());monkeypatch.setattr(module,'send_owner_submission_notice',send)
 assert module.process_one() is True;assert module.process_one() is False;assert send.call_count==1
 notice=must(c.get('/api/admin/submission-notifications',headers=owner));assert notice['count']==1 and notice['sms_states']['owner_sms_unconfirmed']==1

def test_closed_request_does_not_send_old_notice(seller_case,monkeypatch):
 c,db,owner,user,body=seller_case;monkeypatch.setattr(module,'pool',db)
 sid=must(c.post('/api/seller/property-submissions',json=body),201)['id']
 must(c.post('/api/admin/property-submissions/'+sid+'/decision',headers=owner,json={'status':'rejected','note':'بررسی شد'}))
 monkeypatch.setattr(module,'owner_notification_configured',lambda:True);send=MagicMock();monkeypatch.setattr(module,'send_owner_submission_notice',send)
 assert module.process_one() is True;send.assert_not_called()

def test_smsir_owner_uses_separate_template_and_only_owner_phone(monkeypatch):
 monkeypatch.setenv('ADMIN_NOTIFICATION_PHONE','09120000000');monkeypatch.setenv('SMS_PROVIDER','smsir');monkeypatch.setenv('SMSIR_API_KEY','isolated-key');monkeypatch.setenv('SMSIR_ADMIN_NOTIFICATION_TEMPLATE_ID','123');monkeypatch.setenv('SMSIR_TEMPLATE_ID','999')
 response=MagicMock();response.__enter__.return_value.read.return_value=json.dumps({'status':1,'data':{'messageId':45}}).encode();send=MagicMock(return_value=response);monkeypatch.setattr(sms_gateway,'urlopen',send)
 assert sms_gateway.send_owner_submission_notice()=='45'
 req=send.call_args.args[0];payload=json.loads(req.data);assert payload=={'mobile':'09120000000','templateId':123,'parameters':[{'name':'COUNT','value':'1'}]}
 assert send.call_args.kwargs['timeout']==12
 monkeypatch.delenv('SMSIR_ADMIN_NOTIFICATION_TEMPLATE_ID');assert not sms_gateway.owner_notification_configured()
 with pytest.raises(sms_gateway.SmsUnavailable):sms_gateway.send_owner_submission_notice()

@pytest.mark.parametrize('kind,area',[('land',{'area_m2':100}),('villa',{'area_m2':100}),('garden',{'area_m2':100}),('apartment',{'building_area_m2':100}),('mehr',{'building_area_m2':100}),('national',{'building_area_m2':100}),('shop',{'commercial_area_m2':100})])
def test_minimal_form_needs_only_area_region_price_beyond_signed_in_identity(kind,area):
 from pydantic import ValidationError
 payload={'kind':kind,'seller_phone':'09120000000','region_key':'R-QA','asking_price_toman':3000000000,**area}
 item=main.SellerSubmissionIn.model_validate(payload);assert item.media==[] and item.latitude is None
 for missing in ('region_key','asking_price_toman',next(iter(area))):
  with pytest.raises(ValidationError):main.SellerSubmissionIn.model_validate({k:v for k,v in payload.items() if k!=missing})
 with pytest.raises(ValidationError):main.SellerSubmissionIn.model_validate({**payload,'latitude':27.76})
 item=main.SellerSubmissionIn.model_validate({**payload,'latitude':27.76,'longitude':54.0});assert item.longitude==54
