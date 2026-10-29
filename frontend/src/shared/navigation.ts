import type {Page} from './propertyUI';
const paths:Record<Page,string>={home:'/',listings:'/search',map:'/map',index:'/index',areas:'/areas',register:'/register',account:'/account',about:'/about',contact:'/contact',property:'/properties'};
export function propertyPath(code:string){return '/properties/'+encodeURIComponent(code)}
export function readRoute(){
 const url=new URL(window.location.href),path=url.pathname.replace(/\/$/,'')||'/';
 let code='';try{if(path.startsWith('/properties/'))code=decodeURIComponent(path.slice(12))}catch{}
 const page:Page=code?'property':(Object.entries(paths).find(([,p])=>p===path)?.[0] as Page)||'home';
 return {page,code,focusCode:page==='map'?url.searchParams.get('property')||'':''};
}
export function navigate(page:Page,code=''){
 const path=page==='property'?propertyPath(code):page==='map'&&code?'/map?property='+encodeURIComponent(code):paths[page];
 if(window.location.pathname+window.location.search!==path)window.history.pushState({evaz:true},'',path);
 window.dispatchEvent(new Event('evaz:navigate'));
 window.scrollTo({top:0,behavior:'smooth'});
}

export function navigateSearchRegions(regions:string[]){
 const query=new URLSearchParams();regions.forEach(r=>query.append('region',r));
 history.pushState({evaz:true},'','/search?'+query);window.dispatchEvent(new Event('evaz:navigate'));window.scrollTo({top:0});
}
