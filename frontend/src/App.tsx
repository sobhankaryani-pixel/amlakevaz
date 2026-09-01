"use client";
import {useEffect,useState} from "react";
const nav=[['home','خانه'],['index','شاخص قیمت'],['areas','مناطق'],['transactions','معاملات'],['listings','آگهی‌ها'],['reports','گزارش‌ها']];
const areas=['همه مناطق','مرکز شهر','بردسپی','پشت سیتی‌سنتر','شهرک فردوس','کنارسبز','شهرک فرصتی','باستانه','محله کامیاب','پشت ایران خودرو'];
const listings=[['آپارتمان','آپارتمان نورگیر و خوش‌نقشه','مرکز شهر','۱۲۵ متر','۵.۲ میلیارد'],['زمین مسکونی','زمین با دسترسی عالی','شهرک فردوس','۲۸۰ متر','۴.۷ میلیارد'],['خانه','خانه حیاط‌دار بازسازی‌شده','بردسپی','۱۹۰ متر','۶.۴ میلیارد']];
const tx=[['۲۳ مرداد ۱۴۰۵','مرکز شهر','خانه','۵.۲ میلیارد','۴۰ میلیون / متر'],['۱۹ مرداد ۱۴۰۵','کنارسبز','زمین','۳.۸ میلیارد','۱۳.۵ میلیون / متر'],['۰۸ مرداد ۱۴۰۵','شهرک فردوس','آپارتمان','۴.۱ میلیارد','۳۲ میلیون / متر']];
const regionPrices=[['مرکز شهر','۱۳.۸ تا ۱۴.۸ میلیون','↑ ۴.۶٪','داده خوب'],['بردسپی','۱۲.۵ تا ۱۳.۵ میلیون','↑ ۳.۲٪','داده متوسط'],['شهرک فردوس','۱۱.۸ تا ۱۲.۸ میلیون','↑ ۲.۷٪','داده خوب'],['کنارسبز','۱۰.۹ تا ۱۱.۹ میلیون','↑ ۱.۹٪','داده متوسط'],['پشت سیتی‌سنتر','۱۲.۱ تا ۱۳.۱ میلیون','↑ ۲.۴٪','داده متوسط'],['شهرک فرصتی','۱۰.۵ تا ۱۱.۵ میلیون','↑ ۱.۴٪','داده کم'],['باستانه','۹.۸ تا ۱۰.۸ میلیون','↑ ۰.۹٪','داده کم']];
function Chart(){return <svg className="line" viewBox="0 0 700 220" preserveAspectRatio="none">
<path d="M0 190C70 180 80 150 140 165S220 100 280 125S350 100 410 108S490 60 540 78S620 28 700 42V220H0Z" fill="#dff2ea"/>
<path d="M0 190C70 180 80 150 140 165S220 100 280 125S350 100 410 108S490 60 540 78S620 28 700 42" fill="none" stroke="#159b7d" strokeWidth="4"/>
</svg>}
function RegionCard({r}:{r:string[]}){return <article className="region-card">
<div className="region-card-head">
<h3>{r[0]}</h3>
<span>{r[2]}</span>
</div>
<Chart/>
<div className="region-range">
<small>بازه قیمت زمین مسکونی</small>
<b>{r[1]} <em>تومان / متر</em>
</b>
</div>
<small className="confidence">{r[3]} · تغییر نسبت به ماه قبل</small>
</article>}
export default function Home(){const [page,setPage]=useState('home');const [area,setArea]=useState('همه مناطق');const [dark,setDark]=useState(false);const [showAreas,setShowAreas]=useState(false);const title=nav.find(n=>n[0]===page)?.[1];useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('evaz-theme',dark?'dark':'light')},[dark]);useEffect(()=>{setDark(localStorage.getItem('evaz-theme')==='dark')},[]);return <main>
<header>
<a className="brand" href="#" onClick={()=>setPage('home')}>
<img className="brand-logo" src="/brand/logo.png" alt="لوگوی خودمونی"/>
<div>
<strong>خودمونی</strong>
<small>شاخص املاک اوز</small>
</div>
</a>
<nav>{nav.slice(0,4).map(n=>
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
<b>{n[0]==='home'?'⌂':n[0]==='index'?'⌁':n[0]==='areas'?'⌖':n[0]==='transactions'?'▣':n[0]==='listings'?'▤':'▥'}</b>{n[1]}</button>)}</div>
{page==='home'?<>
<section className="hero">
<span className="eyebrow">● گزارش زنده بازار اوز · مرداد ۱۴۰۵</span>
<h1>نبض بازار ملک <em>اوز</em>
<br/>با داده، نه حدس.</h1>
<p>مرجع مستقل قیمت، معاملات و تحلیل بازار املاک اوز؛ ساخته‌شده توسط خودمونی.</p>
<div className="hero-buttons">
<button className="cta" onClick={()=>setPage('index')}>مشاهده شاخص قیمت ←</button>
<button className="valuation-cta" onClick={()=>document.getElementById('valuation')?.scrollIntoView({behavior:'smooth'})}>ملک من چقدر می‌ارزد؟</button>
</div>
<small>داده‌ها از معاملات تأییدشده و بررسی میدانی خودمونی جمع‌آوری می‌شوند</small>
</section>
<section className="section">
<div className="head">
<div>
<span>تصویر کلی بازار</span>
<h2>امروز در بازار اوز</h2>
</div>
<small>آخرین بروزرسانی: ۲۴ مرداد ۱۴۰۵</small>
</div>
<div className="kpis">
<article className="kpi main">
<span>شاخص قیمت کل</span>
<b>۱۲۷.۴</b>
<i>↑ ۳.۸٪ ماهانه</i>
<Chart/>
</article>
<article className="kpi">
<span>قیمت نماینده مسکن</span>
<b>۳۴.۲ <small>م‌ت</small>
</b>
<i>↑ ۲.۱٪ ماهانه</i>
</article>
<article className="kpi">
<span>نقدشونده‌ترین منطقه</span>
<b>مرکز شهر</b>
<small>عالی · ۲۸ معامله</small>
</article>
<article className="kpi">
<span>نمونه‌های بررسی‌شده</span>
<b>۲۴۶</b>
<small>در ۶ ماه اخیر</small>
</article>
</div>
</section>
<section className="section region-prices">
<div className="head">
<div>
<span>قیمت زمین در مناطق اوز</span>
<h2>قیمت هر منطقه، با روند ماهانه</h2>
</div>
<button className="all-regions" onClick={()=>setShowAreas(!showAreas)}>{showAreas?'نمایش کمتر':'نمایش همه مناطق ←'}</button>
</div>
<p className="section-note">بازه‌ها با تلورانس اولیه ±۵۰۰ هزار تومان در هر متر نمایش داده می‌شوند و با افزایش داده‌ها دقیق‌تر خواهند شد.</p>
<div className="region-grid">{regionPrices.slice(0,showAreas?regionPrices.length:3).map(r=>
<RegionCard key={r[0]} r={r}/>)}</div>
</section>
<section className="section split">
<div className="panel">
<div className="head">
<div>
<span>روند قیمت</span>
<h2>شاخص املاک اوز</h2>
</div>
<select>
<option>۶ ماه اخیر</option>
</select>
</div>
<Chart/>
<div className="chart-foot">شاخص قیمت <b>میانه کل بازار: ۱۲۷.۴</b>
</div>
</div>
<div className="panel">
<div className="head">
<div>
<span>رتبه‌بندی مناطق</span>
<h2>کجا داغ‌تر است؟</h2>
</div>
<button onClick={()=>setPage('areas')}>همه ←</button>
</div>{[['مرکز شهر','۱۳۶.۲','عالی'],['شهرک فردوس','۱۲۹.۷','خوب'],['کنارسبز','۱۲۴.۸','متوسط'],['بردسپی','۱۱۸.۳','متوسط']].map((r,i)=>
<div className="rank" key={r[0]}>
<b>{i+1}</b>
<span>{r[0]}<small>{r[2]} نقدشوندگی</small>
</span>
<strong>{r[1]}</strong>
<i style={{width:`${90-i*14}%`}}/>
</div>)}</div>
</section>
<section className="opportunity">
<div>
<span>منتخب خودمونی · مرداد ۱۴۰۵</span>
<h2>فرصت ویژه ماه</h2>
<h3>خانه حیاط‌دار بازسازی‌شده در بردسپی</h3>
<p>فایلی با موقعیت ممتاز، بازسازی کامل و قیمت‌گذاری شفاف؛ انتخاب دستی تیم خودمونی.</p>
<div className="meta">۱۹۰ متر　·　۶.۴ میلیارد تومان　·　<span>۲۰٪ زیر میانگین منطقه</span>
</div>
<a className="gold" href="#lead">دریافت جزئیات و مشاوره ←</a>
</div>
<div className="visual">
<b>فرصت<br/>ماه</b>
</div>
</section>
<section className="section">
<div className="head">
<div>
<span>فایل‌های فعال خودمونی</span>
<h2>آگهی‌های روزانه</h2>
</div>
<button onClick={()=>setPage('listings')}>مشاهده همه ←</button>
</div>
<div className="cards">{listings.map((l,i)=>
<article className="listing" key={l[1]}>
<div className={'photo p'+i}>
<label>{i===0?'فایل تازه':i===1?'قابل مذاکره':'پیشنهاد خودمونی'}</label>
</div>
<div>
<small>{l[0]} · {l[2]}</small>
<h3>{l[1]}</h3>
<b>{l[4]}</b>
<span>{l[3]}</span>
</div>
</article>)}</div>
</section>
<section className="report">
<div>
<span>گزارش رسمی بازار</span>
<h2>نبض بازار اوز · مرداد ۱۴۰۵</h2>
<p>زمین صعودی · خانه باثبات · مرکز شهر نقدشونده‌ترین منطقه</p>
</div>
<button onClick={()=>setPage('reports')}>خواندن گزارش ←</button>
</section>
<section className="valuation" id="valuation">
<div>
<span>ارزیابی قیمت</span>
<h2>ملک من در بازار اوز چقدر می‌ارزد؟</h2>
<p>اطلاعات کلی ملک خود را بفرستید تا بر اساس داده‌های موجود، بازه ارزش تقریبی دریافت کنید.</p>
</div>
<a className="gold" href="#lead">ارزیابی دقیق و مشاوره ←</a>
</section>
</>:<section className="inner section">
<span>شاخص املاک اوز</span>
<h1>{title}</h1>
<p>این بخش در Preview با داده‌های نمونه نمایش داده می‌شود و در نسخه نهایی از نتایج تأییدشده سیستم تغذیه خواهد شد.</p>{page==='index'&&<>
<div className="filters">
<select>
<option>همه انواع ملک</option>
<option>زمین</option>
<option>خانه</option>
<option>آپارتمان</option>
</select>
<select value={area} onChange={e=>setArea(e.target.value)}>{areas.map(a=>
<option key={a}>{a}</option>)}</select>
<select>
<option>۶ ماه اخیر</option>
</select>
</div>
<div className="summary">
<div>میانه قیمت نماینده<b>۱۲۷.۴</b>
<i>↑ ۳.۸٪ ماهانه</i>
</div>
<div>میانگین<b>۱۳۱.۸</b>
<small>تومان / شاخص</small>
</div>
<div>نمونه معتبر<b>۲۴۶</b>
<small>سطح اطمینان: خوب</small>
</div>
</div>
<div className="panel big">
<h2>روند شاخص قیمت {area!=='همه مناطق'?`· ${area}`:''}</h2>
<Chart/>
</div>
</>}{page==='areas'&&<Table headers={['رتبه','منطقه','شاخص قیمت','معاملات ۶ ماهه','نقدشوندگی']} rows={['مرکز شهر','شهرک فردوس','کنارسبز','بردسپی','پشت سیتی‌سنتر','شهرک فرصتی','باستانه'].map((x,i)=>[`۰${i+1}`,x,`${136-i*3.1}`,`${28-i*3}` ,i<2?'عالی':'متوسط'])}/>} {page==='transactions'&&<Table headers={['تاریخ','منطقه','نوع ملک','قیمت معامله','قیمت هر متر']} rows={tx}/>} {page==='listings'&&<div className="cards">{listings.concat(listings).map((l,i)=>
<article className="listing" key={i}>
<div className={'photo p'+i%3}>
<label>فایل فعال</label>
</div>
<div>
<small>{l[0]} · {l[2]}</small>
<h3>{l[1]}</h3>
<b>{l[4]}</b>
<a href="https://wa.me/989212745755" target="_blank">واتساپ ←</a>
</div>
</article>)}</div>}{page==='reports'&&<div className="reports">{['گزارش بازار ملک اوز · مرداد ۱۴۰۵','گزارش بازار ملک اوز · تیر ۱۴۰۵','نبض بازار اوز · خرداد ۱۴۰۵'].map((r,i)=>
<article key={r}>
<small>SNAPSHOT 0{i+1}</small>
<h2>{r}</h2>
<p>خلاصه تحلیلی شاخص قیمت، مناطق، معاملات قطعی و نقدشوندگی بازار اوز.</p>
<button>مشاهده گزارش ←</button>
</article>)}</div>}</section>}
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
<div>بازدید امروز <b>۱۲۸</b>　۳۰ روز اخیر <b>۲٬۸۴۰</b>　آگهی فعال <b>۳۶</b>　معاملات منتشرشده <b>۱۸</b>
</div>
<small>© ۱۴۰۵ خودمونی</small>
</footer>
</main>}
function Table({headers,rows}:{headers:string[],rows:string[][]}){return <div className="table">
<table>
<thead>
<tr>{headers.map(h=>
<th key={h}>{h}</th>)}</tr>
</thead>
<tbody>{rows.map((r,i)=>
<tr key={i}>{r.map((x,j)=>
<td key={j}>{j===1?<b>{x}</b>:x}</td>)}</tr>)}</tbody>
</table>
</div>}
