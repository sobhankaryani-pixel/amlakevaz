import { FormEvent, useEffect, useState } from 'react';
import './styles.css';
import LocationPicker from './LocationPicker';
const API = 'https://api.evazmelk.ir';
type Ref = {id:string;name:string;code?:string;slug?:string};
const months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const initial={public_code:'',property_type_id:'',region_id:'',neighborhood:'',address:'',area_m2:'',building_area_m2:'',commercial_area_m2:'',usage_type:'',status:'آگهی فروش',asking_price_toman:'',registration_year:'',registration_month_name:'',notes:'',street_width:'',street_frontage_m:'',mehr_block:'',mehr_floor:'',mehr_unit:'',national_phase:'',national_stage:'',national_notes:'',build_year:'',bedrooms:'',sale_date:'',sale_price_toman:'',sale_notes:'',latitude:'',longitude:'',land_length_m:'',land_width_m:'',mehr_section:'',mehr_level:'',house_condition:'',floor_count:''};
type Form = typeof initial;
type Kind = 'land'|'villa'|'apartment'|'mehr'|'national'|'shop'|'garden';
const kinds:{value:Kind;label:string;codes:string[]}[]=[
 {value:'land',label:'زمین',codes:['raw_land','commercial_land','land']},
 {value:'villa',label:'خانهٔ ویلایی',codes:['villa_house','villa']},
 {value:'apartment',label:'آپارتمان',codes:['apartment']},
 {value:'mehr',label:'مسکن مهر',codes:['mehr_housing']},
 {value:'national',label:'مسکن ملی',codes:['national_housing']},
 {value:'shop',label:'مغازه',codes:['shop','commercial']},
 {value:'garden',label:'باغ شهری',codes:['urban_garden']},
];
const numeric=['area_m2','building_area_m2','commercial_area_m2','asking_price_toman','street_width','street_frontage_m','mehr_floor','build_year','bedrooms','sale_price_toman','latitude','longitude','land_length_m','land_width_m','floor_count'];
export default function App(){
 const [token,setToken]=useState(localStorage.getItem('evazmelk_admin_token'));
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [section,setSection]=useState('ثبت ملک'),[error,setError]=useState(''),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false);
 const [types,setTypes]=useState<Ref[]>([]),[regions,setRegions]=useState<Ref[]>([]),[items,setItems]=useState<any[]>([]);
 const [editingLocation,setEditingLocation]=useState<{code:string;lat:string;lng:string}|null>(null);
 const [selling,setSelling]=useState<{code:string;date:string;price:string;notes:string}|null>(null);
 const [estimates,setEstimates]=useState<any[]>([]);
 const [form,setForm]=useState<Form>(initial);
 const [kind,setKind]=useState<Kind|null>(null);
 const [editCode,setEditCode]=useState<string|null>(null);
 const [estimate,setEstimate]=useState({period:'',segment:'land_residential',region_key:'',value_toman:''});
 const set=(key:keyof Form,value:string)=>setForm(v=>({...v,[key]:value}));
 async function request(path:string,options:RequestInit={}){const r=await fetch(API+path,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers}});const d=await r.json();if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'درخواست انجام نشد');return d;}
 useEffect(()=>{if(!token)return;let live=true;request('/api/admin/reference').then(d=>{if(live){setTypes(d.property_types);setRegions(d.regions)}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[token]);
 useEffect(()=>{if(token&&section==='املاک ثبت‌شده')request('/api/admin/properties/direct').then(d=>setItems(d.items)).catch(e=>setError(e.message))},[token,section]);
 useEffect(()=>{if(token&&section==='قیمت شاخص')request('/api/admin/monthly-estimates').then(d=>setEstimates(d.items)).catch(e=>setError(e.message))},[token,section]);
 async function login(e:FormEvent){e.preventDefault();setError('');try{const r=await fetch(API+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const d=await r.json();if(!r.ok)throw Error(d.detail||'ورود ناموفق بود');localStorage.setItem('evazmelk_admin_token',d.access_token);setToken(d.access_token)}catch(x){setError(x instanceof Error?x.message:'خطای اتصال')}}
 async function saveProperty(e:FormEvent){e.preventDefault();setError('');setSaved('');setBusy(true);try{
  if(!kind)throw Error('نوع ملک را انتخاب کنید.');
  const code=kind==='land'?(form.usage_type==='تجاری'?'commercial_land':'raw_land'):kinds.find(k=>k.value===kind)!.codes[0];
  const type=types.find(t=>t.code===code)||types.find(t=>kinds.find(k=>k.value===kind)!.codes.includes(t.code||''));
  if(!type)throw Error('این نوع ملک در پایگاه داده تعریف نشده است.');
  const payload:any={...form,property_type_id:type.id,registration_month:form.registration_year&&form.registration_month_name?`${form.registration_year}/${form.registration_month_name}`:null};delete payload.registration_year;delete payload.registration_month_name;
  numeric.forEach(k=>payload[k]=form[k as keyof Form]===''?null:Number(form[k as keyof Form]));for(const k of Object.keys(payload))if(payload[k]==='')payload[k]=null;
  const d=await request(editCode?`/api/admin/properties/${encodeURIComponent(editCode)}/direct`:'/api/admin/properties/direct',{method:editCode?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  setSaved(`ملک ${d.public_code} ${editCode?'ویرایش':'ثبت'} شد.`);setForm(initial);setKind(null);setEditCode(null);
  if(editCode){const fresh=await request('/api/admin/properties/direct');setItems(fresh.items);setSection('املاک ثبت‌شده')}
 }catch(x){setError(x instanceof Error?x.message:'ثبت انجام نشد')}finally{setBusy(false)}}
 function startEdit(p:any){
  const selected=kinds.find(k=>k.codes.includes(p.property_type_code))?.value||null;
  if(!selected){setError('نوع این ملک برای ویرایش در فرم تعریف نشده است.');return}
  const next={...initial};
  for(const key of Object.keys(initial) as (keyof Form)[]){
   if(p[key]!=null && key!=='status')next[key]=String(p[key]);
  }
  if(p.registration_month){const [year,month]=String(p.registration_month).split('/');next.registration_year=year||'';next.registration_month_name=month||''}
  setForm(next);setKind(selected);setEditCode(p.public_code);setSelling(null);setEditingLocation(null);setError('');setSaved('');setSection('ثبت ملک');
 }
 async function changeVisibility(p:any){
  const active=p.status==='غیرفعال';
  if(!window.confirm(active?`آگهی ملک ${p.public_code} دوباره نمایش داده شود؟`:`آگهی ملک ${p.public_code} از سایت برداشته شود؟ این کار معامله ثبت نمی‌کند.`))return;
  setError('');setSaved('');setBusy(true);
  try{await request(`/api/admin/properties/${encodeURIComponent(p.public_code)}/visibility?active=${active}`,{method:'PUT'});const fresh=await request('/api/admin/properties/direct');setItems(fresh.items);setSaved(active?'آگهی دوباره فعال شد.':'آگهی غیرفعال شد؛ معامله‌ای ثبت نشد.')}
  catch(x){setError(x instanceof Error?x.message:'تغییر وضعیت انجام نشد')}finally{setBusy(false)}
 }
 function changeKind(value:Kind){setKind(value);setError('');setSaved('');setForm(v=>({...initial,public_code:v.public_code,region_id:v.region_id,neighborhood:v.neighborhood,address:v.address,asking_price_toman:v.asking_price_toman,latitude:v.latitude,longitude:v.longitude}));}
 async function saveEstimate(e:FormEvent){e.preventDefault();setError('');setSaved('');setBusy(true);try{await request('/api/admin/monthly-estimates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...estimate,region_key:estimate.region_key||'all',value_toman:Number(estimate.value_toman)})});const d=await request('/api/admin/monthly-estimates');setEstimates(d.items);setSaved('قیمت ماهانه ذخیره شد.');setEstimate(v=>({...v,value_toman:''}))}catch(x){setError(x instanceof Error?x.message:'ثبت انجام نشد')}finally{setBusy(false)}}
 async function saveSale(e:FormEvent){e.preventDefault();if(!selling)return;setError('');setSaved('');setBusy(true);try{await request(`/api/admin/properties/${encodeURIComponent(selling.code)}/sell`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sale_date:selling.date,sale_price_toman:Number(selling.price),notes:selling.notes||null})});const d=await request('/api/admin/properties/direct');setItems(d.items);setSaved(`معاملهٔ ملک ${selling.code} ثبت شد و آگهی آن بسته شد.`);setSelling(null)}catch(x){setError(x instanceof Error?x.message:'ثبت معامله انجام نشد')}finally{setBusy(false)}}
 async function saveLocation(e:FormEvent){e.preventDefault();if(!editingLocation)return;setError('');setSaved('');setBusy(true);try{if((!!editingLocation.lat)!=(!!editingLocation.lng))throw Error('هر دو مختصات را وارد کنید.');await request(`/api/admin/properties/${encodeURIComponent(editingLocation.code)}/location`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:editingLocation.lat?Number(editingLocation.lat):null,longitude:editingLocation.lng?Number(editingLocation.lng):null})});const d=await request('/api/admin/properties/direct');setItems(d.items);setSaved(`موقعیت ملک ${editingLocation.code} ذخیره شد.`);setEditingLocation(null)}catch(x){setError(x instanceof Error?x.message:'ثبت موقعیت انجام نشد')}finally{setBusy(false)}}
 const field=(key:keyof Form,label:string,kind='text',required=false)=><label key={key}>{label}<input type={kind} min={kind==='number'?'0':undefined} step={kind==='number'&&!['bedrooms','floor_count','build_year','registration_year','mehr_floor'].includes(key)?'any':undefined} required={required} readOnly={key==='public_code'&&!!editCode} value={form[key]} onChange={e=>set(key,e.target.value)}/></label>;
 const select=(key:keyof Form,label:string,options:{value:string;label:string}[],required=false)=><label>{label}<select required={required} value={form[key]} onChange={e=>set(key,e.target.value)}><option value="">انتخاب کنید</option>{options.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>;
 if(!token)return <main className="login" dir="rtl"><div className="card"><div className="mark">خ</div><h1>خودمونی</h1><p>ورود به مدیریت املاک اوز</p><form onSubmit={login}><label>ایمیل<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>رمز عبور<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="error">{error}</div>}<button>ورود</button></form></div></main>;
 return <div className="shell" dir="rtl"><aside><div className="brand"><span className="mark small">خ</span>خودمونی</div><div className="muted">مدیریت املاک اوز</div>{['ثبت ملک','املاک ثبت‌شده','قیمت شاخص'].map(x=><button key={x} className={section===x?'nav active':'nav'} onClick={()=>{setSection(x);setError('');setSaved('')}}>{x}</button>)}<button className="logout" onClick={()=>{localStorage.removeItem('evazmelk_admin_token');setToken(null)}}>خروج</button></aside><main className="content"><header><h1>{section}</h1></header>
 {section==='ثبت ملک'&&<form className="entry" onSubmit={saveProperty}>
 {editCode&&<div className="panel"><h2>ویرایش ملک {editCode}</h2><p className="hint">مشخصات و قیمت آگهی را اصلاح کن. وضعیت معامله و کد ملک از اینجا تغییر نمی‌کند.</p><button type="button" className="secondary" onClick={()=>{setEditCode(null);setForm(initial);setKind(null);setSection('املاک ثبت‌شده')}}>انصراف از ویرایش</button></div>}
 <div className="panel"><h2>نوع ملک</h2><div className="kind-grid">{kinds.map(k=><button type="button" key={k.value} disabled={!!editCode} className={kind===k.value?'kind selected':'kind'} onClick={()=>changeKind(k.value)}>{k.label}</button>)}</div></div>
 {kind&&<>
 <div className="panel"><h2>مشخصات {kinds.find(k=>k.value===kind)?.label}</h2><div className="fields">
 {field('public_code','کد ملک','text',true)}
 {select('region_id','منطقه',regions.filter(r=>r.slug?.startsWith('R-')).map(r=>({value:r.id,label:`${r.slug} — ${r.name}`})),true)}
 {kind==='mehr'&&<>{select('mehr_section','بخش مسکن مهر',[{value:'محلی',label:'محلی'},{value:'فرهنگیان',label:'فرهنگیان'}],true)}{select('mehr_level','موقعیت طبقه',[{value:'بالا',label:'طبقهٔ بالا'},{value:'پایین',label:'طبقهٔ پایین'}],true)}</>}
 {kind==='land'&&<>{select('usage_type','کاربری',[{value:'مسکونی',label:'مسکونی'},{value:'تجاری',label:'تجاری'}],true)}{field('area_m2','متراژ زمین (مترمربع)','number',true)}{field('land_length_m','طول زمین (متر)','number')}{field('land_width_m','عرض زمین (متر)','number')}</>}
 {kind==='villa'&&<>{select('house_condition','نوع ساختمان',[{value:'نوساز',label:'نوساز'},{value:'کلنگی',label:'کلنگی'}],true)}{field('area_m2','متراژ زمین (مترمربع)','number',true)}{field('building_area_m2','زیربنا (مترمربع)','number',true)}{field('bedrooms','تعداد خواب','number')}{field('floor_count','تعداد طبقه','number')}</>}
 {kind==='apartment'&&<>{field('building_area_m2','زیربنا (مترمربع)','number',true)}{field('bedrooms','تعداد خواب','number')}{field('floor_count','تعداد طبقات ساختمان','number')}{field('build_year','سال ساخت (شمسی)','number')}</>}
 {kind==='national'&&<>{field('national_phase','فاز مسکن ملی')}{select('national_stage','مرحله ساخت',['مرحله سقف اول','مرحله سقف دوم','اتمام اسکلت کامل','اسکلت + تأسیسات کامل','تأسیسات + نما','کامل‌شده'].map(x=>({value:x,label:x})))}{field('building_area_m2','زیربنا (مترمربع)','number')}{field('national_notes','توضیحات مسکن ملی')}</>}
 {kind==='shop'&&<>{field('commercial_area_m2','متراژ مغازه (مترمربع)','number',true)}{field('street_frontage_m','بر خیابان (متر)','number')}</>}
 {kind==='garden'&&<>{field('area_m2','متراژ باغ (مترمربع)','number',true)}{field('land_length_m','طول باغ (متر)','number')}{field('land_width_m','عرض باغ (متر)','number')}</>}
 {field('asking_price_toman','قیمت پیشنهادی (تومان)','number',true)}
 </div></div>
 <div className="panel"><h2>آگهی و موقعیت</h2><p className="hint">ملک ابتدا به صورت آگهی ثبت می‌شود. پس از فروش، معامله را در «املاک ثبت‌شده» ثبت کنید.</p><div className="fields">{field('neighborhood','محله')}{field('address','آدرس')}{field('registration_year','سال ثبت (شمسی)','number')}{select('registration_month_name','ماه ثبت',months.map(x=>({value:x,label:x})))}<label className="wide">توضیحات<textarea value={form.notes} onChange={e=>set('notes',e.target.value)}/></label></div><LocationPicker lat={form.latitude} lng={form.longitude} onChange={(lat,lng)=>setForm(v=>({...v,latitude:lat,longitude:lng}))}/></div>
 {error&&<div className="error" role="alert">{error}</div>}{saved&&<div className="success" role="status">{saved}</div>}<button disabled={busy} className="submit">{busy?'در حال ذخیره…':editCode?'ذخیرهٔ تغییرات':'ثبت ملک'}</button>
 </>}
 </form>}
 {section==='املاک ثبت‌شده'&&<div className="panel"><h2>آخرین املاک</h2><div className="table-wrap"><table><thead><tr><th>کد</th><th>نوع</th><th>منطقه</th><th>وضعیت</th><th>متراژ</th><th>قیمت پیشنهادی / معامله</th><th>ویرایش</th><th>نمایش آگهی</th><th>نقشه</th><th>معامله</th></tr></thead><tbody>{items.map((p,i)=><tr key={i}><td>{p.public_code}</td><td>{p.property_type}</td><td>{p.region||'—'}</td><td>{p.status}</td><td>{p.area_m2||'—'}</td><td>{p.asking_price_toman||p.sale_price_toman||'—'}</td><td>{p.status==='فروخته شده'?'—':<button type="button" className="secondary" onClick={()=>startEdit(p)}>ویرایش</button>}</td><td>{p.status==='فروخته شده'?'—':<button type="button" disabled={busy} className="secondary" onClick={()=>changeVisibility(p)}>{p.status==='غیرفعال'?'فعال‌کردن':'غیرفعال‌کردن'}</button>}</td><td><button type="button" className="secondary" onClick={()=>{setEditingLocation({code:p.public_code,lat:p.latitude==null?'':String(p.latitude),lng:p.longitude==null?'':String(p.longitude)});setSaved('');setError('')}}>{p.latitude==null?'تعیین موقعیت':'اصلاح موقعیت'}</button></td><td>{p.status==='آگهی فروش'?<button type="button" className="secondary" onClick={()=>{setSelling({code:p.public_code,date:'',price:'',notes:''});setEditingLocation(null);setError('');setSaved('')}}>ثبت معامله</button>:p.status}</td></tr>)}</tbody></table></div>{items.length===0&&<p>هنوز ملکی برای نمایش ثبت نشده است.</p>}{selling&&<form className="location-edit" onSubmit={saveSale}><h3>ثبت معاملهٔ ملک {selling.code}</h3><p className="hint">پس از ثبت معامله، آگهی عمومی این ملک بسته می‌شود.</p><div className="fields"><label>تاریخ معامله (شمسی: ۱۴۰۵/۰۷/۰۳)<input required dir="ltr" placeholder="1405/07/03" pattern="[0-9]{4}/(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])" value={selling.date} onChange={e=>setSelling(v=>v?{...v,date:e.target.value}:v)}/></label><label>قیمت قطعی معامله (تومان)<input required type="number" min="1" value={selling.price} onChange={e=>setSelling(v=>v?{...v,price:e.target.value}:v)}/></label><label className="wide">یادداشت داخلی<textarea value={selling.notes} onChange={e=>setSelling(v=>v?{...v,notes:e.target.value}:v)}/></label></div><div className="actions"><button disabled={busy}>ثبت معامله و بستن آگهی</button><button type="button" className="secondary" onClick={()=>setSelling(null)}>انصراف</button></div></form>}{editingLocation&&<form className="location-edit" onSubmit={saveLocation}><h3>موقعیت ملک {editingLocation.code}</h3><LocationPicker lat={editingLocation.lat} lng={editingLocation.lng} onChange={(lat,lng)=>setEditingLocation(v=>v?{...v,lat,lng}:v)}/><div className="actions"><button disabled={busy}>ذخیرهٔ موقعیت</button><button type="button" className="secondary" onClick={()=>setEditingLocation(null)}>انصراف</button></div></form>}</div>}
 {section==='قیمت شاخص'&&<div className="panel"><h2>برآورد ماهانهٔ خودمونی</h2><p className="hint">برآورد شما از میانگین معاملات واقعی جداست. قیمت زمین و زیربنا برای هر متر و قیمت مسکن مهر برای کل واحد ثبت می‌شود.</p>
 <form className="fields" onSubmit={saveEstimate}>
 <label>ماه شمسی (مانند 1405/07)<input required dir="ltr" placeholder="1405/07" pattern="[0-9]{4}/(0[1-9]|1[0-2])" value={estimate.period} onChange={e=>setEstimate(v=>({...v,period:e.target.value}))}/></label>
 <label>نوع نمودار<select value={estimate.segment.startsWith('land_')?'land':estimate.segment.startsWith('mehr')?'mehr':'building'} onChange={e=>setEstimate(v=>({...v,segment:e.target.value==='land'?'land_residential':e.target.value==='building'?'house_new':'mehr_upper',region_key:e.target.value==='land'?'':'all'}))}><option value="land">زمین</option><option value="building">زیربنا</option><option value="mehr">مسکن مهر</option></select></label>
 {estimate.segment.startsWith('land_')&&<label>کاربری زمین<select value={estimate.segment} onChange={e=>setEstimate(v=>({...v,segment:e.target.value}))}><option value="land_residential">مسکونی</option><option value="land_commercial">تجاری</option></select></label>}
 {(estimate.segment==='house_new'||estimate.segment==='apartment')&&<label>نوع زیربنا<select value={estimate.segment} onChange={e=>setEstimate(v=>({...v,segment:e.target.value}))}><option value="house_new">خانهٔ ویلایی نوساز</option><option value="apartment">آپارتمان</option></select></label>}
 {estimate.segment.startsWith('mehr')&&<label>موقعیت طبقهٔ مسکن مهر<select value={estimate.segment} onChange={e=>setEstimate(v=>({...v,segment:e.target.value}))}><option value="mehr_upper">طبقهٔ بالا</option><option value="mehr_lower">طبقهٔ پایین</option></select></label>}
 <label>منطقه<select required={estimate.segment.startsWith('land_')} value={estimate.region_key} onChange={e=>setEstimate(v=>({...v,region_key:e.target.value}))}>{!estimate.segment.startsWith('land_')&&<option value="all">کل اوز</option>}{estimate.segment.startsWith('land_')&&<option value="">انتخاب کنید</option>}{estimate.segment.startsWith('land_')&&regions.filter(r=>r.slug?.startsWith('R-')).map(r=><option key={r.id} value={r.slug}>{r.slug} — {r.name}</option>)}</select></label>
 <label>قیمت (تومان)<input required type="number" min="1" value={estimate.value_toman} onChange={e=>setEstimate(v=>({...v,value_toman:e.target.value}))}/></label><button disabled={busy} className="submit">ذخیرهٔ قیمت ماهانه</button></form>
 <h3>آخرین قیمت‌های ثبت‌شده</h3><div className="table-wrap"><table><thead><tr><th>ماه</th><th>گروه</th><th>منطقه</th><th>قیمت (تومان)</th></tr></thead><tbody>{estimates.map((x,i)=><tr key={i}><td>{x.period}</td><td>{({land_residential:'زمین مسکونی',land_commercial:'زمین تجاری',house_new:'خانهٔ ویلایی نوساز',apartment:'آپارتمان',mehr:'مسکن مهر · قدیمی بدون تفکیک طبقه',mehr_upper:'مسکن مهر · طبقهٔ بالا',mehr_lower:'مسکن مهر · طبقهٔ پایین'} as Record<string,string>)[x.segment]||x.segment}</td><td>{x.region_key==='all'?'کل اوز':regions.find(r=>r.slug===x.region_key)?.name||x.region_key}</td><td>{Number(x.value_toman).toLocaleString('fa-IR')}</td></tr>)}</tbody></table></div>{estimates.length===0&&<p>هنوز قیمتی ثبت نشده است.</p>}</div>}
 {section!=='ثبت ملک'&&error&&<div className="error" role="alert">{error}</div>}{section!=='ثبت ملک'&&saved&&<div className="success" role="status">{saved}</div>}
 </main></div>;
}
