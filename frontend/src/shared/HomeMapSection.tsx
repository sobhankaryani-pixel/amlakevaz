import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import './homeMapSection.css';
const PropertyMap=lazy(()=>import('../PropertyMap'));

export default function HomeMapSection({onFullMap}:{onFullMap:()=>void}){
 const [open,setOpen]=useState(false);
 const frame=useRef<HTMLDivElement>(null),opener=useRef<HTMLButtonElement>(null);
 const close=()=>{setOpen(false);requestAnimationFrame(()=>{opener.current?.focus({preventScroll:true});opener.current?.scrollIntoView({block:'center',behavior:'auto'})})};
 useEffect(()=>{
  if(!open||!frame.current)return;
  const card=frame.current;
  let raf=0,scrolled=false;
  const fit=()=>{
   const site=card.closest('.site')||document;
   const header=site.querySelector<HTMLElement>('.site-header');
   const mobile=matchMedia('(max-width:900px)').matches;
   const top=mobile?(header?.querySelector<HTMLElement>('.header-tools')?.getBoundingClientRect().height||0):(header&&getComputedStyle(header).position==='sticky'?header.getBoundingClientRect().height:0);
   const bottom=mobile?(site.querySelector<HTMLElement>('.mobile-bottom-nav')?.getBoundingClientRect().height||0):0;
   card.style.setProperty('--home-map-fit-height',Math.max(280,(window.visualViewport?.height||innerHeight)-top-bottom-24)+'px');
   if(!scrolled&&card.querySelector('.map-page')){
    scrolled=true;
    raf=requestAnimationFrame(()=>{observer.disconnect();window.scrollTo({top:Math.max(0,scrollY+card.getBoundingClientRect().top-top-12),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})});
   }
  };
  fit();
  const observer=new MutationObserver(fit);observer.observe(card,{childList:true,subtree:true});
  window.addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);
  return()=>{cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('resize',fit);window.visualViewport?.removeEventListener('resize',fit)};
 },[open]);
 return <section className="content-section home-map-section" aria-labelledby="home-map-title">
 <div className={`home-map-intro${open?' home-map-intro-open':''}`}><div className="home-map-copy"><span className="section-kicker">ملک را با موقعیتش ببینید</span><h2 id="home-map-title">املاک روی نقشهٔ اوز</h2><p>موقعیت آگهی‌های فعال را روی نقشه بررسی کنید و ملک موردنظرتان را در منطقهٔ دلخواه پیدا کنید.</p><div className="home-map-actions"><button ref={opener} className="home-map-open" type="button" onClick={()=>open?close():setOpen(true)} aria-expanded={open} aria-controls="home-online-map">{open?'بستن نقشه':'نمایش نقشهٔ آنلاین'} <span aria-hidden="true">⌖</span></button>
 {open&&<div ref={frame} id="home-online-map" className="home-map-live"><div className="home-map-live-bar"><strong>نقشهٔ آنلاین اوز</strong><button type="button" className="home-map-close" onClick={close}><span aria-hidden="true">×</span> بستن نقشه</button></div><Suspense fallback={<p className="state-message" role="status">در حال بازکردن نقشهٔ اوز…</p>}><PropertyMap/></Suspense></div>}
 <button className="link-button" type="button" onClick={onFullMap}>رفتن به صفحهٔ نقشه ←</button></div></div>
 {!open&&<figure className="home-map-preview evaz-satellite-preview"><img src="/visual/evaz-satellite-preview-v1.png" width="1663" height="945" loading="lazy" decoding="async" alt="تصویر ماهواره‌ای اوز؛ پیش‌نمایش نمادین نقشه"/><figcaption>پیش‌نمایش شهر اوز؛ برای دیدن موقعیت املاک، نقشهٔ آنلاین را باز کنید.</figcaption></figure>}</div>
 </section>;
}
