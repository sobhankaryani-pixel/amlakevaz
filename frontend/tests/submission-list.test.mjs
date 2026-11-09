import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('request cards expose six-digit receipt, pending edit and approved ad views; errors remain retryable',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-requests-'));const saved=new Map();let dom,instance,act;
 const put=(k,v)=>{saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})};
 try{
  await writeFile(join(folder,'entry.tsx'),"export {default as List} from '../src/shared/SubmissionList';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';");
  await build({root,configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry:join(folder,'entry.tsx'),formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir/register'});for(const k of ['window','document','Element','HTMLElement','navigator','location','Event'])put(k,dom.window[k]);put('IS_REACT_ACT_ENVIRONMENT',true);
  let editing,fail=false,calls=0;const items=[{id:'internal-pending-uuid',tracking_code:123456,status:'pending',created_at:'2026-11-09'},{id:'internal-approved-uuid',tracking_code:123457,status:'approved',approved_property_code:'01',view_count:17,created_at:'2026-11-09'}];
  put('fetch',async(url)=>{calls++;return new Response(JSON.stringify(fail?{detail:'اتصال انجام نشد'}:String(url).endsWith('my-submissions')?{items}:{id:items[0].id,revision:2,details:{area_m2:200}}),{status:fail?503:200,headers:{'Content-Type':'application/json'}})});
  const m=await import(pathToFileURL(join(folder,'test.mjs')));act=m.act;instance=m.createRoot(document.querySelector('#root'));await act(async()=>instance.render(m.createElement(m.List,{userId:'test',onEdit:x=>editing=x})));
  const rows=document.querySelectorAll('li');assert.equal(rows.length,2);assert.match(rows[0].textContent,/۱۲۳۴۵۶/);assert.equal(document.body.textContent.includes('internal-'),false);assert.equal(rows[1].querySelector('button'),null);assert.equal(rows[1].querySelector('a').getAttribute('href'),'/properties/01');assert.match(rows[1].textContent,/۱۷/);assert.ok(rows[1].querySelector('svg'));
  await act(async()=>rows[0].querySelector('button').click());assert.equal(editing.id,items[0].id);assert.equal(editing.revision,2);
  fail=true;await act(async()=>window.dispatchEvent(new Event('evaz:submissions-updated')));assert.ok(document.querySelector('[role=alert]'));fail=false;await act(async()=>document.querySelector('[role=alert] button').click());assert.equal(document.querySelectorAll('li').length,2);assert.ok(calls>=4);
 }finally{if(instance)await act(async()=>instance.unmount());dom?.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):delete globalThis[k];await rm(folder,{recursive:true,force:true})}
});
