import {fetchWithTimeout as fetch} from './shared/http';
import { useState, type FormEvent } from 'react';

const API = 'https://api.evazmelk.ir';

type Props = { compact?: boolean };

export default function ContactSubscribe({ compact = false }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!smsOptIn && !whatsappOptIn) {
      setError('برای ثبت شماره، حداقل یکی از راه‌های دریافت پیام را انتخاب کنید.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/public/contact-subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, sms_opt_in: smsOptIn, whatsapp_opt_in: whatsappOptIn, website }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : 'ثبت اطلاعات انجام نشد. شماره را بررسی کنید و دوباره تلاش کنید.';
        throw new Error(detail);
      }
      setSuccess(data.message || 'اطلاعات شما ثبت شد. از همراهی شما سپاسگزاریم.');
      setName('');
      setPhone('');
      setWebsite('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ارتباط با سرور برقرار نشد. کمی بعد دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`visitor-subscribe${compact ? ' visitor-subscribe-compact' : ''}`} aria-labelledby="visitor-subscribe-title">
      <div className="visitor-subscribe-copy">
        <span className="section-kicker">خبرهای بازار اوز</span>
        <h2 id="visitor-subscribe-title">آگهی‌های جدید و تغییرات قیمت را از دست ندهید</h2>
        <p>شماره‌تان را داوطلبانه ثبت کنید و مشخص کنید از کدام راه می‌خواهید پیام‌های املاک خودمونی را دریافت کنید.</p>
        <small>اطلاعات شما محرمانه می‌ماند. فقط کانال‌هایی که انتخاب می‌کنید برای اطلاع‌رسانی و تبلیغات استفاده می‌شوند.</small>
      </div>
      <form className="visitor-subscribe-form" onSubmit={submit}>
        <label>نام و نام خانوادگی
          <input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="مثلاً علی احمدی" />
        </label>
        <label>شماره موبایل
          <input required type="tel" inputMode="tel" dir="ltr" autoComplete="tel" minLength={10} maxLength={20} pattern="[+0-9۰-۹٠-٩ -]{10,20}" value={phone} onChange={event => setPhone(event.target.value)} placeholder="09123456789" />
        </label>
        <fieldset className="visitor-subscribe-consents">
          <legend>راه دریافت پیام را انتخاب کنید</legend>
          <label><input type="checkbox" checked={smsOptIn} onChange={event => setSmsOptIn(event.target.checked)} /> پیامک اطلاع‌رسانی و تبلیغاتی</label>
          <label><input type="checkbox" checked={whatsappOptIn} onChange={event => setWhatsappOptIn(event.target.checked)} /> پیام اطلاع‌رسانی و تبلیغاتی در واتساپ</label>
        </fieldset>
        <label className="visitor-subscribe-honey" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
        {error && <p className="visitor-subscribe-message error" role="alert">{error}</p>}
        {success && <p className="visitor-subscribe-message success" role="status">{success}</p>}
        <button type="submit" disabled={busy}>{busy ? 'در حال ثبت…' : 'ثبت شماره و انتخاب‌ها'}</button>
      </form>
    </section>
  );
}
