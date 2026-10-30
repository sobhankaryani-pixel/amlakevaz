import {useState} from 'react';
import {fetchWithTimeout as fetch} from './http';
type Item={id:string;url:string;filename:string;kind:string;size_bytes:number;created_at:string;cleanup_state:string;preview_token:string};
type Report={registered:{files:number;bytes:number};candidates:{files:number;bytes:number};items:Item[];offset:number};
const size=(value:number)=>(Number(value||0)/1024/1024).toLocaleString('fa-IR',{maximumFractionDigits:2})+' مگابایت';
export default function MediaCleanup({token}:{token:string}){
 const [report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[selected,setSelected]=useState<Item|null>(null),[confirmation,setConfirmation]=useState('');
 async function request(path:string,options:RequestInit={}){
  const response=await fetch('https://api.evazmelk.ir/api/admin/media/'+path,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});
  const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'دریافت اطلاعات فایل‌ها انجام نشد.');return data;
 }
 async function scan(offset=0){setBusy(true);setError('');setSelected(null);setConfirmation('');try{setReport(await request('cleanup-preview?offset='+offset))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function remove(){
  if(!selected||confirmation.trim()!=='حذف دائمی'||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await request('cleanup-delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected.id,preview_token:selected.preview_token,confirm:confirmation.trim()})});
   setNotice(result.already_deleted?'این فایل قبلاً حذف شده است.':'حذف فایل از فضای نگهداری تأیید شد.');setSelected(null);setConfirmation('');setReport(await request('cleanup-preview?offset=0'));
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section style={{borderTop:'1px solid #dce3eb',marginTop:24,paddingTop:20}}><h3>فایل‌های بلااستفاده — فقط مالک اصلی</h3><p>«حذف از آگهی» فقط عکس را از فرم کنار می‌گذارد. این بخش برای آزاد کردن فضای فایل‌هایی است که بیش از ۳۰ روز نگهداری شده‌اند، مهلت پیش‌نویسشان تمام شده و به هیچ ملک، درخواست ثبت ملک یا بنری وصل نیستند. درخواست‌ها با هر وضعیت، حتی ردشده، محافظت می‌شوند.</p><p>پاک‌سازی خودکار انجام نمی‌شود. حذف نهایی قابل بازگشت نیست؛ عکس و فیلم در بکاپ دیتابیس وجود ندارند. فایل‌های پیش‌نویس هنگام باز بودن فرم، مهلت ۳۰ روزهٔ تازه می‌گیرند.</p>
 <button type="button" disabled={busy} onClick={()=>{setNotice('');void scan()}}>{busy?'در حال بررسی…':'بررسی فایل‌های بلااستفاده'}</button>{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success">{notice}</p>}
 {report&&<><p>فایل‌های ثبت‌شده و حذف‌نشده: {Number(report.registered.files).toLocaleString('fa-IR')} · حجم ثبت‌شده: {size(report.registered.bytes)}<br/>نامزد بررسی برای حذف: {Number(report.candidates.files).toLocaleString('fa-IR')} · حجم احتمالی قابل آزادسازی: {size(report.candidates.bytes)}</p>
 {report.items.length===0?<p>در این صفحه فایل واجد شرایطی وجود ندارد. فایل تازه، استفاده‌شده یا دارای مهلت پیش‌نویس نشان داده نمی‌شود.</p>:<div className="table-wrap"><table><thead><tr><th>فایل</th><th>نوع / حجم</th><th>تاریخ بارگذاری</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{report.items.map(item=><tr key={item.id}><td><a href={item.url} target="_blank" rel="noopener noreferrer">مشاهدهٔ فایل در تب جدید</a><br/><small dir="ltr" style={{overflowWrap:'anywhere'}}>{item.filename}</small></td><td>{item.kind==='video'?'فیلم':'عکس'} · {size(item.size_bytes)}</td><td>{new Date(item.created_at).toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'})}</td><td>{item.cleanup_state==='deleting'?'حذف ناتمام؛ نیازمند تلاش مجدد':'بدون استفادهٔ ثبت‌شده'}</td><td><button type="button" disabled={busy} onClick={()=>{setSelected(item);setConfirmation('');setError('')}}>بررسی حذف این فایل</button></td></tr>)}</tbody></table></div>}
 <div className="actions"><button type="button" disabled={busy||report.offset===0} onClick={()=>void scan(Math.max(0,report.offset-30))}>صفحهٔ قبل</button><button type="button" disabled={busy||report.offset+30>=Number(report.candidates.files)} onClick={()=>void scan(report.offset+30)}>صفحهٔ بعد</button></div>
 </>}
 {selected&&<div className="panel"><h4>تأیید حذف یک فایل</h4><p>فایل <bdi dir="ltr">{selected.filename}</bdi> به حجم {size(selected.size_bytes)} برای همیشه حذف می‌شود. فایل را بررسی کنید؛ سپس عبارت «حذف دائمی» را بنویسید. پیش از حذف، استفاده و مهلت آن دوباره در سرور بررسی می‌شود.</p><label>عبارت تأیید<input value={confirmation} maxLength={30} disabled={busy} onChange={e=>setConfirmation(e.target.value)} placeholder="حذف دائمی"/></label><div className="actions"><button type="button" disabled={busy||confirmation.trim()!=='حذف دائمی'} onClick={()=>void remove()}>{busy?'در حال بررسی و حذف…':'حذف دائمی همین فایل'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setSelected(null);setConfirmation('')}}>انصراف</button></div></div>}
 </section>;
}
