import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'vite';

test('browser event and form context agree; new campaign isolates visit; DNT sends nothing',async()=>{
 const output=await mkdtemp(join(tmpdir(),'evaz-analytics-'));
 const previous=new Map();
 const put=(name,value)=>{previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})};
 try{
  await build({configFile:false,logLevel:'silent',build:{lib:{entry:fileURLToPath(new URL('../src/shared/analytics.ts',import.meta.url)),formats:['es'],fileName:()=> 'analytics.mjs'},outDir:output,minify:false}});
  const sent=[],storage=new Map();const win=new EventTarget(),doc=new EventTarget();
  const location={pathname:'/',search:'?utm_source=instagram&utm_medium=social&utm_campaign=first'};
  doc.referrer='https://instagram.com/path?private=1';doc.visibilityState='visible';
  put('window',win);win.location=location;put('location',location);put('document',doc);put('navigator',{doNotTrack:'0'});
  put('sessionStorage',{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)});
  put('matchMedia',()=>({matches:false}));put('fetch',async(_url,options)=>{sent.push(JSON.parse(options.body));return new Response('{"accepted":true}')});
  const api=await import(pathToFileURL(join(output,'analytics.mjs')));
  api.startAnalytics();api.startAnalytics();
  const first=api.getAnalyticsContext();assert.equal(first.details.campaign,'first');assert.equal(first.details.referrer,'instagram.com');
  location.pathname='/account';location.search='';win.dispatchEvent(new Event('evaz:navigate'));
  assert.deepEqual(api.getAnalyticsContext(),first);
  location.pathname='/register';win.dispatchEvent(new Event('evaz:navigate'));
  assert.deepEqual(api.getAnalyticsContext(),first);
  api.track('phone_click');
  assert.equal(sent.filter(x=>x.event==='page_view').length,3);
  assert.ok(sent.every(x=>x.session_id===first.session_id&&x.details.campaign==='first'));
  location.search='?utm_source=sms&utm_medium=sms&utm_campaign=second';win.dispatchEvent(new Event('evaz:navigate'));
  const second=api.getAnalyticsContext();assert.notEqual(second.session_id,first.session_id);
  assert.equal(second.details.campaign,'second');assert.deepEqual(api.getAnalyticsContext(),second);
  const before=sent.length;navigator.doNotTrack='1';api.track('phone_click');assert.equal(api.getAnalyticsContext(),null);assert.equal(sent.length,before);
 }finally{
  for(const [name,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
  await rm(output,{recursive:true,force:true});
 }
});
