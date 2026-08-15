# وضعیت امنیت و حریم خصوصی

> Status: CURRENT
> Source of truth: این سند برای وضعیت مشاهده‌شده امنیت، احراز هویت و ریسک داده در پیاده‌سازی فعلی است.
> Owner: Security Owner
> Last validated: 2026-08-15 against `agent/organization-access-foundation`
> Supersedes: none
> Superseded by: none

این سند تأیید آمادگی production نیست.

## Foundation اجراشده

- passwordهای Foundation با `scrypt` و salt نگهداری می‌شوند؛ password خام در database ذخیره نمی‌شود.
- session opaque و hash token در PostgreSQL است؛ cookie دارای `HttpOnly` و `SameSite=Lax` است و در production باید `Secure` باشد.
- state-changing endpointها CSRF token می‌خواهند.
- membership، context و permission در server دوباره محاسبه می‌شوند.
- Customer context از session استخراج می‌شود و client نمی‌تواند tenant را در payload تعیین کند.
- PostgreSQL RLS و `FORCE ROW LEVEL SECURITY` لایه دفاعی دوم برای تمام relationهای Customer 360 و Audit است.
- نقش runtime superuser، database creator یا role creator نیست.
- Customer create، phone/address، merge/unmerge، timeline و AuditEntryهای مربوط در server و transaction ثبت می‌شوند.
- duplicate check فقط داخل context فعال query می‌کند و اطلاعات Tenant دیگر را برنمی‌گرداند.
- identity و normalized phone در Workspace مرکزی هستند، اما relationship/query عملیاتی Customer همچنان Company-scoped است؛ test چندCompany نبود existence oracle را بررسی می‌کند.
- permissionهای حساس `customer.identity.manage` و `customer.merge` سمت server enforce می‌شوند؛ UI مرز امنیتی نیست.
- response خطا secret و password را برنمی‌گرداند و correlation ID برای پیگیری دارد.
- مدیریت Company، Organization unit، UserAccount، Membership و RoleAssignment با Permission و Scope سمت server و Audit انجام می‌شود. RLS اجباری روی `organization_units` مرز Workspace را مستقل از filter برنامه کنترل می‌کند؛ جدول‌های bootstrap هویت همچنان به guard و queryهای Workspace-scoped برنامه متکی‌اند.
- UserAccount جدید credential تصادفی `scrypt` دریافت می‌کند که فقط یک‌بار در response ایجاد نمایش داده می‌شود؛ password legacy migrate، log یا commit نمی‌شود. پرچم `requires_password_change` بدهی flow تغییر password را صریح نگه می‌دارد.
- Impersonation بدون Password هدف، با reason اجباری، مدت ۵ تا ۳۰ دقیقه، منع target خارج از Scope و Permission intersection اجرا می‌شود. Audit، Actor واقعی، User مؤثر و `impersonation_id` را جدا نگه می‌دارد و UI banner/بازگشت دارد.

## ریسک باقی‌مانده Prototype

بخش‌های قدیمی همچنان permission client-side و داده در `localStorage` دارند؛ passwordهای نمونه legacy نیز در همان مدل قدیمی وجود دارند. login محلی و Impersonation legacy از مسیر عادی محصول حذف شده‌اند و صفحه «سازمان و مدیریت» از Backend استفاده می‌کند، اما سایر بخش‌های Prototype همچنان مرز امنیتی production نیستند.

## Gapهای باقی‌مانده

- MFA، recovery، rate limiting و lockout اجرا نشده‌اند.
- flow نهایی اجبار به تغییر credential موقت و recovery هنوز اجرا نشده است؛ `requires_password_change` فقط وضعیت را ثبت می‌کند.
- TLS توسط خود برنامه local فراهم نمی‌شود و باید در deployment خاتمه یابد.
- secret manager، backup/restore، retention، encryption-at-rest policy و security monitoring production تعریف نشده‌اند.
- Audit فعلی append-oriented است، اما tamper-evident storage و Outbox هنوز اجرا نشده‌اند.
- credential واقعی فقط در فایل ignored محیطی مجاز است و هرگز نباید در repository یا log قرار گیرد.

## بدهی `xlsx`

dependency قدیمی `xlsx@0.18.5` هنوز برای export در `src/components/ArchiveView.tsx` لازم است و حذف آن در این Sprint می‌توانست Prototype را بشکند. Customer 360 هیچ import یا parsing جدیدی بر پایه آن ندارد. پیش از ساخت import آینده باید آن مسیر با یک library نگهداری‌شده یا pipeline کنترل‌شده CSV/server-side جایگزین و فایل‌ها از نظر اندازه، نوع، formula injection و محتوای مخرب validate شوند.

## مرز امنیتی Customer Import

- Import جدید فقط CSV متنی، حداکثر `512 KiB` و `500` ردیف را می‌پذیرد و هیچ formula را اجرا نمی‌کند.
- filename به نام امن `.csv` محدود است و مسیر filesystem کاربر پذیرفته نمی‌شود.
- staging و candidate matching زیر RLS همان Workspace/Company اجرا می‌شوند.
- مجوزهای `read`، `create`، `review` و `approve` مستقل و server-side هستند؛ `customer.read` داده Import نمی‌دهد و UI مرز امنیتی محسوب نمی‌شود.
- list فقط summary پاک‌سازی‌شده می‌دهد؛ raw staging/candidate detail هم‌زمان به `customer.import.read` و `customer.import.review` نیاز دارد.
- داده master فقط پس از تصمیم کامل و Approval transaction-safe تغییر می‌کند.
- dependency `xlsx@0.18.5` همچنان legacy debt مربوط به export Prototype است؛ Customer Import جدید هیچ استفاده‌ای از آن ندارد و گسترش استفاده آن مجاز نیست.

جزئیات در [Customer Import](../domains/sales/customer-import.md) است.
