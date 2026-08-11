# بایگانی و ارزیابی PR #1

> Status: HISTORICAL
> Source of truth: این سند فقط برای traceability و تصمیم preservation مربوط به PR #1 است.
> Owner: Documentation Architecture
> Last validated: 2026-08-11 against canonical HEAD `e5176aaa` and PR #1 head `1cc0e9d1`
> Supersedes: none
> Superseded by: none

## نتیجه بررسی

PR #1 با عنوان `docs: طراحی پروفایل مشتری، پروموشن و اجرای خدمات` در طبقه `PARTIALLY_SUPERSEDED` قرار گرفت و نباید مستقیماً merge شود.

- Base تاریخی: `f271cca7eb23e375209a7b575b960d8bdd52ac22`
- Head: `1cc0e9d12e6aa2c6fa1bb3830df2fd000a7b3ef1`
- Commits: `788c559f`، `7f052889` و `1cc0e9d1`
- مسیر PR: `agent/customer-profile-decisions` → `stable`

## علت عدم merge مستقیم

PR روی base قدیمی و موازی با documentation migration و Foundation SaaS ساخته شده است. merge مستقیم می‌تواند اسناد legacy، login محلی و ساختار Prototype را دوباره روی source-of-truth جدید قرار دهد. معماری server session، PostgreSQL، Workspace/Company، RLS، Customer 360 و Import در canonical authority باقی می‌ماند.

## وضعیت کد

قابلیت‌های substantive commit امنیت/RBAC در canonical حفظ یا توسعه یافته‌اند:

- فایل‌های `ApprovalInboxView.tsx`، `ArchiveView.tsx`، `RequestDetailModal.tsx`، `auth.ts`، `batchCalculations.ts`، `orgHierarchy.ts` و `treasurySourceView.ts` در زمان بررسی با PR #1 یکسان بودند.
- `deniedPermissions`، multi-role permission، scope سازمانی، audit، پرداخت بدون فیش جعلی، پرداخت فوری، لغو بدون حذف و batch row correction در canonical وجود دارند و تست دارند.
- نسخه canonical قابلیت‌های Customer 360، Import، Sales/Support recovery و تست‌های بیشتری نسبت به PR #1 دارد.
- login و impersonation محلی PR #1 در مسیر عادی canonical فعال نیستند؛ این تفاوت عمدی و منطبق با معماری server-side است.

بنابراین هیچ application code از PR #1 جداگانه بازیابی نشد.

## دانش یکتای حفظ‌شده

دو سند تحلیلی که به‌صورت فایل مستقل در canonical وجود نداشتند، با وضعیت `HISTORICAL` حفظ شدند:

- [Customer Profile, Promotion and Service Fulfillment](CUSTOMER_PROFILE_PROMOTION_AND_SERVICE_FULFILLMENT.md)
- [Legacy CRM Analysis and End-to-End Sales Flow](LEGACY_CRM_ANALYSIS_AND_END_TO_END_SALES_FLOW.md)

جزئیات معتبر و آینده‌نگر آن‌ها اکنون در authorityهای زیر نگهداری می‌شود:

- [Product principles](../../architecture/product-principles.md)
- [Approved Sales design](../../domains/sales/approved-design.md)
- [Sales open questions](../../domains/sales/open-questions.md)
- [Current Customer](../../domains/sales/current-customer.md)
- [Canonical integration status](../../engineering/canonical-product-integration.md)

نسخه‌های این پوشه فقط شاهد تاریخی‌اند و نباید به‌عنوان رفتار `CURRENT` یا requirement قطعی استفاده شوند.

## اقدام آینده برای PR #1

پس از review انسانی این گزارش، PR #1 را می‌توان بدون merge به‌عنوان superseded بست. branch آن در این task حذف نمی‌شود.
