import test from 'node:test';
import assert from 'node:assert/strict';
import {SITE,DEFAULT_IMAGE,PAGES,pageMetadata,propertyMetadata,propertyFailureMetadata,injectMetadata,canonicalPath} from '../src/shared/seoMetadata.js';
import {onRequest} from '../functions/[[path]].js';
const item={public_code:'EV/101',property_type:'خانه',region:'اوز',asking_price_toman:15555000000,updated_at:'2026-10-29T12:00:00Z',media:[{kind:'image',url:'https://api.evazmelk.ir/api/public/media/a.webp'}]};
const shell='<html><head><title>old</title><meta content="old" name="description"><meta property="og:title" content="old"><meta name="robots" content="noindex"><link href="https://old.invalid" rel="canonical"><script type="application/ld+json">{"@type":"RealEstateListing","name":"old"}</script></head><body><div id="root"></div></body></html>';
const context=path=>({request:new Request(SITE+path),env:{},next:async()=>new Response(shell,{headers:{'Content-Type':'text/html'}})});

test('every route has a distinct description and canonical without search parameters',()=>{
 for(const path of Object.keys(PAGES)){
  const data=pageMetadata(path+'?utm_source=test#fragment');assert.equal(data.url,SITE+path);assert.ok(data.title);assert.ok(data.description);assert.equal(data.image,DEFAULT_IMAGE);assert.equal(data.structured,null);
 }
 assert.equal(pageMetadata('/account').robots,'noindex,follow');assert.equal(pageMetadata('/register').robots,'noindex,follow');assert.equal(pageMetadata('/').robots,'index,follow');
 assert.equal(new Set(Object.keys(PAGES).map(path=>pageMetadata(path).description)).size,Object.keys(PAGES).length);
});

test('property metadata chooses cover then gallery; unsafe or missing image uses logo',()=>{
 const data=propertyMetadata(item);assert.equal(data.url,SITE+'/properties/EV%2F101');assert.match(data.description,/۱۵٬۵۵۵٬۰۰۰٬۰۰۰/);assert.equal(data.structured.offers.price,155550000000);assert.equal(data.structured.offers.priceCurrency,'IRR');
 assert.equal(data.image,item.media[0].url);
 assert.equal(propertyMetadata({...item,cover_photo_url:'https://example.invalid/cover.jpg'}).image,'https://example.invalid/cover.jpg');
 assert.equal(propertyMetadata({...item,cover_photo_url:'javascript:alert(1)',media:[]}).image,DEFAULT_IMAGE);
 assert.equal(propertyMetadata({...item,cover_photo_url:null,media:[]}).image,DEFAULT_IMAGE);
});

test('rewriting a property as another route removes stale tags/schema without duplicates',()=>{
 let html=injectMetadata(shell,propertyMetadata(item));
 html=injectMetadata(html,pageMetadata('/contact'));
 assert.equal((html.match(/<title>/g)||[]).length,1);assert.equal((html.match(/name="description"/g)||[]).length,1);assert.equal((html.match(/rel="canonical"/g)||[]).length,1);assert.equal((html.match(/property="og:title"/g)||[]).length,1);
 assert.ok(html.includes(SITE+'/contact'));assert.ok(!html.includes('EV%2F101'));assert.ok(!html.includes('RealEstateListing'));assert.ok(html.includes('index,follow'));assert.ok(!html.includes('noindex'));
 assert.ok(html.includes('twitter:title'));assert.ok(html.includes('twitter:image'));
});

test('unsafe property text is escaped in HTML and JSON-LD; unrelated schema remains',()=>{
 const attack={...item,property_type:'</title><script>alert(1)</script>',public_code:'"/><x>',updated_at:'invalid'};
 const html=injectMetadata(shell.replace('</head>','<script type="application/ld+json">{"@type":"Organization"}</script></head>'),propertyMetadata(attack));
 assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('\\u003c'));assert.ok(html.includes('Organization'));assert.ok(!html.includes('Invalid Date'));
});

test('loading and failure metadata cannot retain an old property image or schema',()=>{
 for(const data of [pageMetadata('/properties/other'),propertyFailureMetadata('/properties/other',404),propertyFailureMetadata('/properties/other',503)]){
  assert.equal(data.image,DEFAULT_IMAGE);assert.equal(data.structured,null);assert.equal(data.url,SITE+'/properties/other');
 }
 assert.equal(propertyFailureMetadata('/properties/other',404).robots,'noindex,follow');
 assert.equal(canonicalPath('/properties/EV%2f101/'),'/properties/EV%2F101');
});

test('server and browser share exact page and property metadata',async t=>{
 const prior=globalThis.fetch;t.after(()=>{globalThis.fetch=prior});
 globalThis.fetch=async()=>new Response(JSON.stringify({item}));
 for(const path of ['/', '/about','/contact','/account','/register','/properties/EV%2F101']){
  const response=await onRequest(context(path));const html=await response.text();const expected=path.includes('/properties/')?propertyMetadata(item):pageMetadata(path);
  assert.equal(response.status,200);assert.ok(html.includes('content="'+expected.image+'"'));assert.ok(html.includes('<title>'+expected.title+'</title>'));assert.ok(html.includes('href="'+expected.url+'"'));assert.ok(html.includes('content="'+expected.robots+'"'));
 }
});

test('404, malformed encoding and transient failures use correct status and noindex',async t=>{
 const prior=globalThis.fetch;t.after(()=>{globalThis.fetch=prior});
 globalThis.fetch=async()=>new Response('{}',{status:404});let response=await onRequest(context('/properties/missing'));assert.equal(response.status,404);assert.ok((await response.text()).includes('noindex'));
 response=await onRequest(context('/properties/%ZZ'));assert.equal(response.status,404);
 globalThis.fetch=async()=>new Response('{}',{status:500});response=await onRequest(context('/properties/failure'));assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'60');
});

test('sitemap excludes private routes, encodes codes and omits invalid dates',async t=>{
 const prior=globalThis.fetch;t.after(()=>{globalThis.fetch=prior});
 globalThis.fetch=async()=>new Response(JSON.stringify({items:[item,{...item,public_code:'B',updated_at:'invalid'}]}));
 const response=await onRequest(context('/sitemap.xml'));const xml=await response.text();assert.equal(response.status,200);assert.ok(xml.includes('/properties/EV%2F101'));assert.ok(xml.includes('<lastmod>2026-10-29'));assert.ok(!xml.includes(SITE+'/account'));assert.ok(!xml.includes(SITE+'/register'));assert.ok(!xml.includes('Invalid Date'));
});
