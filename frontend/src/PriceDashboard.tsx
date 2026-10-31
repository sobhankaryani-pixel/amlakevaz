import {useEffect,useState,type ReactNode} from 'react';
import {validPoints,type Point} from './shared/marketData';
import {getPriceSeries,type PriceSeriesResult as Result} from './shared/priceSeries';
import {MARKET_WINDOWS,latestPeriod,windowPoints,windowChange,pointMonth,type MarketWindow} from './shared/marketWindow';
import './shared/marketCompact.css';
const fmt=(value:number)=>Math.round(value).toLocaleString('fa-IR');
export function Graph({name,points,color,unit,loading,selector,caption}:{name:string;points:Point[];color:string;unit:string;loading:boolean;selector?:ReactNode;caption?:string}){
 const data=validPoints(points),change=windowChange(data),latest=data.at(-1);
 const values=data.map(p=>Number(p.value_toman));
 const low=Math.min(...values),high=Math.max(...values),range=high-low;
 const pad=range>0?range*.18:Math.max((high||1)*.05,1);
 const bottom=low-pad,span=range+2*pad;
 const firstMonth=data.length?pointMonth(data[0].period):0,lastMonth=latest?pointMonth(latest.period):0;
 const xy=data.map(p=>({x:firstMonth===lastMonth?150:8+(pointMonth(p.period)-firstMonth)*284/(lastMonth-firstMonth),y:67-(Number(p.value_toman)-bottom)*58/span}));
 return <article className="price-card market-card">
 <div className="market-card-top"><div className="market-card-heading">{selector||<h3>{name}</h3>}{caption&&<small>{caption}</small>}</div><span className="market-growth"><small>تغییر بازه</small><span className={`market-change ${change.tone}`} title={change.detail} aria-label={change.detail+'، '+change.label}><span aria-hidden="true">{change.tone==='up'?'↗':change.tone==='down'?'↘':'—'}</span><b dir="ltr">{loading?'—':change.label}</b></span></span></div>
 {loading?<p className="market-empty" role="status">در حال دریافت قیمت‌ها…</p>:latest?<div className="market-card-body">
 <div className="market-value">{fmt(Number(latest.value_toman))}<span>{unit}</span></div>
 <div className="market-chart-visual"><svg className="market-graph" viewBox="0 0 300 78" preserveAspectRatio="none" role="img" aria-label={`روند ${name} از ${data[0].period} تا ${latest.period}`}>
 <line x1="8" x2="292" y1="74" y2="74" stroke="currentColor" opacity=".1"/>
 {xy.length>1&&<><polygon points={`${xy[0].x},74 ${xy.map(p=>`${p.x},${p.y}`).join(' ')} ${xy.at(-1)!.x},74`} fill={color} opacity=".07"/><polyline points={xy.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></>}
 {xy.map((p,i)=><circle key={data[i].period} cx={p.x} cy={p.y} r={i===xy.length-1?3:1.8} fill={color}><title>{`${data[i].period}: ${fmt(Number(data[i].value_toman))} تومان`}</title></circle>)}
 </svg><div className="market-periods"><span>{data[0].period}</span><span>{latest.period}</span></div></div>

 </div>:<p className="market-empty">برای این نوع ملک در بازهٔ انتخابی قیمتی ثبت نشده است.</p>}
 </article>
}
export default function PriceDashboard({compact=false,onViewDetails}:{compact?:boolean;onViewDetails?:()=>void}){
 const [region,setRegion]=useState(''),[usage,setUsage]=useState('land_residential'),[homeType,setHomeType]=useState('house_new'),[mehrType,setMehrType]=useState('mehr_upper'),[months,setMonths]=useState<MarketWindow>(6);
 const [retry,setRetry]=useState(0);
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;setError('');setLoading(true);Promise.all([getPriceSeries(region||'all'),getPriceSeries('all')]).then(([land,overall])=>{if(live){const regionList=land.regions?.length?land.regions:(overall.regions||[]);setResult({regions:regionList,series:{...overall.series,land_residential:land.series?.land_residential||[],land_commercial:land.series?.land_commercial||[]}});if(!region&&regionList.length){const preferred=regionList.find(r=>/ابتدای\s*بردسپی|بردسپی/.test(`${r.name} ${r.slug}`))||regionList[0];setRegion(preferred.slug)}}}).catch(e=>{if(live)setError(e instanceof Error&&e.message?e.message:'دریافت نمودارهای قیمت انجام نشد.')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[region,retry]);
 const regions=result?.regions||[],end=latestPeriod(result?.series||{});
 const selected=(segment:string)=>windowPoints(result?.series[segment]||[],months,end);
 const dates=Object.values(result?.series||{}).flat().map(p=>p.updated_at).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));
 const updated=dates.at(-1);
 return <div className={`price-dashboard market-dashboard market-refined ${compact?'market-compact':''}`} dir="rtl">
 {!compact&&<div className="price-intro"><h2>روند قیمت ملک در اوز</h2></div>}
 <aside className="market-price-warning" aria-label="توجه دربارهٔ قیمت‌ها"><span className="market-price-warning-icon" aria-hidden="true">⚠</span><p><strong>توجه:</strong> قیمت‌ها برآوردی از معاملات و اعلام فروشندگان است؛ املاک خودمونی مسئولیتی در قبال آن‌ها ندارد و مسئولیت خریدوفروش با طرفین معامله می‌باشد!</p></aside>
 <p className="market-scope-note">ساختمان و مسکن مهر: کل اوز</p><div className="market-shared-controls"><label className="market-region"><span>منطقهٔ زمین</span><select aria-label="منطقهٔ زمین" value={region} onChange={e=>setRegion(e.target.value)}><option value="all">کل اوز</option>{regions.map(r=><option key={r.slug} value={r.slug}>{r.name}</option>)}</select></label><div className="market-ranges" role="group" aria-label="بازهٔ نمودارها">{MARKET_WINDOWS.map(value=><button type="button" key={value} aria-pressed={months===value} onClick={()=>setMonths(value)}>{value===12?'یک ساله':`${fmt(value)} ماهه`}</button>)}</div></div>
 {error?<div role="alert" className="market-empty"><p>{error}</p><button onClick={()=>setRetry(v=>v+1)}>تلاش مجدد</button></div>:<div className="market-grid">
 <Graph name={usage==='land_residential'?'زمین مسکونی':'زمین تجاری'} selector={<select aria-label="نوع زمین" value={usage} onChange={e=>setUsage(e.target.value)}><option value="land_residential">زمین مسکونی</option><option value="land_commercial">زمین تجاری</option></select>} caption={regions.find(r=>r.slug===region)?.name||'کل اوز'} points={selected(usage)} color="#2477ed" unit="قیمت هر متر به تومان" loading={loading}/>
 <Graph name={homeType==='house_new'?'ویلایی نوساز':'آپارتمان'} selector={<select aria-label="نوع ساختمان" value={homeType} onChange={e=>setHomeType(e.target.value)}><option value="house_new">ویلایی نوساز</option><option value="apartment">آپارتمان</option></select>} points={selected(homeType)} color="#109f90" unit="قیمت هر متر به تومان" loading={loading}/>
 <Graph name="مسکن مهر" selector={<select aria-label="نوع مسکن مهر" value={mehrType} onChange={e=>setMehrType(e.target.value)}><option value="mehr_upper">مسکن مهر · طبقهٔ بالا</option><option value="mehr_lower">مسکن مهر · طبقهٔ پایین</option>{(result?.series.mehr||[]).length>0&&<option value="mehr">مسکن مهر · بدون تفکیک</option>}</select>} points={selected(mehrType)} color="#7862dc" unit="قیمت کل به تومان" loading={loading}/>
 </div>}
 <div className="market-shared-footer"><small>{updated?`به‌روزرسانی: ${new Date(updated).toLocaleDateString('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran'})}`:end?`آخرین ماه ثبت‌شده: ${end}`:''}</small>{compact&&onViewDetails&&<button type="button" className="link-button" onClick={onViewDetails}>مشاهده تحلیل کامل ←</button>}</div>
 <details className="market-method-details"><summary>داده‌ها و روش محاسبه</summary><p>بازه‌ها به آخرین ماه ثبت‌شده ختم می‌شوند. درصد تغییر از نخستین تا آخرین قیمتِ موجود در بازه محاسبه می‌شود و حداقل دو ماه داده لازم دارد. ماه‌های بدون داده تخمین زده نمی‌شوند. قیمت زمین و ساختمان برای هر متر مربع و مسکن مهر برای کل واحد است؛ منطقه فقط نمودار زمین را تغییر می‌دهد.</p>{!loading&&!error&&[[usage,usage==='land_residential'?'زمین مسکونی':'زمین تجاری'],[homeType,homeType==='house_new'?'ویلایی نوساز':'آپارتمان'],[mehrType,'مسکن مهر']].map(([key,label])=><table key={key} className="market-data-table"><caption>{label}</caption><thead><tr><th>ماه</th><th>{key.startsWith('mehr')?'قیمت کل به تومان':'قیمت هر متر به تومان'}</th></tr></thead><tbody>{selected(key).map(p=><tr key={p.period}><td>{p.period}</td><td>{fmt(Number(p.value_toman))}</td></tr>)}</tbody></table>)}</details>
 </div>
}
