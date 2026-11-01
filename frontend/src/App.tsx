import {useSyncExternalStore,lazy,Suspense} from 'react';
const AgencyPanel=lazy(()=>import('./AgencyPanel')); 
import DesktopView from './desktop/DesktopView';
import MobileView from './mobile/MobileView';
import {useSiteState} from './shared/useSiteState';
import SiteToast from './shared/SiteToast';
import SellInvitation from './shared/SellInvitation';

// Keep this boundary aligned with the CSS entry point (900px).
const mobileQuery=window.matchMedia('(max-width: 900px)');
const subscribe=(notify:()=>void)=>{
 mobileQuery.addEventListener('change',notify);
 return ()=>mobileQuery.removeEventListener('change',notify);
};
export default function App(){
 const state=useSiteState();
 const mobile=useSyncExternalStore(subscribe,()=>mobileQuery.matches);
 if(state.page==='agency')return <Suspense fallback={<p role="status" dir="rtl">در حال باز کردن پنل بنگاه…</p>}><AgencyPanel/></Suspense>;
 return <><SiteToast/><SellInvitation page={state.page} userId={state.sellerUser?.id}/>{mobile?<MobileView {...state}/>:<DesktopView {...state}/>}</>;
}
