# راهنمای اجباری عامل‌ها و توسعه‌دهندگان

> Status: CURRENT
> Source of truth: این فایل برای دستورالعمل‌های اجباری و مسیر ورود AI است.
> Owner: Documentation Architecture
> Last validated: 2026-08-11 against `agent/sales-backend-slice-1`
> Supersedes: none
> Superseded by: none

## ترتیب شروع

1. remote و base را مطابق [source-of-truth rule](docs/engineering/source-of-truth.md) تأیید کنید.
2. [docs/ai/start-here.md](docs/ai/start-here.md) را بخوانید.
3. authority موضوع task را در [docs/README.md](docs/README.md) پیدا کنید.
4. فقط همان سندهای مرتبط و code شاهد آن‌ها را باز کنید؛ کل درخت مستندات را بی‌دلیل بارگذاری نکنید.

## قواعد اجباری

- `CURRENT` فقط برای رفتاری است که با code و configuration موجود اثبات شده باشد.
- `APPROVED-FUTURE` طراحی پذیرفته‌شده اما اجرا‌نشده، `DRAFT` موضوع باز و `HISTORICAL` سابقه تصمیم است.
- وجود type، dependency یا سند طراحی، به‌تنهایی اثبات قابلیت اجرایی نیست.
- هر fact مهم فقط در authority همان موضوع نوشته می‌شود؛ سایر اسناد باید لینک دهند.
- application code، interface، type، storage key یا رفتار runtime فقط در scope صریح task تغییر می‌کند.
- تغییر نام یا حذف قراردادهای پرمصرف مانند `isDualRole`, `approvalChain` و `allowedApproverIds` نیازمند بررسی سراسری و تصمیم صریح است.
- زنجیره فروش (`salesSupervisorId`) هرگز با زنجیره خزانه‌داری (`approvalChain`/`allowedApproverIds`) ترکیب نمی‌شود.
- برای هر flow جدید، تمام نقش‌ها، دسترسی‌ها، انتقال مسئولیت، حالت انتظار، خطا و پایان flow بررسی شوند.
- برای هر تغییر رابط محصول، [قرارداد زبان و نمایش UI](docs/engineering/canonical-product-integration.md#قرارداد-زبان-و-نمایش-ui) را رعایت کن؛ type safety پروژه حفظ شود.
- هیچ secret، credential یا داده واقعی مشتری در repository یا مستندات commit نشود.
- کار آینده از آخرین GitHub `stable` آغاز می‌شود؛ workspace قدیمی یا ZIP منبع branch جدید نیست.

## مسیرهای authoritative

| موضوع | سند |
|---|---|
| مالی و approval | [finance rules](docs/domains/finance/business-rules.md) |
| نقش و permission | [roles and permissions](docs/domains/finance/roles-and-permissions.md) |
| پشتیبانی | [support rules](docs/domains/support/business-rules.md) |
| Customer فعلی | [current customer](docs/domains/sales/current-customer.md) |
| Customer Import | [customer import](docs/domains/sales/customer-import.md) |
| Lead، صف، تخصیص و تماس فعلی | [current lead operations](docs/domains/sales/current-lead-operations.md) |
| فروش آینده | [approved design](docs/domains/sales/approved-design.md) و [open questions](docs/domains/sales/open-questions.md) |
| پوسته canonical و مرز SaaS/Prototype | [canonical product integration](docs/engineering/canonical-product-integration.md) |
| Git lineage و شروع توسعه | [source of truth](docs/engineering/source-of-truth.md) |
| معماری، داده و امنیت | [documentation index](docs/README.md) |
| rationale و تاریخچه | [decision log](docs/decisions/DECISION_LOG.md) |

## نگهداری مستندات

- با تغییر behavior، authority CURRENT مرتبط باید در همان change بررسی و `Last validated` به‌روزرسانی شود.
- تغییر business rule در سند دامنه ثبت می‌شود؛ دلیل تصمیم مهم در Decision Log افزوده می‌شود.
- وقتی طرح آینده پیاده شد، ابتدا code و validation تکمیل، سپس بخش مربوط از future به authority CURRENT منتقل و statusها اصلاح می‌شوند.
- اسناد legacy و [pre-migration snapshot](docs/archive/pre-migration-snapshot/2026-08-10-stable-f271cca7/manifest.md) برای traceability هستند، نه راهنمای رفتار فعلی.

نسخه کامل قواعد legacy این فایل در Snapshot بالا محفوظ است؛ جزئیات استخراج‌شده اکنون در authorityهای دامنه قرار دارند.
