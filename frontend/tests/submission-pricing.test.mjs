import test from 'node:test';import assert from 'node:assert/strict';
import {priceUpdate,formatMoney,moneyDigits,areaField} from '../src/shared/money.ts';
test('money groups Persian/Arabic input and reciprocal pricing preserves last edited basis',()=>{
 assert.equal(formatMoney('۶۶۰۰۰۰۰۰۰۰'),'6٬600٬000٬000');assert.equal(moneyDigits('١٢٣٬۴۵۶'),'123456');
 let form={kind:'land',area_m2:'200',building_area_m2:'',commercial_area_m2:'',asking_price_toman:'',price_per_m2_toman:'',price_basis:'total'};
 form=priceUpdate(form,'asking_price_toman','6٬000٬000٬000');assert.equal(form.price_per_m2_toman,'30000000');
 form=priceUpdate(form,'price_per_m2_toman','۴۰٬۰۰۰٬۰۰۰');assert.equal(form.asking_price_toman,'8000000000');
 form=priceUpdate(form,'area_m2','250');assert.equal(form.asking_price_toman,'10000000000');
 form=priceUpdate(form,'asking_price_toman','5000000000');form=priceUpdate(form,'area_m2','100');assert.equal(form.price_per_m2_toman,'50000000');
 form=priceUpdate(form,'asking_price_toman','');assert.equal(form.price_per_m2_toman,'');
 assert.equal(areaField('apartment'),'building_area_m2');assert.equal(areaField('shop'),'commercial_area_m2');
});
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('seller form: three required fields, grouped price, empty optional map, no photos required',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-submission-'));const saved=new Map();let dom,instance,reactAct;
 const put=(k,v)=>{saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})};
 try{
  await writeFile(join(folder,'entry.tsx'),`export {RegistrationForm} from '../src/SellerRegistration';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';`);
  await build({root,configFile:false,plugins:[react()],define:{'import.meta.env.VITE_NESHAN_MAP_KEY':JSON.stringify('isolated-map-key')},logLevel:'silent',build:{lib:{entry:join(folder,'entry.tsx'),formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir/register',pretendToBeVisual:true});
  for(const k of ['window','document','HTMLElement','Element','Event','CustomEvent','navigator','location','localStorage','sessionStorage'])put(k,dom.window[k]);put('IS_REACT_ACT_ENVIRONMENT',true);put('ResizeObserver',class{observe(){}disconnect(){}});
  const calls=[];put('fetch',async(url,opts)=>{calls.push([String(url),opts]);return new Response(JSON.stringify(String(url).includes('submission-regions')?{items:[{slug:'R-QA',name:'تست'}]}:{id:'isolated-receipt',message:'ثبت شد'}),{status:200,headers:{'Content-Type':'application/json'}})});
  const maps=[];let selected;
  window.L={Map:class{constructor(){maps.push(this)}on(name,fn){if(name==='click')selected=fn}panTo(){}invalidateSize(){}remove(){}},marker(){return {addTo(){return this},remove(){}}}};
  const {RegistrationForm,act,createElement:h,createRoot}=await import(pathToFileURL(join(folder,'test.mjs')));reactAct=act;instance=createRoot(document.querySelector('#root'));
  await act(async()=>instance.render(h(RegistrationForm,{user:{id:'local-user',name:'آزمایش',phone:'09120000000',marketing_opt_in:false}})));
  const field=label=>[...document.querySelectorAll('label')].find(x=>x.textContent.startsWith(label))?.querySelector('input,select');
  const set=async(node,value)=>{await act(async()=>{const proto=node.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);node.dispatchEvent(new window.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}))})};
  const price=field('قیمت کل'),unit=field('قیمت هر متر');assert.ok(price.readOnly);await act(async()=>price.dispatchEvent(new window.FocusEvent('focusin',{bubbles:true})));assert.match(document.body.textContent,/ابتدا متراژ را وارد کنید/);
  assert.equal([...document.querySelectorAll('label')].some(x=>x.textContent.startsWith('محله یا محدوده')),false);
  assert.equal(document.querySelectorAll('input[required],select[required]').length,3);
  await set(field('متراژ زمین'),'200');await set(price,'6000000000');assert.equal(price.value,'6٬000٬000٬000');assert.equal(unit.value,'30٬000٬000');
  await set(unit,'40000000');assert.equal(price.value,'8٬000٬000٬000');await set(field('منطقهٔ زمین'),'R-QA');
  await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent==='ثبت روی نقشه').click());
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20))});assert.equal(maps.length,1);assert.equal(calls.some(([url])=>url.includes('map-listings')),false);
  await act(async()=>selected({latlng:{lat:27.76,lng:54.0}}));assert.match(document.body.textContent,/موقعیت انتخاب شد/);
  await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  const sent=calls.find(([url])=>url.includes('/property-submissions'));assert.ok(sent,document.body.textContent);const payload=JSON.parse(sent[1].body);assert.equal(payload.asking_price_toman,8000000000);assert.equal(payload.latitude,27.76);assert.equal(payload.longitude,54);assert.deepEqual(payload.media,[]);assert.equal('neighborhood' in payload,false);
 }finally{if(instance)await reactAct(async()=>instance.unmount());dom?.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):delete globalThis[k];await rm(folder,{recursive:true,force:true})}
});
test('decimal areas and large prices never become malformed scientific notation',()=>{
 let form={kind:'apartment',building_area_m2:'100.5',asking_price_toman:'',price_per_m2_toman:'',price_basis:'unit',price_error:''};
 form=priceUpdate(form,'price_per_m2_toman','20000000');assert.equal(form.asking_price_toman,'2010000000');
 form=priceUpdate(form,'price_per_m2_toman','9000000000000000');assert.equal(form.asking_price_toman,'');assert.ok(form.price_error);
});
