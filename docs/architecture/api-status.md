# وضعیت فعلی API

> Status: CURRENT
> Source of truth: This document for current API and backend status
> Owner: Architecture Owner
> Last validated: 2026-08-15 against `agent/sales-backend-slice-1`
> Supersedes: none
> Superseded by: none

Foundation API با prefix `/api/v1` اجرا شده است. فقط endpointهای این جدول CURRENT هستند؛ فهرست‌های قدیمی یا [API draft](../future/api-contract-draft.md) قرارداد اجراشده محسوب نمی‌شوند.

| Method | Path | رفتار فعلی |
|---|---|---|
| `GET` | `/api/v1/health` | بررسی اتصال process و PostgreSQL |
| `POST` | `/api/v1/auth/login` | احراز هویت و ایجاد session |
| `GET` | `/api/v1/auth/session` | دریافت user، membershipها، context و permissionها |
| `POST` | `/api/v1/auth/logout` | پایان session؛ نیازمند CSRF |
| `POST` | `/api/v1/auth/password` | جایگزینی اجباری credential موقت و باطل‌کردن sessionهای دیگر همان UserAccount؛ نیازمند CSRF |
| `POST` | `/api/v1/session/context` | انتخاب membership و Scope مجاز؛ نیازمند CSRF |
| `GET` | `/api/v1/organization` | نمای Organization مجاز شامل Company، unit، User، Membership، Role/Scope و mapping legacy |
| `POST`, `PUT` | `/api/v1/organization/companies[/:companyId]` | ایجاد/ویرایش/فعال‌غیرفعال‌سازی Company با Scope و Audit |
| `POST`, `PUT` | `/api/v1/organization/units[/:unitId]` | مدیریت Branch/Department/Team/Shared Service |
| `POST`, `PATCH` | `/api/v1/organization/users[/:userAccountId/status]` | ایجاد UserAccount با credential موقت یک‌بارمصرف نمایشی و تغییر وضعیت |
| `POST`, `PATCH` | `/api/v1/organization/memberships[/:membershipId/status]` | ایجاد Workspace/Company Membership و تغییر وضعیت |
| `POST` | `/api/v1/organization/roles` | ایجاد Role با Permissionهای server |
| `POST`, `DELETE` | `/api/v1/organization/role-assignments[/:assignmentId]` | تخصیص یا لغو Role در Scope صریح |
| `POST` | `/api/v1/impersonation/start` | شروع ورود زمان‌دار به نمای User با reason اجباری و Permission intersection |
| `POST` | `/api/v1/impersonation/stop` | پایان Impersonation و بازگشت به Actor اصلی |
| `GET` | `/api/v1/customers` | فهرست Customerهای context فعال |
| `GET` | `/api/v1/customers/:customerId` | خواندن profile شامل phone، address، source، timeline و merge history |
| `GET` | `/api/v1/customers/:customerId/timeline` | خواندن timeline مجاز Customer |
| `POST` | `/api/v1/customers` | ایجاد Customer و source/phone/timeline؛ نیازمند `Idempotency-Key` |
| `POST` | `/api/v1/customers/:customerId/phones` | افزودن phone و provenance؛ نیازمند `customer.identity.manage` و `Idempotency-Key` |
| `POST` | `/api/v1/customers/:customerId/addresses` | افزودن address و provenance؛ نیازمند `customer.identity.manage` و `Idempotency-Key` |
| `POST` | `/api/v1/customers/duplicates/check` | تشخیص قطعی `EXACT_MATCH` و هشدار نام یکسان `POSSIBLE_DUPLICATE` بدون merge خودکار |
| `POST` | `/api/v1/customers/merge` | merge relationshipهای همان Company؛ deterministic و reversible، نیازمند `customer.merge` و `Idempotency-Key` |
| `POST` | `/api/v1/customers/merges/:operationId/unmerge` | بازگردانی relationship merge و بازیابی profile مستقل؛ نیازمند `customer.merge` |
| `POST` | `/api/v1/customer-identities/merge` | reconciliation هویت مرکزی Workspace با lineage/Audit؛ نیازمند `customer.identity.reconcile`، Scope `WORKSPACE` و `Idempotency-Key` |
| `POST` | `/api/v1/customer-identities/merges/:operationId/unmerge` | بازگردانی reconciliation مرکزی بدون حذف history؛ نیازمند `customer.identity.reconcile` و Scope `WORKSPACE` |
| `GET` | `/api/v1/customer-imports` | summary پاک‌سازی‌شده ImportJobهای context فعال؛ نیازمند `customer.import.read` |
| `GET` | `/api/v1/customer-imports/:jobId` | جزئیات خام staging، classification، candidate و تصمیم‌ها؛ نیازمند `customer.import.read` و `customer.import.review` |
| `POST` | `/api/v1/customer-imports` | دریافت محدود `text/csv` و ساخت staging؛ نیازمند `customer.import.create` و `Idempotency-Key` |
| `POST` | `/api/v1/customer-imports/:jobId/apply-safe-decisions` | ثبت پیشنهادهای deterministic کم‌ریسک؛ نیازمند `customer.import.review` |
| `PUT` | `/api/v1/customer-imports/:jobId/records/:recordId/decision` | تصمیم صریح reviewer برای یک ردیف |
| `POST` | `/api/v1/customer-imports/:jobId/approve` | اعمال transaction نهایی و idempotent به Customer 360؛ نیازمند `customer.import.approve` |
| `GET` | `/api/v1/sales/leads` | صف فروش context فعال؛ فروشنده فقط Leadهای تخصیص‌یافته به membership خود را می‌بیند |
| `GET` | `/api/v1/sales/assignees` | فهرست assigneeهای مجاز همان Workspace/Company؛ فقط manager |
| `GET` | `/api/v1/sales/leads/:leadId` | Lead، assignment history، Call Log، timeline، marketing links و relationship فعلی |
| `POST` | `/api/v1/sales/leads` | ایجاد idempotent Lead برای Customer موجود در Company فعال، همراه Campaign/Promotion context اختیاری |
| `POST` | `/api/v1/sales/leads/:leadId/assignments` | assignment/reassignment idempotent؛ بازتخصیص به permission و دلیل نیاز دارد |
| `POST` | `/api/v1/sales/leads/:leadId/marketing-links` | اتصال idempotent Campaign/Promotion context به Lead/relationship؛ نیازمند `sales.marketing.link` |
| `POST` | `/api/v1/sales/leads/:leadId/calls` | ثبت تماس توسط assignee فعلی و اعمال policy تماس مؤثر |

قرارداد دامنه‌ای endpointهای CURRENT در [Customer Import](../domains/sales/customer-import.md) و [عملیات فعلی Lead](../domains/sales/current-lead-operations.md) توضیح داده شده است.

## قراردادهای مشترک

- session در cookie `tapra2_session` نگهداری می‌شود و token خام وارد database نمی‌شود.
- state-changing routeها header معتبر `x-csrf-token` می‌خواهند.
- Customer relationship و Sales routeها به active Workspace/Company، Scope و permission متناسب نیاز دارند. Identity reconciliation فقط در Workspace context مجاز است. Import از `customer.read` مستقل و دارای `customer.import.read/create/review/approve` است.
- client اجازه ارسال `workspace_id` یا `company_id` برای Customer ندارد؛ context از session استخراج می‌شود.
- mutationهای Organization فقط در Workspace/Company/Unit مجاز اجرا می‌شوند؛ Shared Service فقط Workspace-scoped است.
- Impersonation حداکثر ۳۰ دقیقه است، Password هدف را دریافت نمی‌کند و Permission مؤثر را به اشتراک Actor و target محدود می‌کند.
- خطاها JSON با `error.code`, `error.message` و `correlationId` برمی‌گردند.
- endpointهای فهرست‌شده contract کامل platform نیستند و pagination عمومی هنوز اجرا نشده است.
- winner در هر دو نوع merge از رکورد قدیمی‌تر و سپس UUID به‌صورت deterministic انتخاب می‌شود؛ client نمی‌تواند canonical را تحمیل کند. relationship merge و identity reconciliation دو operation مستقل‌اند.

## مرز آینده

endpointهای مالی، Support، Sales Invoice، موتور مدیریت Campaign/Promotion، Commission، AI Sales و integrationها هنوز وجود ندارند. endpoint موجود فقط reference و snapshot بازاریابی را به Lead/relationship متصل می‌کند و موتور Campaign، pricing یا eligibility نیست. طراحی احتمالی قابلیت‌های کامل باید در [API draft](../future/api-contract-draft.md) با وضعیت `DRAFT` باقی بماند. endpointهای Lead بالا فقط vertical slice فعلی را پوشش می‌دهند و API کامل Sales نیستند.
