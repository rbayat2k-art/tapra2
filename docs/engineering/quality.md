# وضعیت فعلی کیفیت

> Status: CURRENT
> Source of truth: This document for current quality checks and gaps
> Owner: Engineering Owner
> Last validated: 2026-08-11 against `agent/foundation-sprint-1@c5b8de6`
> Supersedes: none
> Superseded by: none

## کنترل‌های موجود

| کنترل | فرمان | پوشش فعلی |
|---|---|---|
| TypeScript | `npm run lint` | Web و Backend |
| Production build | `npm run build` | bundle Web و compile Backend |
| Integration tests | `npm test` | Auth، membership/context، permission، Customer، RLS isolation، idempotency، Audit و persistence |
| Migration verification | اجرای test suite | ساخت schema از ابتدا روی database اختصاصی `tapra2_test` |

آزمون reset فقط زمانی اجرا می‌شود که URL دقیقاً به `tapra2_test` و user به `tapra2_owner` اشاره کند؛ این guard از حذف تصادفی database توسعه جلوگیری می‌کند.

## Gapهای فعلی

- unit test و browser end-to-end خودکار وجود ندارد.
- coverage threshold، ESLint، formatter و CI workflow هنوز اضافه نشده‌اند.
- domainهای legacy عمدتاً فقط با typecheck/build و validation دستی پوشش داده می‌شوند.
- build Web هشدار bundle بزرگ دارد و code splitting آینده لازم است، اما build را شکست نمی‌دهد.

هر تغییر باید فرمان‌های مرتبط را اجرا و شکست یا عدم اجرا را صریح گزارش کند.
