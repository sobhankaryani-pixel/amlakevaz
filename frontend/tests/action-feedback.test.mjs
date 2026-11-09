import test from 'node:test';import assert from 'node:assert/strict';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('clicked action spins through stalled response body, blocks repeats, clears after failure and synchronous action',async()=>{
 const saved=new Map();const dom=new JSDOM('<button id="async">ذخیره</button><button id="sync">بازکردن</button>',{url:'https://evazmelk.ir/'});
 const put=(k,v)=>{saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})};
 try{
  for(const k of ['document','Element','HTMLButtonElement'])put(k,dom.window[k]);let calls=0,controller,fail=false;
  put('fetch',async()=>{calls++;if(fail)throw Error('offline');return new Response(new ReadableStream({start(c){controller=c}}))});
  const {installActionFeedback}=await import('../src/shared/actionFeedback.ts');installActionFeedback();
  let pending;const button=document.querySelector('#async');button.onclick=()=>{pending=globalThis.fetch('/api/test')};button.click();await new Promise(r=>setTimeout(r,210));assert.equal(button.dataset.actionBusy,'true');button.click();assert.equal(calls,1);
  controller.enqueue(new TextEncoder().encode('{}'));controller.close();await pending;assert.equal(button.dataset.actionBusy,undefined);
  fail=true;button.onclick=()=>{pending=globalThis.fetch('/api/test').catch(()=>{})};button.click();await pending;assert.equal(button.dataset.actionBusy,undefined);
  const sync=document.querySelector('#sync');sync.click();assert.equal(sync.dataset.actionBusy,'true');await new Promise(r=>setTimeout(r,210));assert.equal(sync.dataset.actionBusy,undefined);
 }finally{dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):delete globalThis[k]}
});
