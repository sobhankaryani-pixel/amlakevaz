export type HeaderIconName='home'|'listings'|'map'|'index'|'areas'|'search'|'account'|'plus'|'sun'|'moon';
export default function HeaderIcon({name}:{name:HeaderIconName}){
 return <svg className="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
 {name==='home'&&<><path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9"/></>}
 {name==='listings'&&<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h3"/></>}
 {name==='map'&&<><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16"/></>}
 {name==='index'&&<><path d="M4 20h16M6 16v-4M12 16V8M18 16V4"/></>}
 {name==='areas'&&<><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></>}
 {name==='search'&&<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>}
 {name==='account'&&<><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2H4Z"/></>}
 {name==='plus'&&<path d="M12 5v14M5 12h14"/>}
 {name==='sun'&&<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></>}
 {name==='moon'&&<path d="M20.5 15.3A8.5 8.5 0 0 1 8.7 3.5 8.5 8.5 0 1 0 20.5 15.3Z"/>}
 </svg>;
}
