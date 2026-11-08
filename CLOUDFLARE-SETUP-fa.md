# آماده‌سازی انتقال فرانت و ادمین به Cloudflare Pages

این فایل‌ها را روی نسخهٔ جدیدی که نصب کرده‌اید، در ریشهٔ پروژه کپی، Commit و Push کنید. این بسته ابزار Restore ندارد و تنظیمات یا دادهٔ بک‌اند را تغییر نمی‌دهد.

## مقادیر صفحهٔ ساخت Pages

- Project name: amlakevaz
- Production branch: main
- Framework preset: None
- Build command: node cloudflare-build.mjs
- Build output directory: cloudflare-dist
- Root directory: خالی (ریشهٔ مخزن، نه frontend)

متغیرهای ساخت:

- NODE_VERSION = 24
- SKIP_DEPENDENCY_INSTALL = 1
- VITE_NESHAN_MAP_KEY = همان کلید Web نقشهٔ نشان که هم‌اکنون سایت استفاده می‌کند.

فرمان ساخت خودش npm ci را برای frontend و admin و qa اجرا می‌کند؛ TypeScript و تست‌های فرانت را بررسی می‌کند و خروجی ترکیبی را می‌سازد. کلید خصوصی لیارا، SMS، آروان یا دیتابیس برای این ساخت لازم نیست.

## نتیجهٔ فنی

سایت و /management/ از یک پروژهٔ Pages سرو می‌شوند. صفحه‌های آگهی و sitemap از دادهٔ عمومی API فعلی ساخته می‌شوند. قالب HTML از فایل‌های همان انتشار Pages خوانده می‌شود؛ نیاز به فرانت لیارا برای سئوی این صفحات حذف شده است. عکس‌ها، فیلم‌ها، دیتابیس، ورود و API همچنان روی زیرساخت فعلی‌اند.

_routes.json فقط مسیرهای پویا را به Pages Function می‌فرستد؛ فایل‌های عادی سایت و دارایی‌های ادمین از مسیر استاتیک می‌آیند. Pages Functions سهمیهٔ رایگان خودش را دارد و همهٔ درخواست‌ها نامحدود فرض نشده‌اند. سند: https://developers.cloudflare.com/pages/functions/routing/

انتشار خودکار evazmelk-web روی push غیرفعال شده و تنها اجرای دستی workflow باقی است. برنامهٔ در حال اجرای لیارا حذف نمی‌شود؛ سایت فعلی تا پایان انتقال روشن می‌ماند. بررسی‌های GitHub نیز خروجی Cloudflare را می‌سازند. انتشار بک‌اند لیارا دست‌نخورده است.

## ترتیب بعد از ساخت موفق

۱. آدرس amlakevaz.pages.dev را بررسی کنید؛ هنوز DNS و سرویس وب لیارا را تغییر ندهید.
۲. دامنهٔ آزمایشی با evazmelk.ir متفاوت است. برای خواندن مستقیم داده‌ها در دامنهٔ آزمایشی، در صورت نیاز https://amlakevaz.pages.dev را به فهرست فعلی ALLOWED_ORIGINS بک‌اند اضافه کنید؛ مبدأهای فعلی را حذف نکنید. ورود دارای کوکی بین pages.dev و evazmelk.ir ممکن است به‌دلیل محدودیت مرورگر کار نکند؛ آزمایش نهایی ورود روی دامنهٔ اصلی انجام می‌شود. دامنهٔ آزمایشی نقشه نیز باید در محدودیت کلید نشان مجاز باشد، یا نقشه پس از اتصال دامنهٔ اصلی آزمایش شود.
۳. پیش از تغییر نیم‌سرورها، رکوردهای لازم فعلی را در Cloudflare آماده کنید. رکوردهای api و backend باید همچنان مقصد لیارا را داشته باشند و DNS Only باشند. رکوردهای تأیید و تمدید SSL مرتبط با بک‌اند نیز حفظ شوند.
۴. evazmelk.ir و www.evazmelk.ir را در Custom domains پروژهٔ Pages اضافه کنید. نیم‌سرورهای دقیق را از پنل فعلی Cloudflare بردارید؛ از روی نام‌های قدیمی حدس نزنید. DNSSEC ثبت‌شدهٔ ناسازگار را پیش از تغییر بررسی کنید.
۵. پس از فعال‌شدن دامنه و SSL، خانه، آگهی، View Source متادیتا، sitemap.xml، ورود، ثبت ملک، ادمین، عکس و فیلم و نقشه را آزمایش کنید.
۶. تنها پس از تأیید این موارد، سرویس evazmelk-web لیارا قابل حذف است تا هزینهٔ آن متوقف شود. سرویس evazmelk-api را حذف نکنید.

۵۵ تست فرانت، بررسی TypeScript و ساخت کاملِ فرمان cloudflare-build.mjs در محیط محلی موفق بودند. هنوز روی حساب واقعی Cloudflare دیپلوی یا DNS تغییر داده نشده است.

اسناد:
https://developers.cloudflare.com/pages/functions/advanced-mode/
https://developers.cloudflare.com/pages/configuration/build-image/
https://developers.cloudflare.com/pages/configuration/custom-domains/
