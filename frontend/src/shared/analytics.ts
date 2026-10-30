import {fetchWithTimeout as fetch} from './http';
const API='https://api.evazmelk.ir';
import {attributionFor,campaignChanged,type Attribution} from './campaignAttribution.js';
let memoryId:string|undefined;
let memoryAttribution:Attribution|null=null;
let started=false;
function session(){
 if(memoryId)return memoryId;
 try{const stored=sessionStorage.getItem('evaz_visit');memoryId=stored&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)?stored:crypto.randomUUID();sessionStorage.setItem('evaz_visit',memoryId)}catch{memoryId=crypto.randomUUID()}
 return memoryId;
}
function captureAttribution(){
 let prior=memoryAttribution;
 try{if(!prior){const saved=JSON.parse(sessionStorage.getItem('evaz_attribution')||'null');if(saved&&typeof saved==='object'&&!Array.isArray(saved))prior=saved}}catch{}
 let referrer='';try{const url=new URL(document.referrer);if(!['evazmelk.ir','www.evazmelk.ir','admin.evazmelk.ir'].includes(url.hostname))referrer=url.hostname}catch{}
 const next=attributionFor(location.search,referrer,prior);
 if(campaignChanged(prior,next)){
  memoryId=crypto.randomUUID();try{sessionStorage.setItem('evaz_visit',memoryId)}catch{}
 }
 memoryAttribution=next;
 try{sessionStorage.setItem('evaz_attribution',JSON.stringify(next))}catch{}
 return next;
}
export function getAnalyticsContext(){
 if(navigator.doNotTrack==='1')return null;
 const details=captureAttribution();return {session_id:session(),details};
}
export function track(event:string,details:Record<string,unknown>={},code?:string,path=window.location.pathname,fixedContext?:ReturnType<typeof getAnalyticsContext>){
 if(navigator.doNotTrack==='1')return;
 const context=fixedContext===undefined?getAnalyticsContext():fixedContext;if(!context)return;
 const body=JSON.stringify({event,session_id:context.session_id,path,property_code:code||undefined,details:{...details,...context.details}});
 void fetch(API+'/api/public/events',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
}
export function startAnalytics(){
 if(started||navigator.doNotTrack==='1')return;started=true;
 let stopPage=()=>{};
 const page=()=>{
  stopPage();const pagePath=location.pathname;
  const pageContext=getAnalyticsContext();
  track('page_view',{device:matchMedia('(max-width:900px)').matches?'mobile':'desktop'});
  let activeSince=document.visibilityState==='visible'?performance.now():0,seconds=0;const depths=new Set<number>();
  const accrue=()=>{if(activeSince){seconds+=(performance.now()-activeSince)/1000;activeSince=0}};
  const visibility=()=>{if(document.visibilityState==='hidden')accrue();else activeSince=performance.now()};
  const scroll=()=>{const height=document.documentElement.scrollHeight-innerHeight;if(height<=0)return;const depth=Math.min(100,Math.round(scrollY/height*100));for(const mark of [25,50,75,100])if(depth>=mark&&!depths.has(mark)){depths.add(mark);track('scroll_depth',{depth:mark})}};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('scroll',scroll,{passive:true});
  stopPage=()=>{accrue();if(seconds>=1)track('engaged_time',{seconds:Math.round(seconds)},undefined,pagePath,pageContext);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('scroll',scroll)};
 };
 const click=(e:MouseEvent)=>{const link=(e.target as Element)?.closest?.('a');if(!link)return;const href=link.getAttribute('href')||'';const code=link.dataset.propertyCode; if(href.startsWith('tel:'))track('phone_click',{},code);else if(href.startsWith('https://wa.me/'))track('whatsapp_click',{},code);else if(href.includes('instagram.com/'))track('instagram_click')};
 const clientError=()=>track('client_error',{error_kind:'runtime'});
 page();window.addEventListener('popstate',page);window.addEventListener('evaz:navigate',page);document.addEventListener('click',click);window.addEventListener('error',clientError);window.addEventListener('unhandledrejection',clientError);window.addEventListener('pagehide',()=>stopPage());
}
