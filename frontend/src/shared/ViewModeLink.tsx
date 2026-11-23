import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import './view-mode.css';

export default function ViewModeLink({desktop,mobile}:{desktop:boolean;mobile:boolean}){
 const [menu,setMenu]=useState<HTMLElement|null>(null);

 useEffect(()=>{
  setMenu(mobile?document.querySelector<HTMLElement>('.mobile-site .nav-links'):null);
 },[mobile]);

 if(window.top!==window||(!desktop&&!mobile))return null;

 const link=<a
  className={desktop?'view-mode-link view-mode-return':'view-mode-link'}
  href={desktop?'?view=auto':'?view=desktop'}
  onClick={event=>{
   const url=new URL(window.location.href);
   url.searchParams.set('view',desktop?'auto':'desktop');
   event.currentTarget.href=url.href;
  }}
 >{desktop?'بازگشت به نمای موبایل':'نمای دسکتاپ'}</a>;

 return desktop?link:menu&&createPortal(link,menu);
}
