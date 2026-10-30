import {getAnalyticsContext} from './shared/analytics';
import {fetchWithTimeout as fetch} from './shared/http';
import MediaUploader,{type MediaItem} from './shared/MediaUploader';
import {useEffect,useState,type FormEvent} from 'react';
import type {SellerUser} from './SellerAccount';
import {draftKey,readDraft,writeDraft} from './shared/sellerFlow';

const API='https://api.evazmelk.ir';
type Kind='land'|'villa'|'apartment'|'mehr'|'national'|'shop'|'garden';
const kinds:{value:Kind;label:string}[]=[
 {value:'land',label:'زمین'},{value:'villa',label:'خانهٔ ویلایی'},
 {value:'apartment',label:'آپارتمان'},{value:'mehr',label:'مسکن مهر'},
 {value:'national',label:'مسکن ملی'},{value:'garden',label:'باغ شهری'},{value:'shop',label:'مغازه'}
];
const stages=['مرحله سقف اول','مرحله سقف دوم','اتمام اسکلت کامل','اسکلت + تأسیسات کامل','تأسیسات + نما','کامل‌شده'];
const empty={seller_name:'',seller_phone:'',kind:'land' as Kind,region_key:'',neighborhood:'',area_m2:'',commercial_area_m2:'',street_frontage_m:'',building_area_m2:'',land_length_m:'',land_width_m:'',usage_type:'',house_condition:'',bedrooms:'',floor_count:'',build_year:'',mehr_section:'',mehr_level:'',national_phase:'',national_block:'',national_level:'',national_stage:'',asking_price_toman:'',extra_details:'',website:''};
type Form=typeof empty;
const numbers=['commercial_area_m2','street_frontage_m','area_m2','building_area_m2','land_length_m','land_width_m','bedrooms','floor_count','build_year','asking_price_toman'];

export default function SellerRegistration({user,onLogin}:{user:SellerUser|null;onLogin:()=>void}){
 if(!user)return <section className="content-section seller-page"><div className="page-heading"><span className="section-kicker">برای فروشندگان اوز</span><h1>ثبت ملک برای فروش</h1><p>برای ثبت ملک، ابتدا با شمارهٔ موبایل وارد شوید.</p></div><button className="seller-submit" onClick={onLogin}>ورود یا ثبت‌نام با موبایل</button></section>;
 return <RegistrationForm key={user.id} user={user}/>;
}
function RegistrationForm({user}:{user:SellerUser}){
 const key=draftKey(user.id);
 const [initial]=useState(()=>{try{return readDraft(localStorage,key,empty)}catch{return {form:{...empty},media:[] as MediaItem[],restored:false}}});
 const [form,setForm]=useState<Form>({...initial.form,seller_name:initial.form.seller_name||user.name,seller_phone:user.phone});
 const [media,setMedia]=useState<MediaItem[]>(initial.media),[uploading,setUploading]=useState(false);
 const [restored,setRestored]=useState(initial.restored),[storageError,setStorageError]=useState(false);
 const allowVideo=['villa','apartment','mehr','national'].includes(form.kind);
 const visibleMedia=media.filter(item=>item.kind==='image'||allowVideo);
 useEffect(()=>{try{writeDraft(localStorage,key,form,media);setStorageError(false)}catch{setStorageError(true)}},[key,form,media]);
 function clearDraft(){setForm({...empty,seller_name:user.name,seller_phone:user.phone});setMedia([]);setRestored(false);setSuccess('');setError('')}

 const [regions,setRegions]=useState<{slug:string;name:string}[]>([]);
 const [error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(user)setForm(v=>({...v,seller_name:v.seller_name||user.name,seller_phone:user.phone}))},[user?.id]);
 useEffect(()=>{let live=true;fetch(`${API}/api/public/submission-regions`).then(async r=>{if(!r.ok)throw Error('فهرست منطقه‌ها دریافت نشد.');return r.json()}).then(d=>{if(live)setRegions(d.items||[])}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[]);
 const set=(key:keyof Form,value:string)=>setForm(v=>({...v,[key]:value}));
 const input=(key:keyof Form,label:string,required=false,numeric=false)=><label key={key}>{label}<input required={required} type={numeric?'number':'text'} min={numeric?'0':undefined} step={numeric&&!['bedrooms','floor_count','build_year','asking_price_toman'].includes(key)?'any':undefined} value={form[key]} onChange={e=>set(key,e.target.value)}/></label>;
 const select=(key:keyof Form,label:string,values:string[],required=false)=><label key={key}>{label}<select required={required} value={form[key]} onChange={e=>set(key,e.target.value)}><option value="">انتخاب کنید</option>{values.map(x=><option key={x} value={x}>{x}</option>)}</select></label>;
 async function submit(e:FormEvent){
  e.preventDefault();setError('');setSuccess('');setBusy(true);
  try{
   if(!user)throw Error('ابتدا با شمارهٔ موبایل وارد شوید.');
   const payload:Record<string,unknown>={...form,seller_phone:user.phone,media:visibleMedia};
   const kindFields:Record<Kind,string[]>={garden:['area_m2','land_length_m','land_width_m'],shop:['commercial_area_m2','street_frontage_m'],land:['area_m2','land_length_m','land_width_m','usage_type'],villa:['house_condition','area_m2','building_area_m2','bedrooms','floor_count','build_year'],apartment:['building_area_m2','bedrooms','floor_count','build_year'],mehr:['building_area_m2','mehr_section','mehr_level'],national:['building_area_m2','national_phase','national_block','national_level','national_stage']};
   const specificFields=new Set(Object.values(kindFields).flat());
   for(const key of specificFields)if(!kindFields[form.kind].includes(key))payload[key]='';
   for(const key of numbers)payload[key]=payload[key]===''?null:Number(payload[key]);
   const r=await fetch(`${API}/api/seller/property-submissions`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,analytics:getAnalyticsContext()})});
   const d=await r.json();if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'مشخصات واردشده را بررسی کنید.');
   setSuccess(d.message);setRestored(false);setMedia([]);setForm({...empty,seller_name:user.name,seller_phone:user.phone});
  }catch(e){setError(e instanceof Error?e.message:'ارسال درخواست انجام نشد. دوباره تلاش کنید.')}finally{setBusy(false)}
 }

 return <section className="content-section seller-page"><div className="page-heading"><span className="section-kicker">برای فروشندگان اوز</span><h1>ثبت ملک برای فروش</h1><p>مشخصات ملک را وارد کنید. پس از بررسی و تأیید، آگهی در سایت منتشر می‌شود.</p></div>
 <p className="seller-privacy" role="status">{storageError?'ذخیرهٔ پیش‌نویس در این مرورگر ممکن نیست؛ تا ارسال درخواست این صفحه را نبندید.':restored?'پیش‌نویس قبلی بازیابی شد. تغییرات روی همین مرورگر تا ۷ روز نگه داشته می‌شوند.':'پیش‌نویس به‌صورت خودکار روی همین مرورگر تا ۷ روز ذخیره می‌شود.'}</p>
 <button type="button" className="account-link" disabled={busy||uploading} onClick={clearDraft}>پاک‌کردن پیش‌نویس و شروع دوباره</button>
 <form className="seller-form" onSubmit={submit}>
  <div className="seller-step"><h2>۱. نوع ملک</h2><div className="seller-kinds">{kinds.map(k=><button type="button" key={k.value} aria-pressed={form.kind===k.value} className={form.kind===k.value?'active':''} disabled={uploading} onClick={()=>setForm(v=>({...v,kind:k.value}))}>{k.label}</button>)}</div></div>
  <div className="seller-step"><h2>۲. مشخصات ملک</h2><div className="seller-fields">
   {form.kind==='land'&&<><label>منطقهٔ زمین<select required value={form.region_key} onChange={e=>set('region_key',e.target.value)}><option value="">انتخاب کنید</option>{regions.map(r=><option value={r.slug} key={r.slug}>{r.name}</option>)}</select></label>{select('usage_type','کاربری',['مسکونی','تجاری'],true)}{input('area_m2','متراژ زمین (مترمربع)',true,true)}{input('land_length_m','طول زمین (متر)',false,true)}{input('land_width_m','عرض زمین (متر)',false,true)}</>}
   {form.kind==='villa'&&<>{select('house_condition','نوع ساختمان',['نوساز','کلنگی'],true)}{input('area_m2','متراژ زمین (مترمربع)',true,true)}{input('building_area_m2','زیربنا (مترمربع)',true,true)}{input('bedrooms','تعداد خواب',false,true)}{input('floor_count','تعداد طبقات',false,true)}{input('build_year','سال ساخت (شمسی)',false,true)}</>}
   {form.kind==='apartment'&&<>{input('building_area_m2','زیربنا (مترمربع)',true,true)}{input('bedrooms','تعداد خواب',false,true)}{input('floor_count','تعداد طبقات',false,true)}{input('build_year','سال ساخت (شمسی)',false,true)}</>}
   {form.kind==='mehr'&&<>{input('building_area_m2','زیربنا (مترمربع)',true,true)}{select('mehr_section','بخش مسکن مهر',['محلی','فرهنگیان'],true)}{select('mehr_level','موقعیت طبقه',['بالا','پایین'],true)}</>}
   {form.kind==='national'&&<>{input('building_area_m2','زیربنا (مترمربع)',true,true)}{select('national_phase','فاز مسکن ملی',['1','2','3','4','5'],true)}<label>شمارهٔ بلوک<input required type="text" inputMode="numeric" pattern="[0-9۰-۹٠-٩]+" value={form.national_block} onChange={e=>set('national_block',e.target.value)}/></label>{select('national_level','موقعیت طبقه',['بالا','پایین','نامشخص'],true)}{select('national_stage','مرحلهٔ ساخت',stages,true)}</>}
   {form.kind==='garden'&&<>{input('area_m2','متراژ باغ شهری (مترمربع)',true,true)}{input('land_length_m','طول باغ (متر)',false,true)}{input('land_width_m','عرض باغ (متر)',false,true)}</>}
   {form.kind==='shop'&&<>{input('commercial_area_m2','متراژ مغازه (مترمربع)',true,true)}{input('street_frontage_m','بر مغازه (متر)',false,true)}</>}
   {form.kind!=='land'&&<label>منطقه<select value={form.region_key} onChange={e=>set('region_key',e.target.value)}><option value="">کل اوز / نامشخص</option>{regions.map(r=><option value={r.slug} key={r.slug}>{r.name}</option>)}</select></label>}
   {input('neighborhood','محله یا محدوده')}{input('asking_price_toman','قیمت پیشنهادی (تومان)',true,true)}
   <label className="full">توضیحات تکمیلی<textarea maxLength={2000} value={form.extra_details} onChange={e=>set('extra_details',e.target.value)} placeholder="مشخصات تکمیلی ملک را بنویسید"/></label>
  </div></div>
  <div className="seller-step"><MediaUploader items={visibleMedia} draftItems={media} onChange={items=>setMedia(previous=>allowVideo?items:[...items,...previous.filter(item=>item.kind==='video')])} allowVideo={allowVideo} onBusy={setUploading}/></div>
  <div className="seller-step"><h2>۳. اطلاعات فروشنده</h2><div className="seller-fields">{input('seller_name','نام فروشنده',true)}<label>شمارهٔ تأییدشده<input readOnly dir="ltr" value={user.phone}/></label></div><label className="seller-honeypot" aria-hidden="true">وب‌سایت<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e=>set('website',e.target.value)}/></label><p className="seller-privacy">شمارهٔ شما تنها در پنل مدیریت دیده می‌شود. پس از تأیید، آگهی منتشر می‌شود و هنگام پیدا شدن خریدار با شما تماس می‌گیریم.</p></div>
  {error&&<p className="seller-error" role="alert">{error}</p>}{success&&<p className="seller-success" role="status">{success}</p>}
  <button className="seller-submit" disabled={busy||uploading} type="submit">{busy?'در حال ارسال…':'ارسال درخواست ثبت ملک'}</button>
 </form></section>;
}
