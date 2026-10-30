import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('server code is readonly, removed panel is absent, notes stay and wheel cannot change numeric/select/range values',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-property-form-'));
 const saved=new Map();const put=(name,value)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true})};
 let instance,uninstall,dom;
 try{
  const entry=join(folder,'entry.tsx');await writeFile(entry,"export {default as App} from '../src/App';export {installWheelValueGuard} from '../src/wheelValueGuard';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';");
  await build({configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry,formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://admin.evazmelk.ir',pretendToBeVisual:true});
  for(const key of ['window','document','Element','HTMLElement','localStorage','sessionStorage','navigator'])put(key,dom.window[key]);
  put('getComputedStyle',dom.window.getComputedStyle);put('IS_REACT_ACT_ENVIRONMENT',true);
  localStorage.setItem('evazmelk_admin_token','test-only');const scrolls=[];window.scrollBy=value=>scrolls.push(value);
  const uuid='00000000-0000-4000-8000-000000000001';let reservations=0;
  put('fetch',async(url,options)=>{
   let data={};
   if(url.endsWith('/me'))data={sub:uuid,role:'owner'};
   if(url.endsWith('/reference'))data={property_types:[{id:uuid,code:'raw_land',name:'زمین'}],regions:[{id:uuid,slug:'R-01',name:'بردسپی'}]};
   if(url.endsWith('/reserve-code')){reservations++;assert.ok(JSON.parse(options.body).request_id);data={reservation_id:uuid,public_code:'02'}}
   return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  });
  const {App,act,createElement,createRoot,installWheelValueGuard}=await import(pathToFileURL(join(folder,'test.mjs')));
  uninstall=installWheelValueGuard();instance=createRoot(document.querySelector('#root'));
  const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
  await act(async()=>{instance.render(createElement(App));await settle()});
  await act(async()=>{[...document.querySelectorAll('button')].find(x=>x.textContent==='زمین').click();await settle()});
  const code=document.querySelector('input[aria-label="کد ملک — خودکار"]');assert.equal(code.value,'02');assert.equal(code.readOnly,true);assert.equal(reservations,1);
  assert.ok(document.body.textContent.includes('توضیحات اضافی'));assert.ok(!document.body.textContent.includes('آگهی و موقعیت'));
  const number=document.querySelector('input[type="number"]');number.value='125';number.focus();
  const wheel=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:90});number.dispatchEvent(wheel);
  assert.equal(wheel.defaultPrevented,true);assert.equal(number.value,'125');assert.equal(document.activeElement,number);assert.equal(scrolls.at(-1).top,90);
  const select=document.querySelector('select');const value=select.value;const sw=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:60});select.dispatchEvent(sw);assert.equal(sw.defaultPrevented,true);assert.equal(select.value,value);
  const range=document.createElement('input');range.type='range';range.value='40';document.body.append(range);
  const rw=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-20});range.dispatchEvent(rw);assert.equal(rw.defaultPrevented,true);assert.equal(range.value,'40');
  const text=document.createElement('input');document.body.append(text);const tw=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:20});text.dispatchEvent(tw);assert.equal(tw.defaultPrevented,false);
  const adminGuard=await readFile(join(root,'src/wheelValueGuard.ts'),'utf8'),publicGuard=await readFile(join(root,'../frontend/src/shared/wheelValueGuard.ts'),'utf8');assert.equal(adminGuard,publicGuard);
  await act(async()=>instance.unmount());instance=null;
 }finally{
  uninstall?.();if(instance)instance.unmount();dom?.window.close();for(const [name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];await rm(folder,{recursive:true,force:true});
 }
});
