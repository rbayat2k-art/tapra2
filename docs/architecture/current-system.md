# معماری فعلی سیستم

> Status: CURRENT
> Source of truth: This document for current system architecture and technology stack
> Owner: Architecture Owner
> Last validated: 2026-08-11 against `agent/customer-import-sprint-3`
> Supersedes: none
> Superseded by: none

Tapra2 اکنون یک vertical slice از معماری SaaS را در کنار SPA قدیمی اجرا می‌کند. این coexistence عمدی و مطابق الگوی Strangler است؛ پیاده‌سازی کامل همه domainهای آینده را نشان نمی‌دهد.

## اجزای اجراشده

| بخش | وضعیت فعلی |
|---|---|
| Web client | React 19، TypeScript 5.8، Vite 6 و Tailwind 4؛ UI فارسی/RTL |
| Backend | Express modular monolith در `server/src/` با prefix نسخه‌دار `/api/v1` |
| Database | PostgreSQL 18.x با migrationهای ترتیبی در `server/migrations/` |
| Identity | login محلی، session opaque در database و cookie دارای `HttpOnly` و `SameSite=Lax` |
| Organization | `Workspace`، `Company`، `Membership`، انتخاب context و permission سمت server |
| Customer 360 slice | profile، phone/address چندتایی، provenance، timeline، duplicate check و merge/unmerge تراکنشی در PostgreSQL |
| Prototype | سایر قابلیت‌های قدیمی همچنان در SPA و `localStorage` اجرا می‌شوند |

ورودی Backend در `server/src/index.ts` و composition آن در `server/src/app/create-app.ts` است. Web client فقط از client متمرکز `src/foundation/api/client.ts` به Foundation API متصل می‌شود.

## مرز فعلی migration

- session و Customer 360 SaaS از PostgreSQL استفاده می‌کنند.
- صفحه Customer امکان انتخاب صریح `SaaS / PostgreSQL` یا `Prototype / localStorage` دارد.
- هیچ داده قدیمی `localStorage` حذف یا خودکار migrate نمی‌شود.
- domainهای مالی، Support، Letters، Chat و بخش‌های قدیمی Sales هنوز server-backed نشده‌اند.
- طراحی‌های Lead، Invoice، Outbox و integration آینده با وجود ADR یا سند DRAFT، CURRENT نیستند.

Customer 360 در این Sprint فقط foundation هویت است؛ fuzzy matching، import حجیم، Prospect/Lead/Opportunity و AI entity resolution اجرا نشده‌اند. merge رکورد بازنده را حذف نمی‌کند و از رابطه دارای lineage برای unmerge استفاده می‌کند.

## Technology stack

نسخه دقیق dependencyها از `package.json` خوانده می‌شود. اجزای اصلی عبارت‌اند از React، TypeScript، Vite، Tailwind، Express، `pg`، Zod و Vitest. PostgreSQL رسمی development با Docker Compose تعریف شده و native PostgreSQL فقط fallback تنظیم‌پذیر محیط توسعه است.

## مراجع

- [وضعیت API](api-status.md)
- [مدل داده](../data/current-data-model.md)
- [Persistence](../data/persistence.md)
- [توسعه](../engineering/development.md)
- [امنیت](../engineering/security-and-privacy.md)

## Customer Import اجراشده

Customer 360 اکنون یک pipeline محدود و server-backed برای UTF-8 CSV دارد. فایل ابتدا در `customer_import_jobs` و `customer_import_records` staging می‌شود؛ normalization، validation و duplicate detection قبل از هر تغییر master انجام می‌شوند. فقط تصمیم‌های نهایی و Approval دارای permission می‌توانند در یک transaction به Customer 360 اعمال شوند. جزئیات authoritative در [Customer Import](../domains/sales/customer-import.md) است.

این pipeline از `xlsx` استفاده نمی‌کند. پردازش `102M`، worker پس‌زمینه، fuzzy/AI resolution و تبدیل purchase history به Invoice هنوز اجرا نشده‌اند.
