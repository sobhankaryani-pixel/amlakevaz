import {useEffect,useRef,useState} from 'react';
import './siteToast.css';
const EVENT='evaz:toast';
export function showSuccessToast(message:string){window.dispatchEvent(new CustomEvent(EVENT,{detail:message}))}
export default function SiteToast(){
 const [message,setMessage]=useState('');const timer=useRef<number|undefined>(undefined);
 useEffect(()=>{
  const show=(event:Event)=>{const text=(event as CustomEvent).detail;if(typeof text!=='string'||!text.trim())return;window.clearTimeout(timer.current);setMessage(text);timer.current=window.setTimeout(()=>setMessage(''),4500)};
  window.addEventListener(EVENT,show);return()=>{window.removeEventListener(EVENT,show);window.clearTimeout(timer.current)};
 },[]);
 return <div className="site-toast-region" role="status" aria-live="polite" aria-atomic="true">{message&&<div className="site-success-toast"><span aria-hidden="true">✓</span>{message}<button type="button" aria-label="بستن پیام" onClick={()=>setMessage('')}>×</button></div>}</div>;
}
