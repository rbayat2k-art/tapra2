# وضعیت فعلی API

> Status: CURRENT
> Source of truth: This document for current API and backend status
> Owner: Architecture Owner
> Last validated: 2026-08-10 against `stable@e5874572`
> Supersedes: none
> Superseded by: none

## نتیجه

در commit اعتبارسنجی‌شده، Tapra2 هیچ backend یا HTTP API اجرایی ندارد. برنامه به‌صورت client-side اجرا می‌شود و داده‌های عملیاتی را در مرورگر نگهداری می‌کند.

برای این نتیجه، موارد زیر بررسی شدند:

- root repository و entrypointهای موجود؛
- `src/main.tsx` و `src/App.tsx`؛
- ۳۱ فایل component و utility که مستقیماً در ساختار فعلی استفاده می‌شوند؛
- الگوهای `fetch`, `/api/`, `axios`, Express و service client.

در این محدوده هیچ route یا API client اجرایی مشاهده نشد.

## تفسیر dependencies

وجود `express`, `@types/express`, `dotenv` یا `@google/genai` در `package.json` به‌تنهایی اثبات نمی‌کند که backend یا integration اجرایی وجود دارد. سند معماری فقط قابلیت‌هایی را CURRENT می‌داند که entrypoint و data flow آن‌ها در code قابل مشاهده باشد.

## وضعیت سند قدیمی API

[API_DOCUMENTATION.md](../API_DOCUMENTATION.md) مجموعه‌ای از endpointهای فرضی برای آینده است. آن سند نباید:

- به‌عنوان قرارداد API موجود استفاده شود؛
- مبنای integration فعلی قرار گیرد؛
- بدون تصمیم و implementation جدید به `CURRENT` تغییر وضعیت دهد.

مسیر نهایی قرارداد آینده `docs/future/api-contract-draft.md` است، اما آن authority هنوز `PLANNED` است.

## شرط تغییر این وضعیت

این سند فقط زمانی باید تغییر کند که backend یا API واقعی با code، authentication، authorization، persistence، error contract و validation قابل بررسی ایجاد شود.

## مراجع مرتبط

- [معماری فعلی](current-system.md)
- [Persistence فعلی](../data/persistence.md)
- [فهرست مالکیت مستندات](../README.md)
