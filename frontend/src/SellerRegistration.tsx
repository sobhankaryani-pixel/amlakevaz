import {lazy,Suspense} from 'react';
import MoneyInput from './shared/MoneyInput';
import {areaField,priceUpdate} from './shared/money';
import './shared/submission-pricing.css';
import './shared/request-experience.css';
const SubmissionLocation=lazy(()=>import('./shared/SubmissionLocation'));
import {draftEpoch} from './shared/privateDevice';
import {API} from './api';
import SubmissionGuide from './shared/SubmissionGuide';
import {getAnalyticsContext} from './shared/analytics';
import {fetchWithTimeout as fetch} from './shared/http';
import MediaUploader,{type MediaItem} from './shared/MediaUploader';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {SellerUser} from './SellerAccount';
import SubmissionList,{type EditableSubmission} from './shared/SubmissionList';


type Kind='land'|'villa'|'apartment'|'mehr'|'national'|'shop'|'garden';
const kinds:{value:Kind;label:string}[]=[
 {value:'land',label:'زمین'},{value:'villa',label:'خانهٔ ویلایی'},
 {value:'apartment',label:'آپارتمان'},{value:'mehr',label:'مسکن مهر'},
 {value:'national',label:'مسکن ملی'},{value:'garden',label:'باغ شهری'},{value:'shop',label:'مغازه'}
];
const stages=['مرحله سقف اول','مرحله سقف دوم','اتمام اسکلت کامل','اسکلت + تأسیسات کامل','تأسیسات + نما','کامل‌شده'];
const empty={seller_name:'',seller_phone:'',kind:'land' as Kind,region_key:'',neighborhood:'',area_m2:'',commercial_area_m2:'',street_frontage_m:'',building_area_m2:'',land_length_m:'',land_width_m:'',usage_type:'',house_condition:'',bedrooms:'',floor_count:'',build_year:'',mehr_section:'',mehr_level:'',national_phase:'',national_block:'',national_level:'',national_stage:'',asking_price_toman:'',price_per_m2_toman:'',price_basis:'total',price_error:'',latitude:'',longitude:'',extra_details:'',website:''};
type Form=typeof empty;
const numbers=['commercial_area_m2','street_frontage_m','area_m2','building_area_m2','land_length_m','land_width_m','bedrooms','floor_count','build_year','asking_price_toman','latitude','longitude'];

export default function SellerRegistration({user,onLogin}:{user:SellerUser|null;onLogin:()=>void}){
 const [editing,setEditing]=useState<EditableSubmission|null>(null);
 if(!user)return <section className="content-section seller-page"><div className="page-heading"><span className="section-kicker">برای فروشندگان اوز</span><h1>ثبت ملک برای فروش</h1><p>برای ثبت ملک، ابتدا با شمارهٔ موبایل وارد شوید.</p></div><button className="seller-submit" onClick={onLogin}>ورود یا ثبت‌نام با موبایل</button></section>;
 return <><section className="content-section seller-page"><SubmissionList userId={user.id} onEdit={setEditing}/>{editing&&<button type="button" className="account-link" onClick={()=>setEditing(null)}>ثبت درخواست تازه</button>}</section><RegistrationForm key={user.id+':'+(editing?.id||'new')+':'+(editing?.revision||0)} user={user} correction={editing?{...editing,onSaved:()=>{setEditing(null);window.dispatchEvent(new Event('evaz:submissions-updated'))}}:undefined}/></>;
}
export function RegistrationForm({user,agency,correction}:{correction?:{id:string;revision:number;details:Record<string,unknown>;onSaved:()=>void};user:SellerUser;agency?:{id:string;version:number;details:Record<string,unknown>;onSaved:()=>void}}){
 const [version,setVersion]=useState(agency?.version||0);
 const requestId=useRef('');
 const epoch=useRef(draftEpoch());
 const currentDraft=()=>epoch.current===draftEpoch();
 function submissionId(){if(!requestId.current)requestId.current=crypto.randomUUID();return requestId.current}
 function resetSubmissionId(){requestId.current=''}
 const [form,setForm]=useState<Form>(()=>{const details=(agency||correction)?.details||{};const initial={...empty,...Object.fromEntries(Object.entries(details).filter(([k])=>k in empty).map(([k,v])=>[k,v==null?'':String(v)])),seller_name:user.name,seller_phone:user.phone} as Form;return priceUpdate(initial,'kind',initial.kind)});
 const [media,setMedia]=useState<MediaItem[]>((agency||correction)?.details.media as MediaItem[]||[]),[uploading,setUploading]=useState(false);
 const allowVideo=['villa','apartment','mehr','national'].includes(form.kind);
 const visibleMedia=media.filter(item=>item.kind==='image'||allowVideo);
 const [regions,setRegions]=useState<{slug:string;name:string}[]>([]);
 const [error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(user)setForm(v=>({...v,seller_name:v.seller_name||user.name,seller_phone:user.phone}))},[user?.id]);
 useEffect(()=>{let live=true;fetch(`${API}/api/public/submission-regions`).then(async r=>{if(!r.ok)throw Error('فهرست منطقه‌ها دریافت نشد.');return r.json()}).then(d=>{if(live)setRegions(d.items||[])}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[]);
 const [mapOpen,setMapOpen]=useState(false),[priceError,setPriceError]=useState('');
 const area=Number(form[areaField(form.kind) as keyof Form]);const hasArea=Number.isFinite(area)&&area>0;
 const set=(key:keyof Form,value:string)=>{setForm(v=>priceUpdate(v,key,value));if(key===areaField(form.kind)&&Number(value)>0)setPriceError('')};
 const input=(key:keyof Form,label:string,required=false,numeric=false)=><label key={key}>{label}<input required={required} type={numeric?'number':'text'} min={numeric?'0':undefined} step={numeric&&!['bedrooms','floor_count','build_year','asking_price_toman'].includes(key)?'any':undefined} value={form[key]} onChange={e=>set(key,e.target.value)}/></label>;
 const select=(key:keyof Form,label:string,values:string[],required=false)=><label key={key}>{label}<select required={required} value={form[key]} onChange={e=>set(key,e.target.value)}><option value="">انتخاب کنید</option>{values.map(x=><option key={x} value={x}>{x}</option>)}</select></label>;
 async function submit(e:FormEvent){
  if(!currentDraft()){e.preventDefault();setError('نشست حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');return;}
  e.preventDefault();if(busy||uploading)return;setError('');setSuccess('');setBusy(true);
  try{
   if(!user)throw Error('ابتدا با شمارهٔ موبایل وارد شوید.');
   if(form.price_error)throw Error(form.price_error);
   if((!hasArea||!form.region_key||!Number(form.asking_price_toman)))throw Error('منطقه، متراژ و قیمت را وارد کنید.');
   const payload:Record<string,unknown>={...form,seller_name:user.name,seller_phone:user.phone,media:visibleMedia};delete payload.price_error;delete payload.price_basis;delete payload.price_per_m2_toman;delete payload.neighborhood;
   const kindFields:Record<Kind,string[]>={garden:['area_m2','land_length_m','land_width_m'],shop:['commercial_area_m2','street_frontage_m'],land:['area_m2','land_length_m','land_width_m','usage_type'],villa:['house_condition','area_m2','building_area_m2','bedrooms','floor_count','build_year'],apartment:['building_area_m2','bedrooms','floor_count','build_year'],mehr:['building_area_m2','mehr_section','mehr_level'],national:['building_area_m2','national_phase','national_block','national_level','national_stage']};
   const specificFields=new Set(Object.values(kindFields).flat());
   for(const key of specificFields)if(!kindFields[form.kind].includes(key))payload[key]='';
   for(const key of numbers)payload[key]=payload[key]===''?null:Number(payload[key]);
   if(agency){
    const saved=await fetch(`${API}/api/agency/files/${agency.id}`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({details:payload,expected_version:version})});
    const d=await saved.json();if(!saved.ok)throw Error(typeof d.detail==='string'?d.detail:'ذخیره انجام نشد.');setVersion(d.version);
    {const r=await fetch(`${API}/api/agency/files/${agency.id}/submit`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_version:d.version})});const result=await r.json();if(!r.ok)throw Error(typeof result.detail==='string'?result.detail:'ارسال انجام نشد.');}
    agency.onSaved();return;
   }
   const r=await fetch(correction?`${API}/api/seller/property-submissions/${correction.id}/resubmit`:`${API}/api/seller/property-submissions`,{method:correction?'PUT':'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,request_id:submissionId(),...(correction?{expected_revision:correction.revision}:{}),analytics:getAnalyticsContext()})});
   const d=await r.json();if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'مشخصات واردشده را بررسی کنید.');
   window.dispatchEvent(new Event('evaz:submissions-updated'));
   if(correction){resetSubmissionId();correction.onSaved();return;}
   resetSubmissionId();setSuccess(d.message+(d.tracking_code?` شمارهٔ پیگیری: ${d.tracking_code}`:''));setMedia([]);setForm({...empty,seller_name:user.name,seller_phone:user.phone});
  }catch(e){setError(e instanceof Error?e.message:'ارسال درخواست انجام نشد. دوباره تلاش کنید.')}finally{setBusy(false)}
 }

 return <section className="content-section seller-page"><div className="page-heading"><span className="section-kicker">{agency?"فایل اختصاصی بنگاه":"برای فروشندگان اوز"}</span><h1>{correction?"ویرایش درخواست":agency?"ثبت و ویرایش فایل بنگاه":"ثبت ملک برای فروش"}</h1><p>مشخصات ملک را وارد کنید. پس از بررسی و تأیید، آگهی در سایت منتشر می‌شود.</p></div>
 {!agency&&<SubmissionGuide/>}
 <form className="seller-form" onSubmit={submit}>
  <div className="seller-step"><h2>۱. نوع ملک</h2><div className="seller-kinds">{kinds.map(k=><button type="button" key={k.value} aria-pressed={form.kind===k.value} className={form.kind===k.value?'active':''} disabled={uploading} onClick={()=>{setForm(v=>priceUpdate(v,'kind',k.value));setPriceError('')}}>{k.label}</button>)}</div></div>
  <div className="seller-step"><h2>۲. مشخصات ملک</h2><div className="seller-fields">
   {form.kind==='land'&&<><label>منطقهٔ زمین<select required value={form.region_key} onChange={e=>set('region_key',e.target.value)}><option value="">انتخاب کنید</option>{regions.map(r=><option value={r.slug} key={r.slug}>{r.name}</option>)}</select></label>{select('usage_type','کاربری',['مسکونی','تجاری'])}{input('area_m2','متراژ زمین (مترمربع)',true,true)}{input('land_length_m','طول زمین (متر)',false,true)}{input('land_width_m','عرض زمین (متر)',false,true)}</>}
   {form.kind==='villa'&&<>{select('house_condition','نوع ساختمان',['نوساز','کلنگی'])}{input('area_m2','متراژ زمین (مترمربع)',true,true)}{input('building_area_m2','زیربنا (مترمربع)',false,true)}{input('bedrooms','تعداد خواب',false,true)}{input('floor_count','تعداد طبقات',false,true)}{input('build_year','سال ساخت (شمسی)',false,true)}</>}
   {form.kind==='apartment'&&<>{input('building_area_m2','زیربنا (مترمربع)',true,true)}{input('bedrooms','تعداد خواب',false,true)}{input('floor_count','تعداد طبقات',false,true)}{input('build_year','سال ساخت (شمسی)',false,true)}</>}
   {form.kind==='mehr'&&<>{input('building_area_m2','زیربنا (مترمربع)',true,true)}{select('mehr_section','بخش مسکن مهر',['محلی','فرهنگیان'])}{select('mehr_level','موقعیت طبقه',['بالا','پایین'])}</>}
   {form.kind==='national'&&<>{input('building_area_m2','زیربنا (مترمربع)',true,true)}{select('national_phase','فاز مسکن ملی',['1','2','3','4','5'])}<label>شمارهٔ بلوک<input type="text" inputMode="numeric" pattern="[0-9۰-۹٠-٩]+" value={form.national_block} onChange={e=>set('national_block',e.target.value)}/></label>{select('national_level','موقعیت طبقه',['بالا','پایین','نامشخص'])}{select('national_stage','مرحلهٔ ساخت',stages)}</>}
   {form.kind==='garden'&&<>{input('area_m2','متراژ باغ شهری (مترمربع)',true,true)}{input('land_length_m','طول باغ (متر)',false,true)}{input('land_width_m','عرض باغ (متر)',false,true)}</>}
   {form.kind==='shop'&&<>{input('commercial_area_m2','متراژ مغازه (مترمربع)',true,true)}{input('street_frontage_m','بر مغازه (متر)',false,true)}</>}
   {form.kind!=='land'&&<label>منطقه<select required value={form.region_key} onChange={e=>set('region_key',e.target.value)}><option value="">انتخاب کنید</option>{regions.map(r=><option value={r.slug} key={r.slug}>{r.name}</option>)}</select></label>}
   <div className="full submission-map-choice"><button type="button" className="link-button" aria-expanded={mapOpen} aria-controls="submission-map" onClick={()=>setMapOpen(v=>!v)}>ثبت روی نقشه{form.latitude&&form.longitude?' · نقطه انتخاب شده':''}</button>{mapOpen&&<div id="submission-map"><Suspense fallback={<p role="status">در حال آماده‌کردن نقشه…</p>}><SubmissionLocation lat={form.latitude} lng={form.longitude} onChange={(lat,lng)=>setForm(v=>({...v,latitude:lat,longitude:lng}))}/></Suspense></div>}</div>
   <div className="full submission-prices">{(priceError||form.price_error)&&<p className="seller-error price-area-error" role="alert">{priceError||form.price_error}</p>}<div className="submission-price-row"><label>قیمت کل (تومان)<MoneyInput required value={form.asking_price_toman} readOnly={!hasArea} aria-invalid={!!priceError} aria-describedby="price-area-hint" onFocus={()=>{if(!hasArea)setPriceError('ابتدا متراژ را وارد کنید')}} onPointerDown={()=>{if(!hasArea)setPriceError('ابتدا متراژ را وارد کنید')}} onValue={v=>set('asking_price_toman',v)}/></label><label>قیمت هر متر (تومان)<MoneyInput value={form.price_per_m2_toman} readOnly={!hasArea} onFocus={()=>{if(!hasArea)setPriceError('ابتدا متراژ را وارد کنید')}} onPointerDown={()=>{if(!hasArea)setPriceError('ابتدا متراژ را وارد کنید')}} onValue={v=>set('price_per_m2_toman',v)}/></label></div><small id="price-area-hint">مبنای محاسبه: {['apartment','mehr','national'].includes(form.kind)?'زیربنا':form.kind==='shop'?'متراژ مغازه':'متراژ زمین'}؛ مبلغ‌ها به نزدیک‌ترین تومان گرد می‌شوند.</small></div>
   <label className="full">توضیحات تکمیلی<textarea maxLength={2000} value={form.extra_details} onChange={e=>set('extra_details',e.target.value)} placeholder="مشخصات تکمیلی ملک را بنویسید"/></label>
  </div></div>
  <div className="seller-step"><MediaUploader audience={agency?'agency':'seller'} items={visibleMedia} draftItems={media} onChange={items=>setMedia(previous=>allowVideo?items:[...items,...previous.filter(item=>item.kind==='video')])} allowVideo={allowVideo} onBusy={setUploading}/></div>
  <div className="seller-step"><h2>{agency?"۳. اطلاعات بنگاه":"۳. اطلاعات فروشنده"}</h2><div className="seller-fields">{agency?<label>نام بنگاه<input readOnly value={user.name}/></label>:<label>نام فروشنده<input readOnly value={user.name}/></label>}<label>{agency?"شمارهٔ ثبت‌شده نزد مدیریت":"شمارهٔ تأییدشده"}<input readOnly dir="ltr" value={user.phone}/></label></div><label className="seller-honeypot" aria-hidden="true">وب‌سایت<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e=>set('website',e.target.value)}/></label><p className="seller-privacy">شمارهٔ شما تنها در پنل مدیریت دیده می‌شود. پس از تأیید، آگهی منتشر می‌شود و هنگام پیدا شدن خریدار با شما تماس می‌گیریم.</p></div>
  {error&&<p className="seller-error" role="alert">{error}</p>}{success&&<p className="seller-success" role="status">{success}</p>}
  <button className="seller-submit" aria-busy={busy} disabled={busy||uploading} type="submit">{busy?'در حال ارسال…':correction?'ذخیرهٔ تغییرات درخواست':agency?'ارسال برای تأیید مدیر اصلی':'ارسال درخواست ثبت ملک'}</button>
 </form></section>;
}
