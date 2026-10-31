import {lazy,Suspense,useState} from 'react';
import './homeMapSection.css';
const PropertyMap=lazy(()=>import('../PropertyMap'));

export default function HomeMapSection({onFullMap}:{onFullMap:()=>void}){
 const [open,setOpen]=useState(false);
 return <section className="content-section home-map-section" aria-labelledby="home-map-title">
 <div className={`home-map-intro${open?' home-map-intro-open':''}`}><div className="home-map-copy"><span className="section-kicker">ملک را با موقعیتش ببینید</span><h2 id="home-map-title">املاک روی نقشهٔ اوز</h2><p>موقعیت آگهی‌های فعال را روی نقشه بررسی کنید و ملک موردنظرتان را در منطقهٔ دلخواه پیدا کنید.</p><div className="home-map-actions"><button className="home-map-open" type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-controls="home-online-map">{open?'بستن نقشه':'نمایش نقشهٔ آنلاین'} <span aria-hidden="true">⌖</span></button>
 {open&&<div id="home-online-map" className="home-map-live"><Suspense fallback={<p className="state-message" role="status">در حال بازکردن نقشهٔ اوز…</p>}><PropertyMap/></Suspense></div>}
 <button className="link-button" type="button" onClick={onFullMap}>رفتن به صفحهٔ نقشه ←</button></div></div>
 {!open&&<figure className="home-map-preview evaz-satellite-preview"><img src="/visual/evaz-satellite-preview-v1.png" width="1663" height="945" loading="lazy" decoding="async" alt="تصویر ماهواره‌ای اوز؛ پیش‌نمایش نمادین نقشه"/><figcaption>پیش‌نمایش شهر اوز؛ برای دیدن موقعیت املاک، نقشهٔ آنلاین را باز کنید.</figcaption></figure>}</div>
 </section>;
}
