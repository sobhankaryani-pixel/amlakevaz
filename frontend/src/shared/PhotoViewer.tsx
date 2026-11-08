import {useEffect,useRef} from 'react';
import {mediaUrl} from './mediaOrigin';
import './photo-viewer.css';
type Props={images:{url:string}[];active:number;onChange:(index:number)=>void;onClose:()=>void;code:string};
export default function PhotoViewer({images,active,onChange,onClose,code}:Props){
 const dialog=useRef<HTMLDialogElement>(null),start=useRef<{x:number;y:number}|null>(null);
 useEffect(()=>{const el=dialog.current;if(!el)return;const old=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;if(el.open)el.close()}},[]);
 const step=(delta:number)=>onChange((active+delta+images.length)%images.length);
 return <dialog className="photo-viewer" ref={dialog} aria-label={`گالری عکس ملک ${code}`} onCancel={e=>{e.preventDefault();onClose()}} onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();step(1)}if(e.key==='ArrowLeft'){e.preventDefault();step(-1)}}}><div className="photo-viewer-tools"><button type="button" autoFocus onClick={onClose} aria-label="بستن گالری">بستن ×</button><span role="status">عکس {(active+1).toLocaleString('fa-IR')} از {images.length.toLocaleString('fa-IR')}</span></div><div className="photo-viewer-stage" onTouchStart={e=>{const t=e.touches[0];start.current=e.touches.length===1?{x:t.clientX,y:t.clientY}:null}} onTouchEnd={e=>{const old=start.current;start.current=null;const t=e.changedTouches[0];if(old&&t&&Math.abs(t.clientX-old.x)>50&&Math.abs(t.clientX-old.x)>Math.abs(t.clientY-old.y))step(t.clientX<old.x?1:-1)}}><img src={mediaUrl(images[active].url)} alt={`عکس ${(active+1).toLocaleString('fa-IR')} ملک ${code}`}/></div>{images.length>1&&<div className="photo-viewer-navigation"><button type="button" onClick={()=>step(-1)}>عکس قبلی</button><button type="button" onClick={()=>step(1)}>عکس بعدی</button></div>}</dialog>;
}
