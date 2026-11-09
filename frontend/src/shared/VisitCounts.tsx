import EyeIcon from './EyeIcon';
import {useEffect,useState} from 'react';
import {API} from '../api';
import {fetchWithTimeout as fetch} from './http';
import './visit-counts.css';
export default function VisitCounts({code}:{code?:string}){
 const [data,setData]=useState<any>(null);
 useEffect(()=>{const controller=new AbortController();let live=true;const load=()=>fetch(API+'/api/public/visit-counts'+(code?'?code='+encodeURIComponent(code):''),{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(live)setData(d)}).catch(()=>{});void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},60000);return()=>{live=false;controller.abort();clearInterval(timer)}},[code]);
 if(code)return data?<small className="listing-view-count"><EyeIcon/> {Number(data.property_views||0).toLocaleString('fa-IR')} بازدید ثبت‌شده</small>:null;
 return <section className="visit-counts" aria-label="آمار بازدید سایت"><div>{[['today','بازدید امروز'],['week','بازدید این هفته'],['month','بازدید این ماه']].map(([key,label])=><span key={key}><b>{data?Number(data.display[key]).toLocaleString('fa-IR'):'—'}</b>{label}</span>)}</div><small>با احتساب آمار پایه؛ هر نشست در هر روز یک بازدید ثبت می‌شود.</small></section>
}
