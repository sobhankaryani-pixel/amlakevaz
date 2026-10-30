import {useState} from 'react';
type Campaign={has_session:boolean;source:string;medium:string;campaign:string;referrer:string;sessions:number;views:number;phone_clicks:number;whatsapp_clicks:number;contact_submissions:number;property_submissions:number;form_sessions:number;form_rate:number|null};
const number=(value:unknown)=>Number(value||0).toLocaleString('fa-IR');
export default function CampaignReport({rows}:{rows:Campaign[]}){
 const [source,setSource]=useState('instagram'),[medium,setMedium]=useState('social'),[campaign,setCampaign]=useState(''),[destination,setDestination]=useState('/'),[code,setCode]=useState(''),[copied,setCopied]=useState('');
 const validLabel=(v:string)=>v.length<=120&&/^[\p{L}\p{N}_ .\-]+$/u.test(v.trim());
 let link='';
 if(validLabel(source)&&validLabel(medium)&&validLabel(campaign)&&(destination!=='property'||!!code.trim())){
  const url=new URL(destination==='property'?'/properties/'+encodeURIComponent(code.trim()):destination,'https://evazmelk.ir');
  url.searchParams.set('utm_source',source.trim());url.searchParams.set('utm_medium',medium.trim());url.searchParams.set('utm_campaign',campaign.trim());link=url.href;
 }
 async function copy(){try{await navigator.clipboard.writeText(link);setCopied('لینک کپی شد.')}catch{setCopied('لینک را از کادر بالا انتخاب و کپی کنید.')}}
 return <><h3>نتیجهٔ تبلیغات و ثبت موفق درخواست</h3><p>کلیک تماس یا واتساپ، تأیید انجام مکالمه نیست. «فرم موفق» فقط پس از ذخیرهٔ درخواست در سرور شمرده می‌شود. درصد ثبت فرم = نشست‌های دارای حداقل یک فرم موفق ÷ نشست‌های همان منبع؛ تکرار فرم در یک نشست این درصد را زیاد نمی‌کند.</p>
 <div className="table-wrap"><table><thead><tr><th>منبع / رسانه</th><th>کمپین</th><th>ارجاع‌دهنده</th><th>نشست</th><th>بازدید صفحه</th><th>کلیک تماس</th><th>کلیک واتساپ</th><th>فرم تماس موفق</th><th>درخواست ملک موفق</th><th>نشست دارای فرم</th><th>درصد ثبت فرم</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={11}>در این بازه هنوز آماری ثبت نشده است.</td></tr>:rows.map((x,i)=><tr key={i}><td>{!x.has_session?'بدون انتساب':x.source||'مستقیم / نامشخص'}<br/><small>{x.medium||'—'}</small></td><td>{x.campaign||'—'}</td><td>{x.referrer||'—'}</td><td>{number(x.sessions)}</td><td>{number(x.views)}</td><td>{number(x.phone_clicks)}</td><td>{number(x.whatsapp_clicks)}</td><td>{number(x.contact_submissions)}</td><td>{number(x.property_submissions)}</td><td>{number(x.form_sessions)}</td><td>{x.form_rate==null?'—':number(x.form_rate)+'٪'}</td></tr>)}</tbody></table></div>
 <p className="hint">انتساب به اولین رویداد هر نشست است. ورود از لینک تبلیغ جدید، نشست جداگانه می‌سازد. آمار بازه بر اساس زمان رخداد است؛ نشست‌های بدون بازدید ثبت‌شده هم ممکن است دیده شوند. فرم‌های قدیمی یا بدون مجوز آمار، در ردیف «بدون انتساب» و بدون درصد می‌آیند. ثبت درخواست ملک به معنی انتشار آگهی یا انجام معامله نیست.</p>
 <details><summary>ساخت لینک مخصوص تبلیغ</summary><p>برای هر تبلیغ نام جداگانه انتخاب کن و لینک خروجی را در همان تبلیغ بگذار. از نام، شمارهٔ مشتری یا اطلاعات محرمانه در این کادرها استفاده نکن.</p><div className="report-toolbar">
 <label>منبع<input value={source} maxLength={120} onChange={e=>{setSource(e.target.value);setCopied('')}} placeholder="instagram"/></label>
 <label>رسانه<input value={medium} maxLength={120} onChange={e=>{setMedium(e.target.value);setCopied('')}} placeholder="social یا sms"/></label>
 <label>نام کمپین<input value={campaign} maxLength={120} onChange={e=>{setCampaign(e.target.value);setCopied('')}} placeholder="aban_1405"/></label>
 <label>مقصد<select value={destination} onChange={e=>{setDestination(e.target.value);setCopied('')}}><option value="/">صفحهٔ اصلی</option><option value="/search">جستجوی ملک</option><option value="/contact">تماس با ما</option><option value="/register">ثبت ملک</option><option value="property">یک آگهی مشخص</option></select></label>
 {destination==='property'&&<label>کد آگهی<input value={code} maxLength={80} onChange={e=>{setCode(e.target.value);setCopied('')}}/></label>}</div>
 {!link?<p>منبع، رسانه و نام کمپین را با حروف، عدد، فاصله، نقطه، خط تیره یا زیرخط وارد کن.</p>:<><input aria-label="لینک آمادهٔ تبلیغ" readOnly dir="ltr" value={link} onFocus={e=>e.currentTarget.select()} style={{width:'100%',boxSizing:'border-box'}}/><button type="button" onClick={()=>void copy()}>کپی لینک تبلیغ</button></>}{copied&&<p role="status">{copied}</p>}</details>
 </>;
}
