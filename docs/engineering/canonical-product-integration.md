# وضعیت ادغام محصول Canonical Tapra2

> Status: CURRENT
> Source of truth: این سند برای وضعیت اجرایی ادغام محصول legacy با Foundation SaaS است.
> Owner: Product Integration
> Last validated: 2026-08-15 against `agent/organization-access-foundation@afdd254`
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

## قرارداد زبان و نمایش UI

- تمام UI کاربر نهایی Tapra2 باید فارسی و RTL باشد.
- هر عنوان، منو، دکمه، فرم، label، tooltip، status، warning، error، success message و confirmation جدید باید فارسی باشد.
- اصطلاحات فنی English فقط در code، API، database و اسناد فنی باقی می‌مانند.
- UI عادی نباید نام‌هایی مانند `PostgreSQL`، `localStorage`، `Workspace` یا `Scope` را بدون نیاز کاری صریح به کاربر نمایش دهد؛ این مفاهیم باید با واژگان قابل‌فهم محصول بیان شوند.

این بخش authority قرارداد زبان و نمایش UI است. اسناد و راهنماهای دیگر باید به آن لینک دهند و متن Rule را تکرار نکنند.

## مرز backing

| بخش | backing فعلی |
|---|---|
| Login، session، Workspace، Company، Branch/Department/Team/Shared Service، Membership/Role/Scope/Permission، Organization Admin و Impersonation | `SaaS-backed` |
| Customer 360، identity/relationship، phone/address/source/timeline، merge/unmerge | `SaaS-backed` |
| Customer Import و reconciliation | `SaaS-backed` |
| Dashboard، navigation، tabs و theme | `Hybrid`؛ session جدید و state نمایشی محلی |
| Sales غیرCustomer، Finance، Support و Communications | `Prototype-backed` تا vertical sliceهای بعدی |
| bank/Issabel/SMS/portal/inventory/commission/GL/DR/BPMN | `Future` |

جزئیات capability-by-capability، شاهد Git/stash و تصمیم preservation در [Legacy Product Preservation Matrix](../archive/legacy-product-preservation-matrix.md) ثبت شده است. آن ماتریس همچنین Legacy → SaaS migration map و role mapping را نگه می‌دارد و این سند آن محتوا را تکرار نمی‌کند.

## RBAC reconciliation

`resolveLegacyShellUser` فقط identity نمایشی shell را می‌سازد. این adapter نمی‌تواند permission server ایجاد کند. تمام APIها session، Membership، permission و RLS را مستقل enforce می‌کنند. حساب deterministic `demo@tapra.local` فقط برای نمایش کامل محصول محلی به profile مدیر prototype نگاشت می‌شود؛ این نگاشت هیچ bypass در Backend ندارد.

login محلی legacy در مسیر عادی قابل‌استفاده نیست. Impersonation فقط از مسیر server-backed، با permission اختصاصی، reason الزامی، انقضای محدود و Audit actor/effective user قابل‌استفاده است و permission مؤثر را بالاتر از Admin آغازکننده نمی‌برد. roleهای legacy برای migration حفظ شده‌اند، اما مرجع authorization SaaS نیستند.

## Validation ثبت‌شده

- `npm run lint`: موفق برای Web و Backend.
- `npm run build`: موفق؛ هشدار bundle بزرگ باقی است.
- `npm test`: `419/419` موفق در `24` فایل، شامل PostgreSQL، migration populated database و تست‌های domain legacy.
- browser: Login، context selection/switching، Organization Admin، Impersonation، Dashboard، Sales queue، Finance vendor directory، Support، Customer 360 و Import بررسی شدند.
- tenant check مرورگر: Company بتا Customer نمونه بتا را دید و Customer نمونه آلفا را ندید.
- browser console: بدون warning/error در سناریوی بررسی‌شده.

این validation گواه production readiness کامل نیست. ماژول‌های prototype-backed باید به‌ترتیب vertical slice به Backend منتقل شوند.
