# وضعیت فعلی کیفیت

> Status: CURRENT
> Source of truth: This document for current quality checks and gaps
> Owner: Engineering Owner
> Last validated: 2026-08-10 against `stable@e5874572`
> Supersedes: none
> Superseded by: none

این سند وضعیت ابزارهای کنترل کیفیت موجود در repository را ثبت می‌کند. مواردی که وجود ندارند به‌عنوان gap معرفی می‌شوند، نه به‌عنوان قابلیت آینده پیاده‌سازی‌شده.

## کنترل‌های موجود

| کنترل | فرمان | پوشش |
|---|---|---|
| TypeScript checking | `npm run lint` | اجرای `tsc --noEmit` |
| Production bundle | `npm run build` | ساخت bundle توسط Vite |

نام script برابر `lint` است، اما فرمان واقعی ESLint اجرا نمی‌کند. بنابراین گزارش آن باید «TypeScript check» نامیده شود.

## Gapهای مشاهده‌شده

در commit اعتبارسنجی‌شده موارد زیر مشاهده نشد:

- `test` script؛
- unit یا integration test framework در dependencies؛
- automated test suite؛
- ESLint یا formatter script؛
- quality threshold یا coverage gate؛
- CI workflow قابل مشاهده در ساختار فعلی repository.

این فهرست فقط وضعیت مشاهده‌شده این commit است و با اضافه‌شدن ابزار جدید باید دوباره اعتبارسنجی شود.

## حداقل گزارش تغییرات در وضعیت فعلی

برای هر تغییر آینده، گزارش باید صریحاً مشخص کند:

- آیا `npm run lint` اجرا شده است؛
- آیا `npm run build` اجرا شده است؛
- اگر اجرا نشده یا شکست خورده، دلیل چیست؛
- چه بخش‌هایی به‌دلیل نبود test suite فقط با inspection بررسی شده‌اند.

این بخش policy مستندسازی نتیجه است و ادعا نمی‌کند که gate خودکار وجود دارد.

## مراجع مرتبط

- [راهنمای توسعه](development.md)
- [معماری فعلی](../architecture/current-system.md)
- [فهرست مالکیت مستندات](../README.md)
