import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import worker from '../../cloudflare/worker.js';import {propertyMetadata} from '../src/shared/seoMetadata.js';
const shell='<html><head><title>old</title><meta property="og:image" content="old"></head><body><div id="root"></div><script src="/assets/current.js"></script></body></html>';
const item={public_code:'EV/01',property_type:'زمین',region:'اوز',asking_price_toman:3000000000,updated_at:'2026-11-08T10:00:00Z',media:[{url:'https://api.evazmelk.ir/api/public/media/test.webp',kind:'image'}]};
function environment(){const paths=[];return {paths,ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname;paths.push(path);if(['/seo-shell','/management/','/mobile-preview'].includes(path))return new Response(shell,{headers:{'Content-Type':'text/html'}});return new Response('missing',{status:404})}}}}
const req=(path,options={})=>new Request('https://amlakevaz.pages.dev'+path,options);
test('Cloudflare listing uses local deployment assets and public API only',async t=>{
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({item}))};const env=environment();
 const response=await worker.fetch(req('/properties/EV%2F01?ignored=secret',{headers:{Cookie:'secret',Authorization:'Bearer secret'}}),env);const text=await response.text();assert.equal(response.status,200);assert.ok(text.includes(propertyMetadata(item).title));assert.ok(text.includes('test.webp'));assert.ok(text.includes('/assets/current.js'));assert.deepEqual(env.paths,['/seo-shell']);assert.equal(calls[0].url,'https://backend.evazmelk.ir/api/public/property-detail?code=EV%2F01');assert.deepEqual(calls[0].options.headers,{Accept:'application/json'});assert.equal(calls[0].options.redirect,'error');assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('missing, invalid and transient property errors have correct HTTP status and noindex',async t=>{
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);let calls=0;globalThis.fetch=async()=>{calls++;return new Response('{}',{status:404})};
 const malformed=await worker.fetch(req('/properties/%ZZ'),environment());assert.equal(malformed.status,404);assert.equal(calls,0);
 const missing=await worker.fetch(req('/properties/missing'),environment());assert.equal(missing.status,404);assert.match(await missing.text(),/noindex/);
 for(const value of [()=>new Response('{}',{status:500}),()=>new Response('invalid-json'),()=>{throw Error('network')}]){globalThis.fetch=async()=>value();const response=await worker.fetch(req('/properties/01'),environment());assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'60');assert.match(await response.text(),/noindex/)}
});
test('HEAD is bodyless; mutation requests never reach API',async t=>{
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({item}))};
 const head=await worker.fetch(req('/properties/EV%2F01',{method:'HEAD'}),environment());assert.equal(head.status,200);assert.equal(await head.text(),'');
 const before=calls;const post=await worker.fetch(req('/properties/01',{method:'POST',body:'private'}),environment());assert.equal(post.status,405);assert.equal(calls,before);
});
test('sitemap includes public routes, deduplicates codes and ignores invalid dates',async t=>{
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);globalThis.fetch=async()=>new Response(JSON.stringify({items:[item,{public_code:'02',updated_at:'invalid'},item]}));const response=await worker.fetch(req('/sitemap.xml'),environment());const xml=await response.text();assert.equal(response.status,200);assert.equal((xml.match(/EV%2F01/g)||[]).length,1);for(const value of ['/account','/register','/agency','Invalid Date'])assert.ok(!xml.includes(value));assert.match(response.headers.get('Content-Type'),/application\/xml/);globalThis.fetch=async()=>new Response('{}',{status:500});assert.equal((await worker.fetch(req('/sitemap.xml'),environment())).status,503);
});
test('management deep links and mobile preview work without Liara web',async()=>{
 const env=environment();assert.equal((await worker.fetch(req('/management'),env)).headers.get('Location'),'https://amlakevaz.pages.dev/management/');const nested=await worker.fetch(req('/management/reports'),env);assert.equal(nested.status,200);assert.equal(nested.headers.get('X-Robots-Tag'),'noindex, nofollow');assert.ok(env.paths.includes('/management/'));assert.equal((await worker.fetch(req('/management/missing.js'),env)).status,404);const preview=await worker.fetch(req('/mobile-preview?page=%2F'),env);assert.equal(preview.status,200);assert.equal(preview.headers.get('X-Robots-Tag'),'noindex, nofollow');assert.ok(env.paths.includes('/mobile-preview'));
});
test('static traffic avoids blanket Functions invocation and Liara web no longer auto-publishes',async()=>{
 const build=await readFile(new URL('../../build-cloudflare.mjs',import.meta.url),'utf8'),pipeline=await readFile(new URL('../../.github/workflows/liara-web.yml',import.meta.url),'utf8'),source=await readFile(new URL('../../cloudflare/worker.js',import.meta.url),'utf8');assert.ok(build.includes("exclude:['/management/assets/*']"));assert.ok(!build.includes("include:['/*']"));assert.ok(!source.includes('evazmelk-web.liara.run'));assert.ok(!pipeline.includes('  push:'));assert.ok(pipeline.includes('workflow_dispatch:'));
});
