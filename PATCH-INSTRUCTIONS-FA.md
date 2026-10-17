# بستهٔ اصلاحی — ثبت مخاطبان سایت و خروجی CRM

این ZIP فقط فایل‌های تغییرکرده را با پوشه‌بندی اصلی پروژه دارد؛ آن را به‌عنوان کل پروژه جایگزین نکنید.

1. فایل SQL در `database/migrations/0011_public_contact_capture.sql` را ابتدا در Supabase SQL Editor اجرا کنید.
2. فایل‌های زیر را در همان مسیرهای مخزن `amlakevaz` جایگزین کنید:
   - `backend/app/main.py`
   - `backend/app/crm.py`
   - `frontend/src/App.tsx`
   - `frontend/src/ContactSubscribe.tsx`
   - `frontend/src/styles.css`
   - `admin/src/CRM.tsx`
   - `admin/src/CRM.css`
3. فایل `docs/HANDOFF-public-contact-capture.md` راهنمای کامل تغییرات و آزمون پس از انتشار است.
4. Commit/Push کنید و انتشار API در Render و فرانت‌اند/پنل در Cloudflare Pages را بررسی کنید.

قبل از اجرای SQL و انتشار کد، مطمئن شوید که `main` در GitHub هنوز بر مبنای همان نسخهٔ پروژهٔ ارائه‌شده است؛ فایل‌های کامل `main.py`، `App.tsx` و `CRM.tsx` ممکن است تغییرات جدیدتر از آرشیو را بازنویسی کنند.
