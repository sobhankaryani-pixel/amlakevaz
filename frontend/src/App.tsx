import {useSyncExternalStore} from 'react';
import DesktopView from './desktop/DesktopView';
import MobileView from './mobile/MobileView';
import {useSiteState} from './shared/useSiteState';
import SiteToast from './shared/SiteToast';

// Keep this boundary aligned with the CSS entry point (900px).
const mobileQuery=window.matchMedia('(max-width: 900px)');
const subscribe=(notify:()=>void)=>{
 mobileQuery.addEventListener('change',notify);
 return ()=>mobileQuery.removeEventListener('change',notify);
};
export default function App(){
 const state=useSiteState();
 const mobile=useSyncExternalStore(subscribe,()=>mobileQuery.matches);
 return <><SiteToast/>{mobile?<MobileView {...state}/>:<DesktopView {...state}/>}</>;
}
