import {fetchWithTimeout as fetch} from './http';
const API='https://api.evazmelk.ir';
let memoryId:string|undefined;
function session(){
 if(memoryId)return memoryId;
 try{memoryId=sessionStorage.getItem('evaz_visit')||crypto.randomUUID();sessionStorage.setItem('evaz_visit',memoryId)}catch{memoryId=crypto.randomUUID()}
 return memoryId;
}
export function track(event:string,details:Record<string,unknown>={},code?:string,path=window.location.pathname){
 if(navigator.doNotTrack==='1')return;
 let attribution={};try{attribution=JSON.parse(sessionStorage.getItem('evaz_attribution')||'{}')}catch{}
 const body=JSON.stringify({event,session_id:session(),path,property_code:code||undefined,details:{...attribution,...details}});
 void fetch(API+'/api/public/events',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
}
export function startAnalytics(){
 let stopPage=()=>{};
 const page=()=>{
  stopPage();const pagePath=location.pathname;const params=new URLSearchParams(location.search);
  let referrer='';try{referrer=document.referrer?new URL(document.referrer).hostname:''}catch{}
  let attribution:Record<string,string>={source:params.get('utm_source')||'',medium:params.get('utm_medium')||'',campaign:params.get('utm_campaign')||'',referrer};
  try{const prior=sessionStorage.getItem('evaz_attribution');if(prior)attribution=JSON.parse(prior);else sessionStorage.setItem('evaz_attribution',JSON.stringify(attribution))}catch{}
  track('page_view',{...attribution,device:matchMedia('(max-width:900px)').matches?'mobile':'desktop'});
  let activeSince=document.visibilityState==='visible'?performance.now():0,seconds=0;const depths=new Set<number>();
  const accrue=()=>{if(activeSince){seconds+=(performance.now()-activeSince)/1000;activeSince=0}};
  const visibility=()=>{if(document.visibilityState==='hidden')accrue();else activeSince=performance.now()};
  const scroll=()=>{const height=document.documentElement.scrollHeight-innerHeight;if(height<=0)return;const depth=Math.min(100,Math.round(scrollY/height*100));for(const mark of [25,50,75,100])if(depth>=mark&&!depths.has(mark)){depths.add(mark);track('scroll_depth',{depth:mark})}};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('scroll',scroll,{passive:true});
  stopPage=()=>{accrue();if(seconds>=1)track('engaged_time',{seconds:Math.round(seconds)},undefined,pagePath);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('scroll',scroll)};
 };
 const click=(e:MouseEvent)=>{const link=(e.target as Element)?.closest?.('a');if(!link)return;const href=link.getAttribute('href')||'';const code=link.dataset.propertyCode; if(href.startsWith('tel:'))track('phone_click',{},code);else if(href.startsWith('https://wa.me/'))track('whatsapp_click',{},code);else if(href.includes('instagram.com/'))track('instagram_click')};
 const clientError=()=>track('client_error',{error_kind:'runtime'});
 page();window.addEventListener('popstate',page);window.addEventListener('evaz:navigate',page);document.addEventListener('click',click);window.addEventListener('error',clientError);window.addEventListener('unhandledrejection',clientError);window.addEventListener('pagehide',()=>stopPage());
}
