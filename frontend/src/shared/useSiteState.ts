import {fetchWithTimeout as fetch} from './http';
import {useEffect,useLayoutEffect,useState} from 'react';
import {applyMetadata} from './seo';
import {pageMetadata} from './seoMetadata.js';
import {API,kindOf,type Page,type Property} from './propertyUI';
import {type SellerUser} from '../SellerAccount';
import {readRoute,navigate} from './navigation';
export function useSiteState(){
 const [route,setRoute]=useState(readRoute);
 const page=route.page,propertyCode=route.code,focusCode=route.focusCode;
 useEffect(()=>{const update=()=>{setRoute(readRoute());setMenu(false)};window.addEventListener('popstate',update);window.addEventListener('evaz:navigate',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('evaz:navigate',update)}},[]);
 const setPage=(next:Page)=>navigate(next);
 const [items,setItems]=useState<Property[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[kind,setKind]=useState('all'),[region,setRegion]=useState('all'),[menu,setMenu]=useState(false),[dark,setDark]=useState(false);
 const selected=null;
 const setSelected=(item:Property|null)=>{if(item)navigate('property',item.public_code);else navigate('listings')};
 const [reload,setReload]=useState(0);const retryListings=()=>setReload(v=>v+1);
 const [sellerUser,setSellerUser]=useState<SellerUser|null>(null);
 const [sessionLoading,setSessionLoading]=useState(true),[sessionError,setSessionError]=useState(''),[sessionRetry,setSessionRetry]=useState(0);
 const retrySession=()=>setSessionRetry(value=>value+1);
 useEffect(()=>{let live=true;const controller=new AbortController();setSessionLoading(true);setSessionError('');
  fetch(`${API}/api/seller/me`,{credentials:'include',signal:controller.signal}).then(async response=>{
   if(response.status===401)return null;
   if(!response.ok)throw Error('بررسی حساب کاربری انجام نشد. اتصال را بررسی و دوباره تلاش کنید.');
   const data=await response.json();if(!data||!('user' in data))throw Error('پاسخ حساب کاربری معتبر نیست.');return data.user;
  }).then(user=>{if(live)setSellerUser(user||null)}).catch(()=>{if(live)setSessionError('بررسی حساب کاربری انجام نشد. دوباره تلاش کنید.');}).finally(()=>{if(live)setSessionLoading(false)});
  return()=>{live=false;controller.abort()};
 },[sessionRetry]);
 useLayoutEffect(()=>{applyMetadata(pageMetadata(window.location.pathname))},[page,propertyCode]);
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light'},[dark]);
 useEffect(()=>{let live=true;setLoading(true);setError('');fetch(`${API}/api/public/property-cards`).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(live)setItems(d.items||[])}).catch(e=>{if(live)setError(e instanceof Error&&e.message?e.message:'دریافت آگهی‌ها انجام نشد. کمی بعد دوباره امتحان کنید.')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[reload]);
 const regions=[...new Map(items.filter(p=>p.region_key).map(p=>[p.region_key,{slug:p.region_key!,name:p.region||p.region_key!}])).values()];
 const matching=items.filter(p=>(kind==='all'||kindOf(p)===kind)&&(region==='all'||p.region_key===region)&&(!query.trim()||`${p.region||''} ${p.neighborhood||''} ${p.property_type} ${p.public_code}`.toLocaleLowerCase('fa-IR').includes(query.trim().toLocaleLowerCase('fa-IR'))));
 const go=(next:Page)=>{navigate(next);setMenu(false)};
 const search=(e:React.FormEvent)=>{e.preventDefault();go('listings')};

 return {sessionLoading,sessionError,retrySession,page,propertyCode,focusCode,retryListings,setPage,items,loading,error,query,setQuery,kind,setKind,region,setRegion,selected,setSelected,menu,setMenu,dark,setDark,sellerUser,setSellerUser,regions,matching,go,search};
}
export type SiteState=ReturnType<typeof useSiteState>;
