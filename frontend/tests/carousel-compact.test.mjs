import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('native RTL rail: paired mobile scrolling, desktop controls, drag safety and motion preference',async t=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-carousel-'));const saved=new Map();let dom,instance;const realNow=Date.now;
 const put=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})};
 try{
  await writeFile(join(folder,'entry.tsx'),"export {Carousel} from '../src/shared/propertyUI';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';");
  await build({root,configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry:join(folder,'entry.tsx'),formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir/',pretendToBeVisual:true});
  for(const key of ['window','document','Element','HTMLElement','navigator','Event'])put(key,dom.window[key]);put('IS_REACT_ACT_ENVIRONMENT',true);put('getComputedStyle',window.getComputedStyle.bind(window));
  let reduced=false,width=390,total=1320,time=0;const calls=[],observers=[],timers=new Map();Date.now=()=>time;window.matchMedia=query=>({matches:query.includes('reduced-motion')?reduced:width<=900});
  Object.defineProperty(window.HTMLElement.prototype,'clientWidth',{get:()=>360});Object.defineProperty(window.HTMLElement.prototype,'scrollWidth',{get:()=>total});
  window.HTMLElement.prototype.getBoundingClientRect=function(){return {width:this.classList.contains('listing-card')?150:360}};
  window.HTMLElement.prototype.scrollBy=function(options){calls.push(options);this.scrollLeft=Math.max(-(total-360),Math.min(0,this.scrollLeft+options.left));this.dispatchEvent(new window.Event('scroll'))};
  window.HTMLElement.prototype.scrollTo=function(options){calls.push(options);this.scrollLeft=options.left;this.dispatchEvent(new window.Event('scroll'))};
  put('ResizeObserver',class{constructor(fn){observers.push(fn)}observe(){}disconnect(){}});let id=0;window.setInterval=fn=>{timers.set(++id,fn);return id};window.clearInterval=id=>timers.delete(id);
  const {Carousel,act,createElement:h,createRoot}=await import(pathToFileURL(join(folder,'test.mjs')));
  const items=Array.from({length:8},(_,i)=>({public_code:String(i+1),property_type:'زمین',property_code:'raw_land',asking_price_toman:6000000000,region:'بردسپی',area_m2:200}));
  instance=createRoot(document.querySelector('#root'));let opened='';await act(async()=>instance.render(h(Carousel,{items,onOpen:p=>opened=p.public_code})));const viewport=document.querySelector('.carousel-viewport');
  await t.test('one real link per property; mobile advances two cards smoothly',async()=>{
   assert.equal(document.querySelectorAll('.listing-card').length,8);assert.equal(document.querySelector('.slide-prev').disabled,true);
   await act(async()=>document.querySelector('.slide-next').click());assert.deepEqual(calls.at(-1),{left:-324,behavior:'smooth'});assert.equal(viewport.scrollLeft,-324);
   await act(async()=>document.querySelector('.slide-prev').click());assert.equal(viewport.scrollLeft,0);
  });
  await t.test('touch is not intercepted and manual interaction suspends autoplay',async()=>{
   const touch=new window.Event('touchstart',{bubbles:true,cancelable:true});await act(async()=>viewport.dispatchEvent(touch));assert.equal(touch.defaultPrevented,false);
   await act(async()=>{time=14999;for(const fn of timers.values())fn()});assert.equal(viewport.scrollLeft,0);
   await act(async()=>{time=15000;for(const fn of timers.values())fn()});assert.equal(viewport.scrollLeft,-324);
  });
  await t.test('desktop moves one card and respects reduced motion',async()=>{
   width=1440;await act(async()=>document.querySelector('.slide-prev').click());assert.equal(calls.at(-1).left,162);
   reduced=true;await act(async()=>document.querySelector('.slide-next').click());assert.equal(calls.at(-1).behavior,'auto');reduced=false;
  });
  await t.test('mouse drag cannot accidentally open a property; a normal click still works',async()=>{
   const pointer=(type,x)=>{const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerType:'mouse',button:0,pointerId:1,clientX:x});return event};
   await act(async()=>{viewport.dispatchEvent(pointer('pointerdown',100));viewport.dispatchEvent(pointer('pointermove',150));viewport.dispatchEvent(pointer('pointerup',150))});
   const click=new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0});await act(async()=>document.querySelector('.listing-open').dispatchEvent(click));assert.equal(click.defaultPrevented,true);assert.equal(opened,'');
   await act(async()=>{viewport.dispatchEvent(pointer('pointerdown',100));viewport.dispatchEvent(pointer('pointerup',100));document.querySelector('.listing-open').click()});assert.equal(opened,'1');
  });
  await t.test('end state and short lists do not expose empty scrolling controls',async()=>{
   await act(async()=>viewport.dispatchEvent(new window.KeyboardEvent('keydown',{key:'End',bubbles:true})));assert.equal(viewport.scrollLeft,-960);assert.equal(document.querySelector('.slide-next').disabled,true);
   total=360;await act(async()=>{for(const fn of observers)fn()});assert.equal(document.querySelector('.rail-navigation'),null);
   await act(async()=>instance.render(h(Carousel,{items:items.slice(0,1),onOpen:()=>{}})));assert.equal(document.querySelectorAll('.listing-card').length,1);
  });
  await t.test('mobile width leaves a partial card and uses native two-card snap groups',async()=>{
   const css=await readFile(join(root,'src/shared/listing-rail.css'),'utf8');assert.match(css,/overflow-x:auto/);assert.match(css,/2\.15/);assert.match(css,/nth-child\(2n\+1\)/);assert.match(css,/scroll-snap-stop:always/);
  });
 }finally{if(instance)await (await import('react')).act(async()=>instance.unmount());Date.now=realNow;dom?.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}await rm(folder,{recursive:true,force:true})}
});
