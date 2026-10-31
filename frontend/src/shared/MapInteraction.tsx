import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import './mapInteraction.css';
const QUERY='(max-width:900px), (pointer:coarse)';
const HANDLERS=['dragging','touchZoom','scrollWheelZoom','doubleClickZoom','boxZoom','keyboard'];
export default function MapInteraction({map,ready,blocked=false,children}:{map:any;ready:boolean;blocked?:boolean;children:ReactNode}){
 const wrap=useRef<HTMLDivElement>(null),activate=useRef(()=>{}),lock=useRef(()=>{});
 const [mobile,setMobile]=useState(()=>window.matchMedia(QUERY).matches),[active,setActive]=useState(false);
 const gesture=useRef<{x:number;y:number;moved:boolean}|null>(null);
 useLayoutEffect(()=>{
  if(!map||!ready)return;
  const query=window.matchMedia(QUERY);
  const states=HANDLERS.map(key=>({handler:map[key],enabled:Boolean(map[key]?.enabled?.())}));
  const restore=()=>states.forEach(({handler,enabled})=>{try{enabled?handler?.enable():handler?.disable()}catch{}});
  const disable=()=>states.forEach(({handler})=>handler?.disable());
  lock.current=()=>{if(query.matches){disable();setActive(false)}};
  activate.current=()=>{if(query.matches){restore();setActive(true)}};
  const change=()=>{setMobile(query.matches);setActive(false);query.matches?disable():restore()};change();
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{if(!entries[0]?.isIntersecting)lock.current()},{threshold:0}):null;
  if(wrap.current)observer?.observe(wrap.current);
  const visibility=()=>{if(document.visibilityState==='hidden')lock.current()};
  document.addEventListener('visibilitychange',visibility);query.addEventListener('change',change);
  return()=>{observer?.disconnect();document.removeEventListener('visibilitychange',visibility);query.removeEventListener('change',change);restore();activate.current=()=>{};lock.current=()=>{}};
 },[map,ready]);
 useLayoutEffect(()=>{if(blocked)lock.current()},[blocked]);
 const controls=mobile&&ready&&!blocked;
 return <div ref={wrap} className={`map-wrap map-interaction${mobile&&!active?' map-interaction-locked':''}${mobile&&active?' map-interaction-active':''}`} onKeyDown={e=>{if(e.key==='Escape')lock.current()}}>
  {children}
  {controls&&(active?<><div className="map-control-status" role="status">کنترل نقشه فعال است</div><button type="button" className="map-control-exit" aria-label="خروج از کنترل نقشه و بازگشت به اسکرول صفحه" title="خروج از کنترل نقشه" onClick={()=>lock.current()}>×</button></>:<button type="button" className="map-control-cover" aria-label="برای کنترل نقشه، ضربه بزنید" onPointerDown={e=>{gesture.current={x:e.clientX,y:e.clientY,moved:false}}} onPointerMove={e=>{const start=gesture.current;if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)start.moved=true}} onPointerCancel={()=>{if(gesture.current)gesture.current.moved=true}} onClick={e=>{if(e.detail===0||!gesture.current?.moved)activate.current();gesture.current=null}}><span className="map-control-hint"><span aria-hidden="true" className="map-control-symbol">⌖</span><span><strong>برای کنترل نقشه، ضربه بزنید</strong><small>فعلاً می‌توانید صفحه را بالا و پایین ببرید</small></span></span></button>)}
 </div>;
}
