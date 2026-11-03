import {useSmsOtp} from './shared/useSmsOtp';
import {fetchWithTimeout as fetch} from './shared/http';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {navigate} from './shared/navigation';
import {RESIDENCE_CITIES,validResidenceCity} from './shared/residenceCities';
import {inviteAfterProfile} from './shared/SellInvitation';
import {showSuccessToast} from './shared/SiteToast';
import {normalizeDigits,normalizeSellerPhone,remainingSeconds,RESEND_SECONDS,loadChallenge,saveChallenge,clearChallenge} from './shared/sellerFlow';
const API='https://backend.evazmelk.ir';
export type SellerUser={id:string;phone:string;name:string;marketing_opt_in:boolean;residence_city?:string|null};
type Props={user:SellerUser|null;onUser:(user:SellerUser|null)=>void;onRegister:()=>void};
export default function SellerAccount({user,onUser,onRegister}:Props){
 const [challenge]=useState(loadChallenge);
 const [phone,setPhone]=useState(challenge?.phone||''),[code,setCode]=useState(''),[step,setStep]=useState<'phone'|'code'>(challenge?'code':'phone');
 const [deadline,setDeadline]=useState(challenge?.deadline||0),[now,setNow]=useState(Date.now);
 const seconds=remainingSeconds(deadline,now);
 const [sentPhone,setSentPhone]=useState(challenge?.phone||'');
 const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 const verifyLock=useRef(false),requestLock=useRef(false),lastAutomatic=useRef('');
 const sms=useSmsOtp(setCode);
 useEffect(()=>{if(challenge&&!user)sms.start();return sms.stop},[]);
 useEffect(()=>{if(user||!deadline)return;const tick=()=>setNow(Date.now());tick();const timer=window.setInterval(tick,1000);return()=>window.clearInterval(timer)},[deadline,user?.id]);
 const [residenceCity,setResidenceCity]=useState('');
 const [name,setName]=useState(''),[items,setItems]=useState<any[]>([]);
 const completed=Boolean(user?.name?.trim()&&validResidenceCity(user?.residence_city));
 const [completing,setCompleting]=useState(false);const redirectTimer=useRef<number|undefined>(undefined);
 useEffect(()=>()=>window.clearTimeout(redirectTimer.current),[]);
 const [submissionsLoading,setSubmissionsLoading]=useState(false),[submissionsError,setSubmissionsError]=useState(''),[submissionsRetry,setSubmissionsRetry]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setName(user?.name||'');setResidenceCity(user?.residence_city||'')},[user?.id]);
 useEffect(()=>{if(!user||!completed||completing)return;let live=true;const controller=new AbortController();setSubmissionsLoading(true);setSubmissionsError('');fetch(`${API}/api/seller/my-submissions`,{credentials:'include',signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('دریافت درخواست‌ها انجام نشد.');return r.json()}).then(d=>{if(live)setItems(d.items||[])}).catch(e=>{if(live)setSubmissionsError(e instanceof Error?e.message:'دریافت درخواست‌ها انجام نشد.')}).finally(()=>{if(live)setSubmissionsLoading(false)});return()=>{live=false;controller.abort()}},[user?.id,completed,completing,submissionsRetry]);
 async function send(path:string,body:object){const r=await fetch(API+path,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok){const error=new Error(typeof d.detail==='string'?d.detail:'درخواست انجام نشد') as Error&{status:number;retryAfter:number};error.status=r.status;error.retryAfter=Number(r.headers.get('Retry-After'))||RESEND_SECONDS;throw error}return d}
 async function requestCode(e?:FormEvent){
  e?.preventDefault();const normalized=normalizeSellerPhone(phone);
  if(busy||requestLock.current||verifyLock.current||(normalized===sentPhone&&remainingSeconds(deadline)>0))return;
  requestLock.current=true;lastAutomatic.current='';setCode('');sms.start();
  setBusy(true);setError('');setNotice('');
  try{
   const d=await send('/api/seller/auth/request-code',{phone:normalized});
   if(!mounted.current)return;
   const next=Date.now()+RESEND_SECONDS*1000;setPhone(normalized);setSentPhone(normalized);setDeadline(next);setNow(Date.now());saveChallenge(normalized,next);setNotice(d.message);setStep('code');
  }catch(e){
   sms.stop();setCode('');
   const error=e as Error&{status?:number;retryAfter?:number};
   if(error.status===429){setSentPhone(normalized);setDeadline(Date.now()+Math.max(1,error.retryAfter||RESEND_SECONDS)*1000);setNow(Date.now())}
   setError(e instanceof Error?e.message:'خطای اتصال');
  }finally{requestLock.current=false;setBusy(false)}
 }

 async function verify(e?:FormEvent,provided=code){
  e?.preventDefault();const value=normalizeDigits(provided).trim();
  if(user||step!=='code'||busy||verifyLock.current||requestLock.current||!/^[0-9]{6}$/.test(value))return;
  verifyLock.current=true;sms.stop();setBusy(true);setError('');
  // An unsuccessful automatic attempt must not loop against the server's limit.
  lastAutomatic.current=normalizeSellerPhone(phone)+':'+value;
  try{
   const d=await send('/api/seller/auth/verify-code',{phone:normalizeSellerPhone(phone),code:value});
   if(!mounted.current)return;
   clearChallenge();setDeadline(0);onUser(d.user);setNotice('');
   if(d.user?.name?.trim()&&validResidenceCity(d.user?.residence_city))navigate('home');
  }catch(e){setError(e instanceof Error?e.message:'کد نامعتبر است؛ آن را بررسی کنید.')}finally{verifyLock.current=false;setBusy(false)}
 }
 useEffect(()=>{
  const value=normalizeDigits(code).trim(),key=normalizeSellerPhone(phone)+':'+value;
  if(user||step!=='code'||busy||requestLock.current||verifyLock.current||!/^[0-9]{6}$/.test(value)||lastAutomatic.current===key)return;
  lastAutomatic.current=key;void verify(undefined,value);
 },[code,step,busy,phone,user?.id]);
 async function saveProfile(e:FormEvent){
  e.preventDefault();if(busy||completing)return;const fullName=name.trim();
  if(fullName.length<2){setError('نام و نام خانوادگی خود را وارد کنید.');return}
  if(!validResidenceCity(residenceCity)){setError('محل سکونت خود را انتخاب کنید.');return}
  setBusy(true);setError('');
  try{
   const r=await fetch(`${API}/api/seller/me`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:fullName,residence_city:residenceCity,marketing_opt_in:user?.marketing_opt_in||false})});
   const d=await r.json();if(!r.ok)throw Error(d.detail||'ثبت اطلاعات انجام نشد');
   if(!d.user?.name?.trim()||!validResidenceCity(d.user?.residence_city))throw Error('مشخصات کامل ذخیره نشد؛ دوباره تلاش کنید.');
   setCompleting(true);onUser(d.user);showSuccessToast('مشخصات با موفقیت ذخیره شد');
   redirectTimer.current=window.setTimeout(()=>{navigate('home');inviteAfterProfile(d.user.id)},900);
  }catch(e){setError(e instanceof Error?e.message:'خطا در ذخیره')}finally{setBusy(false)}
 }
 async function logout(){if(busy)return;setBusy(true);setError('');try{await send('/api/seller/auth/logout',{});onUser(null);clearChallenge();setDeadline(0);setCode('');setStep('phone');setNotice('از حساب خارج شدید.')}catch(e){setError(e instanceof Error?e.message:'خروج انجام نشد؛ دوباره تلاش کنید.')}finally{setBusy(false)}}
 if(!user)return <section className="account-login-scene" aria-label="ورود به حساب کاربری">
 <picture className="account-login-background"><source media="(max-width:900px)" srcSet="/visual/account-login-mobile.webp"/><img src="/visual/account-login-desktop.webp" alt="املاک خودمونی اوز؛ نخلستان و برکهٔ گنبدی اوز" fetchPriority="high"/></picture>
 <div className="account-login-card" dir="rtl"><img className="account-login-emblem" src="/brand/logo-emblem-v2.png" alt="لوگوی املاک خودمونی"/><h1>{step==='phone'?'ورود یا ثبت‌نام':'تأیید شماره موبایل'}</h1><p className="account-login-intro">{step==='phone'?'شماره موبایل خود را وارد کنید.':<>کد شش‌رقمی ارسال‌شده به <b dir="ltr">{phone}</b> را وارد کنید.</>}</p>
 {error&&<p role="alert" className="seller-error">{error}</p>}{notice&&<p role="status" className="seller-success">{notice}</p>}
 {step==='phone'?<form onSubmit={requestCode} aria-busy={busy}><label htmlFor="seller-login-phone">شماره موبایل</label><div className="account-phone-field"><input id="seller-login-phone" name="phone" required type="tel" inputMode="tel" dir="ltr" value={phone} autoComplete="tel" onChange={e=>setPhone(normalizeDigits(e.target.value))} placeholder="09123456789" disabled={busy}/><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 3 3 5c-1 6 10 17 16 16l2-3-5-4-2 2c-3-1-5-3-6-6l2-2Z" strokeLinejoin="round"/></svg></div><button className="account-login-primary" disabled={busy||(normalizeSellerPhone(phone)===sentPhone&&seconds>0)}>{busy?<span className="account-login-spinner" aria-hidden="true"/>:<span className="account-login-arrow" aria-hidden="true">➜</span>}{busy?'در حال ارسال…':normalizeSellerPhone(phone)===sentPhone&&seconds>0?`ارسال مجدد تا ${seconds.toLocaleString('fa-IR')} ثانیهٔ دیگر`:'ارسال کد ورود'}</button><a className="account-agency-entry" href="/agency">ورود بنگاه‌داران</a></form>:<form onSubmit={e=>void verify(e)} aria-busy={busy}><label htmlFor="seller-login-code">کد ورود</label><input id="seller-login-code" name="code" className="account-code-field" required type="text" inputMode="numeric" dir="ltr" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" autoFocus enterKeyHint="done" spellCheck={false} value={code} onChange={e=>{const next=normalizeDigits(e.target.value).replace(/[^0-9]/g,'').slice(0,6);if(next!==code)lastAutomatic.current='';setError('');setCode(next)}} disabled={busy}/><button className="account-login-primary" disabled={busy}>{busy&&<span className="account-login-spinner" aria-hidden="true"/>}{busy?'در حال ورود…':'تأیید و ورود'}</button><p className="seller-privacy">با تکمیل کد شش‌رقمی، ورود خودکار انجام می‌شود.</p><a className="account-agency-entry" href="/agency">ورود بنگاه‌داران</a><div className="account-code-actions"><button type="button" className="account-link" disabled={busy||seconds>0} onClick={()=>void requestCode()}>{seconds>0?`ارسال مجدد تا ${seconds.toLocaleString('fa-IR')} ثانیهٔ دیگر`:'ارسال مجدد کد'}</button><button type="button" className="account-link" disabled={busy} onClick={()=>{sms.stop();clearChallenge();lastAutomatic.current='';setStep('phone');setCode('');setError('');setNotice('')}}>تغییر شماره</button></div></form>}
 </div></section>;
 return <section className="content-section seller-page"><div className="page-heading"><span className="section-kicker">حساب املاک خودمونی</span><h1>حساب من</h1><p>اطلاعات حساب و درخواست‌های ثبت ملک شما</p></div>{error&&<p role="alert" className="seller-error">{error}</p>}{notice&&<p role="status" className="seller-success">{notice}</p>}
 <><div className="seller-step auth-panel"><h2>{!completed||completing?'مشخصات حساب':'حساب کاربری'}</h2><p>شمارهٔ تأییدشده: <b dir="ltr">{user.phone}</b></p>{!completed||completing?<form onSubmit={saveProfile} aria-busy={busy||completing}><label>نام و نام خانوادگی<input required autoComplete="name" minLength={2} maxLength={120} value={name} disabled={busy||completing} onChange={e=>setName(e.target.value)}/></label><label>محل سکونت<select className="seller-residence" required autoComplete="address-level2" value={residenceCity} disabled={busy||completing} onChange={e=>setResidenceCity(e.target.value)}><option value="" disabled>شهر محل سکونت را انتخاب کنید</option>{RESIDENCE_CITIES.map(city=><option value={city} key={city}>{city}</option>)}</select></label><button className="seller-submit" disabled={busy||completing}>{completing?'در حال انتقال به صفحهٔ اصلی…':busy?'در حال ذخیره…':'ذخیرهٔ مشخصات'}</button></form>:<p>{user.name}<br/>محل سکونت: {user.residence_city}</p>}{completed&&!completing&&<div className="account-actions"><button type="button" onClick={onRegister}>ثبت ملک برای فروش</button><button type="button" disabled={busy} onClick={logout}>خروج از حساب</button></div>}</div>{completed&&!completing&&<div className="seller-step"><h2>درخواست‌های من</h2>{submissionsLoading?<p role="status">در حال دریافت درخواست‌ها…</p>:submissionsError?<div role="alert"><p>{submissionsError}</p><button type="button" className="account-link" onClick={()=>setSubmissionsRetry(v=>v+1)}>تلاش مجدد</button></div>:items.length?<ul className="seller-submissions">{items.map(x=><li key={x.id}><span>{({land:'زمین',villa:'خانهٔ ویلایی',apartment:'آپارتمان',mehr:'مسکن مهر',national:'مسکن ملی',garden:'باغ شهری',shop:'مغازه'} as Record<string,string>)[x.kind]||x.kind}</span><span>{({pending:'در انتظار بررسی',approved:'منتشرشده',rejected:'تأیید نشده'} as Record<string,string>)[x.status]||x.status}</span><small>{new Date(x.created_at).toLocaleDateString('fa-IR')}</small></li>)}</ul>:<p>هنوز درخواستی ثبت نکرده‌اید.</p>}</div>}</></section>;
}
