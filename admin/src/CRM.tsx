import { useEffect, useState, type FormEvent } from 'react';
import './CRM.css';

const API = 'https://api.evazmelk.ir';

type Contact = {
  id: string;
  phone: string;
  name: string;
  source: string;
  account_enabled: boolean;
  marketing_opt_in: boolean;
  consent_source: string | null;
  whatsapp_opt_in: boolean;
  whatsapp_consent_source: string | null;
  created_at: string;
};
type Campaign = { id: string; title: string; body: string; status: string; total: number; pending: number; sent: number; failed: number; skipped: number };

export default function CRM({ token, section }: { token: string; section: string }) {
  const [overview, setOverview] = useState<any>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function request(path: string, method = 'GET', payload?: object) {
    const response = await fetch(API + '/api/admin/crm' + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'درخواست انجام نشد');
    return data;
  }

  async function refresh() {
    const [o, c, k] = await Promise.all([
      request('/overview'),
      request(`/contacts?q=${encodeURIComponent(appliedQ)}&offset=${offset}`),
      request('/campaigns'),
    ]);
    setOverview(o);
    setContacts(c.items);
    setCampaigns(k.items);
  }

  useEffect(() => { refresh().catch(e => setError(e.message)); }, [token, section, offset, appliedQ]);

  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setSuccess('');
    try { await action(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'خطا'); }
    finally { setBusy(false); }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    perform(async () => {
      await request('/contacts', 'POST', { name, phone, notes, marketing_opt_in: consent, consent_evidence: consent ? evidence : null });
      setName(''); setPhone(''); setNotes(''); setConsent(false); setEvidence('');
      setSuccess('مخاطب ثبت شد. رضایت واتساپ را فقط در صورت اعلام رضایت واقعی مخاطب ثبت کنید.');
    });
  }

  function createCampaign(event: FormEvent) {
    event.preventDefault();
    perform(async () => { await request('/campaigns', 'POST', { title, body }); setTitle(''); setBody(''); setSuccess('پیش‌نویس پیامک ذخیره شد'); });
  }

  function updateSmsConsent(contact: Contact) {
    const next = !contact.marketing_opt_in;
    const source = next ? window.prompt('منبع رضایت این مخاطب برای دریافت پیامک تبلیغاتی را بنویسید:') : '';
    if (next && !source?.trim()) return;
    if (!next && !window.confirm('رضایت پیامک این مخاطب لغو شود؟')) return;
    perform(async () => { await request(`/contacts/${contact.id}/consent`, 'PUT', { marketing_opt_in: next, consent_evidence: source }); setSuccess(next ? 'رضایت پیامک ثبت شد' : 'رضایت پیامک لغو شد'); });
  }

  function updateWhatsappConsent(contact: Contact) {
    const next = !contact.whatsapp_opt_in;
    const source = next ? window.prompt('منبع رضایت این مخاطب برای دریافت پیام تبلیغاتی واتساپ را بنویسید:') : '';
    if (next && !source?.trim()) return;
    if (!next && !window.confirm('رضایت واتساپ این مخاطب لغو شود؟')) return;
    perform(async () => { await request(`/contacts/${contact.id}/whatsapp-consent`, 'PUT', { whatsapp_opt_in: next, consent_evidence: source }); setSuccess(next ? 'رضایت واتساپ ثبت شد' : 'رضایت واتساپ لغو شد'); });
  }

  async function downloadExport(channel: 'whatsapp' | 'sms', format: 'txt' | 'csv') {
    setExportBusy(true); setError(''); setSuccess('');
    try {
      const response = await fetch(`${API}/api/admin/crm/export?channel=${channel}&format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : 'دریافت خروجی انجام نشد');
      }
      const count = response.headers.get('X-Export-Count') || '';
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `evazmelk-${channel}-contacts.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess(`خروجی آماده شد${count ? `؛ تعداد مخاطبان مجاز: ${count}` : ''}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دریافت خروجی انجام نشد');
    } finally {
      setExportBusy(false);
    }
  }

  const stats = overview?.stats || {};
  const sourceName: Record<string, string> = {
    manual: 'دستی', signup: 'ثبت‌نام حساب', legacy_request: 'درخواست قبلی', website_form: 'فرم سایت',
  };

  return <div className="panel crm-panel">
    <p className="hint">اطلاعات مخاطبان خصوصی است. شماره به‌تنهایی به معنی رضایت تبلیغاتی نیست. خروجی‌های تبلیغاتی فقط مخاطبانی را شامل می‌شوند که رضایت همان کانال برایشان ثبت شده باشد.</p>
    <div className="crm-stats">
      <span>کل مخاطبان: <b>{stats.total || 0}</b></span>
      <span>ثبت‌شده از سایت: <b>{stats.website_signups || 0}</b></span>
      <span>حساب‌های فعال: <b>{stats.accounts || 0}</b></span>
      <span>رضایت پیامک: <b>{stats.opted_in || 0}</b></span>
      <span>رضایت واتساپ: <b>{stats.whatsapp_opted_in || 0}</b></span>
      <span>درخواست‌های ملک منتظر بررسی: <b>{overview?.pending_submissions || 0}</b></span>
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    {success && <div className="success" role="status">{success}</div>}

    {section === 'کاربران و مخاطبان' ? <>
      <h2>افزودن مخاطب</h2>
      <form onSubmit={add} className="crm-form">
        <label>نام<input required minLength={2} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>موبایل<input required dir="ltr" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="09123456789" /></label>
        <label>یادداشت داخلی<input value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <label className="crm-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> رضایت دریافت پیامک تبلیغاتی ثبت شده است</label>
        {consent && <label>منبع رضایت<input required value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="مثلاً فرم سایت یا رضایت کتبی" /></label>}
        <button disabled={busy}>ذخیرهٔ مخاطب</button>
      </form>

      <div className="crm-export-panel">
        <div><h2>خروجی مخاطبان برای نرم‌افزار تبلیغاتی</h2><p className="hint">برای Business Sender Pro، فایل TXT شامل یک شماره در هر خط است. فقط افرادی صادر می‌شوند که رضایت واتساپشان ثبت شده باشد.</p></div>
        <div className="crm-export-actions">
          <button type="button" disabled={exportBusy} onClick={() => downloadExport('whatsapp', 'txt')}>دانلود TXT واتساپ</button>
          <button type="button" className="secondary" disabled={exportBusy} onClick={() => downloadExport('whatsapp', 'csv')}>دانلود CSV واتساپ</button>
          <button type="button" className="secondary" disabled={exportBusy} onClick={() => downloadExport('sms', 'csv')}>دانلود CSV پیامک</button>
        </div>
      </div>

      <h2>کاربران و مخاطبان</h2>
      <form className="crm-search" onSubmit={e => { e.preventDefault(); setOffset(0); setAppliedQ(q.trim()); }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="جست‌وجوی نام یا موبایل" />
        <button type="submit">جست‌وجو</button>
        <button type="button" className="secondary" onClick={() => { setQ(''); setAppliedQ(''); setOffset(0); }}>پاک‌کردن</button>
      </form>
      <div className="table-wrap"><table><thead><tr><th>نام</th><th>موبایل</th><th>منبع</th><th>حساب</th><th>رضایت پیامک</th><th>رضایت واتساپ</th><th>ثبت</th></tr></thead><tbody>
        {contacts.map(c => <tr key={c.id}>
          <td>{c.name || '—'}</td><td dir="ltr">{c.phone}</td><td>{sourceName[c.source] || c.source}</td><td>{c.account_enabled ? 'دارد' : '—'}</td>
          <td>{c.marketing_opt_in ? 'بله' : 'خیر'} <button className="secondary" disabled={busy} onClick={() => updateSmsConsent(c)}>{c.marketing_opt_in ? 'لغو' : 'ثبت رضایت'}</button></td>
          <td>{c.whatsapp_opt_in ? 'بله' : 'خیر'} <button className="secondary" disabled={busy} onClick={() => updateWhatsappConsent(c)}>{c.whatsapp_opt_in ? 'لغو' : 'ثبت رضایت'}</button></td>
          <td>{new Date(c.created_at).toLocaleDateString('fa-IR')}</td>
        </tr>)}
      </tbody></table></div>
      {contacts.length === 0 && <p className="hint">مخاطبی در این صفحه پیدا نشد.</p>}
      <div className="crm-pages"><button className="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>قبلی</button><span>صفحهٔ {Math.floor(offset / 100) + 1}</span><button className="secondary" disabled={contacts.length < 100} onClick={() => setOffset(offset + 100)}>بعدی</button></div>
    </> : <>
      <h2>پیامک تبلیغاتی</h2>
      <p className="hint">وضعیت اتصال: {overview?.sms_configured ? 'آمادهٔ آزمایش با سرویس‌دهنده' : 'درگاه هنوز تنظیم نشده است'}. ساخت پیامک بدون اتصال ممکن است؛ شروع ارسال به درگاه نیاز دارد.</p>
      <form className="crm-form" onSubmit={createCampaign}>
        <label>عنوان داخلی<input required minLength={2} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="crm-wide">متن پیامک<textarea required maxLength={500} value={body} onChange={e => setBody(e.target.value)} /></label>
        <button disabled={busy}>ذخیرهٔ پیش‌نویس</button>
      </form>
      <h2>کمپین‌ها</h2>
      <div className="table-wrap"><table><thead><tr><th>عنوان و متن</th><th>وضعیت</th><th>کل</th><th>ارسال موفق</th><th>ناموفق</th><th>عملیات</th></tr></thead><tbody>
        {campaigns.map(c => <tr key={c.id}><td><b>{c.title}</b><br />{c.body}</td><td>{c.status}</td><td>{c.total}</td><td>{c.sent}</td><td>{c.failed}</td><td>
          {c.status === 'draft' ? <button disabled={busy || !overview?.sms_configured} onClick={() => { if (window.confirm('پیامک برای همهٔ مخاطبان فعال دارای رضایت پیامک آماده شود؟')) perform(async () => { await request(`/campaigns/${c.id}/start`, 'POST'); setSuccess('کمپین آماده است. ارسال را آغاز کنید.'); }); }}>آماده‌سازی ارسال</button> : c.status === 'sending' ? <button disabled={busy} onClick={() => perform(async () => { const data = await request(`/campaigns/${c.id}/send-next`, 'POST'); setSuccess(`ارسال مرحله‌ای انجام شد. باقی‌مانده: ${data.pending}`); })}>ارسال ۳ پیام بعدی</button> : null}
        </td></tr>)}
      </tbody></table></div>
      <p className="hint">ارسال مرحله‌ای است؛ تا پایان کمپین دکمهٔ «ارسال ۳ پیام بعدی» را تکرار کنید. فقط مخاطبان دارای رضایت پیامک وارد کمپین می‌شوند.</p>
    </>}
  </div>;
}
