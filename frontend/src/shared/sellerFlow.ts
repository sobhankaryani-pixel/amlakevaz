import type {MediaItem} from './MediaUploader';

export const DRAFT_TTL=7*24*60*60*1000;
export const RESEND_SECONDS=60;
export function normalizeDigits(value:string){
 return value.replace(/[۰-۹٠-٩]/g,c=>String(c.charCodeAt(0)-(c>='۰'&&c<='۹'?1776:1632)));
}
export function normalizeSellerPhone(value:string){
 let phone=normalizeDigits(value).replace(/[\s()-]/g,'');
 if(phone.startsWith('+98'))phone='0'+phone.slice(3);
 else if(phone.startsWith('0098'))phone='0'+phone.slice(4);
 else if(/^98\d{10}$/.test(phone))phone='0'+phone.slice(2);
 return phone;
}
export function remainingSeconds(deadline:number,now=Date.now()){
 return Math.max(0,Math.ceil((deadline-now)/1000));
}
export function draftKey(userId:string){return 'evaz:seller-draft:v1:'+userId}
export function readDraft<T extends Record<string,string>>(storage:Pick<Storage,'getItem'>,key:string,defaults:T,now=Date.now()):{form:T;media:MediaItem[];restored:boolean}{
 const fallback={form:{...defaults},media:[] as MediaItem[],restored:false};
 try{
  const data=JSON.parse(storage.getItem(key)||'null');
  if(!data||data.version!==1||typeof data.savedAt!=='number'||data.savedAt>now+60000||now-data.savedAt>DRAFT_TTL||!data.form||!['land','villa','apartment','mehr','national','shop','garden'].includes(data.form.kind))return fallback;
  const form={...defaults};
  for(const name of Object.keys(defaults))if(typeof data.form[name]==='string'&&name!=='website')(form as Record<string,string>)[name]=data.form[name];
  const media:MediaItem[]=Array.isArray(data.media)?data.media.filter((x:MediaItem)=>x&&['image','video'].includes(x.kind)&&typeof x.url==='string'&&/^https:\/\/api\.evazmelk\.ir\/api\/public\/media\//.test(x.url)).slice(0,14):[];
  return {form,media,restored:true};
 }catch{return fallback}
}
export function writeDraft(storage:Pick<Storage,'setItem'|'removeItem'>,key:string,form:Record<string,string>,media:MediaItem[],now=Date.now()){
 const filled=Object.entries(form).some(([key,value])=>!['kind','seller_name','seller_phone','website'].includes(key)&&value!=='');
 if(!filled&&!media.length){storage.removeItem(key);return}
 storage.setItem(key,JSON.stringify({version:1,savedAt:now,form:{...form,website:''},media}));
}
const CHALLENGE_KEY='evaz:seller-otp:v1';
export function loadChallenge(){
 try{const data=JSON.parse(sessionStorage.getItem(CHALLENGE_KEY)||'null');if(data&&/^09[0-9]{9}$/.test(data.phone)&&Number.isFinite(data.deadline)&&Number.isFinite(data.expires)&&data.expires>Date.now())return data as {phone:string;deadline:number;expires:number}}catch{}
 return null;
}
export function saveChallenge(phone:string,deadline:number){
 try{sessionStorage.setItem(CHALLENGE_KEY,JSON.stringify({phone,deadline,expires:Date.now()+5*60*1000}))}catch{}
}
export function clearChallenge(){try{sessionStorage.removeItem(CHALLENGE_KEY)}catch{}}
