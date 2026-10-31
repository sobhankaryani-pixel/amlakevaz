import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('mobile map: swipe stays locked, tap activates, X/offscreen lock; desktop restores handlers; marker taps work only when active',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-map-test-'));
 let dom,instance;const saved=new Map();
 const put=(name,value)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true})};
 try{
  const entry=join(folder,'entry.tsx');await writeFile(entry,"export {default as MapInteraction} from '../src/shared/MapInteraction';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';");
  await build({root,configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry,cssFileName:'test',formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir/map'});
  for(const key of ['window','document','Element','HTMLElement','navigator','Event'])put(key,dom.window[key]);put('IS_REACT_ACT_ENVIRONMENT',true);
  let change,intersection;const query={matches:true,addEventListener:(_,f)=>{change=f},removeEventListener:()=>{change=null}};window.matchMedia=()=>query;
  class Observer{constructor(f){intersection=f}observe(){}disconnect(){intersection=null}}
  window.IntersectionObserver=Observer;put('IntersectionObserver',Observer);
  const map=Object.fromEntries(['dragging','touchZoom','scrollWheelZoom','doubleClickZoom','boxZoom','keyboard'].map(key=>{let enabled=key!=='boxZoom';return [key,{enabled:()=>enabled,enable:()=>{enabled=true},disable:()=>{enabled=false}}]}));
  const {MapInteraction,act,createElement:h,createRoot}=await import(pathToFileURL(join(folder,'test.mjs')));
  instance=createRoot(document.querySelector('#root'));let markerClicks=0;
  await act(async()=>instance.render(h(MapInteraction,{map,ready:true},h('div',{className:'property-map'},h('button',{onClick:()=>markerClicks++},'ملک')))));
  const enabled=()=>map.dragging.enabled();const click=async selector=>act(async()=>document.querySelector(selector).click());
  assert.equal(enabled(),false);assert.ok(document.querySelector('.map-control-cover'));assert.equal(document.querySelector('.map-control-exit'),null);
  const cover=document.querySelector('.map-control-cover');
  await act(async()=>{cover.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,clientX:10,clientY:10}));cover.dispatchEvent(new window.MouseEvent('pointermove',{bubbles:true,clientX:10,clientY:80}));cover.dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail:1}))});
  assert.equal(enabled(),false,'scroll/swipe must not activate');assert.equal(markerClicks,0);
  await click('.map-control-cover');assert.equal(enabled(),true);assert.ok(document.querySelector('.map-control-exit'));assert.equal(document.querySelector('.map-control-cover'),null);assert.equal(map.boxZoom.enabled(),false,'preserve initially disabled handler');
  await click('.property-map button');assert.equal(markerClicks,1);
  await click('.map-control-exit');assert.equal(enabled(),false);assert.ok(document.querySelector('.map-control-cover'));
  await click('.map-control-cover');await act(async()=>intersection([{isIntersecting:false}]));assert.equal(enabled(),false);
  await act(async()=>{query.matches=false;change()});assert.equal(enabled(),true);assert.equal(document.querySelector('.map-control-cover'),null);assert.equal(document.querySelector('.map-control-exit'),null);
  await act(async()=>{query.matches=true;change()});assert.equal(enabled(),false);assert.ok(document.querySelector('.map-control-cover'));
 }finally{
  if(instance)await (await import('react')).act(async()=>instance.unmount());dom?.window.close();for(const [name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}await rm(folder,{recursive:true,force:true});
 }
});
