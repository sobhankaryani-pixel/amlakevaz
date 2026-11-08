import test from 'node:test';import assert from 'node:assert/strict';
import {thumbnailUrl} from '../src/shared/mediaOrigin.ts';
test('thumbnail transformation is restricted to managed images and keeps original external/video URLs',()=>{
 const managed='https://api.evazmelk.ir/api/public/media/11111111-1111-1111-1111-111111111111.webp';assert.equal(thumbnailUrl(managed),'https://backend.evazmelk.ir/api/public/media/11111111-1111-1111-1111-111111111111.webp/thumbnail');assert.equal(thumbnailUrl('https://example.com/a.jpg'),'https://example.com/a.jpg');assert.equal(thumbnailUrl(managed.replace('.webp','.mp4')),'https://backend.evazmelk.ir/api/public/media/11111111-1111-1111-1111-111111111111.mp4');
});
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('map loads additional pages, resets page on filter and ignores repeated active filter clicks',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-map-pages-'));const saved=new Map();let dom,instance;
 const put=(name,value)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true})};
 try{
  await writeFile(join(folder,'entry.tsx'),"export {default as Map} from '../src/PropertyMap';export {ListingCard} from '../src/shared/propertyUI';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';");
  await build({root,configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry:join(folder,'entry.tsx'),formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir/map'});
  for(const k of ['window','document','navigator','Element','HTMLElement','Event'])put(k,dom.window[k]);put('IS_REACT_ACT_ENVIRONMENT',true);window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  const requests=[];put('fetch',async input=>{const url=new URL(String(input));requests.push(url);return new Response(JSON.stringify({items:[{public_code:url.searchParams.get('offset')||'0',property_code:'raw_land',property_type:'زمین',latitude:27.76,longitude:54,area_m2:200,asking_price_toman:5e9}],total:401,has_more:url.searchParams.get('offset')!=='200'}))});
  const {Map,ListingCard,act,createElement:h,createRoot}=await import(pathToFileURL(join(folder,'test.mjs')));
  instance=createRoot(document.querySelector('#root'));await act(async()=>{instance.render(h(Map));await new Promise(r=>setTimeout(r,20))});await act(async()=>new Promise(r=>setTimeout(r,20)));
  const click=async text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);await act(async()=>{b.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,20))});await act(async()=>new Promise(r=>setTimeout(r,20)))};
  assert.equal(requests[0].searchParams.get('offset'),'0');await click('نمایش نقاط بیشتر روی نقشه');assert.equal(requests.at(-1).searchParams.get('offset'),'200');assert.match(document.querySelector('.map-count').textContent,/۲ آگهی/);
  await click('زمین');assert.equal(requests.at(-1).searchParams.get('offset'),'0');assert.equal(requests.at(-1).searchParams.get('kind'),'land');const count=requests.length;await click('زمین');assert.equal(requests.length,count);assert.match(document.querySelector('.map-count').textContent,/۱ آگهی/);
  await act(async()=>instance.render(h(ListingCard,{item:{public_code:'01',property_type:'زمین',cover_photo_url:'https://api.evazmelk.ir/api/public/media/11111111-1111-1111-1111-111111111111.webp',asking_price_toman:5e9},onOpen(){}})));
  assert.match(document.querySelector('img').src,/thumbnail$/);await act(async()=>document.querySelector('img').dispatchEvent(new window.Event('error')));assert.match(document.querySelector('img').src,/webp$/);await act(async()=>document.querySelector('img').dispatchEvent(new window.Event('error')));assert.equal(document.querySelector('img'),null);
  await act(async()=>instance.unmount());instance=null;
 }finally{if(instance)instance.unmount();dom?.window.close();for(const [k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}await rm(folder,{recursive:true,force:true})}
});
