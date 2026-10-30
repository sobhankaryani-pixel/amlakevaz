"""Generic campaign gateway and a separate SMS.ir template adapter for login OTP."""
import json
import os
import re
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class SmsUnavailable(Exception):
    pass


def configured() -> bool:
    url=os.environ.get('SMS_GATEWAY_URL','')
    return bool(urlsplit(url).scheme=='https' and urlsplit(url).netloc and os.environ.get('SMS_GATEWAY_TOKEN'))


def otp_configured() -> bool:
    provider=os.environ.get('SMS_PROVIDER','generic').strip().lower()
    if provider=='generic':return configured()
    if provider!='smsir':return False
    template=os.environ.get('SMSIR_TEMPLATE_ID','').strip()
    return bool(os.environ.get('SMSIR_API_KEY','').strip() and re.fullmatch(r'[1-9][0-9]*',template))


def send_login_code(phone: str, code: str) -> str:
    """Use CODE in the approved OTP template; never send campaign text through it."""
    if not re.fullmatch(r'[0-9]{6}',code):
        raise SmsUnavailable('کد ورود معتبر نیست')
    if not otp_configured():
        raise SmsUnavailable('ورود با پیامک هنوز فعال نشده است')
    if os.environ.get('SMS_PROVIDER','generic').strip().lower()=='generic':
        return send_sms(phone,f'کد ورود خودمونی: {code}\nاعتبار: ۵ دقیقه')
    payload={'mobile':phone,'templateId':int(os.environ['SMSIR_TEMPLATE_ID']),
             'parameters':[{'name':'CODE','value':code}]}
    req=Request('https://api.sms.ir/v1/send/verify',
      data=json.dumps(payload).encode('utf-8'),
      headers={'x-api-key':os.environ['SMSIR_API_KEY'].strip(),'Content-Type':'application/json','Accept':'application/json'},method='POST')
    try:
        with urlopen(req,timeout=12) as response:
            result=json.loads(response.read(16384).decode('utf-8'))
        if not isinstance(result,dict) or type(result.get('status')) is not int or result['status']!=1:
            raise SmsUnavailable('سامانهٔ پیامکی ارسال را نپذیرفت؛ وضعیت قالب، کلید و اعتبار پنل را بررسی کنید')
        data=result.get('data')
        reference=data.get('messageId') if isinstance(data,dict) else None
        if isinstance(reference,bool) or not re.fullmatch(r'[1-9][0-9]*',str(reference)):
            raise SmsUnavailable('پاسخ سامانهٔ پیامکی قابل تأیید نیست؛ گزارش پنل را بررسی کنید')
        return str(reference)
    except SmsUnavailable:raise
    except HTTPError as exc:
        # Do not return vendor response bodies: they can contain submitted values.
        raise SmsUnavailable('ارسال پیامک پذیرفته نشد؛ وضعیت قالب، کلید و اعتبار پنل را بررسی کنید') from exc
    except Exception as exc:
        raise SmsUnavailable('ارتباط با سامانهٔ پیامکی برقرار نشد؛ کمی بعد دوباره تلاش کنید') from exc


def send_sms(phone: str, message: str) -> str:
    if not configured():
        raise SmsUnavailable('درگاه پیامک هنوز تنظیم نشده است')
    url=os.environ['SMS_GATEWAY_URL']
    payload=json.dumps({'to':phone,'message':message,'sender':os.environ.get('SMS_SENDER','')},ensure_ascii=False).encode('utf-8')
    req=Request(url,data=payload,headers={'Authorization':'Bearer '+os.environ['SMS_GATEWAY_TOKEN'],'Content-Type':'application/json'},method='POST')
    try:
        with urlopen(req,timeout=12) as response:
            raw=response.read(4096).decode('utf-8','replace')
            result=json.loads(raw) if raw else {}
            if isinstance(result,dict) and result.get('success') is False:
                raise SmsUnavailable('درگاه پیامک ارسال را نپذیرفت')
            return str(result.get('id') or result.get('message_id') or '') if isinstance(result,dict) else ''
    except SmsUnavailable:
        raise
    except Exception as exc:
        raise SmsUnavailable('ارسال پیامک از درگاه انجام نشد') from exc
