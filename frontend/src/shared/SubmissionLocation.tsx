import {useEffect,useRef,useState} from 'react';
const KEY=import.meta.env.VITE_NESHAN_MAP_KEY as string|undefined;
declare global {interface Window {L:any;__evazNeshanPromise?:Promise<any>}}
function loadNeshan(){
 if(window.L?.Map)return Promise.resolve(window.L);
 if(window.__evazNeshanPromise)return window.__evazNeshanPromise;
 const base='https://static.neshan.org/sdk/leaflet/v1.9.4/neshan-sdk/v1.0.8/';
 window.__evazNeshanPromise=new Promise((resolve,reject)=>{
  if(!document.querySelector('link[data-evaz-neshan]')){const css=document.createElement('link');css.rel='stylesheet';css.href=base+'index.css';css.dataset.evazNeshan='';document.head.appendChild(css)}
  const script=document.createElement('script');script.src=base+'index.js';script.async=true;
  const finish=(error?:Error)=>{clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();reject(error)}else resolve(window.L)};
  const timer=setTimeout(()=>finish(Error('بارگذاری نقشه بیش از حد طول کشید؛ دوباره تلاش کنید.')),30000);
  script.onload=()=>finish(window.L?.Map?undefined:Error('نقشهٔ نشان بارگذاری نشد.'));
  script.onerror=()=>finish(Error('ارتباط با نقشهٔ نشان برقرار نشد.'));
  document.head.appendChild(script);
 }).catch(e=>{window.__evazNeshanPromise=undefined;throw e});
 return window.__evazNeshanPromise;
}

export default function SubmissionLocation({lat,lng,onChange}:{lat:string;lng:string;onChange:(lat:string,lng:string)=>void}){
 const host=useRef<HTMLDivElement>(null),map=useRef<any>(null),marker=useRef<any>(null),callback=useRef(onChange);callback.current=onChange;
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!KEY)return;let live=true;setError('');setReady(false);loadNeshan().then(L=>{if(!live||!host.current)return;map.current=new L.Map(host.current,{key:KEY,maptype:'dreamy',center:[27.7600,54.0073],zoom:15});map.current.on('click',(e:any)=>callback.current(e.latlng.lat.toFixed(7),e.latlng.lng.toFixed(7)));setReady(true)}).catch(()=>{if(live)setError('نقشه بارگذاری نشد؛ انتخاب موقعیت اختیاری است.')});return()=>{live=false;marker.current?.remove();marker.current=null;map.current?.remove();map.current=null}},[retry]);
 useEffect(()=>{if(!ready||!map.current)return;marker.current?.remove();marker.current=null;if(lat&&lng){marker.current=window.L.marker([Number(lat),Number(lng)]).addTo(map.current);map.current.panTo([Number(lat),Number(lng)])}},[lat,lng,ready]);
 useEffect(()=>{if(!ready||!host.current)return;const observer=new ResizeObserver(()=>map.current?.invalidateSize({pan:false}));observer.observe(host.current);return()=>observer.disconnect()},[ready]);
 return <div className="submission-location"><p>روی محل ملک بزنید؛ فقط یک نقطه انتخاب می‌شود. ثبت موقعیت اختیاری است و پس از تأیید مدیریت ممکن است در آگهی نمایش داده شود.</p>{KEY?<div ref={host} className="submission-location-map" role="region" aria-label="انتخاب یک نقطه برای ملک"/>:<p role="status">نقشه هنوز تنظیم نشده است؛ می‌توانید فرم را بدون موقعیت ارسال کنید.</p>}{error&&<p role="alert">{error} <button type="button" onClick={()=>setRetry(x=>x+1)}>تلاش مجدد</button></p>}{lat&&lng&&<p role="status">موقعیت انتخاب شد. <button type="button" onClick={()=>onChange('','')}>حذف نقطه</button></p>}</div>
}
