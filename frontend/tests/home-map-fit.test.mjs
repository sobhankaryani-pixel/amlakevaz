import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('home map fits viewport, scrolls once after lazy load, restores preview and focus',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-home-map-'));let dom,instance;const saved=new Map();
 const put=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})};
 try{
  const entry=join(folder,'entry.tsx');await writeFile(entry,"export {default as Home} from '../src/shared/HomeMapSection';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';");
  await build({root,configFile:false,plugins:[react(),{name:'mock-map',enforce:'pre',load(id){if(id.endsWith('/src/PropertyMap.tsx'))return "export default function Map(){return <div className='map-page'>نقشه</div>}"}}],logLevel:'silent',build:{lib:{entry,formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom/client']}}});
  dom=new JSDOM('<div class="site"><header class="site-header"><div class="header-tools"></div></header><div id="root"></div><nav class="mobile-bottom-nav"></nav></div>',{url:'https://evazmelk.ir'});
  for(const k of ['window','document','HTMLElement','MutationObserver'])put(k,dom.window[k]);put('IS_REACT_ACT_ENVIRONMENT',true);put('innerHeight',800);put('scrollY',300);put('matchMedia',q=>({matches:!q.includes('reduced-motion')}));
  let scrolls=[];window.scrollTo=o=>scrolls.push(o);put('requestAnimationFrame',f=>setTimeout(f,0));put('cancelAnimationFrame',clearTimeout);
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){return {top:this.id==='home-online-map'?400:0,height:this.className==='header-tools'?60:this.className==='mobile-bottom-nav'?56:0}};
  const {Home,act,createElement:h,createRoot}=await import(pathToFileURL(join(folder,'test.mjs')));instance=createRoot(document.querySelector('#root'));await act(async()=>instance.render(h(Home,{onFullMap(){}})));
  assert.ok(document.querySelector('.home-map-preview'));await act(async()=>document.querySelector('.home-map-open').click());
  for(let i=0;i<10&&!scrolls.length;i++)await act(async()=>{await new Promise(r=>setTimeout(r,50))});
  assert.equal(document.querySelector('.home-map-preview'),null);assert.equal(scrolls.length,1);assert.equal(scrolls[0].top,628);assert.equal(document.querySelector('.home-map-live').style.getPropertyValue('--home-map-fit-height'),'660px');assert.match(document.querySelector('.home-map-close').textContent,/بستن نقشه/);
  window.dispatchEvent(new window.Event('resize'));await new Promise(r=>setTimeout(r,10));assert.equal(scrolls.length,1);
  await act(async()=>document.querySelector('.home-map-close').click());await new Promise(r=>setTimeout(r,10));assert.ok(document.querySelector('.home-map-preview'));assert.equal(document.querySelector('.home-map-live'),null);assert.equal(document.activeElement,document.querySelector('.home-map-open'));
 }finally{if(instance)await(await import('react')).act(async()=>instance.unmount());dom?.window.close();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}await rm(folder,{recursive:true,force:true})}
});
