import {useEffect,useState,type FormEvent} from 'react';
import {normalizeDigits,normalizeSellerPhone,remainingSeconds,RESEND_SECONDS,loadChallenge,saveChallenge,clearChallenge} from './shared/sellerFlow';
const API='https://api.evazmelk.ir';
export type SellerUser={id:string;phone:string;name:string;marketing_opt_in:boolean};
type Props={user:SellerUser|null;onUser:(user:SellerUser|null)=>void;onRegister:()=>void};
export default function SellerAccount({user,onUser,onRegister}:Props){
 const [challenge]=useState(loadChallenge);
 const [phone,setPhone]=useState(challenge?.phone||''),[code,setCode]=useState(''),[step,setStep]=useState<'phone'|'code'>(challenge?'code':'phone');
 const [deadline,setDeadline]=useState(challenge?.deadline||0),[now,setNow]=useState(Date.now);
 const seconds=remainingSeconds(deadline,now);
 const [sentPhone,setSentPhone]=useState(challenge?.phone||'');
 useEffect(()=>{if(user||!deadline)return;const tick=()=>setNow(Date.now());tick();const timer=window.setInterval(tick,1000);return()=>window.clearInterval(timer)},[deadline,user?.id]);
 const [name,setName]=useState(''),[consent,setConsent]=useState(false),[items,setItems]=useState<any[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setName(user?.name||'');setConsent(user?.marketing_opt_in||false);if(user)fetch(`${API}/api/seller/my-submissions`,{credentials:'include'}).then(r=>r.ok?r.json():{items:[]}).then(d=>setItems(d.items||[])).catch(()=>setItems([]))},[user?.id]);
 async function send(path:string,body:object){const r=await fetch(API+path,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok){const error=new Error(typeof d.detail==='string'?d.detail:'درخواست انجام نشد') as Error&{status:number;retryAfter:number};error.status=r.status;error.retryAfter=Number(r.headers.get('Retry-After'))||RESEND_SECONDS;throw error}return d}
 async function requestCode(e?:FormEvent){
  e?.preventDefault();const normalized=normalizeSellerPhone(phone);
  if(busy||(normalized===sentPhone&&remainingSeconds(deadline)>0))return;
  setBusy(true);setError('');setNotice('');
  try{
   const d=await send('/api/seller/auth/request-code',{phone:normalized});
   const next=Date.now()+RESEND_SECONDS*1000;setPhone(normalized);setSentPhone(normalized);setDeadline(next);setNow(Date.now());saveChallenge(normalized,next);setCode('');setNotice(d.message);setStep('code');
  }catch(e){
   const error=e as Error&{status?:number;retryAfter?:number};
   if(error.status===429){setSentPhone(normalized);setDeadline(Date.now()+Math.max(1,error.retryAfter||RESEND_SECONDS)*1000);setNow(Date.now())}
   setError(e instanceof Error?e.message:'خطای اتصال');
  }finally{setBusy(false)}
 }

 async function verify(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const d=await send('/api/seller/auth/verify-code',{phone:normalizeSellerPhone(phone),code:normalizeDigits(code).trim()});clearChallenge();setDeadline(0);onUser(d.user);setNotice('ورود موفق بود. نام خود را ثبت کنید.')}catch(e){setError(e instanceof Error?e.message:'کد نامعتبر است')}finally{setBusy(false)}}
 async function saveProfile(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch(`${API}/api/seller/me`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,marketing_opt_in:consent})});const d=await r.json();if(!r.ok)throw Error(d.detail||'ثبت اطلاعات انجام نشد');onUser(d.user);setNotice('اطلاعات حساب ذخیره شد.')}catch(e){setError(e instanceof Error?e.message:'خطا در ذخیره')}finally{setBusy(false)}}
 async function logout(){await send('/api/seller/auth/logout',{});onUser(null);clearChallenge();setDeadline(0);setCode('');setStep('phone');setNotice('از حساب خارج شدید.')}
 return <section className="content-section seller-page"><div className="page-heading"><a className="account-admin-entry" href="https://admin.evazmelk.ir">ورود ادمین <span aria-hidden="true">↗</span></a><span className="section-kicker">حساب املاک خودمونی</span><h1>{user?'حساب من':'ورود یا ثبت‌نام'}</h1><p>برای ثبت ملک، شمارهٔ موبایل خود را با کد یک‌بارمصرف تأیید کنید.</p></div>
 {error&&<p role="alert" className="seller-error">{error}</p>}{notice&&<p role="status" className="seller-success">{notice}</p>}
 {!user?<div className="seller-step auth-panel">{step==='phone'?<form onSubmit={requestCode}><h2>شمارهٔ موبایل</h2><label>موبایل<input required type="tel" inputMode="tel" dir="ltr" value={phone} autoComplete="tel" onChange={e=>setPhone(normalizeDigits(e.target.value))} placeholder="09123456789"/></label><button className="seller-submit" disabled={busy||(normalizeSellerPhone(phone)===sentPhone&&seconds>0)}>{busy?'در حال ارسال…':normalizeSellerPhone(phone)===sentPhone&&seconds>0?`ارسال مجدد تا ${seconds.toLocaleString('fa-IR')} ثانیهٔ دیگر`:'ارسال کد ورود'}</button></form>:<form onSubmit={verify}><h2>کد پیامک‌شده</h2><p>کد شش‌رقمی ارسال‌شده به {phone} را وارد کنید.</p><label>کد ورود<input required type="text" inputMode="numeric" dir="ltr" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={e=>setCode(normalizeDigits(e.target.value).replace(/\s/g,''))}/></label><button className="seller-submit" disabled={busy}>تأیید و ورود</button><button type="button" className="account-link" disabled={busy||seconds>0} onClick={()=>void requestCode()}>{seconds>0?`ارسال مجدد تا ${seconds.toLocaleString('fa-IR')} ثانیهٔ دیگر`:'ارسال مجدد کد'}</button><button type="button" className="account-link" disabled={busy} onClick={()=>{setStep('phone');setCode('');setError('');setNotice('')}}>تغییر شماره</button></form>}</div>:<><div className="seller-step auth-panel"><h2>مشخصات حساب</h2><p>شمارهٔ تأییدشده: <b dir="ltr">{user.phone}</b></p><form onSubmit={saveProfile}><label>نام و نام خانوادگی<input required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><label className="consent-choice"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> مایل هستم پیامک‌های اطلاع‌رسانی و پیشنهادهای املاک خودمونی را دریافت کنم.</label><p className="seller-privacy">این انتخاب اختیاری است و هر وقت بخواهید می‌توانید آن را تغییر دهید.</p><button className="seller-submit" disabled={busy}>ذخیرهٔ حساب</button></form><div className="account-actions"><button type="button" onClick={onRegister}>ثبت ملک برای فروش</button><button type="button" onClick={logout}>خروج از حساب</button></div></div><div className="seller-step"><h2>درخواست‌های من</h2>{items.length?<ul className="seller-submissions">{items.map(x=><li key={x.id}><span>{({land:'زمین',villa:'خانهٔ ویلایی',apartment:'آپارتمان',mehr:'مسکن مهر',national:'مسکن ملی'} as Record<string,string>)[x.kind]||x.kind}</span><span>{({pending:'در انتظار بررسی',approved:'منتشرشده',rejected:'تأیید نشده'} as Record<string,string>)[x.status]||x.status}</span><small>{new Date(x.created_at).toLocaleDateString('fa-IR')}</small></li>)}</ul>:<p>هنوز درخواستی ثبت نکرده‌اید.</p>}</div></>}
 </section>
}
