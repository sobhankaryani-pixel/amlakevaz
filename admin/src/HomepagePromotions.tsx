import {fetchWithTimeout as fetch} from './http';
import { useEffect, useState } from 'react';
import './HomepagePromotions.css';

const API='https://api.evazmelk.ir';
type Promotion={id:number;slug:string;title:string;subtitle:string;badge:string;image_url:string;cta_text:string;target_page:string;sort_order:number;is_active:boolean};
const targets=[{value:'listings',label:'فهرست آگهی‌ها'},{value:'map',label:'نقشهٔ املاک'},{value:'index',label:'شاخص قیمت'},{value:'areas',label:'مناطق اوز'},{value:'register',label:'ثبت ملک'}];
function imagePreview(url:string){return url.startsWith('/')?'https://evazmelk.ir'+url:url;}
export default function HomepagePromotions({token}:{token:string}){
 const [items,setItems]=useState<Promotion[]>([]),[loading,setLoading]=useState(true),[busyId,setBusyId]=useState<number|null>(null),[error,setError]=useState(''),[success,setSuccess]=useState('');
 async function request(path:string,method='GET',payload?:object){const r=await fetch(API+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'درخواست انجام نشد');return d;}
 async function refresh(){const d=await request('/api/admin/homepage-promotions');setItems((d.items||[]).sort((a:Promotion,b:Promotion)=>a.sort_order-b.sort_order));}
 useEffect(()=>{let live=true;request('/api/admin/homepage-promotions').then(d=>{if(live)setItems((d.items||[]).sort((a:Promotion,b:Promotion)=>a.sort_order-b.sort_order))}).catch(e=>{if(live)setError(e instanceof Error?e.message:'دریافت تبلیغات انجام نشد')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[token]);
 function change(id:number,key:keyof Promotion,value:unknown){setItems(old=>old.map(item=>item.id===id?({...item,[key]:value} as Promotion):item));setSuccess('');}
 async function save(item:Promotion){setBusyId(item.id);setError('');setSuccess('');try{await request(`/api/admin/homepage-promotions/${item.id}`,'PUT',{title:item.title,subtitle:item.subtitle,badge:item.badge,image_url:item.image_url,cta_text:item.cta_text,target_page:item.target_page,sort_order:Number(item.sort_order),is_active:Boolean(item.is_active)});await refresh();setSuccess(`کارت «${item.title}» ذخیره شد.`)}catch(e){setError(e instanceof Error?e.message:'ذخیرهٔ تغییرات انجام نشد')}finally{setBusyId(null)}}
 if(loading)return <div className="panel homepage-promotions-panel"><p>در حال دریافت کارت‌های صفحهٔ اصلی...</p></div>;
 return <div className="panel homepage-promotions-panel"><div className="homepage-promotions-intro"><div><h2>مدیریت کارت‌های صفحهٔ اصلی</h2><p>چهار کارت اولیه برای طراحی صفحه آماده شده‌اند. عنوان، توضیح، برچسب، عکس و مقصد هر کارت را تغییر بده و ذخیره کن.</p></div><span className="homepage-promo-count">{items.length} کارت</span></div>
 {error&&<div className="error" role="alert">{error}</div>}{success&&<div className="success" role="status">{success}</div>}
 {items.length===0&&!error&&<p className="hint">هنوز کارت تبلیغاتی در پایگاه داده وجود ندارد. مهاجرت 0012_homepage_promotions.sql را اجرا کن.</p>}
 <div className="homepage-promotions-list">{items.map(item=><article className="homepage-promo-edit" key={item.id}><div className="homepage-promo-edit-preview">{item.image_url?<img src={imagePreview(item.image_url)} alt={item.title} onError={e=>{(e.currentTarget as HTMLImageElement).style.opacity='0.25'}}/>:<div className="homepage-promo-no-image">بدون تصویر</div>}<span>{item.badge||'بدون برچسب'}</span></div><div className="homepage-promo-edit-fields">
 <label>عنوان کارت<input value={item.title} maxLength={100} onChange={e=>change(item.id,'title',e.target.value)}/></label>
 <label>توضیح کوتاه<textarea rows={2} value={item.subtitle} maxLength={220} onChange={e=>change(item.id,'subtitle',e.target.value)}/></label>
 <div className="homepage-promo-fields-row"><label>برچسب<input value={item.badge} maxLength={40} onChange={e=>change(item.id,'badge',e.target.value)}/></label><label>متن دکمه<input value={item.cta_text} maxLength={40} onChange={e=>change(item.id,'cta_text',e.target.value)}/></label></div>
 <label>آدرس عکس (URL عمومی یا مسیر محلی)<input dir="ltr" value={item.image_url} placeholder="/homepage-promos/villa.webp یا https://..." onChange={e=>change(item.id,'image_url',e.target.value)}/><small>برای عکس‌های جدید، URL عمومی تصویر را وارد کن. مسیرهای /homepage-promos/... برای عکس‌های داخل سایت قابل استفاده‌اند.</small></label>
 <div className="homepage-promo-fields-row"><label>با کلیک کجا باز شود؟<select value={item.target_page} onChange={e=>change(item.id,'target_page',e.target.value)}>{targets.map(t=><option value={t.value} key={t.value}>{t.label}</option>)}</select></label><label>ترتیب نمایش<input type="number" min={1} max={20} value={item.sort_order} onChange={e=>change(item.id,'sort_order',e.target.value)}/></label></div>
 <label className="homepage-promo-active"><input type="checkbox" checked={item.is_active} onChange={e=>change(item.id,'is_active',e.target.checked)}/> نمایش این کارت در صفحهٔ اصلی</label>
 <div className="homepage-promo-actions"><button type="button" disabled={busyId===item.id} onClick={()=>save(item)}>{busyId===item.id?'در حال ذخیره…':'ذخیرهٔ این کارت'}</button></div>
 </div></article>)}</div>
 </div>;
}
