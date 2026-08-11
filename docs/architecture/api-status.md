# وضعیت فعلی API

> Status: CURRENT
> Source of truth: This document for current API and backend status
> Owner: Architecture Owner
> Last validated: 2026-08-11 against `agent/canonical-product-integration`
> Supersedes: none
> Superseded by: none

Foundation API با prefix `/api/v1` اجرا شده است. فقط endpointهای این جدول CURRENT هستند؛ فهرست‌های قدیمی یا [API draft](../future/api-contract-draft.md) قرارداد اجراشده محسوب نمی‌شوند.

| Method | Path | رفتار فعلی |
|---|---|---|
| `GET` | `/api/v1/health` | بررسی اتصال process و PostgreSQL |
| `POST` | `/api/v1/auth/login` | احراز هویت و ایجاد session |
| `GET` | `/api/v1/auth/session` | دریافت user، membershipها، context و permissionها |
| `POST` | `/api/v1/auth/logout` | پایان session؛ نیازمند CSRF |
| `POST` | `/api/v1/session/context` | انتخاب membership مجاز؛ نیازمند CSRF |
| `GET` | `/api/v1/customers` | فهرست Customerهای context فعال |
| `GET` | `/api/v1/customers/:customerId` | خواندن profile شامل phone، address، source، timeline و merge history |
| `GET` | `/api/v1/customers/:customerId/timeline` | خواندن timeline مجاز Customer |
| `POST` | `/api/v1/customers` | ایجاد Customer و source/phone/timeline؛ نیازمند `Idempotency-Key` |
| `POST` | `/api/v1/customers/:customerId/phones` | افزودن phone و provenance؛ نیازمند `customer.identity.manage` و `Idempotency-Key` |
| `POST` | `/api/v1/customers/:customerId/addresses` | افزودن address و provenance؛ نیازمند `customer.identity.manage` و `Idempotency-Key` |
| `POST` | `/api/v1/customers/duplicates/check` | تشخیص قطعی `EXACT_MATCH` و هشدار نام یکسان `POSSIBLE_DUPLICATE` بدون merge خودکار |
| `POST` | `/api/v1/customers/merge` | merge کنترل‌شده، deterministic و reversible؛ نیازمند `customer.merge` و `Idempotency-Key` |
| `POST` | `/api/v1/customers/merges/:operationId/unmerge` | بازگردانی merge و بازیابی profile مستقل؛ نیازمند `customer.merge` |
| `GET` | `/api/v1/customer-imports` | summary پاک‌سازی‌شده ImportJobهای context فعال؛ نیازمند `customer.import.read` |
| `GET` | `/api/v1/customer-imports/:jobId` | جزئیات خام staging، classification، candidate و تصمیم‌ها؛ نیازمند `customer.import.read` و `customer.import.review` |
| `POST` | `/api/v1/customer-imports` | دریافت محدود `text/csv` و ساخت staging؛ نیازمند `customer.import.create` و `Idempotency-Key` |
| `POST` | `/api/v1/customer-imports/:jobId/apply-safe-decisions` | ثبت پیشنهادهای deterministic کم‌ریسک؛ نیازمند `customer.import.review` |
| `PUT` | `/api/v1/customer-imports/:jobId/records/:recordId/decision` | تصمیم صریح reviewer برای یک ردیف |
| `POST` | `/api/v1/customer-imports/:jobId/approve` | اعمال transaction نهایی و idempotent به Customer 360؛ نیازمند `customer.import.approve` |

قرارداد کامل CURRENT این endpointها در [Customer Import](../domains/sales/customer-import.md) توضیح داده شده است.

## قراردادهای مشترک

- session در cookie `tapra2_session` نگهداری می‌شود و token خام وارد database نمی‌شود.
- state-changing routeها header معتبر `x-csrf-token` می‌خواهند.
- Customer routeها به active Workspace/Company و permission متناسب نیاز دارند. Import از `customer.read` مستقل و دارای `customer.import.read/create/review/approve` است.
- client اجازه ارسال `workspace_id` یا `company_id` برای Customer ندارد؛ context از session استخراج می‌شود.
- خطاها JSON با `error.code`, `error.message` و `correlationId` برمی‌گردند.
- endpointهای فهرست‌شده contract کامل platform نیستند و pagination عمومی هنوز اجرا نشده است.
- merge winner از profile قدیمی‌تر و سپس UUID به‌صورت deterministic انتخاب می‌شود؛ client نمی‌تواند canonical را تحمیل کند.

## مرز آینده

endpointهای مالی، Support، Sales Invoice، Lead، Catalog و integrationها هنوز وجود ندارند. طراحی احتمالی آن‌ها باید در [API draft](../future/api-contract-draft.md) با وضعیت `DRAFT` باقی بماند.
