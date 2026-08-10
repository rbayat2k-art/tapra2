# شروع سریع برای AI و توسعه‌دهنده

> Status: CURRENT
> Source of truth: این سند فقط برای مسیریابی task-based عامل‌های AI است.
> Owner: Documentation Architecture
> Last validated: 2026-08-11 against `stable@cea6514`
> Supersedes: none
> Superseded by: none

## ترتیب خواندن

1. قواعد اجباری و محدودیت‌ها: [AGENTS.md](../../AGENTS.md)
2. انتخاب authority موضوع: [docs/README.md](../README.md)
3. فقط سندهای مرتبط با task و سپس code شاهد همان موضوع.

## مسیرهای رایج

| Task | فقط این اسناد را ابتدا بخوانید |
|---|---|
| درخواست مالی یا approval | [finance rules](../domains/finance/business-rules.md)، [roles](../domains/finance/roles-and-permissions.md) |
| پشتیبانی/عودت | [support rules](../domains/support/business-rules.md)، [finance rules](../domains/finance/business-rules.md) |
| مشتری فعلی | [current customer](../domains/sales/current-customer.md) |
| طراحی آینده فروش | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) |
| معماری/API آینده | [future platform](../architecture/future-platform.md)، [API draft](../future/api-contract-draft.md) |
| امنیت | [security](../engineering/security-and-privacy.md)، [persistence](../data/persistence.md) |
| تصمیم و rationale | [decision log](../decisions/DECISION_LOG.md) |

## قاعده context

اسناد legacy و Snapshot را فقط برای traceability یا حل تعارض تاریخی باز کنید. این فایل جزئیات دامنه را تکرار نمی‌کند و وجود متن future در repository هرگز اثبات پیاده‌سازی نیست.
