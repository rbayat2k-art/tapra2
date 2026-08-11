# وضعیت ادغام محصول Canonical Tapra2

> Status: CURRENT
> Source of truth: این سند برای وضعیت اجرایی ادغام محصول legacy با Foundation SaaS است.
> Owner: Product Integration
> Last validated: 2026-08-11 against `agent/sales-backend-slice-1`
> Supersedes: none
> Superseded by: none

## محصول visible فعلی

Tapra2 اکنون یک shell واحد دارد. کاربر با Foundation login وارد می‌شود، Workspace/Company مجاز را انتخاب می‌کند و سپس Dashboard، Customers، Sales، Finance، Support، Organization/RBAC و Communications را در همان محصول می‌بیند.

- مسیر عادی login محلی prototype ندارد.
- Customer همیشه `SaasCustomerWorkspace` را باز می‌کند.
- CSV Import داخل Customer 360 و کنار profileها قرار دارد.
- انتخاب فنی `Prototype / localStorage` یا `SaaS / PostgreSQL` از UI عادی حذف شده است.
- تعویض context، tabهای باز را به Dashboard بازنشانی می‌کند.
- داده legacy `localStorage` حذف یا خودکار ingest نشده است.

## مرز backing

| بخش | backing فعلی |
|---|---|
| Login، session، Workspace، Company، Membership/Permission | `SaaS-backed` |
| Customer 360، identity/relationship، phone/address/source/timeline، merge/unmerge | `SaaS-backed` |
| Customer Import و reconciliation | `SaaS-backed` |
| Sales Lead، Queue، Assignment/Reassignment و Call Log | `SaaS-backed` |
| Dashboard، navigation، tabs و theme | `Hybrid`؛ session جدید و state نمایشی محلی |
| Campaign/Promotion، Sales Invoice/Commission، Finance، Support، Organization UI و Communications | `Prototype-backed` تا vertical sliceهای بعدی |
| bank/Issabel/SMS/portal/inventory/commission/GL/DR/BPMN | `Future` |

جزئیات capability-by-capability، شاهد Git/stash و تصمیم preservation در [Legacy Product Preservation Matrix](../archive/legacy-product-preservation-matrix.md) ثبت شده است. آن ماتریس همچنین Legacy → SaaS migration map و role mapping را نگه می‌دارد و این سند آن محتوا را تکرار نمی‌کند.

## RBAC reconciliation

`resolveLegacyShellUser` فقط identity نمایشی shell را می‌سازد. این adapter نمی‌تواند permission server ایجاد کند. تمام APIها session، Membership، permission و RLS را مستقل enforce می‌کنند. حساب deterministic `demo@tapra.local` فقط برای نمایش کامل محصول محلی به profile مدیر prototype نگاشت می‌شود؛ این نگاشت هیچ bypass در Backend ندارد.

Impersonation و login محلی legacy در مسیر عادی قابل‌استفاده نیستند. UI مدیریت roleهای prototype حفظ شده، اما تا زمان Backend migration مرجع authorization SaaS نیست.

## Validation ثبت‌شده

- `npm run lint`: موفق برای Web و Backend.
- `npm run build`: موفق؛ هشدار bundle بزرگ باقی است.
- `npm test`: `425/425` موفق در `25` فایل، شامل PostgreSQL، Sales Lead isolation/policy، migration populated database و تست‌های domain legacy.
- browser: Login، context selection/switching، Dashboard، Sales Lead/queue/assignment/call/relationship lock، Finance vendor directory، Support، RBAC، Customer 360 و Import بررسی شدند.
- tenant check مرورگر: Company بتا Customer نمونه بتا را دید و Customer نمونه آلفا را ندید.
- browser console: بدون warning/error در سناریوی بررسی‌شده.

این validation گواه production readiness کامل نیست. ماژول‌های prototype-backed باید به‌ترتیب vertical slice به Backend منتقل شوند.
