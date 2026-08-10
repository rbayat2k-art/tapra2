# Persistence فعلی

> Status: CURRENT
> Source of truth: This document for current persistence model
> Owner: Data Owner
> Last validated: 2026-08-10 against `stable@e5874572`
> Supersedes: none
> Superseded by: none

Tapra2 در وضعیت فعلی داده‌های برنامه را در مرورگر نگهداری می‌کند. مرجع implementation این رفتار [src/utils/storage.ts](../../src/utils/storage.ts) است.

## روش ذخیره‌سازی

- storage layer داده‌ها را با `localStorage` می‌خواند و می‌نویسد.
- کلیدهای دامنه در `STORAGE_KEYS` متمرکز شده‌اند.
- داده‌های پیش‌فرض برای کاربران تازه یا storage خالی در همان لایه تعریف شده‌اند.
- بعضی تنظیمات UI مانند theme، font و impersonation مستقیماً در `App.tsx` با کلیدهای جداگانه ذخیره می‌شوند.

گروه‌های persistent فعلی شامل کاربران و نقش‌ها، شرکت‌ها، حساب‌ها، مراکز هزینه، vendors، درخواست‌ها، اعلان‌ها، پیام‌ها، support cases، نامه‌ها، workflow، tasks، tab usage و customers هستند. نام دقیق کلیدها باید از `STORAGE_KEYS` خوانده شود و در اسناد دیگر تکرار نشود.

## Migration و compatibility

مکانیزم عمومی برای migrate یا upgrade خودکار داده‌های قدیمی `localStorage` مشاهده نشد. بنابراین:

- تغییر default data روی داده ذخیره‌شده کاربران قبلی الزاماً اعمال نمی‌شود.
- تغییر schema یا storage key ممکن است داده قبلی را ناسازگار یا غیرقابل مشاهده کند.
- هر تغییر آینده در persistence باید migration، rollback و compatibility plan جداگانه داشته باشد.

## محدودیت‌ها و ریسک‌ها

- داده به browser profile و دستگاه فعلی وابسته است.
- پاک‌شدن site data می‌تواند داده را حذف کند.
- backup مرکزی و restore سازمانی وجود ندارد.
- همگام‌سازی چندکاربره و concurrency control وجود ندارد.
- client-side storage برای secrets یا enforcement امنیتی قابل اتکا نیست.
- `localStorage` database سازمانی محسوب نمی‌شود.

## مسئولیت اسناد دیگر

- مدل مفهومی داده در [current-data-model.md](current-data-model.md) نگهداری می‌شود.
- معماری runtime در [current-system.md](../architecture/current-system.md) نگهداری می‌شود.
- security authority آینده `docs/engineering/security-and-privacy.md` هنوز `PLANNED` است.

## شرط تغییر این وضعیت

با اضافه‌شدن database، server synchronization یا persistence جدید، ابتدا design و migration plan باید تصویب شود و سپس این سند پس از implementation به‌روزرسانی گردد.
