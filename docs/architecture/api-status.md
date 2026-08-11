# وضعیت فعلی API

> Status: CURRENT
> Source of truth: This document for current API and backend status
> Owner: Architecture Owner
> Last validated: 2026-08-11 against `agent/foundation-sprint-1@c5b8de6`
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
| `GET` | `/api/v1/customers/:customerId` | خواندن Customer در context فعال |
| `POST` | `/api/v1/customers` | ایجاد Customer؛ نیازمند CSRF، permission و `Idempotency-Key` از نوع UUID |

## قراردادهای مشترک

- session در cookie `tapra2_session` نگهداری می‌شود و token خام وارد database نمی‌شود.
- state-changing routeها header معتبر `x-csrf-token` می‌خواهند.
- Customer routeها به active Workspace/Company و permissionهای `customer.read` یا `customer.create` نیاز دارند.
- client اجازه ارسال `workspace_id` یا `company_id` برای Customer ندارد؛ context از session استخراج می‌شود.
- خطاها JSON با `error.code`, `error.message` و `correlationId` برمی‌گردند.
- endpointهای فهرست‌شده contract کامل platform نیستند و pagination عمومی هنوز اجرا نشده است.

## مرز آینده

endpointهای مالی، Support، Sales Invoice، Lead، Catalog و integrationها هنوز وجود ندارند. طراحی احتمالی آن‌ها باید در [API draft](../future/api-contract-draft.md) با وضعیت `DRAFT` باقی بماند.
