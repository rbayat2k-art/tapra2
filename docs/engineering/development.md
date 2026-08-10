# راهنمای توسعه فعلی

> Status: CURRENT
> Source of truth: This document for current development setup and commands
> Owner: Engineering Owner
> Last validated: 2026-08-10 against `stable@e5874572`
> Supersedes: none
> Superseded by: none

این سند فرمان‌های موجود در repository را توضیح می‌دهد و قابلیت یا ابزار توسعه‌ای را که در `package.json` وجود ندارد فرض نمی‌کند.

## پیش‌نیازها

- Node.js
- npm

نسخه Node در `package.json` یا فایل `.nvmrc` تثبیت نشده است؛ بنابراین این سند نسخه مشخصی را تضمین نمی‌کند.

## راه‌اندازی

```bash
npm install
```

فایل [.env.example](../../.env.example) متغیر زیر را معرفی می‌کند:

```text
GEMINI_API_KEY=
```

در صورت نیاز، مقدار واقعی باید در فایل محیطی محلی قرار گیرد و نباید commit شود.

## فرمان‌های موجود

| فرمان | رفتار واقعی |
|---|---|
| `npm run dev` | اجرای Vite روی port `3000` و host `0.0.0.0` |
| `npm run build` | ساخت bundle با Vite |
| `npm run preview` | preview خروجی Vite |
| `npm run lint` | اجرای `tsc --noEmit`؛ این فرمان ESLint نیست |

تنظیمات Vite در [vite.config.ts](../../vite.config.ts) شامل React plugin، Tailwind plugin، alias با `@` و کنترل HMR از طریق `DISABLE_HMR` است.

## محدودیت‌های فعلی workflow

- package manager version قفل نشده است.
- Node engine تعریف نشده است.
- formatter یا ESLint script مشاهده نشد.
- test script در `package.json` وجود ندارد.
- این سند موفقیت build یا type check در همه commitها را تضمین نمی‌کند؛ نتیجه هر تغییر باید جداگانه اجرا و گزارش شود.

## مراجع مرتبط

- [وضعیت کیفیت](quality.md)
- [معماری فعلی](../architecture/current-system.md)
- [Persistence فعلی](../data/persistence.md)
- [فهرست مستندات](../README.md)
