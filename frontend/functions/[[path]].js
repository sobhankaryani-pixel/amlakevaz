import {SITE,PAGES,escapeHtml,propertyPath,isoDate,pageMetadata,propertyMetadata,propertyFailureMetadata,injectMetadata} from '../src/shared/seoMetadata.js';
import {fetchWithTimeout} from '../src/shared/http.ts';
const API='https://api.evazmelk.ir';
export async function onRequest(context){
 const {request}=context,url=new URL(request.url),path=url.pathname.replace(/\/$/,'')||'/';
 const api=context.env.PUBLIC_API_BASE_URL||API;
 if(path==='/robots.txt')return new Response('User-agent: *\nAllow: /\nDisallow: /account\nSitemap: '+SITE+'/sitemap.xml\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}});
 if(path==='/sitemap.xml'){
  try{
   const r=await fetchWithTimeout(api+'/api/public/sitemap-data',{timeoutMs:8000});if(!r.ok)throw Error();const data=await r.json();
   const entries=[...Object.keys(PAGES).filter(p=>!['/account','/register'].includes(p)).map(p=>({path:p})),...data.items.map(p=>({path:propertyPath(p.public_code),updated:isoDate(p.updated_at)}))];
   return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries.map(p=>'<url><loc>'+escapeHtml(SITE+p.path)+'</loc>'+(p.updated?'<lastmod>'+escapeHtml(p.updated)+'</lastmod>':'')+'</url>').join('')+'</urlset>',{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public,max-age=300'}});
  }catch{return new Response('Sitemap temporarily unavailable',{status:503,headers:{'Retry-After':'60'}})}
 }
 if(!PAGES[path]&&!path.startsWith('/properties/'))return context.next();
 let metadata=pageMetadata(path),status=200,item=null;
 if(path.startsWith('/properties/')){
  let code;try{code=decodeURIComponent(path.slice(12))}catch{status=404;metadata=propertyFailureMetadata(path,404)}
  if(code!==undefined){
   try{
    const r=await fetchWithTimeout(api+'/api/public/property-detail?code='+encodeURIComponent(code),{timeoutMs:8000});
    if(r.status===404){status=404;metadata=propertyFailureMetadata(path,404)}
    else if(!r.ok)throw Error();
    else{item=(await r.json()).item;if(!item?.public_code||!item?.property_type)throw Error();metadata=propertyMetadata(item)}
   }catch{status=503;item=null;metadata=propertyFailureMetadata(path,503)}
  }
 }
 // Keep the original SPA assets and layout; only metadata and initial ad fallback change.
 const shell=await context.next();let html=injectMetadata(await shell.text(),metadata);
 if(item)html=html.replace('<div id="root"></div>','<div id="root"><article dir="rtl"><h1>'+escapeHtml(metadata.title)+'</h1><p>'+escapeHtml(metadata.description)+'</p><p>'+escapeHtml(item.public_notes||'')+'</p></article></div>');
 return new Response(html,{status,headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-store',...(status===503?{'Retry-After':'60'}:{})}});
}
