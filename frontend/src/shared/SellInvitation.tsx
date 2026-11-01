import {useEffect,useRef,useState} from 'react';
import {navigate} from './navigation';
import './sellInvitation.css';
const EVENT='evaz:sell-invitation';
export function inviteAfterProfile(userId:string){window.dispatchEvent(new CustomEvent(EVENT,{detail:userId}))}
export default function SellInvitation({page,userId}:{page:string;userId?:string}){
 const [pending,setPending]=useState<string|null>(null);const dialog=useRef<HTMLDialogElement>(null);
 const visible=page==='home'&&Boolean(userId)&&pending===userId;
 useEffect(()=>{const receive=(e:Event)=>{const id=(e as CustomEvent).detail;if(typeof id==='string'&&id)setPending(id)};window.addEventListener(EVENT,receive);return()=>window.removeEventListener(EVENT,receive)},[]);
 useEffect(()=>{if(page!=='home'||!userId)setPending(null)},[page,userId]);
 useEffect(()=>{const element=dialog.current;if(visible&&element&&!element.open)element.showModal();return()=>{if(element?.open)element.close()}},[visible]);
 const dismiss=()=>setPending(null);
 return <dialog ref={dialog} className="sell-invitation" aria-labelledby="sell-invitation-title" onCancel={e=>{e.preventDefault();dismiss()}} dir="rtl">
 <div className="sell-invitation-icon" aria-hidden="true">⌂</div><h2 id="sell-invitation-title">اگر ملکی برای فروش دارید آن را ثبت کنید</h2>
 <div className="sell-invitation-actions"><button type="button" className="sell-invitation-register" onClick={()=>{dismiss();navigate('register')}}>ثبت ملک</button><button type="button" className="sell-invitation-dismiss" onClick={dismiss} autoFocus>فعلاً نه</button></div>
 </dialog>;
}
