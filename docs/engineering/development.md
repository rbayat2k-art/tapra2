# راهنمای توسعه فعلی

> Status: CURRENT
> Source of truth: This document for current development setup and commands
> Owner: Engineering Owner
> Last validated: 2026-08-17 against `agent/operational-ui-acceptance-v1`
> Supersedes: none
> Superseded by: none

## پیش‌نیازها

- Node.js و npm
- PostgreSQL 18.x از Docker Compose در ماشین‌های پشتیبانی‌شده
- در Windows بدون Docker: PostgreSQL native فقط به‌عنوان development fallback

## محیط

`.env.example` را به `.env.local` کپی و placeholderها را محلی جایگزین کنید. `.env.local` ignored است و هرگز نباید commit شود. runtime باید از `tapra2_app` و migration از `tapra2_owner` استفاده کند؛ `postgres` superuser برای اجرای برنامه مجاز نیست.

در Windows، `scripts/setup-native-postgres.ps1` با دریافت تعاملی رمز admin، database/userهای محدود را ایجاد می‌کند. رمز admin ذخیره نمی‌شود.

## فرمان‌ها

| فرمان | کارکرد |
|---|---|
| `npm install` | نصب dependencyها |
| `npm run infra:up` | اجرای PostgreSQL با Docker Compose |
| `npm run db:migrate` | اعمال migrationهای نسخه‌دار |
| `npm run db:seed` | ایجاد داده deterministic توسعه |
| `npm run db:setup` | migration سپس seed |
| `npm run dev:all` | اجرای Web روی `3000` و Backend روی `3101` |
| `npm run local` | setup database و اجرای هر دو process |
| `npm run local:docker` | بالا‌آوردن container و اجرای local workflow |
| `npm run build` | build Web و Backend |
| `npm run lint` | typecheck Web و Backend؛ ESLint نیست |
| `npm test` | integration test روی `tapra2_test` |

داده seed صرفاً توسعه‌ای است و نباید برای production استفاده شود.

## حساب‌های ایزوله پذیرش محلی

`npm run db:seed` در محیط `development` علاوه بر دو Workspace و Customerهای نمونه، یک چرخه قابل اجرای Lead → تماس → Sale → Invoice → Payment Review → Reservation و داده پایه انبار ایجاد می‌کند. در محیط `test` این داده عملیاتی افزوده نمی‌شود تا fixture تست‌ها مستقل بماند.

| نقش پذیرش | ایمیل محلی | رمز صرفاً توسعه‌ای |
|---|---|---|
| مدیر Workspace | `demo@tapra.local` | `TapraDemo!2026` |
| فروشنده | `sales-one@tapra.local` | `TapraSales!2026` |
| سرپرست فروش | `sales-supervisor@tapra.local` | `TapraOperations!2026` |
| اپراتور ثبت کاغذی | `paper-entry@tapra.local` | `TapraOperations!2026` |
| بررسی‌کننده مالی | `finance-review@tapra.local` | `TapraFinance!2026` |
| اپراتور مشتریان | `customer-operator@tapra.local` | `TapraOperations!2026` |
| اپراتور انبار | `warehouse-operator@tapra.local` | `TapraWarehouse!2026` |
| تأییدکننده انبار | `warehouse-approver@tapra.local` | `TapraWarehouse!2026` |
| مشاهده‌گر محدود | `alpha-only@tapra.local` | `TapraAlpha!2026` |

این credentialها فقط fixture عمومی توسعه برای databaseهای guardشده `tapra2_dev`/`tapra2_test` هستند و secret تولید یا production محسوب نمی‌شوند. هر حساب نقش و Scope جدا دارد؛ برای پذیرش از حساب مدیر به‌جای همه نقش‌ها استفاده نشود.
