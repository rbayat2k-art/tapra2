# وضعیت امنیت و حریم خصوصی

> Status: CURRENT
> Source of truth: این سند برای وضعیت مشاهده‌شده امنیت، احراز هویت و ریسک داده در پیاده‌سازی فعلی است.
> Owner: Security Owner
> Last validated: 2026-08-11 against `agent/foundation-sprint-1@c5b8de6`
> Supersedes: none
> Superseded by: none

این سند تأیید آمادگی production نیست.

## Foundation اجراشده

- passwordهای Foundation با `scrypt` و salt نگهداری می‌شوند؛ password خام در database ذخیره نمی‌شود.
- session opaque و hash token در PostgreSQL است؛ cookie دارای `HttpOnly` و `SameSite=Lax` است و در production باید `Secure` باشد.
- state-changing endpointها CSRF token می‌خواهند.
- membership، context و permission در server دوباره محاسبه می‌شوند.
- Customer context از session استخراج می‌شود و client نمی‌تواند tenant را در payload تعیین کند.
- PostgreSQL RLS و `FORCE ROW LEVEL SECURITY` لایه دفاعی دوم برای Customer/Audit است.
- نقش runtime superuser، database creator یا role creator نیست.
- Customer create و AuditEntry server-derived در یک transaction ثبت می‌شوند.
- response خطا secret و password را برنمی‌گرداند و correlation ID برای پیگیری دارد.

## ریسک باقی‌مانده Prototype

بخش‌های قدیمی همچنان login و permission client-side و داده در `localStorage` دارند؛ passwordهای نمونه legacy نیز در همان مدل قدیمی وجود دارند. این بخش‌ها مرز امنیتی سازمانی نیستند و نباید برای داده حساس production استفاده شوند.

## Gapهای باقی‌مانده

- MFA، recovery، rate limiting و lockout اجرا نشده‌اند.
- TLS توسط خود برنامه local فراهم نمی‌شود و باید در deployment خاتمه یابد.
- secret manager، backup/restore، retention، encryption-at-rest policy و security monitoring production تعریف نشده‌اند.
- Audit فعلی append-oriented است، اما tamper-evident storage و Outbox هنوز اجرا نشده‌اند.
- credential واقعی فقط در فایل ignored محیطی مجاز است و هرگز نباید در repository یا log قرار گیرد.
