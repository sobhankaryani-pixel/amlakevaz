"use client";
import {useEffect,useState} from "react";
import PropertyMap from "./PropertyMap";
import PriceDashboard from "./PriceDashboard";
const nav=[['home','خانه'],['index','شاخص قیمت'],['areas','مناطق'],['transactions','معاملات'],['listings','آگهی‌ها'],['map','املاک روی نقشه'],['reports','گزارش‌ها']];
export default function Home(){const [page,setPage]=useState('home');const [dark,setDark]=useState(false);const title=nav.find(n=>n[0]===page)?.[1];useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('evaz-theme',dark?'dark':'light')},[dark]);useEffect(()=>{setDark(localStorage.getItem('evaz-theme')==='dark')},[]);return <main>
<header>
<a className="brand" href="#" onClick={()=>setPage('home')}>
<img className="brand-logo" src="/brand/logo.png" alt="لوگوی خودمونی"/>
<div>
<strong>خودمونی</strong>
<small>شاخص املاک اوز</small>
</div>
</a>
<nav>{nav.filter(n=>['home','index','areas','listings','map'].includes(n[0])).map(n=>
<button className={page===n[0]?'sel':''} onClick={()=>setPage(n[0])} key={n[0]}>{n[1]}</button>)}</nav>
<div className="actions">
<a className="social-icon" href="https://www.instagram.com/melkekhodmoonii/" target="_blank" aria-label="اینستاگرام">
<img src="/brand/instagram.png" alt=""/>
</a>
<a className="social-icon" href="https://wa.me/989212745755" target="_blank" aria-label="واتساپ">
<img src="/brand/whatsapp.png" alt=""/>
</a>
<button className="theme-toggle" onClick={()=>setDark(!dark)} aria-label="تغییر تم">{dark?'☀':'☾'}</button>
<a className="cta" href="#lead">درخواست مشاوره</a>
</div>
</header>
<div className="mobile-nav">{nav.map(n=>
<button className={page===n[0]?'sel':''} onClick={()=>setPage(n[0])} key={n[0]}>
<b>{n[0]==='home'?'⌂':n[0]==='index'?'⌁':n[0]==='areas'?'⌖':n[0]==='transactions'?'▣':n[0]==='listings'?'▤':n[0]==='map'?'⌖':'▥'}</b>{n[1]}</button>)}</div>
{page==='home'?<>
<section className="hero">
<span className="eyebrow">● قیمت‌های ثبت‌شدهٔ بازار اوز</span>
<h1>نبض بازار ملک <em>اوز</em>
<br/>با داده، نه حدس.</h1>
<p>مرجع مستقل قیمت، معاملات و تحلیل بازار املاک اوز؛ ساخته‌شده توسط خودمونی.</p>
<div className="hero-buttons">
<button className="cta" onClick={()=>setPage('index')}>مشاهده شاخص قیمت ←</button>
<button className="valuation-cta" onClick={()=>document.getElementById('valuation')?.scrollIntoView({behavior:'smooth'})}>ملک من چقدر می‌ارزد؟</button>
</div>
<small>نمودارهای معامله و برآورد ماهانه با برچسب جدا نمایش داده می‌شوند</small>
</section>
<section className="section"><PriceDashboard compact/></section>
<section className="valuation" id="valuation">
<div>
<span>ارزیابی قیمت</span>
<h2>ملک من در بازار اوز چقدر می‌ارزد؟</h2>
<p>اطلاعات کلی ملک خود را بفرستید تا بر اساس داده‌های موجود، بازه ارزش تقریبی دریافت کنید.</p>
</div>
<a className="gold" href="#lead">ارزیابی دقیق و مشاوره ←</a>
</section>
</>:page==='map'?<PropertyMap/>:<section className="inner section">
<span>شاخص املاک اوز</span>
<h1>{title}</h1>
{(page==='index'||page==='areas')?<PriceDashboard/>:page==='listings'?<div className="panel"><p>برای دیدن آگهی‌های دارای موقعیت، نقشهٔ املاک را باز کنید.</p><button onClick={()=>setPage('map')}>مشاهدهٔ املاک روی نقشه</button></div>:<div className="panel"><p>هنوز داده‌ای برای نمایش این بخش منتشر نشده است.</p></div>}</section>}
<section className="lead" id="lead">
<div>
<span>با خودمونی در ارتباط باشید</span>
<h2>برای تصمیم بهتر، با داده شروع کنید.</h2>
<p>برای قیمت ملک، فروش فایل یا ارزیابی قیمت با ما در ارتباط باشید.</p>
</div>
<div>
<a className="gold" href="https://wa.me/989212745755" target="_blank">پیام در واتساپ ↗</a>
<a className="outline" href="https://www.instagram.com/melkekhodmoonii/" target="_blank">اینستاگرام خودمونی ↗</a>
</div>
</section>
<footer>
<a className="brand" href="#" onClick={()=>setPage('home')}>
<img className="brand-logo" src="/brand/logo.png" alt="لوگوی خودمونی"/>
<strong>خودمونی<small>مرجع بازار ملک اوز</small>
</strong>
</a>

<small>© ۱۴۰۵ خودمونی</small>
</footer>
</main>}
