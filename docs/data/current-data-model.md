# مدل داده فعلی

> Status: CURRENT
> Source of truth: This document for current conceptual data model
> Owner: Data Owner
> Last validated: 2026-08-10 against `stable@e5874572`
> Supersedes: none
> Superseded by: none

این سند مرجع مفهومی مدل داده اجراشده است. تعریف دقیق fieldها و TypeScript contractها در [src/types.ts](../../src/types.ts) قرار دارد و هنگام تغییر مدل باید هم‌زمان با این سند بررسی شود.

## ماهیت مدل

مدل فعلی مجموعه‌ای از TypeScript interface و type است؛ database schema، SQL table یا server-side relation نیست. ارتباط موجودیت‌ها با string IDها و referenceهای منطقی داخل داده‌های مرورگر برقرار می‌شود و foreign key enforcement پایگاه داده وجود ندارد.

## گروه‌های اصلی موجودیت

| حوزه | موجودیت‌های اصلی |
|---|---|
| هویت و دسترسی | `User`, `SystemRole`, `SystemPermission` |
| ساختار سازمانی | `Company`, `CompanyBankAccount`, `CostCenter` |
| مالی و گردش کار | `PaymentRequest`, `RequestBatchItem`, `RequestTimelineStep`, `WorkflowStepRule` |
| ذی‌نفعان | `Vendor`, `VendorCategory` |
| دبیرخانه | `Letter` و مدل‌های attachment، signature، version، forward و timeline |
| Support | `SupportCase` و مدل‌های timeline، transaction و custom field |
| ارتباطات | `ChatMessage`, `SystemNotification`, `DirectMessage` |
| وظایف | `AssignedTask`, `TaskLogEntry`, `TaskMessage` |
| مشتری | `Customer`, `CustomerActivityLogEntry` |

## قواعد اعتبار مدل

- `src/types.ts` شاهد دقیق field-level implementation است.
- `src/utils/storage.ts` نشان می‌دهد کدام مدل‌ها persistent هستند.
- وجود یک type به‌تنهایی اثبات نمی‌کند که تمام workflowهای مرتبط با آن کامل هستند.
- تغییر نام ID، status یا relation باید همراه با بررسی business rules، persistence و migration انجام شود.
- طراحی موجودیت‌های آینده sales نباید پیش از implementation وارد این سند `CURRENT` شود.

## محدودیت‌های فعلی

- schema registry یا runtime schema validation مرکزی مشاهده نشد.
- database constraint و transaction سروری وجود ندارد.
- referential integrity عمدتاً توسط code و داده‌های پیش‌فرض حفظ می‌شود.
- versioned data migration عمومی وجود ندارد.

## مراجع مرتبط

- [Persistence فعلی](persistence.md)
- [معماری فعلی](../architecture/current-system.md)
- [وضعیت API](../architecture/api-status.md)
- [فهرست مالکیت مستندات](../README.md)
