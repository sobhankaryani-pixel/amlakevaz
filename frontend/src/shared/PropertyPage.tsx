import {applyMetadata} from './seo';
import {canonicalPath,pageMetadata,propertyMetadata,propertyFailureMetadata} from './seoMetadata.js';
import {fetchWithTimeout as fetch} from './http';
import {useEffect,useState} from 'react';
import {API,contact,type Property} from './propertyUI';
import {propertyPath,navigate} from './navigation';
import {track} from './analytics';
import type {MediaItem} from './MediaUploader';
export type PropertyDetail=Property & {media?:MediaItem[];updated_at?:string|null;registration_month?:string|null;public_notes?:string|null;build_year?:number|null;street_width?:number|null;street_frontage_m?:number|null;floor?:number|null;land_length_m?:number|null;land_width_m?:number|null};
export const persianDate=(date?:string|null)=>date?new Date(date).toLocaleDateString('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric'}):'ثبت نشده';
const fmt=(n:number)=>Number(n).toLocaleString('fa-IR');
export function PropertyContent({item}:{item:PropertyDetail}){
 const [notice,setNotice]=useState(''),[active,setActive]=useState(0);
 const images=(item.media||[]).filter(x=>x.kind==='image');if(item.cover_photo_url&&!images.some(x=>x.url===item.cover_photo_url))images.unshift({url:item.cover_photo_url,kind:'image'});
 const videos=(item.media||[]).filter(x=>x.kind==='video');
 const fields:[string,unknown][]=[['نوع ملک',item.property_type],['منطقه',item.region],['محله یا محدوده',item.neighborhood],['متراژ زمین',item.area_m2?`${fmt(item.area_m2)} مترمربع`:null],['زیربنا',item.building_area_m2?`${fmt(item.building_area_m2)} مترمربع`:null],['متراژ تجاری',item.commercial_area_m2?`${fmt(item.commercial_area_m2)} مترمربع`:null],['کاربری',item.usage_type],['طول زمین',item.land_length_m?`${fmt(item.land_length_m)} متر`:null],['عرض زمین',item.land_width_m?`${fmt(item.land_width_m)} متر`:null],['تعداد خواب',item.bedrooms!=null?fmt(item.bedrooms):null],['تعداد طبقات',item.floor_count!=null?fmt(item.floor_count):null],['طبقه',item.floor!=null?fmt(item.floor):null],['سال ساخت',item.build_year?fmt(item.build_year):null],['وضعیت بنا',item.house_condition],['بخش مسکن مهر',item.mehr_section],['طبقهٔ مسکن مهر',item.mehr_level],['فاز مسکن ملی',item.national_phase],['بلوک',item.national_block],['طبقهٔ مسکن ملی',item.national_level],['مرحلهٔ ساخت',item.national_stage],['عرض گذر',item.street_width?`${fmt(item.street_width)} متر`:null],['بر ملک',item.street_frontage_m?`${fmt(item.street_frontage_m)} متر`:null],['ماه ثبت توسط مدیریت',item.registration_month]];
 async function share(){
  const url=location.origin+propertyPath(item.public_code),title=`${item.property_type} در ${item.neighborhood||item.region||'اوز'} — کد ${item.public_code}`;
  try{if(navigator.share)await navigator.share({title,url});else if(navigator.clipboard){await navigator.clipboard.writeText(url);setNotice('لینک آگهی کپی شد.')}else setNotice(url);track('share',{},item.public_code)}catch(e){if((e as Error).name!=='AbortError')setNotice(url)}
 }
 return <article className="property-full"><span className="section-kicker">آگهی فروش · کد {item.public_code}</span><h1>{item.property_type} در {item.neighborhood||item.region||'اوز'}</h1><div className="property-date">آخرین به‌روزرسانی: {item.updated_at?persianDate(item.updated_at):'تاریخ ویرایش قدیمی ثبت نشده'} <span>· انتشار: {persianDate(item.published_at)}</span></div><strong className="property-full-price">{fmt(item.asking_price_toman)} تومان</strong>
 {images.length?<div className="property-gallery"><img className="property-main-photo" src={images[Math.min(active,images.length-1)].url} alt={`تصویر ملک ${item.public_code}`} onError={e=>{e.currentTarget.alt='تصویر در دسترس نیست'}}/><div className="property-thumbnails">{images.map((x,i)=><button type="button" key={x.url} className={i===active?'active':''} aria-label={`نمایش عکس ${i+1}`} aria-pressed={i===active} onClick={()=>setActive(i)}><img src={x.url} loading="lazy" alt={`عکس ${i+1}`}/></button>)}</div></div>:<p className="state-message">تصویری برای این ملک ثبت نشده است.</p>}
 <dl className="property-facts">{fields.filter(([,v])=>v!=null&&v!=='').map(([label,value])=><div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl>{item.public_notes&&<section><h2>توضیحات ملک</h2><p className="property-description">{item.public_notes}</p></section>}{videos.length>0&&<section><h2>فیلم ملک</h2>{videos.map(x=><video key={x.url} src={x.url} controls playsInline preload="none" aria-label="فیلم ملک"/>)}</section>}
 <div className="property-actions"><a href="tel:09212745755" data-property-code={item.public_code}>تماس با مشاور</a><a href={`${contact}?text=${encodeURIComponent(`سلام، دربارهٔ ملک با کد ${item.public_code} سؤال دارم. ${location.origin+propertyPath(item.public_code)}`)}`} data-property-code={item.public_code} target="_blank" rel="noopener noreferrer">گفتگو در واتساپ</a><button type="button" onClick={()=>void share()}>اشتراک‌گذاری آگهی</button>{item.latitude!=null&&item.longitude!=null&&<button type="button" onClick={()=>{track('map_open',{},item.public_code);navigate('map',item.public_code)}}>دیدن این ملک روی نقشه</button>}</div>{notice&&<p role="status" className="share-notice">{notice}</p>}</article>
}
export default function PropertyPage({code}:{code:string}){
 const [resolvedCode,setResolvedCode]=useState(''),[errorStatus,setErrorStatus]=useState(0);
 const [item,setItem]=useState<PropertyDetail|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setError('');setItem(null);fetch(API+'/api/public/property-detail?code='+encodeURIComponent(code)).then(async r=>{const d=await r.json();if(!r.ok)throw Object.assign(Error(typeof d.detail==='string'?d.detail:'دریافت آگهی انجام نشد'),{status:r.status});return d.item}).then(d=>{if(live){setItem(d);setResolvedCode(code);track('property_view',{},code)}}).catch(e=>{if(live){setError(e.message);setErrorStatus(e.status||503);setResolvedCode(code)}}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[code,retry]);
 useEffect(()=>{
  if(canonicalPath(window.location.pathname)!==propertyPath(code))return;
  const metadata=!loading&&resolvedCode===code?(error?propertyFailureMetadata(propertyPath(code),errorStatus):item?propertyMetadata(item):pageMetadata(propertyPath(code))):pageMetadata(propertyPath(code));
  applyMetadata(metadata);
 },[code,item,error,errorStatus,loading,resolvedCode]);
 return <section className="content-section property-page"><button className="link-button" onClick={()=>navigate('listings')}>همهٔ آگهی‌ها ←</button>{loading?<p role="status" className="state-message">در حال دریافت مشخصات ملک…</p>:error?<div role="alert" className="state-message"><p>{error}</p><button onClick={()=>setRetry(x=>x+1)}>تلاش مجدد</button><a href="tel:09212745755">تماس با مشاور</a></div>:item&&<PropertyContent key={code} item={item}/>}</section>
}
