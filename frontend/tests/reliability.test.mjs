import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('recovery, real links, account connectivity and mobile photo navigation',async t=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-reliability-'));const saved=new Map();let dom,instance;
 const put=(name,value)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true})};
 try{
  await writeFile(join(folder,'entry.tsx'),`export {ListingCard} from '../src/shared/propertyUI';export {default as Boundary} from '../src/shared/ErrorBoundary';export {default as Viewer} from '../src/shared/PhotoViewer';export {default as Gate} from '../src/shared/SessionGate';export {useSiteState} from '../src/shared/useSiteState';export {act,createElement,useState} from 'react';export {createRoot} from 'react-dom/client';`);
  await build({root,configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry:join(folder,'entry.tsx'),formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir/account',pretendToBeVisual:true});
  for(const key of ['window','document','HTMLElement','Element','Event','CustomEvent','location','navigator','localStorage','sessionStorage'])put(key,dom.window[key]);put('IS_REACT_ACT_ENVIRONMENT',true);window.scrollTo=()=>{};
  Object.assign(window.HTMLDialogElement.prototype,{showModal(){this.open=true},close(){this.open=false}});
  const {ListingCard,Boundary,Viewer,Gate,useSiteState,act,createElement:h,useState,createRoot}=await import(pathToFileURL(join(folder,'test.mjs')));
  const unmount=async()=>{if(instance){await act(async()=>instance.unmount());instance=null}};
  const mount=async node=>{await unmount();instance=createRoot(document.querySelector('#root'));await act(async()=>instance.render(node))};
  const click=async text=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(button,text);await act(async()=>button.click())};
  await t.test('listing is a real link; modifier click is not intercepted',async()=>{
   let opens=0;await mount(h(ListingCard,{item:{public_code:'A/1',property_type:'زمین',property_code:'raw_land',asking_price_toman:5000000000},onOpen:()=>opens++}));
   const link=document.querySelector('a.listing-open');assert.equal(link.getAttribute('href'),'/properties/A%2F1');
   const plain=new window.MouseEvent('click',{button:0,bubbles:true,cancelable:true});link.dispatchEvent(plain);assert.equal(opens,1);assert.equal(plain.defaultPrevented,true);
   const modified=new window.MouseEvent('click',{button:0,ctrlKey:true,bubbles:true,cancelable:true});link.addEventListener('click',event=>{assert.equal(event.defaultPrevented,false);event.preventDefault()},{once:true});link.dispatchEvent(modified);assert.equal(opens,1);
  });
  await t.test('error boundary renders recovery controls without exposing internal error text',async()=>{
   const before=console.error;console.error=()=>{};try{await mount(h(Boundary,null,h(()=>{throw Error('private-internal-test')})));assert.match(document.body.textContent,/تلاش مجدد/);assert.ok(!document.body.textContent.includes('private-internal-test'));assert.ok(document.querySelector('a[href="tel:09212745755"]'))}finally{console.error=before}
  });
  await t.test('session gate does not show a login form while account lookup failed',async()=>{
   await mount(h(Gate,{loading:false,error:'اتصال قطع شد',retry:()=>{}},h('form',{id:'must-not-show'})));assert.equal(document.querySelector('#must-not-show'),null);assert.match(document.body.textContent,/بررسی دوباره/);
  });
  await t.test('fullscreen gallery navigates, swipes and restores page scrolling on close',async()=>{
   function Gallery(){const [active,setActive]=useState(0),[open,setOpen]=useState(true);return open?h(Viewer,{images:[{url:'https://api.evazmelk.ir/api/public/media/a.webp'},{url:'https://api.evazmelk.ir/api/public/media/b.webp'}],active,onChange:setActive,onClose:()=>setOpen(false),code:'01'}):h('p',null,'closed')}
   document.body.style.overflow='auto';await mount(h(Gallery));assert.equal(document.querySelector('dialog').open,true);assert.equal(document.body.style.overflow,'hidden');
   await click('عکس بعدی');assert.match(document.querySelector('dialog img').src,/b.webp$/);
   await act(async()=>document.querySelector('dialog').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));assert.match(document.querySelector('dialog img').src,/a.webp$/);
   const stage=document.querySelector('.photo-viewer-stage');const touch=(name,x)=>{const event=new window.Event(name,{bubbles:true});Object.defineProperty(event,name==='touchstart'?'touches':'changedTouches',{value:[{clientX:x,clientY:100}]});return event};
   await act(async()=>{stage.dispatchEvent(touch('touchstart',200));stage.dispatchEvent(touch('touchend',100))});assert.match(document.querySelector('dialog img').src,/b.webp$/);
   await click('بستن ×');assert.equal(document.querySelector('dialog'),null);assert.equal(document.body.style.overflow,'auto');
  });
  await t.test('account network failure is retryable; only HTTP401 means logged out',async()=>{
   let mode='offline',state;put('fetch',async url=>{if(String(url).endsWith('/api/seller/me')){if(mode==='offline')throw TypeError('offline');return new Response(JSON.stringify(mode==='ok'?{user:{id:'user-test',phone:'09120000000'}}:{}),{status:mode==='signedout'?401:200})}return new Response('{"items":[]}')});
   function AccountState(){state=useSiteState();return h('p',null,state.sessionError||state.sellerUser?.id||'none')}
   await mount(h(AccountState));await act(async()=>new Promise(resolve=>setTimeout(resolve,25)));assert.ok(state.sessionError);assert.equal(state.sessionLoading,false);
   mode='ok';await act(async()=>{state.retrySession();await new Promise(resolve=>setTimeout(resolve,25))});assert.equal(state.sessionError,'');assert.equal(state.sellerUser.id,'user-test');
   mode='offline';await act(async()=>{state.retrySession();await new Promise(resolve=>setTimeout(resolve,25))});assert.ok(state.sessionError);assert.equal(state.sellerUser.id,'user-test');
   mode='signedout';await act(async()=>{state.retrySession();await new Promise(resolve=>setTimeout(resolve,25))});assert.equal(state.sessionError,'');assert.equal(state.sellerUser,null);
  });
  await unmount();
 }finally{if(instance)await instance.unmount();dom?.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}await rm(folder,{recursive:true,force:true})}
});
