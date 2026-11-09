import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('admin entry shows new-request alert and badge; dismiss preserves pending count; MFA never falls back to agency',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-admin-notice-'));const saved=new Map();let dom,instance,act;
 const put=(k,v)=>{saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})};
 try{
  await writeFile(join(folder,'entry.tsx'),`export {default as App} from '../../admin/src/App';export {authenticatePanel} from '../src/shared/panelAuth';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';`);
  await build({root,configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry:join(folder,'entry.tsx'),formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir/management/',pretendToBeVisual:true});
  for(const k of ['window','document','HTMLElement','Element','Event','CustomEvent','location','navigator','localStorage','sessionStorage'])put(k,dom.window[k]);put('IS_REACT_ACT_ENVIRONMENT',true);window.scrollTo=()=>{};localStorage.setItem('evazmelk_admin_token','isolated-token');
  const calls=[];put('fetch',async url=>{calls.push(String(url));const data=String(url).endsWith('/me')?{sub:'isolated-admin',role:'owner'}:String(url).includes('/reference')?{property_types:[],regions:[]}:String(url).includes('/submission-notifications')?{count:3,latest:'2026-11-09T12:00:00Z',sms_configured:true,sms_states:{}}:{items:[]};return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})});
  const module=await import(pathToFileURL(join(folder,'test.mjs')));act=module.act;instance=module.createRoot(document.querySelector('#root'));
  await act(async()=>instance.render(module.createElement(module.App)));
  assert.equal(localStorage.getItem('evazmelk_admin_token'),null);assert.equal(sessionStorage.getItem('evazmelk_admin_token'),'isolated-token');
  assert.match(document.querySelector('.request-notification').textContent,/درخواست جدید دارید/);assert.match(document.querySelector('.request-new-badge').textContent,/جدید ۳/);
  await act(async()=>document.querySelector('button[aria-label="بستن اعلان"]').click());assert.equal(document.querySelector('.request-notification'),null);assert.ok(document.querySelector('.request-new-badge'));
  await act(async()=>document.querySelector('.request-mobile-badge').click());assert.match(document.querySelector('.content h1').textContent,/درخواست‌های ثبت ملک/);assert.ok(calls.some(x=>x.endsWith('/property-submissions')));
  let attempts=0;await assert.rejects(()=>module.authenticatePanel('qa','isolated-password',async()=>{attempts++;return new Response(JSON.stringify({detail:'کد رمزساز را وارد کنید'}),{status:401,headers:{'X-Admin-MFA':'required'}})}),/رمزساز/);assert.equal(attempts,1);
 }finally{if(instance)await act(async()=>instance.unmount());dom?.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):delete globalThis[k];await rm(folder,{recursive:true,force:true})}
});
