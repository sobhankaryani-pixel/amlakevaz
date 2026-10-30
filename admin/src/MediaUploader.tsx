import './media-uploader.css';
import {fetchWithTimeout as fetch,UPLOAD_TIMEOUT_MS} from './http';
import {useEffect,useRef,useState} from 'react';
export type MediaItem={url:string;kind:'image'|'video'};
export default function MediaUploader({items,onChange,allowVideo,token,onBusy,draftItems}:{items:MediaItem[];onChange:(items:MediaItem[])=>void;allowVideo:boolean;token?:string;onBusy?:(busy:boolean)=>void;draftItems?:MediaItem[]}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const input=useRef<HTMLInputElement>(null);
 const [retentionError,setRetentionError]=useState('');
 const mediaKey=(draftItems||items).map(item=>item.url).join('\n');
 useEffect(()=>{
  if(!mediaKey){setRetentionError('');return}
  const controller=new AbortController();let live=true,inFlight=false;
  const retain=async()=>{
   if(document.visibilityState!=='visible'||inFlight)return;inFlight=true;
   try{
    const response=await fetch('https://api.evazmelk.ir/api/'+(token?'admin':'seller')+'/media/retain',{method:'POST',credentials:token?'omit':'include',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({urls:mediaKey.split('\n')}),signal:controller.signal});
    const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'حفظ فایل‌های پیش‌نویس تأیید نشد.');
    if(live)setRetentionError('');
   }catch(e){if(live)setRetentionError(e instanceof Error?e.message:'حفظ فایل‌های پیش‌نویس تأیید نشد.')}finally{inFlight=false}
  };
  void retain();const timer=setInterval(()=>void retain(),300000);
  const visible=()=>{if(document.visibilityState==='visible')void retain()};document.addEventListener('visibilitychange',visible);
  return()=>{live=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible)};
 },[mediaKey,token]);

 async function upload(files:FileList|null){
  if(!files)return;setError('');setBusy(true);onBusy?.(true);let next=[...items];
  try{for(const file of Array.from(files)){
   const video=file.type.startsWith('video/');
   if(video&&!allowVideo)throw Error('فیلم فقط برای خانه قابل بارگذاری است.');
   if(file.size>(video?50:8)*1024*1024)throw Error('حداکثر حجم عکس ۸ و فیلم ۵۰ مگابایت است.');
   if(next.filter(x=>x.kind===(video?'video':'image')).length>=(video?2:12))throw Error('حداکثر ۱۲ عکس و ۲ فیلم مجاز است.');
   const form=new FormData();form.append('file',file);
   const response=await fetch('https://api.evazmelk.ir/api/'+(token?'admin':'seller')+'/media',{method:'POST',credentials:token?'omit':'include',headers:token?{Authorization:'Bearer '+token}:{},body:form,timeoutMs:UPLOAD_TIMEOUT_MS});
   const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'بارگذاری فایل انجام نشد.');
   next=[...next,{url:data.url,kind:data.kind}];onChange(next);
  }}catch(e){setError(e instanceof Error?e.message:'خطای بارگذاری')}finally{setBusy(false);onBusy?.(false);if(input.current)input.current.value=''}
 }
 return <div className="media-uploader"><h3>عکس‌ها{allowVideo?' و فیلم خانه':''}</h3><p>تا ۱۲ عکس، هر عکس حداکثر ۸ مگابایت.{allowVideo?' تا ۲ فیلم MP4 یا WebM، هرکدام حداکثر ۵۰ مگابایت.':''} اولین عکس، تصویر اصلی آگهی است. فقط تصاویر مجاز برای انتشار عمومی را اضافه کنید.</p><input ref={input} type="file" multiple accept={'image/jpeg,image/png,image/webp'+(allowVideo?',video/mp4,video/webm':'')} disabled={busy} onChange={e=>void upload(e.target.files)}/>{busy&&<p role="status">در حال بارگذاری فایل‌ها…</p>}{error&&<p role="alert">{error}</p>}{retentionError&&<p role="alert">{retentionError} تا رفع این پیام، پیش‌نویس را نهایی نکنید؛ حفظ فایل‌ها در پس‌زمینه دوباره بررسی می‌شود.</p>}<div className="media-upload-grid">{items.map((item,i)=><figure key={item.url}>{item.kind==='image'?<a href={item.url} target="_blank" rel="noopener noreferrer" title="مشاهدهٔ عکس کامل در تب جدید"><img src={item.url} alt={`عکس ${i+1}`}/></a>:<video src={item.url} controls preload="metadata"/>}<figcaption>{item.kind==='image'&&<button type="button" disabled={busy||i===0} onClick={()=>onChange([item,...items.filter((_,j)=>j!==i)])}>عکس اصلی</button>}<button type="button" disabled={busy} onClick={()=>onChange(items.filter((_,j)=>i!==j))}>حذف از آگهی</button></figcaption></figure>)}</div></div>
}
