import {fetchWithTimeout as fetch} from './http';
import {useEffect,useState} from 'react';
import {API} from './api';
let session:Promise<void>|null=null,lastSession=0,lastToken='';
function adminSession(token:string){if(!session||lastToken!==token||Date.now()-lastSession>240000){lastToken=token;lastSession=Date.now();session=fetch(API+'/api/admin/media/session',{method:'POST',credentials:'include',headers:{Authorization:'Bearer '+token}}).then(r=>{if(!r.ok)throw Error('پیش‌نمایش فایل مجاز نیست')}).catch(e=>{session=null;throw e})}return session}
export async function clearPrivateMediaSession(){const pending=session;session=null;lastSession=0;lastToken='';try{await pending}catch{}try{await fetch(API+'/api/admin/media/session',{method:'DELETE',credentials:'include'})}catch{}}
export default function PrivateMedia({url,kind,label,audience='seller',token}:{url:string;kind:string;label:string;audience?:'seller'|'agency'|'admin';token?:string}){
 const [src,setSrc]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let live=true;setSrc('');setError('');async function load(){try{const u=new URL(url);if(!['https://api.evazmelk.ir','https://backend.evazmelk.ir',new URL(API).origin].includes(u.origin)||!/^\/api\/public\/media\/[0-9a-f-]+\.(webp|jpg|png|mp4|webm)$/.test(u.pathname)){if(live)setSrc(url);return}if(audience==='admin'){if(!token)throw Error('ابتدا وارد شوید');await adminSession(token)}if(live)setSrc(API+'/api/'+audience+'/media/view/'+u.pathname.split('/').pop())}catch{if(live)setError('پیش‌نمایش در دسترس نیست؛ ورود و اتصال را بررسی کنید.')}}void load();const timer=setInterval(()=>void load(),240000);return()=>{live=false;clearInterval(timer)}},[url,audience,token]);
 if(error)return <span role="status">{error}</span>;if(!src)return <span role="status">در حال دریافت پیش‌نمایش…</span>;
 return kind==='image'?<a href={src} target="_blank" rel="noopener noreferrer" title="مشاهدهٔ عکس کامل"><img src={src} alt={label}/></a>:<video src={src} controls playsInline preload="metadata" aria-label={label}/>;
}
