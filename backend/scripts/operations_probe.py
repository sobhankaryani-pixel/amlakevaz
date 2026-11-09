"""Bounded public HTTP checks; never writes production data."""
import json,time,urllib.request
TARGETS=[('home','https://evazmelk.ir/'),('health','https://backend.evazmelk.ir/health'),('cards','https://backend.evazmelk.ir/api/public/property-cards?limit=1')]
def check(name,url):
 start=time.monotonic()
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Evaz-Operational-Check/1.0'}),timeout=20) as response:
   status=response.status; body=response.read(1048577)
  if status!=200 or len(body)>1048576:raise ValueError('unexpected_response')
  if name=='home':
   if b'<html' not in body.lower():raise ValueError('html_missing')
  else:
   data=json.loads(body)
   if name=='health' and (data.get('status')!='ok' or data.get('database')!='ok'):raise ValueError('health_failed')
   if name=='cards' and not isinstance(data.get('items'),list):raise ValueError('cards_failed')
  return {'name':name,'ok':True,'status':status,'bytes':len(body),'ms':round((time.monotonic()-start)*1000)}
 except Exception as exc:return {'name':name,'ok':False,'error':type(exc).__name__,'ms':round((time.monotonic()-start)*1000)}
def main():
 results=[]
 for name,url in TARGETS:
  for attempt in range(3):
   result=check(name,url)
   if result['ok']:break
   if attempt<2:time.sleep(2)
  results.append(result)
 print(json.dumps({'scope':'runner HTTP checks, not real mobile performance','results':results}))
 return 0 if all(x['ok'] for x in results) else 1
if __name__=='__main__':raise SystemExit(main())
