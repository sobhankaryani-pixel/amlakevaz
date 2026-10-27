import {useEffect,useState} from 'react';
import {validPoints,changeInfo,type Point} from './shared/marketData';
type Region={name:string;slug:string};
type Result={regions:Region[];series:Record<string,Point[]>};
const API='https://api.evazmelk.ir';
const fmt=(value:number)=>Math.round(value).toLocaleString('fa-IR');
export function Graph({name,points,color,unit,loading}:{name:string;points:Point[];color:string;unit:string;loading:boolean}){
 const data=validPoints(points),change=changeInfo(data),latest=data.at(-1);
 const values=data.map(p=>Number(p.value_toman));
 const low=Math.min(...values),high=Math.max(...values),range=high-low;
 const pad=range>0?range*.18:Math.max((high||1)*.05,1);
 const bottom=low-pad,span=range+2*pad;
 const xy=data.map((p,i)=>({x:data.length===1?260:18+i*484/(data.length-1),y:164-(Number(p.value_toman)-bottom)*144/span}));
 return <article className="price-card market-card">
 <div className="market-card-top"><h3>{name}</h3><span className="market-growth"><small>درصد رشد</small><span className={`market-change ${change.tone}`} title={change.detail} aria-label={change.detail+'، '+change.label}><span aria-hidden="true">{change.tone==='up'?'↗':change.tone==='down'?'↘':'—'}</span><b dir="ltr">{loading?'—':change.label}</b></span></span></div>
 {loading?<p className="market-empty" role="status">در حال دریافت قیمت‌ها…</p>:latest?<>
 <div className="market-value">{fmt(Number(latest.value_toman))}<span>تومان {unit}</span></div>
 <svg className="market-graph" viewBox="0 0 520 188" role="img" aria-label={`روند ${name} از ${data[0].period} تا ${latest.period}`}>
 {[36,92,148].map(y=><line key={y} x1="18" x2="502" y1={y} y2={y} stroke="currentColor" opacity=".12" strokeDasharray="3 6"/>)}
 {xy.length>1&&<polyline points={xy.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>}
 {xy.map((p,i)=><circle key={data[i].period} cx={p.x} cy={p.y} r={i===xy.length-1?3.5:2.2} fill={color}><title>{`${data[i].period}: ${fmt(Number(data[i].value_toman))} تومان`}</title></circle>)}
 </svg><div className="market-periods"><span>{data[0].period}</span><span>{latest.period}</span></div>
 <p className="market-comparison">{change.detail}</p>
 </>:<p className="market-empty">برای این انتخاب هنوز قیمت اعلامی ثبت نشده است.</p>}
 </article>
}
export default function PriceDashboard({compact=false,onViewDetails}:{compact?:boolean;onViewDetails?:()=>void}){
 const [region,setRegion]=useState(''),[usage,setUsage]=useState('land_residential'),[homeType,setHomeType]=useState('house_new'),[mehrType,setMehrType]=useState('mehr_upper');
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[refreshTick,setRefreshTick]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{const refresh=()=>setRefreshTick(v=>v+1);const onVisibility=()=>{if(document.visibilityState==='visible')refresh()};const timer=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',onVisibility);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',onVisibility)}},[]);
 useEffect(()=>{let live=true;setError('');setLoading(true);const get=(slug:string)=>fetch(`${API}/api/public/price-series?region=${encodeURIComponent(slug)}`).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<Result>});Promise.all([get(region||'all'),get('all')]).then(([land,overall])=>{if(live){const regionList=land.regions?.length?land.regions:(overall.regions||[]);setResult({regions:regionList,series:{...overall.series,land_residential:land.series?.land_residential||[],land_commercial:land.series?.land_commercial||[]}});if(!region&&regionList.length){const preferred=regionList.find(r=>/ابتدای\s*بردسپی|بردسپی/.test(`${r.name} ${r.slug}`))||regionList[0];setRegion(preferred.slug)}}}).catch(()=>{if(live)setError('دریافت نمودارهای قیمت انجام نشد.')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[region,refreshTick]);
 const regions=result?.regions||[];
 const landName=usage==='land_residential'?'زمین مسکونی':'زمین تجاری';
 return <div className={`price-dashboard market-dashboard ${compact?'market-compact':''}`} dir="rtl">
 {!compact&&<div className="price-intro"><h2>روند قیمت ملک در اوز</h2><p>تنها مرجع این نمودارها، قیمت ماهانهٔ اعلامی خودمونی است.</p></div>}

 {error?<p role="alert" className="market-empty">{error}</p>:<div className="market-grid">
 <section className="market-chart-section"><div className="market-filters"><label>منطقهٔ زمین<select value={region} onChange={e=>setRegion(e.target.value)}><option value="all">کل اوز</option>{regions.map(r=><option key={r.slug} value={r.slug}>{r.name}</option>)}</select></label>{!compact&&<label>کاربری<select value={usage} onChange={e=>setUsage(e.target.value)}><option value="land_residential">مسکونی</option><option value="land_commercial">تجاری</option></select></label>}</div><Graph name={`${landName} · ${regions.find(r=>r.slug===region)?.name||'کل اوز'}`} points={result?.series[usage]||[]} color="#2778c5" unit="برای هر متر زمین" loading={loading}/></section>
 <section className="market-chart-section"><div className="market-filters"><label>نوع زیربنا<select value={homeType} onChange={e=>setHomeType(e.target.value)}><option value="house_new">ویلایی نوساز</option><option value="apartment">آپارتمان</option></select></label></div><Graph name={`${homeType==='house_new'?'ویلایی نوساز':'آپارتمان'} · کل اوز`} points={result?.series[homeType]||[]} color="#149a8b" unit="برای هر متر زیربنا" loading={loading}/></section>
 <section className="market-chart-section"><div className="market-filters"><label>طبقهٔ مسکن مهر<select value={mehrType} onChange={e=>setMehrType(e.target.value)}><option value="mehr_upper">طبقهٔ بالا</option><option value="mehr_lower">طبقهٔ پایین</option>{(result?.series.mehr||[]).length>0&&<option value="mehr">قدیمی بدون تفکیک طبقه</option>}</select></label></div><Graph name={`مسکن مهر · ${mehrType==='mehr_upper'?'طبقهٔ بالا':mehrType==='mehr_lower'?'طبقهٔ پایین':'بدون تفکیک'}`} points={result?.series[mehrType]||[]} color="#9470bd" unit="برای کل واحد" loading={loading}/></section>
 </div>}
 <p className="market-note">درصد تغییر بین دو دورهٔ اخیرِ دارای داده محاسبه می‌شود؛ حداقل دو دوره لازم است. هر نقطه، قیمت اعلامی خودمونی برای همان ماه است. قیمت آگهی و معامله شاخص جداگانه‌ای ایجاد نمی‌کند؛ ماه‌های بدون قیمت اعلامی نقطه ندارند.</p>
 </div>
}
