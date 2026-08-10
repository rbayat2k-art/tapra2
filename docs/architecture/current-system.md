# معماری فعلی سیستم

> Status: CURRENT
> Source of truth: This document for current system architecture and technology stack
> Owner: Architecture Owner
> Last validated: 2026-08-10 against `stable@e5874572`
> Supersedes: none
> Superseded by: none

این سند معماری اجراشده در `stable` را توضیح می‌دهد. طراحی‌های backend و معماری آینده در این سند مرجع نیستند.

## شکل معماری

Tapra2 یک `Single-Page Application` سمت مرورگر است:

1. `src/main.tsx` برنامه را با `ReactDOM.createRoot` و `StrictMode` راه‌اندازی می‌کند.
2. `src/App.tsx` وضعیت اصلی UI، کاربر جاری، navigation و اتصال viewها را هماهنگ می‌کند.
3. viewها و modalها در `src/components/` قرار دارند.
4. مدل‌های مشترک در `src/types.ts` تعریف شده‌اند.
5. persistence و داده‌های پیش‌فرض عمدتاً در `src/utils/storage.ts` مدیریت می‌شوند.

مدل navigation از `openTabs` و `activeTabId` استفاده می‌کند و viewهای باز را برای حفظ state رابط کاربری mounted نگه می‌دارد.

## Technology stack اعتبارسنجی‌شده

نسخه‌های زیر از `package.json` خوانده شده‌اند:

| بخش | نسخه یا ابزار |
|---|---|
| UI runtime | React `19.0.1`, React DOM `19.0.1` |
| Language | TypeScript `~5.8.2` |
| Build tool | Vite `6.2.3` |
| Styling | Tailwind CSS `4.1.14` با `@tailwindcss/vite` |
| Icons | `lucide-react` |
| Animation | `motion` |
| Date | `react-date-object`, `react-multi-date-picker` |
| Spreadsheet export | `xlsx` |

`Recharts` در dependencies فعلی وجود ندارد و نباید جزو stack فعلی معرفی شود.

## State و data flow

- UI actionها state داخل React را تغییر می‌دهند.
- عملیات دامنه از helperها و storage layer استفاده می‌کنند.
- داده‌های persistent در همان مرورگر نوشته و دوباره خوانده می‌شوند.
- synchronization سروری، database server و transaction سمت backend وجود ندارد.

## Backend boundary

`express` در `package.json` نصب شده است، اما در root، `src/` و ۳۱ فایل component/utility بررسی‌شده، server entrypoint، route با `/api/`، `fetch`، `axios` یا Express application اجرایی مشاهده نشد. بنابراین وجود dependency به معنی وجود backend نیست.

## پیامدهای معماری فعلی

- authorization و validation قابل مشاهده در برنامه، client-side هستند.
- داده‌ها به browser profile وابسته‌اند.
- چندکاربره واقعی، همگام‌سازی مرکزی، backup سروری و enforcement سمت سرور فراهم نیست.
- این محدودیت‌ها باید پیش از هر ادعای production یا enterprise deployment برطرف و مستند شوند.

## مراجع مرتبط

- [وضعیت API](api-status.md)
- [مدل داده](../data/current-data-model.md)
- [Persistence](../data/persistence.md)
- [راهنمای توسعه](../engineering/development.md)
- [وضعیت کیفیت](../engineering/quality.md)
