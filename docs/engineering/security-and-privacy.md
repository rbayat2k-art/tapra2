# وضعیت امنیت و حریم خصوصی

> Status: CURRENT
> Source of truth: این سند برای وضعیت مشاهده‌شده امنیت، احراز هویت و ریسک داده در پیاده‌سازی فعلی است.
> Owner: Security Owner
> Last validated: 2026-08-11 against `stable@cea6514`
> Supersedes: none
> Superseded by: none

این سند گزارش وضعیت است، نه تأیید آمادگی production. جزئیات permission در [roles and permissions](../domains/finance/roles-and-permissions.md) قرار دارد.

## وضعیت فعلی

- برنامه یک SPA بدون backend و بدون API اجرایی است.
- کاربران، passwordها، current user و داده‌های کسب‌وکار در `localStorage` مرورگر نگهداری می‌شوند.
- passwordها hash نشده‌اند و `AdminPanel` امکان نمایش/تغییر مقدار آن‌ها را دارد.
- login در client انجام می‌شود و passwordهای fallback نمونه مانند `123456` و `admin` پذیرفته می‌شوند.
- `storage.getCurrentUser()` در نبود session ذخیره‌شده، admin نمونه را به‌صورت خودکار برمی‌گرداند.
- session token، secure cookie، server-side authorization، encryption at rest و audit مقاوم در برابر دست‌کاری وجود ندارد.
- فایل‌ها/تصاویر می‌توانند به‌صورت Data URL یا URL نمونه در داده client ذخیره شوند.

## کنترل‌های موجود و محدودیت آن‌ها

- UI بر اساس role و permission بخش‌ها و اقدام‌ها را محدود می‌کند.
- admin در چند مسیر UI bypass دارد و بعضی Viewها هنوز از محاسبه واحد `getEffectiveUserPermissions` استفاده نمی‌کنند.
- بازنشانی tabها هنگام تغییر هویت از نمایش tab بازمانده کاربر قبلی جلوگیری می‌کند.
- همه این کنترل‌ها client-side هستند و در برابر کاربری که storage یا bundle مرورگر را دست‌کاری کند مرز امنیتی قابل اتکا محسوب نمی‌شوند.

## حریم خصوصی و بهره‌برداری

- داده‌هایی مانند اطلاعات هویتی، شماره تماس، حساب بانکی، شکایت، پیام و password نباید در این معماری برای داده واقعی حساس یا محیط production استفاده شوند.
- پاک‌کردن storage مرورگر می‌تواند داده را از بین ببرد؛ export/backup امن و سیاست retention مرکزی وجود ندارد.
- مرورگر و دستگاه مشترک می‌تواند داده و session را در معرض کاربر بعدی قرار دهد.
- repository و مستندات نباید secret یا داده واقعی مشتری را دریافت کنند. `GEMINI_API_KEY` فقط متغیر محیط توسعه است و نباید commit شود.

## شرط عبور به معماری سازمانی

نیازهای آینده مانند backend، احراز هویت server-side، hash امن password، least privilege، encryption، validation سمت server، audit immutable، backup و سیاست retention هنوز پیاده‌سازی نشده‌اند. جهت طراحی در [future platform](../architecture/future-platform.md) و قرارداد پیشنهادی در [API draft](../future/api-contract-draft.md) ثبت می‌شود.
