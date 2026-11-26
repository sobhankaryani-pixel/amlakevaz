import {useEffect,useState} from 'react';
import {API} from '../api';
import {fetchWithTimeout} from './http';
import {pointMonth,windowChange} from './marketWindow';
import './regional-land-prices.css';

type Segment='land_residential'|'land_commercial';
type Estimate={name:string;slug:string;period:string|null;value_toman:number|null};
const format=(value:number)=>value.toLocaleString('fa-IR',{maximumFractionDigits:0});

export function rankRegionalPrices(items:Estimate[]){
 const grouped=new Map<string,Estimate[]>();
 for(const item of items){
  const group=grouped.get(item.slug);
  if(group)group.push(item);
  else grouped.set(item.slug,[item]);
 }
 return Array.from(grouped.values(), estimates=>{
  const ordered=estimates.filter(item=>item.period&&pointMonth(item.period)>0&&Number(item.value_toman)>0)
   .sort((a,b)=>b.period!.localeCompare(a.period!));
  const latest=ordered[0];
  const baseline=latest&&ordered.find(item=>pointMonth(latest.period!)-pointMonth(item.period!)===3);
  const points=latest&&baseline?[baseline,latest].map(item=>({period:item.period!,value_toman:Number(item.value_toman),count:null})):[];
  const growth=baseline?(Number(latest.value_toman)/Number(baseline.value_toman)-1)*100:null;
  return {name:estimates[0].name,slug:estimates[0].slug,latest,growth,change:windowChange(points)};
 }).sort((a,b)=>(b.growth??-Infinity)-(a.growth??-Infinity)||a.name.localeCompare(b.name,'fa'));
}

export default function RegionalLandPrices({segment}:{segment:Segment}){
 const [items,setItems]=useState<Estimate[]|null>(null);
 const [error,setError]=useState(false);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  setItems(null);
  setError(false);
  fetchWithTimeout(`${API}/api/public/regional-land-prices?segment=${segment}`,{signal:controller.signal})
   .then(response=>{if(!response.ok)throw Error();return response.json() as Promise<{items:Estimate[]}>})
   .then(result=>{if(!controller.signal.aborted)setItems(result.items)})
   .catch(()=>{if(!controller.signal.aborted)setError(true)});
  return ()=>controller.abort();
 },[segment,attempt]);
 const rows=rankRegionalPrices(items||[]);
 const middle=Math.ceil(rows.length/2);
 const groups=rows.length>1?[rows.slice(0,middle),rows.slice(middle)]:[rows];

 return <section className="regional-prices" aria-labelledby="regional-prices-title">
  <header><h2 id="regional-prices-title">قیمت فعلی زمین در مناطق اوز</h2><p>آخرین قیمت اعلام‌شدهٔ {segment==='land_residential'?'زمین مسکونی':'زمین تجاری'} برای هر متر مربع</p></header>
  {error?<p role="alert">دریافت قیمت مناطق انجام نشد. <button type="button" onClick={()=>setAttempt(value=>value+1)}>تلاش مجدد</button></p>
   :!items?<p role="status">در حال دریافت قیمت مناطق…</p>
   :!rows.length?<p>هنوز منطقه‌ای برای نمایش ثبت نشده است.</p>
   :<div className="regional-price-tables">{groups.map((group,index)=><table key={index} aria-label={`قیمت مناطق، بخش ${index+1}`}>
    <thead><tr><th scope="col">منطقه</th><th scope="col">قیمت هر متر مربع</th><th scope="col" aria-sort="descending">رشد سه‌ماهه ↓</th></tr></thead>
    <tbody>{group.map(({slug,name,latest,change})=><tr key={slug}>
     <th scope="row">{name}</th>
     <td>{latest?<><strong>{format(Number(latest.value_toman))}</strong> <small>تومان</small><time dir="ltr">{latest.period}</time></>:<small>ثبت نشده</small>}</td>
     <td><span className={`regional-growth ${change.tone}`}>
      {change.tone==='none'?'دادهٔ ناکافی':change.tone==='flat'?'۰٪ · ثابت':<><span aria-hidden="true">{change.tone==='up'?'↗':'↘'}</span> <b dir="ltr">{change.label}</b></>}
     </span></td>
    </tr>)}</tbody>
   </table>)}</div>}
  <p className="regional-price-note">رشد از مقایسهٔ آخرین قیمت هر منطقه با قیمت دقیقاً سه ماه قبل محاسبه می‌شود.</p>
 </section>;
}
