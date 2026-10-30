import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('seller new types survive draft restore and submit correct fields; admin reaches item 245 and transfers both types',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-step08-'));
 const saved=new Map();const put=(name,value)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true})};let instance,dom;
 try{
  const entry=join(folder,'entry.tsx');await writeFile(entry,"export {default as App} from '../src/App';export {default as Seller} from '../../frontend/src/SellerRegistration';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';");
  await build({root,configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry,cssFileName:'test',formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir/register',pretendToBeVisual:true});
  for(const key of ['window','document','Element','HTMLElement','localStorage','sessionStorage','navigator','location'])put(key,dom.window[key]);put('IS_REACT_ACT_ENVIRONMENT',true);window.scrollTo=()=>{};
  const id='00000000-0000-4000-8000-000000000001',sent=[],offsets=[];let fail=false;
  const requests=[{id:'shop-request',kind:'shop',details:{commercial_area_m2:55,street_frontage_m:5,asking_price_toman:5000000000,region_key:'R-01',extra_details:'توضیح مغازه',media:[]}},{id:'garden-request',kind:'garden',details:{area_m2:300,land_length_m:20,land_width_m:15,asking_price_toman:5000000000,region_key:'R-01',extra_details:'توضیح باغ',media:[]}}];
  put('fetch',async(url,options={})=>{
   let data={},status=200;
   if(url.endsWith('/submission-regions'))data={items:[{slug:'R-01',name:'مرکز شهر'}]};
   if(url.endsWith('/property-submissions')&&options.method==='POST'){sent.push(JSON.parse(options.body));data={id,message:'درخواست ثبت شد'}};
   if(url.endsWith('/admin/me'))data={sub:id,role:'owner'};
   if(url.endsWith('/reference'))data={property_types:[{id,code:'raw_land',name:'زمین'},{id:'shop-type',code:'shop',name:'مغازه'},{id:'garden-type',code:'urban_garden',name:'باغ شهری'}],regions:[{id,slug:'R-01',name:'مرکز شهر'}]};
   if(url.includes('/properties/direct?')){
    const params=new URL(url).searchParams,offset=Number(params.get('offset'));offsets.push(offset);
    let code=(params.get('code')||'').replace(/[۰-۹]/g,x=>String(x.charCodeAt(0)-1776));
    const all=Array.from({length:245},(_,i)=>({public_code:String(245-i).padStart(3,'0'),property_type:'زمین',property_type_code:'raw_land',region:'مرکز',status:'آگهی فروش',area_m2:100,asking_price_toman:5000000000})).filter(x=>x.public_code.includes(code));
    data={items:all.slice(offset,offset+50),total:all.length,offset,limit:50};if(fail){fail=false;status=503;data={detail:'خطای آزمایشی'}}
   }
   if(url.endsWith('/admin/property-submissions')&&!options.method)data={items:requests.map(x=>({...x,seller_name:'آزمایشی',seller_phone:'09212745755',created_at:'2026-10-30T00:00:00Z'}))};
   if(url.endsWith('/reserve-code'))data={public_code:'999',reservation_id:id};
   return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  });
  const {App,Seller,act,createElement,createRoot}=await import(pathToFileURL(join(folder,'test.mjs')));const settle=()=>new Promise(r=>setTimeout(r,50));
  const mount=async component=>{instance=createRoot(document.querySelector('#root'));await act(async()=>{instance.render(component);await settle()})};
  const click=async(text,index=0)=>{const button=[...document.querySelectorAll('button')].filter(x=>x.textContent===text)[index];assert.ok(button,text);await act(async()=>{button.click();await settle()})};
  const fill=async(label,value)=>{const element=[...document.querySelectorAll('label')].find(x=>x.textContent.startsWith(label))?.querySelector('input');assert.ok(element,label);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}));await settle()})};
  const seller=createElement(Seller,{user:{id,name:'آزمایشی',phone:'09212745755'},onLogin:()=>{}});await mount(seller);
  await click('مغازه');await fill('متراژ مغازه','55');await fill('بر مغازه','5');await fill('قیمت پیشنهادی','5000000000');
  await act(async()=>instance.unmount());instance=null;await mount(seller);assert.equal(document.querySelector('.seller-kinds button.active').textContent,'مغازه');
  await act(async()=>{document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await settle()});assert.equal(sent[0].kind,'shop');assert.equal(sent[0].commercial_area_m2,55);assert.equal(sent[0].street_frontage_m,5);assert.equal(sent[0].area_m2,null);
  await click('باغ شهری');await fill('متراژ باغ شهری','300');await fill('طول باغ','20');await fill('عرض باغ','15');await fill('قیمت پیشنهادی','5000000000');
  await act(async()=>instance.unmount());instance=null;await mount(seller);assert.equal(document.querySelector('.seller-kinds button.active').textContent,'باغ شهری');
  await act(async()=>{document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await settle()});assert.equal(sent[1].kind,'garden');assert.equal(sent[1].area_m2,300);assert.equal(sent[1].commercial_area_m2,null);
  await act(async()=>instance.unmount());instance=null;localStorage.setItem('evazmelk_admin_token','test-only');await mount(createElement(App));
  await click('املاک ثبت‌شده');assert.ok(document.body.textContent.includes('245'));await click('صفحهٔ آخر');assert.equal(offsets.at(-1),200);assert.ok(document.body.textContent.includes('001'));
  await fill('پیدا کردن کد ملک','۱۴۵');await click('جستجوی کد');assert.equal(document.querySelectorAll('tbody tr').length,1);assert.ok(document.querySelector('tbody').textContent.includes('145'));
  fail=true;await click('نمایش همه و تازه‌سازی');assert.ok(document.body.textContent.includes('خطای آزمایشی'));await click('تلاش مجدد دریافت املاک');assert.equal(document.querySelectorAll('tbody tr').length,50);
  await click('درخواست‌های ثبت ملک');await click('انتقال به فرم ثبت',0);assert.ok(document.body.textContent.includes('مشخصات مغازه'));assert.ok([...document.querySelectorAll('input')].some(x=>x.value==='55'));
  await click('درخواست‌های ثبت ملک');await click('انتقال به فرم ثبت',1);assert.ok(document.body.textContent.includes('مشخصات باغ شهری'));assert.ok([...document.querySelectorAll('input')].some(x=>x.value==='300'));
  await act(async()=>instance.unmount());instance=null;
 }finally{if(instance)instance.unmount();dom?.window.close();for(const [key,value]of saved)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];await rm(folder,{recursive:true,force:true})}
});
