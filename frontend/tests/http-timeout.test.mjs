import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchWithTimeout,RequestTimeoutError,API_TIMEOUT_MS,UPLOAD_TIMEOUT_MS} from '../src/shared/http.ts';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function stub(t,handler){const prior=globalThis.fetch;globalThis.fetch=handler;t.after(()=>{globalThis.fetch=prior})}

test('successful response preserves HTTP metadata, JSON and clears deadline',async t=>{
 let signal,received;
 stub(t,async(input,options)=>{signal=options.signal;received=options;return new Response('{"saved":true}',{status:201,headers:{'X-Export-Count':'3'}})});
 const response=await fetchWithTimeout('https://example.invalid/api',{method:'POST',headers:{Authorization:'Bearer test-only'},credentials:'include',body:'{}',timeoutMs:40});
 assert.equal(response.status,201);assert.equal(response.headers.get('X-Export-Count'),'3');assert.deepEqual(await response.json(),{saved:true});
 assert.equal(received.credentials,'include');assert.equal(received.headers.Authorization,'Bearer test-only');assert.equal(received.body,'{}');assert.equal(received.timeoutMs,undefined);
 await sleep(50);assert.equal(signal.aborted,false);
});

test('no headers: aborts exactly one mutation and reports uncertain result',async t=>{
 let signal,count=0;stub(t,(_input,options)=>{signal=options.signal;count++;return new Promise(()=>{})});
 await assert.rejects(fetchWithTimeout('https://example.invalid/api',{method:'POST',body:'{}',timeoutMs:15}),e=>e instanceof RequestTimeoutError&&e.message.includes('ممکن است درخواست ثبت شده باشد'));
 assert.equal(count,1);assert.equal(signal.aborted,true);
});

test('headers arrive but stalled body still times out',async t=>{
 let signal;stub(t,async(_input,options)=>{signal=options.signal;return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"partial":'));signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true})}}))});
 await assert.rejects(fetchWithTimeout('https://example.invalid/api',{timeoutMs:15}),RequestTimeoutError);
 assert.equal(signal.aborted,true);
});

test('external cancellation preserves AbortError and never becomes timeout',async t=>{
 let signal;stub(t,(_input,options)=>{signal=options.signal;return new Promise(()=>{})});
 const external=new AbortController();const pending=fetchWithTimeout('https://example.invalid/api',{signal:external.signal,timeoutMs:100});external.abort();
 await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(signal.aborted,true);
});

test('already cancelled request is never sent; Request signal also respected',async t=>{
 let count=0;stub(t,async()=>{count++;return new Response('{}')});
 const external=new AbortController();external.abort();
 await assert.rejects(fetchWithTimeout('https://example.invalid/api',{signal:external.signal}),e=>e.name==='AbortError');
 await assert.rejects(fetchWithTimeout(new Request('https://example.invalid/api',{signal:external.signal})),e=>e.name==='AbortError');
 assert.equal(count,0);
});

test('HTTP errors remain readable for existing auth/retry handling; blob exports work',async t=>{
 stub(t,async()=>new Response('{"detail":"unavailable"}',{status:503,headers:{'Retry-After':'60'}}));
 const response=await fetchWithTimeout('https://example.invalid/api');assert.equal(response.ok,false);assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'60');assert.equal((await response.json()).detail,'unavailable');
 stub(t,async()=>new Response('name,phone\ntest,000',{headers:{'Content-Type':'text/csv'}}));
 assert.match(await (await (await fetchWithTimeout('https://example.invalid/export')).blob()).text(),/name,phone/);
});

test('network failures are readable Persian; invalid deadlines cannot send requests',async t=>{
 let count=0;stub(t,async()=>{count++;throw new TypeError('Failed to fetch')});
 await assert.rejects(fetchWithTimeout('https://example.invalid/api'),e=>e.message.includes('ارتباط با سرور'));
 for(const timeoutMs of [0,-1,NaN,Infinity])await assert.rejects(fetchWithTimeout('https://example.invalid/api',{timeoutMs}),RangeError);
 assert.equal(count,1);
});

test('longer upload budget is finite and both independent apps use the same implementation',()=>{
 assert.equal(API_TIMEOUT_MS,60000);assert.equal(UPLOAD_TIMEOUT_MS,180000);
 assert.equal(readFileSync(new URL('../src/shared/http.ts',import.meta.url),'utf8'),readFileSync(new URL('../../admin/src/http.ts',import.meta.url),'utf8'));
 for(const path of ['../src/shared/MediaUploader.tsx','../../admin/src/MediaUploader.tsx'])assert.match(readFileSync(new URL(path,import.meta.url),'utf8'),/timeoutMs:UPLOAD_TIMEOUT_MS/);
});
