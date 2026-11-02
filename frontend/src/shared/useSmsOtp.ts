import {useCallback,useEffect,useRef} from 'react';
import {normalizeDigits} from './sellerFlow';
type SmsCredential={code?:string}|null;
type SmsCredentials={get:(options:{otp:{transport:['sms']};signal:AbortSignal})=>Promise<SmsCredential>};
/** Listen before requesting an SMS. Browser permission is owned by the browser. */
export function useSmsOtp(onCode:(code:string)=>void){
 const receive=useRef(onCode);receive.current=onCode;
 const current=useRef<AbortController|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),generation=useRef(0);
 const stop=useCallback(()=>{
  generation.current++;clearTimeout(timer.current);timer.current=undefined;
  current.current?.abort();current.current=null;
 },[]);
 const start=useCallback(()=>{
  stop();
  if(!window.isSecureContext||!('OTPCredential' in window)||!navigator.credentials?.get)return;
  const controller=new AbortController(),cycle=generation.current;current.current=controller;
  timer.current=setTimeout(()=>{if(current.current===controller)stop()},120000);
  try{
   // OTP is absent from some versions of lib.dom; keep that cast local.
   const credentials=navigator.credentials as unknown as SmsCredentials;
   void credentials.get({otp:{transport:['sms']},signal:controller.signal}).then(result=>{
    if(controller.signal.aborted||cycle!==generation.current)return;
    const code=normalizeDigits(result?.code||'').trim();
    if(/^[0-9]{6}$/.test(code))receive.current(code);
    if(current.current===controller){clearTimeout(timer.current);current.current=null}
   }).catch(()=>{
    // Cancellation, refusal, timeout and unsupported browsers retain manual entry.
    if(current.current===controller){clearTimeout(timer.current);current.current=null}
   });
  }catch{if(current.current===controller){clearTimeout(timer.current);current.current=null}}
 },[stop]);
 useEffect(()=>stop,[stop]);
 return {start,stop};
}
