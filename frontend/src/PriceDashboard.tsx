import {useEffect,useState} from 'react';

type Point={period:string;value_toman:number;count:number|null};
type Region={name:string;slug:string};
type Result={regions:Region[];series:Record<string,Point[]>};
const API='https://api.evazmelk.ir';
const fmt=(value:number)=>Math.round(value).toLocaleString('fa-IR');
const names:Record<string,string>={land_residential:'زمین مسکونی',land_commercial:'زمین تجاری',house_new:'خانهٔ ویلایی نوساز',apartment:'آپارتمان',mehr:'مسکن مهر · قدیمی بدون تفکیک طبقه',mehr_upper:'مسکن مهر · طبقهٔ بالا',mehr_lower:'مسکن مهر · طبقهٔ پایین'};
function changeInfo(points:Point[]){
 const values=points.map(p=>Number(p.value_toman)).filter(v=>Number.isFinite(v));
 if(values.length<2)return {label:'—',tone:'none' as const,detail:'برای محاسبهٔ تغییرات، دست‌کم دو دوره لازم است.'};
 const prev=values[values.length-2],last=values[values.length-1];
 if(prev<=0)return {label:'—',tone:'none' as const,detail:'مبنای محاسبه معتبر نیست.'};
 const change=Math.round(((last-prev)/prev)*100);
 return {label:`${change>0?'+':''}${change.toLocaleString('fa-IR')}٪`,tone:change>0?'up' as const:'down' as const,detail:`مقایسهٔ ${points[points.length-2].period} با ${points[points.length-1].period}`};
}
function Sparkline({points,color}:{points:Point[];color:string}){
 const values=points.slice(-8).map(p=>Number(p.value_toman));
 if(!values.length)return <div className="home-index-spark-empty"/>;
 const low=Math.min(...values),high=Math.max(...values),span=high-low||Math.max(high*.08,1);
 const coords=values.map((v,i)=>({x:8+(values.length===1?112:i*224/(values.length-1)),y:34-(v-low)*24/span}));
 const poly=coords.map(p=>`${p.x},${p.y}`).join(' ');
 const area=`8,42 ${poly} ${coords[coords.length-1].x},42`;
 return <svg className="home-index-spark" viewBox="0 0 240 46" aria-hidden="true"><polygon points={area} fill={color} opacity=".09"/><polyline points={poly} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>{coords.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={i===coords.length-1?3.5:2} fill={color}/>)}</svg>;
}
function Graph({name,points,color,unit,source}:{name:string;points:Point[];color:string;unit:string;source:string}){
 const values=points.map(p=>Number(p.value_toman));
 const change=changeInfo(points);
 const low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):0,span=high-low||1;
 const positions=points.map((p,i)=>({x:points.length===1?300:45+i*510/(points.length-1),y:175-(Number(p.value_toman)-low)*125/span}));
 return <article className="price-card"><div className="price-card-top"><div className="price-card-heading"><h3>{name}</h3></div><div className={`price-change ${change.tone}`}><span>درصد تغییرات:</span><b>{change.label}</b></div></div>{points.length===0?<p className="price-empty">برای این انتخاب هنوز {source==='sales'?'معاملهٔ معتبر':'برآورد ماهانه'} ثبت نشده است.</p>:<>
 <strong>{fmt(values[values.length-1])} <small>تومان {unit}</small></strong>
 <svg viewBox="0 0 600 210" className="price-graph" role="img" aria-label={`روند ${name}`}><line x1="30" y1="185" x2="580" y2="185" stroke="currentColor" opacity=".2"/>
 {positions.length>1&&<polyline points={positions.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
 {positions.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="5" fill={color}><title>{points[i].period}: {fmt(values[i])} تومان{source==='sales'?` · ${points[i].count} معامله`:''}</title></circle>)}</svg>
 <div className="price-periods"><span>{points[0].period}</span><span>{points[points.length-1].period}</span></div>
 {source==='sales'&&<small className="price-samples">ماه آخر: {fmt(points[points.length-1].count||0)} معامله · میانهٔ قیمت</small>}
 </>}</article>
}

export default function PriceDashboard({compact=false,onViewDetails}:{compact?:boolean;onViewDetails?:()=>void}){
 const [source,setSource]=useState('manual'),[region,setRegion]=useState(''),[usage,setUsage]=useState('land_residential'),[homeType,setHomeType]=useState('house_new'),[mehrType,setMehrType]=useState('mehr_upper');
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;setError('');const get=(slug:string)=>fetch(`${API}/api/public/price-series?source=${source}&region=${encodeURIComponent(slug)}`).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<Result>});Promise.all([get(region||'all'),get('all')]).then(([land,overall])=>{if(live){const regionList=land.regions?.length?land.regions:(overall.regions||[]);setResult({regions:regionList,series:{...overall.series,land_residential:land.series?.land_residential||[],land_commercial:land.series?.land_commercial||[]}});if(!region&&regionList.length){const preferred=regionList.find(r=>/مرکز\s*شهر/.test(r.name))||regionList[0];setRegion(preferred.slug)}}}).catch(()=>{if(live)setError('دریافت نمودارهای قیمت انجام نشد.')});return()=>{live=false}},[source,region]);
 const regions=result?.regions||[];
 const landPoints=result?.series[usage]||[];
 if(compact){
  const cards=[
   {key:'land_residential',title:`زمین مسکونی · ${regions.find(r=>r.slug===region)?.name||'اوز'}`,unit:'تومان برای هر متر زمین',points:result?.series.land_residential||[],color:'#1766a7',icon:'⌖'},
   {key:'house_new',title:'خانهٔ ویلایی نوساز · کل اوز',unit:'تومان برای هر متر زیربنا',points:result?.series.house_new||[],color:'#12a781',icon:'⌂'},
   {key:'mehr_upper',title:'مسکن مهر · طبقهٔ بالا',unit:'تومان برای کل واحد',points:result?.series.mehr_upper||[],color:'#8a63b6',icon:'▦'},
  ];
  return <section className="home-index-dashboard" dir="rtl"><div className="home-index-heading"><div className="home-index-heading-copy"><span className="home-index-symbol" aria-hidden="true">▥</span><div><h2>شاخص قیمت املاک در اوز</h2><p>روند تغییرات بر اساس داده‌های ثبت‌شده</p></div></div><button type="button" className="home-index-details" onClick={onViewDetails}>مشاهدهٔ جزئیات شاخص <span aria-hidden="true">←</span></button></div>{error?<p className="home-index-error" role="alert">{error}</p>:<div className="home-index-grid">{cards.map(card=>{const latest=card.points[card.points.length-1];const change=changeInfo(card.points);return <article className="home-index-card" key={card.key}><div className="home-index-card-icon" style={{color:card.color}} aria-hidden="true">{card.icon}</div><div className="home-index-card-content"><div className="home-index-card-top"><h3>{card.title}</h3><span className={`home-index-change ${change.tone}`} title={change.detail}>{change.tone==='up'?'↑':change.tone==='down'?'↓':'·'} {change.label}</span></div>{latest?<><strong className="home-index-value">{fmt(Number(latest.value_toman))}</strong><small className="home-index-unit">{card.unit}</small><Sparkline points={card.points} color={card.color}/><div className="home-index-periods"><span>{card.points[0]?.period||''}</span><span>{latest.period}</span></div></>:<div className="home-index-no-data">هنوز داده‌ای برای نمایش ثبت نشده است.</div>}</div></article>})}</div>}<p className="home-index-footnote">قیمت‌های پیشنهادی آگهی‌ها با شاخص معاملات قطعی متفاوت‌اند؛ درصد تغییرات تنها با وجود حداقل دو دورهٔ معتبر محاسبه می‌شود.</p></section>;
 }
 return <div className="price-dashboard" dir="rtl">
 <div className="price-intro"><h2>روند قیمت ملک در اوز</h2><p>قیمت‌های معامله‌شده و برآورد ماهانهٔ خودمونی جدا نمایش داده می‌شوند. قیمت آگهی در این نمودارها محاسبه نمی‌شود.</p></div>
 <div className="price-controls"><label>منبع قیمت<select value={source} onChange={e=>setSource(e.target.value)}><option value="manual">برآورد ماهانهٔ خودمونی</option><option value="sales">معاملات ثبت‌شده</option></select></label></div>
 {error?<p role="alert" className="price-empty">{error}</p>:<div className="price-cards">
 <section className="price-chart-section"><div className="price-controls price-chart-controls"><label>منطقهٔ زمین<select value={region} onChange={e=>setRegion(e.target.value)}><option value="all">کل اوز</option>{regions.map(r=><option key={r.slug} value={r.slug}>{r.name}</option>)}</select></label><label>کاربری زمین<select value={usage} onChange={e=>setUsage(e.target.value)}><option value="land_residential">مسکونی</option><option value="land_commercial">تجاری</option></select></label></div>
 <Graph name={`${names[usage]} · ${regions.find(r=>r.slug===region)?.name||'کل اوز'}`} points={landPoints} color="#1766a7" unit="برای هر متر زمین" source={source}/>
 </section>
 <section className="price-chart-section"><div className="price-controls price-chart-controls"><label>نوع زیربنا<select value={homeType} onChange={e=>setHomeType(e.target.value)}><option value="house_new">خانهٔ ویلایی نوساز</option><option value="apartment">آپارتمان</option></select></label></div>
 <Graph name={`${names[homeType]} · کل اوز`} points={result?.series[homeType]||[]} color="#13a781" unit="برای هر متر زیربنا" source={source}/>
 </section>
 <section className="price-chart-section"><div className="price-controls price-chart-controls"><label>موقعیت طبقهٔ مسکن مهر<select value={mehrType} onChange={e=>setMehrType(e.target.value)}><option value="mehr_upper">طبقهٔ بالا</option><option value="mehr_lower">طبقهٔ پایین</option>{(result?.series.mehr||[]).length>0&&<option value="mehr">قدیمی بدون تفکیک طبقه</option>}</select></label></div>
 <Graph name={`${names[mehrType]} · کل اوز`} points={result?.series[mehrType]||[]} color="#8a63b6" unit="برای کل واحد" source={source}/>
 </section>
 </div>}
 <p className="price-method">هر نقطه در حالت معاملات، میانهٔ قیمت معاملات ثبت‌شده در همان ماه است. برای خانه فقط ویلایی نوساز حساب می‌شود؛ ملک بدون متراژ معتبر وارد قیمت هر متر نمی‌شود. ماه‌های بدون داده خالی می‌مانند.</p>
 </div>
}
