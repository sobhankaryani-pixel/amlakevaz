import {lazy,Suspense,useState} from 'react';
const PropertyMap=lazy(()=>import('../PropertyMap'));

export default function HomeMapSection({onFullMap}:{onFullMap:()=>void}){
 const [open,setOpen]=useState(false);
 return <section className="content-section home-map-section" aria-labelledby="home-map-title">
 <div className="home-map-intro"><div className="home-map-copy"><span className="section-kicker">ملک را با موقعیتش ببینید</span><h2 id="home-map-title">املاک روی نقشهٔ اوز</h2><p>موقعیت آگهی‌های فعال را روی نقشه بررسی کنید و ملک موردنظرتان را در منطقهٔ دلخواه پیدا کنید.</p><div className="home-map-actions"><button className="home-map-open" type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-controls="home-online-map">{open?'بستن نقشه':'نمایش نقشهٔ آنلاین'} <span aria-hidden="true">⌖</span></button><button className="link-button" type="button" onClick={onFullMap}>رفتن به صفحهٔ نقشه ←</button></div></div>
 <figure className="home-map-preview"><img src="/visual/evaz-inspired-hero.webp" width="1536" height="1024" loading="lazy" decoding="async" alt="نمای مفهومی از معماری جنوب ایران"/><figcaption>تصویر مفهومی؛ برای دیدن موقعیت واقعی املاک، نقشه را باز کنید.</figcaption></figure></div>
 {open&&<div id="home-online-map" className="home-map-live"><Suspense fallback={<p className="state-message" role="status">در حال بازکردن نقشهٔ اوز…</p>}><PropertyMap/></Suspense></div>}
 </section>;
}
