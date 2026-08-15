# وضعیت فعلی کیفیت

> Status: CURRENT
> Source of truth: This document for current quality checks and gaps
> Owner: Engineering Owner
> Last validated: 2026-08-15 against `agent/access-verification-matrix`
> Supersedes: none
> Superseded by: none

## کنترل‌های موجود

| کنترل | فرمان | پوشش فعلی |
|---|---|---|
| TypeScript | `npm run lint` | Web و Backend |
| Production build | `npm run build` | bundle Web و compile Backend |
| Automated tests | `npm test` | PostgreSQL Foundation/Customer/Import/Identity reconciliation/Sales، ماتریس ۳۰ سناریویی Role/Permission/Scope و unit testهای Sales/Finance/Support/RBAC بازیابی‌شده |
| Migration verification | اجرای test suite | ساخت schema تا `0015` از ابتدا، upgrade Customer قدیمی و bridge نام‌های legacy Sales بدون reset داده |
| Pull Request CI | `.github/workflows/ci.yml` | PostgreSQL 18، install، typecheck، lint، build، test، migration و repeat migration |

آزمون reset فقط زمانی اجرا می‌شود که URL دقیقاً به `tapra2_test` و user به `tapra2_owner` اشاره کند؛ این guard از حذف تصادفی database توسعه جلوگیری می‌کند.

## Gapهای فعلی

- browser end-to-end خودکار و coverage threshold هنوز وجود ندارد؛ browser flow این integration دستی validate شده است.
- ESLint و formatter مستقل هنوز اضافه نشده‌اند؛ `lint` فعلی typecheck Web/Backend است.
- پوشش domainهای legacy گسترده است، اما UI component-level test کامل برای تمام screenها وجود ندارد.
- build Web هشدار bundle بزرگ دارد و code splitting آینده لازم است، اما build را شکست نمی‌دهد.

هر تغییر باید فرمان‌های مرتبط را اجرا و شکست یا عدم اجرا را صریح گزارش کند.

## پوشش Canonical Integration

تست‌های PostgreSQL مسیر migrationهای `0001` تا `0015`، permission/Scope منفی reconciliation و Sales، identity مشترک Workspace با relationship جدا در چند Company، نبود existence oracle، merge/unmerge مستقل relationship و Identity، lineage/Audit/RLS، tenant isolation، migration داده موجود، CSV staging/approval، Lead assignment/reassignment، failed/effective call، relationship lock، Campaign/Promotion linkage، Sale/Invoice attribution، revision، Payment review/correction، partial/full/overpayment gate، provenance و timeline را پوشش می‌دهند. testهای بازیابی‌شده قواعد Dashboard profile، navigation/RBAC، Catalog، Sales Invoice/Coordination/Fulfillment legacy، Support refund و storage compatibility را نیز اجرا می‌کنند.

Browser validation دستی Sales شامل ایجاد Lead برای Customer 360، assignment، ورود فروشنده، مشاهده صف شخصی، تماس ناموفق بدون lock، تماس مؤثر با `until_reassigned`، بازتخصیص manager با reason و اتصال Promotion پس از ایجاد relationship بود. فروشنده context جدید را در صف/تاریخچه دید و snapshot تماس‌های قبلی تغییر نکرد؛ console مرورگر error/warning نداشت.

ماتریس `server/tests/access-matrix.test.ts` شامل سناریوهای `A01` تا `A30` است و با یک invariant اضافه برای تعداد/شناسه، `31/31` تست متمرکز دارد. این تست projection واقعی Scope و permission در Impersonation را بررسی می‌کند؛ HTTP/RLS/Audit همچنان در integration testهای PostgreSQL اثبات می‌شوند.

آخرین اجرای کامل شامل `26/26` فایل و `467/467` test موفق بود. Browser validation این Run، ثبت Sale، ساخت خودکار Invoice، revision غیرمخرب و کارتابل Financial Review را در Company context با UI فارسی/RTL و بدون console warning/error بررسی کرد. تست PostgreSQL نیز partial payment بدون release، exact full payment با release، correction مستقل، overpayment hold، RLS چندشرکتی و Audit را اثبات کرد. build Web هشدار chunk بزرگ‌تر از `500 kB` دارد و code splitting یک کار آینده است.
