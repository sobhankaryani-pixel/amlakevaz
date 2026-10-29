import {useEffect,useRef,useState} from 'react';
import {navigate} from './shared/navigation';
import type {Property} from './shared/propertyUI';
import {isLand,isHouse,markerLabel,markerTone,validLocation} from './shared/mapPresentation';
const API='https://api.evazmelk.ir';
const KEY=import.meta.env.VITE_NESHAN_MAP_KEY as string|undefined;
const EVaz={lat:27.7600,lng:54.0073};
type Listing={public_code:string;property_code:string;property_type:string;category:string;region:string|null;area_m2:number|null;building_area_m2:number|null;latitude:number;longitude:number;asking_price_toman:number;usage_type:string|null;land_length_m:number|null;land_width_m:number|null;mehr_section:string|null;mehr_level:string|null;house_condition:string|null;bedrooms:number|null;floor_count:number|null;commercial_area_m2:number|null;national_phase:string|null;national_block:string|null;national_level:string|null;national_stage:string|null;cover_photo_url?:string|null;neighborhood?:string|null;public_notes?:string|null;build_year?:number|null;street_width?:number|null;street_frontage_m?:number|null;floor?:number|null};
declare global {interface Window {L:any;__evazNeshanPromise?:Promise<any>}}
function loadNeshan(){if(window.L?.Map)return Promise.resolve(window.L);if(window.__evazNeshanPromise)return window.__evazNeshanPromise;const base='https://static.neshan.org/sdk/leaflet/v1.9.4/neshan-sdk/v1.0.8/';window.__evazNeshanPromise=new Promise((resolve,reject)=>{if(!document.querySelector('link[data-evaz-neshan]')){const css=document.createElement('link');css.rel='stylesheet';css.href=base+'index.css';css.dataset.evazNeshan='';document.head.appendChild(css)}const script=document.createElement('script');script.src=base+'index.js';script.async=true;script.onload=()=>window.L?.Map?resolve(window.L):reject(Error('نقشهٔ نشان بارگذاری نشد.'));script.onerror=()=>reject(Error('ارتباط با نقشهٔ نشان برقرار نشد.'));document.head.appendChild(script)}).catch(e=>{window.__evazNeshanPromise=undefined;throw e});return window.__evazNeshanPromise}

const fmt=(n:number)=>Number(n).toLocaleString('fa-IR');
export default function PropertyMap({focusCode='',onOpen}:{focusCode?:string;onOpen?:(item:Property)=>void}){
 const host=useRef<HTMLDivElement>(null),mapRef=useRef<any>(null),markers=useRef<any[]>([]);
 const [items,setItems]=useState<Listing[]>([]),[filter,setFilter]=useState('همه'),[retry,setRetry]=useState(0),[dataError,setDataError]=useState(''),[mapError,setMapError]=useState(''),[loading,setLoading]=useState(true),[ready,setReady]=useState(false);
 useEffect(()=>{let active=true;let controller:AbortController|undefined;const refresh=()=>{controller?.abort();controller=new AbortController();fetch(API+'/api/public/map-listings',{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(active){setItems((d.items||[]).filter(validLocation));setDataError('')}}).catch(e=>{if(active&&e.name!=='AbortError')setDataError('دریافت آگهی‌ها انجام نشد؛ دوباره تلاش کنید.')}).finally(()=>{if(active)setLoading(false)})};setLoading(true);refresh();return()=>{active=false;controller?.abort()}},[retry]);
 useEffect(()=>{if(!KEY){setMapError('کلید نقشهٔ نشان برای سایت تنظیم نشده است.');return}let active=true;loadNeshan().then(L=>{if(!active||!host.current)return;mapRef.current=new L.Map(host.current,{key:KEY,maptype:'dreamy',center:[EVaz.lat,EVaz.lng],zoom:14});setReady(true)}).catch(e=>{if(active)setMapError(e.message)});return()=>{active=false;markers.current.forEach(m=>m.remove());markers.current=[];mapRef.current?.remove();mapRef.current=null}},[]);
 const shown=items.filter(p=>filter==='همه'||(filter==='زمین'?isLand(p):isHouse(p)));
 useEffect(()=>{if(!ready||!mapRef.current)return;const L=window.L;markers.current.forEach(m=>m.remove());markers.current=[];
 for(const p of items.filter(p=>filter==='همه'||(filter==='زمین'?isLand(p):isHouse(p)))){
 const pin=document.createElement('span');pin.className=`evaz-map-pin tone-${markerTone(p.public_code)}${p.public_code===focusCode?' focused-property':''}`;
 const balloon=document.createElement('span');balloon.className='evaz-map-balloon';balloon.textContent=markerLabel(p);
 const dot=document.createElement('span');dot.className='evaz-map-dot';pin.append(balloon,dot);
 const label=`${p.property_type}، ${markerLabel(p)}، نمایش مشخصات ملک ${p.public_code}`;
 const icon=L.divIcon({html:pin,className:'evaz-map-marker',iconSize:[144,64],iconAnchor:[72,56]});
 const marker=L.marker([Number(p.latitude),Number(p.longitude)],{icon,title:label,alt:label,keyboard:true,riseOnHover:true}).addTo(mapRef.current).on('click',()=>onOpen?onOpen(p as unknown as Property):navigate('property',p.public_code));markers.current.push(marker);
 }
 const target=items.find(p=>p.public_code===focusCode);if(target)mapRef.current.setView([Number(target.latitude),Number(target.longitude)],17);
 },[items,filter,ready,focusCode,onOpen]);
 return <div className="map-page red-property-map"><div className="map-toolbar"><div><h2>املاک روی نقشهٔ اوز</h2><p>روی متراژ زمین یا قیمت خانه بزنید تا مشخصات آن را ببینید.</p></div><div className="map-filters" aria-label="فیلتر نوع ملک">{['همه','زمین','خانه'].map(x=><button type="button" key={x} aria-pressed={filter===x} className={filter===x?'active':''} onClick={()=>{setFilter(x)}}>{x}</button>)}</div></div><div className="map-wrap"><div className="property-map" ref={host} role="region" aria-label="نقشه آگهی‌های املاک اوز"/>{(mapError||dataError)&&<div className="map-error" role="alert">{mapError||dataError}<button type="button" onClick={()=>{if(mapError)location.reload();else setRetry(v=>v+1)}}>تلاش مجدد</button></div>}{!mapError&&!dataError&&(loading||!ready)&&<div className="map-empty" role="status">در حال دریافت نقشه و آگهی‌ها…</div>}{!loading&&ready&&!mapError&&!dataError&&shown.length===0&&<div className="map-empty">برای این انتخاب هنوز آگهیِ دارای موقعیت ثبت نشده است.</div>}</div><p className="map-count">{fmt(shown.length)} آگهی روی نقشه · زمین: متراژ، خانه: قیمت</p>{focusCode&&!loading&&!items.some(p=>p.public_code===focusCode)&&<p role="status">موقعیت این ملک در دسترس نیست یا آگهی دیگر فعال نیست.</p>}</div>
}
