// JSDOM_MODULE can point at a QA-only jsdom installation; production needs no jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('cleanup requires preview and exact confirmation; draft lease protects hidden media and releases timers',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
 const output=await mkdtemp(join(root,'.qa-media-cleanup-'));
 const saved=new Map();const put=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})};
 const entry=join(output,'entry.tsx');let instance,dom;
 try{
  await writeFile(entry,`export {default as Cleanup} from '../src/MediaCleanup';export {default as Uploader} from '../src/MediaUploader';export {createRoot} from 'react-dom/client';export {act,createElement} from 'react';`);
  await build({configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry,formats:['es'],fileName:()=> 'test.mjs'},outDir:output,emptyOutDir:false,rollupOptions:{external:['react','react-dom/client','react/jsx-runtime']}}});
  process.env.NODE_ENV='test';
  dom=new JSDOM('<div id="root"></div>',{url:'https://admin.evazmelk.ir',pretendToBeVisual:true});
  put('window',dom.window);put('document',dom.window.document);put('navigator',dom.window.navigator);put('HTMLElement',dom.window.HTMLElement);put('IS_REACT_ACT_ENVIRONMENT',true);
  const requests=[],timers=new Map();let timerId=0;
  put('setInterval',(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId});put('clearInterval',id=>timers.delete(id));
  const filename='00000000-0000-4000-8000-000000000001.webp';
  const item={id:filename.slice(0,-5),filename,url:'https://api.evazmelk.ir/api/public/media/'+filename,kind:'image',size_bytes:100,created_at:'2026-07-01T00:00:00Z',cleanup_state:'active',preview_token:'test-only'};
  let deleted=false;
  put('fetch',async(url,options)=>{
   requests.push({url,options});let data;
   if(url.includes('cleanup-delete')){deleted=true;data={deleted:true}}
   else if(url.includes('cleanup-preview'))data={registered:{files:deleted?0:1,bytes:100},candidates:{files:deleted?0:1,bytes:100},items:deleted?[]:[item],offset:0};
   else data={retained:2};
   return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  });
  const {Cleanup,Uploader,act,createElement,createRoot}=await import(pathToFileURL(join(output,'test.mjs')));
  instance=createRoot(document.querySelector('#root'));
  const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
  const click=async text=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(button,text);await act(async()=>{button.click();await settle()})};
  await act(async()=>{instance.render(createElement(Cleanup,{token:'test-only'}));await settle()});assert.equal(requests.length,0);
  await click('بررسی فایل‌های بلااستفاده');assert.ok(document.body.textContent.includes(filename));
  await click('بررسی حذف این فایل');
  let remove=[...document.querySelectorAll('button')].find(x=>x.textContent==='حذف دائمی همین فایل');assert.equal(remove.disabled,true);
  await act(async()=>{const input=document.querySelector('input[placeholder="حذف دائمی"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'حذف دائمی');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await settle()});
  assert.equal(remove.disabled,false);await click('حذف دائمی همین فایل');
  assert.equal(requests.filter(x=>x.url.includes('cleanup-delete')).length,1);
  assert.equal(JSON.parse(requests.find(x=>x.url.includes('cleanup-delete')).options.body).confirm,'حذف دائمی');
  assert.ok(document.body.textContent.includes('حذف فایل از فضای نگهداری تأیید شد'));
  const hidden={url:item.url.replace('.webp','.mp4'),kind:'video'};
  await act(async()=>{instance.render(createElement(Uploader,{items:[{url:item.url,kind:'image'}],draftItems:[{url:item.url,kind:'image'},hidden],allowVideo:false,onChange:()=>{},token:'test-only'}));await settle()});
  const retained=requests.filter(x=>x.url.endsWith('/media/retain'));assert.equal(retained.length,1);
  assert.deepEqual(JSON.parse(retained[0].options.body).urls,[item.url,hidden.url]);
  assert.ok([...timers.values()].some(x=>x.ms===300000));
  await act(async()=>instance.unmount());instance=null;assert.equal(timers.size,0);
 }finally{
  if(instance)instance.unmount();dom?.window.close();
  for(const [key,value]of saved)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
  await rm(output,{recursive:true,force:true});
 }
});
