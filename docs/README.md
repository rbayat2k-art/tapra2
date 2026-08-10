# راهنمای مستندات پروژه

> Status: CURRENT
> Source of truth: این فایل فقط مرجع ناوبری و فهرست مستندات است.
> Owner: Documentation Architecture
> Last validated: 2026-08-10 against `stable@bdfd165e`
> Supersedes: none
> Superseded by: none

این فایل نقطه ورود مرکزی مستندات پروژه است. هدف آن پیدا کردن سند مناسب با کمترین میزان مطالعه و جلوگیری از بارگذاری غیرضروری تمام مستندات است.

## هشدار مهاجرت

معماری مستندات در Phase 3 در حال مهاجرت به مدل `single source of truth` است. تا پیش از تکمیل مرحله تعیین مالکیت، وجود یک فایل در این فهرست به معنی مرجع نهایی بودن تمام محتوای آن نیست.

برای تشخیص وضعیت اطلاعات:

- `CURRENT`: رفتار پیاده‌سازی‌شده و اعتبارسنجی‌شده با کد.
- `APPROVED-FUTURE`: طراحی پذیرفته‌شده‌ای که هنوز پیاده‌سازی نشده است.
- `DRAFT`: موضوع در حال بررسی و فاقد تصمیم نهایی.
- `HISTORICAL`: تاریخچه حفظ‌شده و غیرقابل استفاده به‌عنوان رفتار فعلی.
- `DEPRECATED`: مرجع قدیمی که فقط برای سازگاری نگهداری می‌شود.

اسناد دارای وضعیت `MIXED` از ساختار قدیمی باقی مانده‌اند و باید هنگام مهاجرت به اسناد متمرکز و دارای وضعیت روشن تقسیم شوند.

## مسیرهای ورود

| نیاز | نقطه شروع فعلی |
|---|---|
| آشنایی اولیه و اجرای محلی | [README.md](../README.md) |
| قواعد و محدودیت‌های عامل هوش مصنوعی | [AGENTS.md](../AGENTS.md) |
| تاریخچه تصمیمات | [DECISION_LOG.md](../DECISION_LOG.md) |
| راه‌اندازی محیط توسعه | [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) |
| معماری فعلی | [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) |
| مدل داده و persistence | [DATABASE_DOCUMENTATION.md](DATABASE_DOCUMENTATION.md) |
| قواعد کسب‌وکار | [BUSINESS_RULES.md](BUSINESS_RULES.md) |
| طراحی آینده فروش | [SALES_ARCHITECTURE_DRAFT.md](SALES_ARCHITECTURE_DRAFT.md) |
| طرح مفهومی API آینده | [API_DOCUMENTATION.md](API_DOCUMENTATION.md) |

## فهرست مستندات موجود

| فایل | نقش فعلی | وضعیت مشاهده‌شده پیش از مهاجرت |
|---|---|---|
| [README.md](../README.md) | معرفی و اجرای محلی | `CURRENT` — ناقص و نیازمند بازنویسی |
| [AGENTS.md](../AGENTS.md) | قواعد AI، قواعد دامنه و محدودیت‌های پیاده‌سازی | `MIXED` |
| [DECISION_LOG.md](../DECISION_LOG.md) | تاریخچه تصمیمات | `HISTORICAL` |
| [AI_CONTEXT.md](AI_CONTEXT.md) | زمینه دستیاران هوش مصنوعی | `MIXED` |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | طرح API و backend آینده | `APPROVED-FUTURE / DRAFT` |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | قواعد گردش کار، دسترسی و اعتبارسنجی | `MIXED` |
| [CODE_STRUCTURE.md](CODE_STRUCTURE.md) | نقشه ساختار کد | `CURRENT` — نیازمند اعتبارسنجی |
| [DATABASE_DOCUMENTATION.md](DATABASE_DOCUMENTATION.md) | مدل داده و persistence فعلی | `CURRENT` — نیازمند اصلاح واژگان |
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | راه‌اندازی، build و type checking | `CURRENT` |
| [MODULES_DOCUMENTATION.md](MODULES_DOCUMENTATION.md) | فهرست ماژول‌ها | `CURRENT` — نیازمند اعتبارسنجی |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | هدف، دامنه و وضعیت پروژه | `CURRENT` — دارای ادعاهای قدیمی |
| [SALES_ARCHITECTURE_DRAFT.md](SALES_ARCHITECTURE_DRAFT.md) | تصمیم‌ها و پرسش‌های طراحی فروش | `APPROVED-FUTURE + DRAFT` |
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | معماری فعلی SPA | `CURRENT` — نیازمند اعتبارسنجی |

## Snapshot پیش از مهاجرت

نسخه کامل و تغییرناپذیر مستندات قبل از Phase 3 در مسیر زیر نگهداری می‌شود:

- [Pre-migration snapshot manifest](archive/pre-migration-snapshot/2026-08-10-stable-f271cca7/manifest.md)
- [Pre-migration snapshot checksums](archive/pre-migration-snapshot/2026-08-10-stable-f271cca7/checksums.sha256)

Snapshot فقط برای بازیابی و تاریخچه است و نباید به‌عنوان مستندات فعال استفاده شود.

## قواعد استفاده در دوره مهاجرت

1. برای رفتار فعلی، ادعاهای سند باید با کد موجود در `stable` تطبیق داده شوند.
2. اسناد API و طراحی فروش نباید بدون شواهد کد به‌عنوان قابلیت پیاده‌سازی‌شده تلقی شوند.
3. عامل‌های هوش مصنوعی ابتدا این فایل را بخوانند و فقط سند مرتبط با وظیفه را باز کنند.
4. از بارگذاری هم‌زمان تمام مستندات خودداری شود.
5. جدول رسمی مالکیت `source of truth` در مرحله بعدی مهاجرت ایجاد خواهد شد.
