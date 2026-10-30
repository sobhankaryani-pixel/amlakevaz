"""Offline SMS.ir contracts: no real keys, SMS or provider calls."""
import io,json,os,unittest
from unittest.mock import patch
from urllib.error import HTTPError
from backend.app import sms_gateway as gateway

class SmsirTests(unittest.TestCase):
 def setUp(self):
  self.env=patch.dict(os.environ,{'SMS_PROVIDER':'smsir','SMSIR_API_KEY':'offline-test-key','SMSIR_TEMPLATE_ID':'560883'},clear=True);self.env.start();self.addCleanup(self.env.stop)
 def response(self,data):return io.BytesIO(json.dumps(data).encode())
 def test_template_request_keeps_leading_zero_and_api_key_out_of_body(self):
  with patch.object(gateway,'urlopen',return_value=self.response({'status':1,'data':{'messageId':123}})) as send:
   self.assertEqual(gateway.send_login_code('09120000000','012345'),'123')
  req=send.call_args.args[0];body=json.loads(req.data)
  self.assertEqual(req.full_url,'https://api.sms.ir/v1/send/verify')
  self.assertEqual(body,{'mobile':'09120000000','templateId':560883,'parameters':[{'name':'CODE','value':'012345'}]})
  self.assertEqual(req.get_header('X-api-key'),'offline-test-key');self.assertNotIn('offline-test-key',req.data.decode());self.assertEqual(send.call_args.kwargs['timeout'],12)
 def test_unconfigured_or_invalid_code_does_not_contact_provider(self):
  with patch.object(gateway,'urlopen') as send:
   for template in ('','0','-1','bad'):
    os.environ['SMSIR_TEMPLATE_ID']=template;self.assertFalse(gateway.otp_configured())
    with self.assertRaises(gateway.SmsUnavailable):gateway.send_login_code('09120000000','012345')
   os.environ['SMSIR_TEMPLATE_ID']='560883'
   for code in ('12345','1234567','ABCDEF'):
    with self.assertRaises(gateway.SmsUnavailable):gateway.send_login_code('09120000000',code)
   send.assert_not_called()
 def test_http_200_business_errors_and_bad_response_are_failures(self):
  for payload in ({'status':102,'message':'pending'}, {'status':1,'data':None},{'status':1,'data':{'messageId':0}},{'status':True,'data':{'messageId':123}},[]):
   with self.subTest(payload=payload),patch.object(gateway,'urlopen',return_value=self.response(payload)):
    with self.assertRaises(gateway.SmsUnavailable):gateway.send_login_code('09120000000','012345')
 def test_transport_failure_is_safe_and_does_not_retry(self):
  for error in (TimeoutError('private transport information'),HTTPError('https://api.sms.ir',401,'secret error',{},None)):
   with patch.object(gateway,'urlopen',side_effect=error) as send:
    with self.assertRaises(gateway.SmsUnavailable) as result:gateway.send_login_code('09120000000','012345')
    self.assertNotIn('private',str(result.exception));self.assertNotIn('secret error',str(result.exception));self.assertEqual(send.call_count,1)
 def test_generic_legacy_gateway_remains_supported(self):
  os.environ.update(SMS_PROVIDER='generic',SMS_GATEWAY_URL='https://gateway.example/send',SMS_GATEWAY_TOKEN='offline-token')
  with patch.object(gateway,'urlopen',return_value=self.response({'success':True,'id':'old-ref'})) as send:
   self.assertTrue(gateway.otp_configured());self.assertEqual(gateway.send_login_code('09120000000','012345'),'old-ref')
  self.assertIn('012345',json.loads(send.call_args.args[0].data)['message'])
 def test_smsir_otp_does_not_enable_generic_marketing_campaigns(self):
  self.assertTrue(gateway.otp_configured());self.assertFalse(gateway.configured())
  with patch.object(gateway,'urlopen') as send:
   with self.assertRaises(gateway.SmsUnavailable):gateway.send_sms('09120000000','تبلیغ آزمایشی')
   send.assert_not_called()

if __name__=='__main__':unittest.main()
