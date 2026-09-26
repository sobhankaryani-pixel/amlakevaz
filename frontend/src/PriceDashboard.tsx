import {useEffect,useState} from 'react';

type Point={period:string;value_toman:number;count:number|null};
type Result={regions:{name:string;slug:string}[];series:Record<string,Point[]>};
const API='https://api.evazmelk.ir';
const fmt=(value:number)=>Math.round(value).toLocaleString('fa-IR');
const names:Record<string,string>={land_residential:'زمین مسکونی',land_commercial:'زمین تجاری',house_new:'خانهٔ ویلایی نوساز',apartment:'آپارتمان',mehr:'مسکن مهر'};

function Graph({name,points,color,unit,source}:{name:string;points:Point[];color:string;unit:string;source:string}){
 const values=points.map(p=>Number(p.value_toman));
 const low=Math.min(...values),high=Math.max(...values),span=high-low||1;
 const positions=points.map((p,i)=>({x:points.length===1?300:45+i*510/(points.length-1),y:175-(Number(p.value_toman)-low)*125/span}));
 return <article className="price-card"><h3>{name}</h3>{points.length===0?<p className="price-empty">برای این انتخاب هنوز {source==='sales'?'معاملهٔ معتبر':'برآورد ماهانه'} ثبت نشده است.</p>:<>
 <strong>{fmt(values[values.length-1])} <small>تومان {unit}</small></strong>
 <svg viewBox="0 0 600 210" className="price-graph" role="img" aria-label={`روند ${name}`}><line x1="30" y1="185" x2="580" y2="185" stroke="currentColor" opacity=".2"/>
 {positions.length>1&&<polyline points={positions.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
 {positions.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="5" fill={color}><title>{points[i].period}: {fmt(values[i])} تومان{source==='sales'?` · ${points[i].count} معامله`:''}</title></circle>)}</svg>
 <div className="price-periods"><span>{points[0].period}</span><span>{points[points.length-1].period}</span></div>
 {source==='sales'&&<small className="price-samples">ماه آخر: {fmt(points[points.length-1].count||0)} معامله · میانهٔ قیمت</small>}
 </>}</article>
}

function HomesGraph({house,apartment,source}:{house:Point[];apartment:Point[];source:string}){
 const periods=[...new Set([...house,...apartment].map(p=>p.period))].sort();
 const values=[...house,...apartment].map(p=>Number(p.value_toman));
 const low=Math.min(...values),span=Math.max(...values)-low||1;
 const points=(items:Point[])=>items.map(p=>({x:periods.length===1?300:45+periods.indexOf(p.period)*510/(periods.length-1),y:175-(Number(p.value_toman)-low)*125/span,item:p}));
 return <article className="price-card"><h3>قیمت هر متر زیربنای خانهٔ نوساز و آپارتمان · کل اوز</h3><div className="price-legend"><span>● خانهٔ ویلایی نوساز: {house.length?fmt(house[house.length-1].value_toman):'بدون داده'}</span><span>● آپارتمان: {apartment.length?fmt(apartment[apartment.length-1].value_toman):'بدون داده'}</span></div>
 {!values.length?<p className="price-empty">برای این انتخاب هنوز {source==='sales'?'معاملهٔ معتبر':'برآورد ماهانه'} ثبت نشده است.</p>:<><svg viewBox="0 0 600 210" className="price-graph" role="img" aria-label="روند قیمت هر متر خانهٔ نوساز و آپارتمان"><line x1="30" y1="185" x2="580" y2="185" stroke="currentColor" opacity=".2"/>
 {([house,apartment] as Point[][]).map((items,index)=>{const coords=points(items),color=index?'#af7829':'#13a781';return <g key={index}>{coords.length>1&&<polyline points={coords.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth="3"/>}{coords.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="5" fill={color}><title>{index?'آپارتمان':'خانهٔ نوساز'} · {p.item.period}: {fmt(p.item.value_toman)} تومان/متر{source==='sales'?` · ${p.item.count} معامله`:''}</title></circle>)}</g>})}</svg><div className="price-periods"><span>{periods[0]}</span><span>{periods[periods.length-1]}</span></div></>}
 </article>
}

export default function PriceDashboard({compact=false}:{compact?:boolean}){
 const [source,setSource]=useState('manual'),[region,setRegion]=useState(''),[usage,setUsage]=useState('land_residential');
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;setError('');const get=(slug:string)=>fetch(`${API}/api/public/price-series?source=${source}&region=${slug}`).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<Result>});Promise.all([get(region||'all'),get('all')]).then(([land,overall])=>{if(live){setResult({regions:land.regions,series:{...overall.series,land_residential:land.series.land_residential,land_commercial:land.series.land_commercial}});if(!region&&land.regions.length)setRegion(land.regions[0].slug)}}).catch(()=>{if(live)setError('دریافت نمودارهای قیمت انجام نشد.')});return()=>{live=false}},[source,region]);
 const regions=result?.regions||[];
 const landPoints=region?result?.series[usage]||[]:[];
 return <div className={compact?'price-dashboard compact':'price-dashboard'} dir="rtl">
 <div className="price-intro"><h2>روند قیمت ملک در اوز</h2><p>قیمت‌های معامله‌شده و برآورد ماهانهٔ خودمونی جدا نمایش داده می‌شوند. قیمت آگهی در این نمودارها محاسبه نمی‌شود.</p></div>
 <div className="price-controls"><label>منبع قیمت<select value={source} onChange={e=>setSource(e.target.value)}><option value="manual">برآورد ماهانهٔ خودمونی</option><option value="sales">معاملات ثبت‌شده</option></select></label><label>منطقهٔ زمین<select value={region} onChange={e=>setRegion(e.target.value)}><option value="all">کل اوز</option>{regions.map(r=><option key={r.slug} value={r.slug}>{r.name}</option>)}</select></label><label>کاربری زمین<select value={usage} onChange={e=>setUsage(e.target.value)}><option value="land_residential">مسکونی</option><option value="land_commercial">تجاری</option></select></label></div>
 {error?<p role="alert" className="price-empty">{error}</p>:<div className="price-cards">
 <Graph name={`${names[usage]} · ${regions.find(r=>r.slug===region)?.name||'کل اوز'}`} points={landPoints} color="#1766a7" unit="برای هر متر زمین" source={source}/>
 <HomesGraph house={result?.series.house_new||[]} apartment={result?.series.apartment||[]} source={source}/>
 <Graph name={`${names.mehr} · کل اوز`} points={result?.series.mehr||[]} color="#8a63b6" unit="برای کل واحد" source={source}/>
 </div>}
 <p className="price-method">هر نقطه در حالت معاملات، میانهٔ قیمت معاملات ثبت‌شده در همان ماه است. برای خانه فقط ویلایی نوساز حساب می‌شود؛ ملک بدون متراژ معتبر وارد قیمت هر متر نمی‌شود. ماه‌های بدون داده خالی می‌مانند.</p>
 </div>
}
