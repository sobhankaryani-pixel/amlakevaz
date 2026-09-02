import { FormEvent, useState } from 'react';

const API = 'https://api.evazmelk.ir';
type Login = { access_token?: string; token?: string; role?: string; user?: { role?: string } };

function App() {
  const [token, setToken] = useState(localStorage.getItem('evazmelk_admin_token'));
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [section, setSection] = useState('نمای کلی');
  async function login(e: FormEvent) { e.preventDefault(); setError('');
    try { const r = await fetch(`${API}/api/auth/login`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password})});
      const data: Login = await r.json(); if (!r.ok) throw new Error((data as any).detail || 'ورود ناموفق بود');
      const t = data.access_token || data.token; if (!t) throw new Error('توکن ورود دریافت نشد'); localStorage.setItem('evazmelk_admin_token', t); setToken(t);
    } catch (err) { setError(err instanceof Error ? err.message : 'خطای اتصال به سرور'); }
  }
  if (!token) return <main className="login"><div className="card"><div className="mark">خ</div><h1>خودمونی</h1><p>ورود به پنل مدیریت شاخص املاک اوز</p><form onSubmit={login}><label>ایمیل<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>رمز عبور<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} /></label>{error&&<div className="error">{error}</div>}<button>ورود امن</button></form></div></main>;
  return <div className="shell" dir="rtl"><aside><div className="brand"><span className="mark small">خ</span><span>خودمونی</span></div><div className="muted">پنل مدیریت</div>{['نمای کلی','املاک','معاملات','آگهی‌ها','شاخص‌ها','گزارش‌های ماهانه'].map(x=><button key={x} className={section===x?'nav active':'nav'} onClick={()=>setSection(x)}>{x}</button>)}<button className="logout" onClick={()=>{localStorage.removeItem('evazmelk_admin_token');setToken(null)}}>خروج</button></aside><section className="content"><header><div><h1>{section}</h1><p>داده‌های خصوصی و عملیاتی پروژه</p></div><span className="status">API متصل</span></header><div className="grid"><article><span>املاک ثبت‌شده</span><strong>—</strong><small>آمادهٔ ورود داده</small></article><article><span>معاملات تأییدشده</span><strong>—</strong><small>منبع عمومی هنوز خالی است</small></article><article><span>آخرین شاخص</span><strong>—</strong><small>پس از انتشار نمایش داده می‌شود</small></article></div><div className="panel"><h2>شروع کار</h2><p>این پنل آمادهٔ اتصال به API است. ابتدا داده‌های مناطق، نوع ملک و سپس معاملات تأییدشده را وارد کنید.</p><div className="actions"><button onClick={()=>setSection('املاک')}>افزودن ملک</button><button className="secondary" onClick={()=>setSection('معاملات')}>ثبت معامله</button></div></div></section></div>;
}
export default App;
