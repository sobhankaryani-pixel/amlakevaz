import {PAGES,SITE,escapeHtml,isoDate,propertyPath,propertyMetadata,propertyFailureMetadata,injectMetadata} from '../frontend/src/shared/seoMetadata.js';
import {API} from '../frontend/src/api.ts';
const API_ORIGIN=API;
function output(request,body,status=200,headers={}){
 return new Response(request.method==='HEAD'?null:body,{status,headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-store',...headers}});
}
async function asset(env,request,path){const url=new URL(request.url);url.pathname=path;url.search='';return env.ASSETS.fetch(new Request(url,{method:'GET'}))}
async function publicJson(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const result=await fetch(API_ORIGIN+path,{headers:{Accept:'application/json'},redirect:'error',signal:controller.signal});
  if(result.status===404)return {status:404};
  if(!result.ok)throw Error('backend_unavailable');
  if(Number(result.headers.get('Content-Length'))>2*1024*1024)throw Error('response_too_large');
  const text=await result.text();if(text.length>2*1024*1024)throw Error('response_too_large');
  return {status:200,data:JSON.parse(text)};
 }finally{clearTimeout(timer)}
}
async function listing(request,env,path){
 const shellResponse=await asset(env,request,'/seo-shell');
 if(!shellResponse.ok)return output(request,'دریافت صفحه موقتاً ممکن نیست.',503,{'Retry-After':'60','X-Robots-Tag':'noindex, follow'});
 const shell=await shellResponse.text();let code;
 try{code=decodeURIComponent(path.slice('/properties/'.length));if(!code||code.length>120)throw Error('invalid_code')}
 catch{return output(request,injectMetadata(shell,propertyFailureMetadata(path,404)),404,{'X-Robots-Tag':'noindex, follow'})}
 try{
  const result=await publicJson('/api/public/property-detail?code='+encodeURIComponent(code));
  if(result.status===404)return output(request,injectMetadata(shell,propertyFailureMetadata(propertyPath(code),404)),404,{'X-Robots-Tag':'noindex, follow'});
  const item=result.data?.item;if(!item||String(item.public_code)!==code||typeof item.property_type!=='string'||!Number.isFinite(Number(item.asking_price_toman)))throw Error('invalid_property');
  return output(request,injectMetadata(shell,propertyMetadata(item)));
 }catch{return output(request,injectMetadata(shell,propertyFailureMetadata(propertyPath(code),503)),503,{'Retry-After':'60','X-Robots-Tag':'noindex, follow'})}
}
async function sitemap(request){
 try{
  const result=await publicJson('/api/public/sitemap-data');if(result.status!==200||!Array.isArray(result.data?.items))throw Error('invalid_sitemap');
  const paths=Object.keys(PAGES).filter(path=>!['/account','/register','/agency'].includes(path));
  const entries=paths.map(path=>({url:SITE+path}));const seen=new Set();
  for(const item of result.data.items){const code=item.public_code;if(typeof code!=='string'||!code||code.length>120)throw Error('invalid_code');if(seen.has(code))continue;seen.add(code);entries.push({url:SITE+propertyPath(code),updated:isoDate(item.updated_at)})}
  const xml='<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries.map(item=>'<url><loc>'+escapeHtml(item.url)+'</loc>'+(item.updated?'<lastmod>'+escapeHtml(item.updated)+'</lastmod>':'')+'</url>').join('')+'</urlset>';
  return output(request,xml,200,{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'});
 }catch{return output(request,'Sitemap temporarily unavailable',503,{'Content-Type':'text/plain; charset=utf-8','Retry-After':'60','X-Robots-Tag':'noindex, follow'})}
}
export default {
 async fetch(request,env){
  if(!['GET','HEAD'].includes(request.method))return output(request,'Method not allowed',405,{Allow:'GET, HEAD'});
  const url=new URL(request.url),path=url.pathname;
  if(path==='/sitemap.xml')return sitemap(request);
  if(path.startsWith('/properties/'))return listing(request,env,path.replace(/\/$/,''));
  if(path==='/mobile-preview'||path==='/mobile-preview/'){
   const r=await asset(env,request,'/mobile-preview');return output(request,await r.text(),r.status,{'X-Robots-Tag':'noindex, nofollow'});
  }
  if(path==='/management')return Response.redirect(url.origin+'/management/',308);
  if(path.startsWith('/management/')){
   const original=await env.ASSETS.fetch(request);const notHtml=/\.[a-z0-9]{1,8}$/i.test(path);
   const response=original.status===404&&!notHtml?await asset(env,request,'/management/'):original;
   const headers=new Headers(response.headers);headers.set('X-Robots-Tag','noindex, nofollow');headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');
   return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
  }
  return env.ASSETS.fetch(request);
 }
};
