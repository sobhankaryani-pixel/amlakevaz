import {useEffect,useState} from 'react';
import {API,kindOf,type Page,type Property} from './propertyUI';
import {type SellerUser} from '../SellerAccount';
export function useSiteState(){
 const [page,setPage]=useState<Page>('home'),[items,setItems]=useState<Property[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[kind,setKind]=useState('all'),[region,setRegion]=useState('all'),[selected,setSelected]=useState<Property|null>(null),[menu,setMenu]=useState(false),[dark,setDark]=useState(false);
 const [sellerUser,setSellerUser]=useState<SellerUser|null>(null);
 useEffect(()=>{fetch(`${API}/api/seller/me`,{credentials:'include'}).then(r=>r.ok?r.json():null).then(d=>setSellerUser(d?.user||null)).catch(()=>{})},[]);
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light'},[dark]);
 useEffect(()=>{let live=true;fetch(`${API}/api/public/property-cards`).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(live)setItems(d.items||[])}).catch(()=>{if(live)setError('دریافت آگهی‌ها انجام نشد. کمی بعد دوباره امتحان کنید.')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 const regions=[...new Map(items.filter(p=>p.region_key).map(p=>[p.region_key,{slug:p.region_key!,name:p.region||p.region_key!}])).values()];
 const matching=items.filter(p=>(kind==='all'||kindOf(p)===kind)&&(region==='all'||p.region_key===region)&&(!query.trim()||`${p.region||''} ${p.neighborhood||''} ${p.property_type} ${p.public_code}`.toLocaleLowerCase('fa-IR').includes(query.trim().toLocaleLowerCase('fa-IR'))));
 const go=(next:Page)=>{setPage(next);setSelected(null);setMenu(false);window.scrollTo({top:0,behavior:'smooth'})};
 const search=(e:React.FormEvent)=>{e.preventDefault();go('listings')};

 return {page,setPage,items,loading,error,query,setQuery,kind,setKind,region,setRegion,selected,setSelected,menu,setMenu,dark,setDark,sellerUser,setSellerUser,regions,matching,go,search};
}
export type SiteState=ReturnType<typeof useSiteState>;
