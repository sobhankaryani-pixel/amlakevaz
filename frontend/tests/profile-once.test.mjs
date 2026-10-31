import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('profile is saved once; success toast survives home redirect; returning OTP skips profile; failed save stays',async()=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-profile-test-'));
 const saved=new Map();let dom,instance;
 const put=(name,value)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true})};
 try{
  const entry=join(folder,'entry.tsx');await writeFile(entry,"export {default as Account} from '../src/SellerAccount';export {default as Toast} from '../src/shared/SiteToast';export {act,createElement,useState,useEffect} from 'react';export {createRoot} from 'react-dom/client';");
  await build({root,configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry,cssFileName:'test',formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir/account',pretendToBeVisual:true});
  for(const key of ['window','document','Element','HTMLElement','localStorage','sessionStorage','navigator','location','CustomEvent','Event'])put(key,dom.window[key]);
  put('IS_REACT_ACT_ENVIRONMENT',true);window.scrollTo=()=>{};
  let fail=true,puts=0;const bodies=[];const oldUser={id:'profile-test',phone:'09120000000',name:'',marketing_opt_in:true};
  put('fetch',async(url,options={})=>{
   let data={items:[]},status=200;
   if(options.method==='PUT'){puts++;const body=JSON.parse(options.body);bodies.push(body);status=fail?503:200;data=fail?{detail:'خطای آزمایشی'}:{user:{...oldUser,name:body.name}}}
   if(url.endsWith('/request-code'))data={message:'کد آزمایشی'};
   if(url.endsWith('/verify-code'))data={user:{...oldUser,name:'کاربر آزمایشی'}};
   return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  });
  const {Account,Toast,act,createElement:h,useState,useEffect,createRoot}=await import(pathToFileURL(join(folder,'test.mjs')));
  function Harness({initial}){
   const [user,setUser]=useState(initial),[path,setPath]=useState(location.pathname);
   useEffect(()=>{const update=()=>setPath(location.pathname);window.addEventListener('evaz:navigate',update);return()=>window.removeEventListener('evaz:navigate',update)},[]);
   return h('div',null,h(Toast),path==='/'?h('h1',null,'صفحهٔ اصلی'):h(Account,{user,onUser:setUser,onRegister:()=>{}}));
  }
  const settle=()=>new Promise(r=>setTimeout(r,30));
  const mount=async initial=>{instance=createRoot(document.querySelector('#root'));await act(async()=>{instance.render(h(Harness,{initial}));await settle()})};
  const unmount=async()=>{await act(async()=>instance.unmount());instance=null};
  const fill=async(selector,value)=>{const e=document.querySelector(selector);assert.ok(e,selector);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));await settle()})};
  const submit=async()=>{await act(async()=>{document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle()})};
  await mount(oldUser);assert.equal(document.querySelectorAll('form input').length,1);assert.equal(document.querySelectorAll('input[type=checkbox]').length,0);
  await fill('input[autocomplete=name]','   ');await submit();assert.equal(puts,0);assert.equal(location.pathname,'/account');
  await fill('input[autocomplete=name]','  کاربر آزمایشی  ');await submit();assert.equal(puts,1);assert.equal(location.pathname,'/account');assert.match(document.body.textContent,/خطای آزمایشی/);assert.equal(document.querySelector('.site-success-toast'),null);
  fail=false;await submit();assert.equal(puts,2);assert.deepEqual(bodies[1],{name:'کاربر آزمایشی',marketing_opt_in:true});assert.match(document.querySelector('.site-success-toast').textContent,/مشخصات با موفقیت ذخیره شد/);assert.ok(document.querySelector('button[type=submit],button.seller-submit').disabled);
  await submit();assert.equal(puts,2);
  await act(async()=>{await new Promise(r=>setTimeout(r,1000))});assert.equal(location.pathname,'/');assert.match(document.querySelector('h1').textContent,/صفحهٔ اصلی/);assert.ok(document.querySelector('.site-success-toast'));
  await unmount();window.history.replaceState(null,'','/account');await mount({...oldUser,name:'کاربر آزمایشی'});assert.equal(document.querySelector('input[autocomplete=name]'),null);assert.match(document.body.textContent,/درخواست‌های من/);
  await unmount();await mount(null);await fill('#seller-login-phone','09120000000');await submit();await fill('#seller-login-code','123456');await submit();assert.equal(location.pathname,'/');assert.equal(document.querySelector('input[autocomplete=name]'),null);
 }finally{
  if(instance)await (await import('react')).act(async()=>instance.unmount());dom?.window.close();for(const [name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}await rm(folder,{recursive:true,force:true});
 }
});
