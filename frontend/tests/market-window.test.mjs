import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('calendar ranges, endpoint change, real selector updates and total Mehr units',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-market-'));let dom,instance;const saved=new Map();
 const put=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})};
 try{
  const entry=join(folder,'entry.tsx');await writeFile(entry,"export {default as Dashboard} from '../src/PriceDashboard';export * from '../src/shared/marketWindow';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';");
  await build({root,configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry,formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir'});for(const k of ['window','document','HTMLElement','Event'])put(k,dom.window[k]);put('IS_REACT_ACT_ENVIRONMENT',true);
  const data=Array.from({length:13},(_,i)=>{const month=1404*12+6+i;return {period:`${Math.floor(month/12)}/${String(month%12+1).padStart(2,'0')}`,value_toman:100+i*10,count:null}});
  put('fetch',async()=>({ok:true,clone:()=>({arrayBuffer:async()=>new ArrayBuffer(0)}),json:async()=>({regions:[{name:'ابتدای بردسپی',slug:'R-01'}],series:{land_residential:data,land_commercial:data.map(p=>({...p,value_toman:p.value_toman*2})),house_new:data,apartment:[],mehr_upper:data.map(p=>({...p,value_toman:p.value_toman*1000000})),mehr_lower:[]}})}));
  const {Dashboard,windowPoints,windowChange,latestPeriod,act,createElement:h,createRoot}=await import(pathToFileURL(join(folder,'test.mjs')));
  assert.equal(windowPoints(data,1,'1405/07').length,2);assert.equal(windowPoints(data,3,'1405/07').length,4);assert.equal(windowPoints(data,6,'1405/07').length,7);assert.equal(windowPoints(data,12,'1405/07').length,13);
  assert.equal(windowChange(windowPoints(data,12,'1405/07')).label,'+۱۲۰٪');assert.equal(windowChange(windowPoints(data,1,'1405/07')).label,'+۴٫۸٪');
  assert.equal(windowPoints([data[0],data[12]],6,'1405/07').length,1,'do not use out-of-window baseline or fabricate missing months');assert.equal(windowChange([data[12]]).label,'—');assert.equal(latestPeriod({a:[...data,{period:'invalid',value_toman:500,count:null}]}),'1405/07');
  instance=createRoot(document.querySelector('#root'));await act(async()=>instance.render(h(Dashboard,{compact:true})));for(let i=0;i<5&&!document.querySelector('.market-value');i++)await act(async()=>{await new Promise(r=>setTimeout(r,10))});
  const cards=()=>document.querySelectorAll('.market-card');assert.equal(cards().length,3);assert.equal(cards()[0].querySelectorAll('circle').length,7);assert.match(cards()[2].querySelector('.market-value').textContent,/۲۲۰٬۰۰۰٬۰۰۰.*قیمت کل به تومان/);
  await act(async()=>[...document.querySelectorAll('.market-ranges button')].find(b=>b.textContent==='۱ ماهه').click());assert.equal(cards()[0].querySelectorAll('circle').length,2);assert.match(cards()[0].querySelector('.market-change').textContent,/۴٫۸/);
  await act(async()=>{const s=document.querySelector('[aria-label="نوع زمین"]');s.value='land_commercial';s.dispatchEvent(new Event('change',{bubbles:true}))});assert.match(cards()[0].querySelector('.market-value').textContent,/۴۴۰/);
  await act(async()=>{const s=document.querySelector('[aria-label="نوع مسکن مهر"]');s.value='mehr_lower';s.dispatchEvent(new Event('change',{bubbles:true}))});assert.match(cards()[2].textContent,/قیمتی ثبت نشده/);assert.equal(cards()[2].querySelector('.market-value'),null);
 }finally{if(instance)await(await import('react')).act(async()=>instance.unmount());dom?.window.close();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}await rm(folder,{recursive:true,force:true})}
});
