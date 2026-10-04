"""Gateway adapter. Configure an HTTPS endpoint accepting the documented JSON contract.

For a vendor with a different request format, adapt only send_sms().
"""
import json
import os
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class SmsUnavailable(Exception):
    pass


def configured() -> bool:
    url=os.environ.get('SMS_GATEWAY_URL','')
    return bool(urlsplit(url).scheme=='https' and urlsplit(url).netloc and os.environ.get('SMS_GATEWAY_TOKEN'))


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
