import {useEffect,useState,type FormEvent} from 'react';

const API='https://api.evazmelk.ir';
type Kind='land'|'villa'|'apartment'|'mehr'|'national';
const kinds:{value:Kind;label:string}[]=[
 {value:'land',label:'زمین'},{value:'villa',label:'خانهٔ ویلایی'},
 {value:'apartment',label:'آپارتمان'},{value:'mehr',label:'مسکن مهر'},
 {value:'national',label:'مسکن ملی'}
];
const stages=['مرحله سقف اول','مرحله سقف دوم','اتمام اسکلت کامل','اسکلت + تأسیسات کامل','تأسیسات + نما','کامل‌شده'];
const empty={seller_name:'',seller_phone:'',kind:'land' as Kind,region_key:'',neighborhood:'',area_m2:'',building_area_m2:'',land_length_m:'',land_width_m:'',usage_type:'',house_condition:'',bedrooms:'',floor_count:'',build_year:'',mehr_section:'',mehr_level:'',national_phase:'',national_block:'',national_level:'',national_stage:'',asking_price_toman:'',extra_details:'',website:''};
type Form=typeof empty;
const numbers=['area_m2','building_area_m2','land_length_m','land_width_m','bedrooms','floor_count','build_year','asking_price_toman'];

export default function SellerRegistration(){
 const [form,setForm]=useState<Form>(empty);
 const [regions,setRegions]=useState<{slug:string;name:string}[]>([]);
 const [error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;fetch(`${API}/api/public/submission-regions`).then(async r=>{if(!r.ok)throw Error('فهرست منطقه‌ها دریافت نشد.');return r.json()}).then(d=>{if(live)setRegions(d.items||[])}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[]);
 const set=(key:keyof Form,value:string)=>setForm(v=>({...v,[key]:value}));
 const input=(key:keyof Form,label:string,required=false,numeric=false)=><label key={key}>{label}<input required={required} type={numeric?'number':'text'} min={numeric?'0':undefined} step={numeric&&!['bedrooms','floor_count','build_year','asking_price_toman'].includes(key)?'any':undefined} value={form[key]} onChange={e=>set(key,e.target.value)}/></label>;
 const select=(key:keyof Form,label:string,values:string[],required=false)=><label key={key}>{label}<select required={required} value={form[key]} onChange={e=>set(key,e.target.value)}><option value="">انتخاب کنید</option>{values.map(x=><option key={x} value={x}>{x}</option>)}</select></label>;
 async function submit(e:FormEvent){
  e.preventDefault();setError('');setSuccess('');setBusy(true);
  try{
   const payload:Record<string,string|number|null>={...form};
   for(const key of numbers)payload[key]=form[key as keyof Form]===''?null:Number(form[key as keyof Form]);
   const r=await fetch(`${API}/api/public/property-submissions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const d=await r.json();if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'مشخصات واردشده را بررسی کنید.');
   setSuccess(d.message);setForm(empty);
  }catch(e){setError(e instanceof Error?e.message:'ارسال درخواست انجام نشد. دوباره تلاش کنید.')}finally{setBusy(false)}
 }
 return <section className="content-section seller-page"><div className="page-heading"><span className="section-kicker">برای فروشندگان اوز</span><h1>ثبت ملک برای فروش</h1><p>مشخصات ملکتان را ثبت کنید. خودمونی درخواست را بررسی می‌کند و برای ادامه با شما تماس می‌گیرد.</p></div>
 <form className="seller-form" onSubmit={submit}>
  <div className="seller-step"><h2>۱. نوع ملک</h2><div className="seller-kinds">{kinds.map(k=><button type="button" key={k.value} aria-pressed={form.kind===k.value} className={form.kind===k.value?'active':''} onClick={()=>setForm(v=>({...empty,seller_name:v.seller_name,seller_phone:v.seller_phone,kind:k.value}))}>{k.label}</button>)}</div></div>
  <div className="seller-step"><h2>۲. مشخصات ملک</h2><div className="seller-fields">
   {form.kind==='land'&&<><label>منطقهٔ زمین<select required value={form.region_key} onChange={e=>set('region_key',e.target.value)}><option value="">انتخاب کنید</option>{regions.map(r=><option value={r.slug} key={r.slug}>{r.name}</option>)}</select></label>{select('usage_type','کاربری',['مسکونی','تجاری'],true)}{input('area_m2','متراژ زمین (مترمربع)',true,true)}{input('land_length_m','طول زمین (متر)',false,true)}{input('land_width_m','عرض زمین (متر)',false,true)}</>}
   {form.kind==='villa'&&<>{select('house_condition','نوع ساختمان',['نوساز','کلنگی'],true)}{input('area_m2','متراژ زمین (مترمربع)',true,true)}{input('building_area_m2','زیربنا (مترمربع)',true,true)}{input('bedrooms','تعداد خواب',false,true)}{input('floor_count','تعداد طبقات',false,true)}{input('build_year','سال ساخت (شمسی)',false,true)}</>}
   {form.kind==='apartment'&&<>{input('building_area_m2','زیربنا (مترمربع)',true,true)}{input('bedrooms','تعداد خواب',false,true)}{input('floor_count','تعداد طبقات',false,true)}{input('build_year','سال ساخت (شمسی)',false,true)}</>}
   {form.kind==='mehr'&&<>{select('mehr_section','بخش مسکن مهر',['محلی','فرهنگیان'],true)}{select('mehr_level','موقعیت طبقه',['بالا','پایین'],true)}</>}
   {form.kind==='national'&&<>{select('national_phase','فاز مسکن ملی',['1','2','3','4','5'],true)}<label>شمارهٔ بلوک<input required type="text" inputMode="numeric" pattern="[0-9۰-۹٠-٩]+" value={form.national_block} onChange={e=>set('national_block',e.target.value)}/></label>{select('national_level','موقعیت طبقه',['بالا','پایین','نامشخص'],true)}{select('national_stage','مرحلهٔ ساخت',stages,true)}</>}
   {input('neighborhood','محله یا محدوده')}{input('asking_price_toman','قیمت پیشنهادی (تومان)',true,true)}
   <label className="full">توضیحات تکمیلی<textarea maxLength={2000} value={form.extra_details} onChange={e=>set('extra_details',e.target.value)} placeholder="مشخصات تکمیلی ملک را بنویسید"/></label>
  </div></div>
  <div className="seller-step"><h2>۳. راه ارتباطی</h2><div className="seller-fields">{input('seller_name','نام فروشنده',true)}<label>شمارهٔ تماس<input required type="tel" dir="ltr" inputMode="tel" value={form.seller_phone} onChange={e=>set('seller_phone',e.target.value)} placeholder="09..."/></label></div><label className="seller-honeypot" aria-hidden="true">وب‌سایت<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e=>set('website',e.target.value)}/></label><p className="seller-privacy">شمارهٔ تماس شما فقط در پنل مدیر دیده می‌شود. درخواست پس از بررسی مدیر به آگهی تبدیل می‌شود.</p></div>
  {error&&<p className="seller-error" role="alert">{error}</p>}{success&&<p className="seller-success" role="status">{success}</p>}
  <button className="seller-submit" disabled={busy} type="submit">{busy?'در حال ارسال…':'ارسال درخواست ثبت ملک'}</button>
 </form></section>;
}
