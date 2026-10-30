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
 useEffect(()=>{fetch(`${API}/api/seller/me`,{credentials:'include'}).then(r=>r.ok?r.json():null).then(d=>setSellerUser(d?.user||null)).catch(()=>{})},[]);
 useLayoutEffect(()=>{applyMetadata(pageMetadata(window.location.pathname))},[page,propertyCode]);
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light'},[dark]);
 useEffect(()=>{let live=true;setLoading(true);setError('');fetch(`${API}/api/public/property-cards`).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(live)setItems(d.items||[])}).catch(e=>{if(live)setError(e instanceof Error&&e.message?e.message:'دریافت آگهی‌ها انجام نشد. کمی بعد دوباره امتحان کنید.')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[reload]);
 const regions=[...new Map(items.filter(p=>p.region_key).map(p=>[p.region_key,{slug:p.region_key!,name:p.region||p.region_key!}])).values()];
 const matching=items.filter(p=>(kind==='all'||kindOf(p)===kind)&&(region==='all'||p.region_key===region)&&(!query.trim()||`${p.region||''} ${p.neighborhood||''} ${p.property_type} ${p.public_code}`.toLocaleLowerCase('fa-IR').includes(query.trim().toLocaleLowerCase('fa-IR'))));
 const go=(next:Page)=>{navigate(next);setMenu(false)};
 const search=(e:React.FormEvent)=>{e.preventDefault();go('listings')};

 return {page,propertyCode,focusCode,retryListings,setPage,items,loading,error,query,setQuery,kind,setKind,region,setRegion,selected,setSelected,menu,setMenu,dark,setDark,sellerUser,setSellerUser,regions,matching,go,search};
}
export type SiteState=ReturnType<typeof useSiteState>;
