# وضعیت فعلی کیفیت

> Status: CURRENT
> Source of truth: This document for current quality checks and gaps
> Owner: Engineering Owner
> Last validated: 2026-08-11 against `agent/canonical-product-integration`
> Supersedes: none
> Superseded by: none

## کنترل‌های موجود

| کنترل | فرمان | پوشش فعلی |
|---|---|---|
| TypeScript | `npm run lint` | Web و Backend |
| Production build | `npm run build` | bundle Web و compile Backend |
| Automated tests | `npm test` | `416` آزمون در `24` فایل: PostgreSQL Foundation/Customer/Import و unit testهای Sales/Finance/Support/RBAC بازیابی‌شده |
| Migration verification | اجرای test suite | ساخت schema از ابتدا و upgrade از database دارای Customer قبل از `0008` روی `tapra2_test` |
| Pull Request CI | `.github/workflows/ci.yml` | PostgreSQL 18، install، typecheck، lint، build، test، migration و repeat migration |

آزمون reset فقط زمانی اجرا می‌شود که URL دقیقاً به `tapra2_test` و user به `tapra2_owner` اشاره کند؛ این guard از حذف تصادفی database توسعه جلوگیری می‌کند.

## Gapهای فعلی

- browser end-to-end خودکار و coverage threshold هنوز وجود ندارد؛ browser flow این integration دستی validate شده است.
- ESLint و formatter مستقل هنوز اضافه نشده‌اند؛ `lint` فعلی typecheck Web/Backend است.
- پوشش domainهای legacy گسترده است، اما UI component-level test کامل برای تمام screenها وجود ندارد.
- build Web هشدار bundle بزرگ دارد و code splitting آینده لازم است، اما build را شکست نمی‌دهد.

هر تغییر باید فرمان‌های مرتبط را اجرا و شکست یا عدم اجرا را صریح گزارش کند.

## پوشش Canonical Integration

تست‌های PostgreSQL مسیر migrationهای `0001` تا `0008`، permission منفی Import، identity مشترک Workspace با relationship جدا در چند Company، tenant isolation، migration داده موجود، CSV staging/approval، provenance، timeline و audit را پوشش می‌دهند. testهای بازیابی‌شده قواعد Dashboard profile، navigation/RBAC، Catalog، Sales Invoice/Coordination/Fulfillment، Support refund و storage compatibility را نیز اجرا می‌کنند.

آخرین اجرای ثبت‌شده `24` فایل و `416/416` test موفق داشت. build Web هشدار chunk بزرگ‌تر از `500 kB` دارد و code splitting یک کار آینده است.
