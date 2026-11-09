import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';import react from '@vitejs/plugin-react';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('WebOTP listens before send, buffers early SMS, submits once, cancels stale work and preserves manual fallback',async t=>{
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),folder=await mkdtemp(join(root,'.qa-otp-'));
 const globals=new Map();const put=(name,value)=>{globals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true})};let dom,instance;
 try{
  await writeFile(join(folder,'entry.tsx'),"export {default as Account} from '../src/SellerAccount';export {act,createElement,useState} from 'react';export {createRoot} from 'react-dom/client';");
  await build({root,configFile:false,plugins:[react()],logLevel:'silent',build:{lib:{entry:join(folder,'entry.tsx'),cssFileName:'test',formats:['es'],fileName:()=> 'test.mjs'},outDir:folder,emptyOutDir:false,rollupOptions:{external:['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom/client']}}});
  process.env.NODE_ENV='test';dom=new JSDOM('<div id="root"></div>',{url:'https://evazmelk.ir/account',pretendToBeVisual:true});
  for(const key of ['window','document','Element','HTMLElement','localStorage','sessionStorage','navigator','location','CustomEvent','Event'])put(key,dom.window[key]);
  put('IS_REACT_ACT_ENVIRONMENT',true);window.scrollTo=()=>{};Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});window.OTPCredential=class{};
  let requests=[],verifications=[],listeners=[],logged=[],requestStatus=200,verifyStatus=200,requestResolve,holdRequest=false;
  Object.defineProperty(navigator,'credentials',{configurable:true,value:{get(options){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});listeners.push({options,resolve,reject});return promise}}});
  put('fetch',async(url,options={})=>{
   let data={items:[]},status=200;
   if(url.endsWith('/request-code')){if('OTPCredential' in window)assert.ok(listeners.length,'WebOTP must start before dispatching SMS');requests.push(JSON.parse(options.body));if(holdRequest)await new Promise(r=>requestResolve=r);status=requestStatus;data=status===200?{message:'کد آزمایشی ارسال شد'}:{detail:'ارسال انجام نشد'};}
   if(url.endsWith('/verify-code')){verifications.push(JSON.parse(options.body));status=verifyStatus;data=status===200?{user:{id:'otp-test',phone:'09120000000',name:'کاربر آزمایشی',residence_city:'اوز'}}:{detail:'کد نامعتبر است'};}
   return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  });
  const {Account,act,createElement:h,createRoot}=await import(pathToFileURL(join(folder,'test.mjs')));
  const settle=()=>new Promise(r=>setTimeout(r,20));
  const unmount=async()=>{if(instance){await act(async()=>instance.unmount());instance=null}};
  const mount=async({restore=false}={})=>{await unmount();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/account');requests=[];verifications=[];listeners=[];logged=[];requestStatus=200;verifyStatus=200;holdRequest=false;
   if(restore)sessionStorage.setItem('evaz:seller-otp:v1',JSON.stringify({phone:'09120000000',deadline:Date.now()+60000,expires:Date.now()+300000}));
   instance=createRoot(document.querySelector('#root'));await act(async()=>{instance.render(h(Account,{user:null,onUser:u=>logged.push(u),onRegister:()=>{}}));await settle()});};
  const fill=async(selector,value)=>{const el=document.querySelector(selector);assert.ok(el,selector);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));await settle()})};
  const submit=async()=>{await act(async()=>{document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle()})};
  const click=async(text)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(b,text);await act(async()=>{b.click();await settle()})};
  const sms=async(value,index=listeners.length-1)=>{await act(async()=>{listeners[index].resolve({code:value});await settle()})};
  await t.test('early SMS waits until the request succeeds; leading zero and normalized phone survive',async()=>{
   await mount();await fill('#seller-login-phone','+۹۸۹۱۲۳۴۵۶۷۸۹');holdRequest=true;await submit();assert.equal(requests[0].phone,'09123456789');
   await sms('012345');assert.equal(verifications.length,0);await act(async()=>{requestResolve();await settle()});
   assert.deepEqual(verifications,[{phone:'09123456789',code:'012345'}]);assert.equal(logged.length,1);assert.equal(location.pathname,'/');
   await act(async()=>{await settle()});assert.equal(verifications.length,1);
  });
  await t.test('Persian autofill/manual six digits submit once; errors do not cause an automatic loop',async()=>{
   await mount();await fill('#seller-login-phone','09120000000');await submit();verifyStatus=401;
   const input=document.querySelector('#seller-login-code');assert.equal(input.autocomplete,'one-time-code');assert.equal(document.querySelectorAll('.otp-cells span').length,6);
   await fill('#seller-login-code','۰۱۲۳۴');assert.equal(verifications.length,0);
   await fill('#seller-login-code','۰۱۲۳۴۵');assert.equal(verifications.length,1);assert.equal(verifications[0].code,'012345');
   await act(async()=>{await new Promise(r=>setTimeout(r,80))});assert.equal(verifications.length,1);assert.match(document.body.textContent,/کد نامعتبر/);
   assert.equal(listeners[0].options.signal.aborted,true);verifyStatus=200;await submit();assert.equal(verifications.length,2);assert.equal(logged.length,1);
  });
  await t.test('changing number cancels listening and ignores a late response',async()=>{
   await mount();await fill('#seller-login-phone','09120000000');await submit();await click('اصلاح شماره');assert.equal(listeners[0].options.signal.aborted,true);
   await sms('123456',0);assert.equal(verifications.length,0);assert.ok(document.querySelector('#seller-login-phone'));
  });
  await t.test('failed SMS request and unmount abort listeners; stale SMS never logs in',async()=>{
   await mount();await fill('#seller-login-phone','09120000000');requestStatus=503;await submit();assert.equal(listeners[0].options.signal.aborted,true);await sms('123456',0);assert.equal(verifications.length,0);
   requestStatus=200;await submit();const last=listeners.length-1;await unmount();assert.equal(listeners[last].options.signal.aborted,true);await sms('123456',last);assert.equal(logged.length,0);
  });
  await t.test('permission refusal keeps normal input and automatic submission available',async()=>{
   await mount();await fill('#seller-login-phone','09120000000');await submit();await act(async()=>{listeners[0].reject(new Error('Permission refused'));await settle()});await fill('#seller-login-code','654321');assert.equal(verifications.length,1);assert.equal(logged.length,1);
  });
  await t.test('unsupported browser still submits an autofilled code; malformed WebOTP code is ignored',async()=>{
   await mount();await fill('#seller-login-phone','09120000000');await submit();await sms('1234567');assert.equal(verifications.length,0);await fill('#seller-login-code','123456');assert.equal(verifications.length,1);
   await mount();delete window.OTPCredential;await fill('#seller-login-phone','09120000000');await submit();assert.equal(listeners.length,0);await fill('#seller-login-code','123456');assert.equal(verifications.length,1);window.OTPCredential=class{};
  });
  await t.test('restored verification screen listens again and retains the target phone',async()=>{await mount({restore:true});assert.ok(document.querySelector('#seller-login-code'));assert.equal(requests.length,0);await sms('012345');assert.equal(logged.length,1);assert.equal(verifications[0].phone,'09120000000')});
 }finally{
  if(instance)await(await import('react')).act(async()=>instance.unmount());dom?.window.close();for(const[k,v]of globals){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}await rm(folder,{recursive:true,force:true});
 }
});
