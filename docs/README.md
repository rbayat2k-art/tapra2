# راهنمای مستندات پروژه

> Status: CURRENT
> Source of truth: این فایل فقط مرجع ناوبری و فهرست مستندات است.
> Owner: Documentation Architecture
> Last validated: 2026-08-10 against `stable@e5874572`
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
| آشنایی با دامنه فعلی محصول | [product/overview.md](product/overview.md) |
| معماری و tech stack فعلی | [architecture/current-system.md](architecture/current-system.md) |
| وضعیت فعلی API | [architecture/api-status.md](architecture/api-status.md) |
| مدل داده فعلی | [data/current-data-model.md](data/current-data-model.md) |
| Persistence فعلی | [data/persistence.md](data/persistence.md) |
| راه‌اندازی محیط توسعه | [engineering/development.md](engineering/development.md) |
| وضعیت quality و test | [engineering/quality.md](engineering/quality.md) |
| قواعد و محدودیت‌های عامل هوش مصنوعی | [AGENTS.md](../AGENTS.md) |
| تاریخچه تصمیمات | [DECISION_LOG.md](../DECISION_LOG.md) |
| قواعد کسب‌وکار legacy | [BUSINESS_RULES.md](BUSINESS_RULES.md) |
| طراحی آینده فروش | [SALES_ARCHITECTURE_DRAFT.md](SALES_ARCHITECTURE_DRAFT.md) |
| طرح مفهومی API آینده | [API_DOCUMENTATION.md](API_DOCUMENTATION.md) |

## اسناد authoritative فعال

| موضوع | مرجع CURRENT |
|---|---|
| هدف و دامنه محصول | [product/overview.md](product/overview.md) |
| معماری و tech stack | [architecture/current-system.md](architecture/current-system.md) |
| وضعیت API | [architecture/api-status.md](architecture/api-status.md) |
| مدل داده | [data/current-data-model.md](data/current-data-model.md) |
| Persistence | [data/persistence.md](data/persistence.md) |
| Development workflow | [engineering/development.md](engineering/development.md) |
| Quality status | [engineering/quality.md](engineering/quality.md) |

اسناد legacy پایین حذف یا بازنشسته نشده‌اند و تا پایان migration برای traceability باقی می‌مانند.

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
5. جدول زیر تنها مرجع تعیین مالکیت مستندات است؛ جزئیات هر موضوع نباید در این فایل تکرار شود.

## سیاست مالکیت source of truth

این جدول مالک موضوعات را تعیین می‌کند، اما سند مقصد فقط زمانی مرجع فعال می‌شود که:

1. فایل واقعاً ایجاد شده باشد.
2. وضعیت آن `CURRENT`، `APPROVED-FUTURE` یا `DRAFT` به‌طور صریح مشخص شده باشد.
3. محتوای `CURRENT` با کد `stable` اعتبارسنجی شده باشد.
4. اسناد دیگر به‌جای تکرار محتوا به آن لینک دهند.

وضعیت مالکیت در دوره مهاجرت:

- `ACTIVE`: مرجع رسمی اکنون موجود و قابل استفاده است.
- `LEGACY`: اطلاعات فعلاً در ساختار قدیمی است و باید با کد یا تاریخچه تطبیق داده شود.
- `PLANNED`: مسیر نهایی رزرو شده، اما هنوز مرجع فعال نیست.
- `HISTORICAL`: فقط برای تاریخچه و بازیابی است.

## Source-of-truth ownership map

| موضوع | منبع بررسی فعلی در دوره مهاجرت | سند نهایی authoritative | Owner | وضعیت فعلی | اسنادی که باید به مرجع نهایی لینک دهند |
|---|---|---|---|---|---|
| ناوبری و مالکیت مستندات | همین فایل | `docs/README.md` | Documentation Architecture | `ACTIVE` | `README.md`, `AGENTS.md`, تمام indexهای دامنه |
| هدف، دامنه و کاربران پروژه | `docs/product/overview.md` | `docs/product/overview.md` | Product Owner | `ACTIVE` | `README.md`, module catalog, AI instructions |
| فهرست ماژول‌های پیاده‌سازی‌شده | `docs/MODULES_DOCUMENTATION.md` و `src/components/` | `docs/product/module-catalog.md` | Product Owner | `LEGACY → PLANNED` | product overview, codebase map, AI instructions |
| واژگان فارسی و English دامنه | پراکنده در اسناد موجود | `docs/glossary.md` | Documentation Architecture | `PLANNED` | تمام اسناد دامنه |
| tech stack فعلی | `docs/architecture/current-system.md` با شواهد package و code | `docs/architecture/current-system.md` | Architecture Owner | `ACTIVE` | `README.md`, development guide, AI instructions |
| معماری فعلی سیستم | `docs/architecture/current-system.md` | `docs/architecture/current-system.md` | Architecture Owner | `ACTIVE` | module catalog, codebase map, data docs |
| وضعیت API فعلی | `docs/architecture/api-status.md` | `docs/architecture/api-status.md` | Architecture Owner | `ACTIVE` | `README.md`, security, future API contract |
| معماری آینده platform/backend | `API_DOCUMENTATION.md` و تصمیمات مرتبط، بدون ادعای اجرا | `docs/architecture/future-platform.md` | Architecture Owner | `LEGACY → PLANNED` | future API contract, approved sales design |
| مدل داده فعلی | `docs/data/current-data-model.md` با شواهد `src/types.ts` | `docs/data/current-data-model.md` | Data Owner | `ACTIVE` | اسناد دامنه، architecture |
| persistence فعلی | `docs/data/persistence.md` با شواهد `src/utils/storage.ts` | `docs/data/persistence.md` | Data Owner | `ACTIVE` | architecture, security, development |
| قواعد مالی و approval workflow | `BUSINESS_RULES.md`, `AGENTS.md` و رفتار کد | `docs/domains/finance/business-rules.md` | Finance Domain Owner | `LEGACY → PLANNED` | module catalog, roles and permissions |
| نقش‌ها و permissions | `BUSINESS_RULES.md`, `AGENTS.md` و permission utilities | `docs/domains/finance/roles-and-permissions.md` | Access Control Owner | `LEGACY → PLANNED` | finance rules, security, module catalog |
| قواعد support و complaint | `BUSINESS_RULES.md`, module documentation و رفتار کد | `docs/domains/support/business-rules.md` | Support Domain Owner | `LEGACY → PLANNED` | module catalog, sales documents |
| رفتار فعلی customer/sales | کد پیاده‌سازی‌شده به‌همراه تصمیمات مرتبط | `docs/domains/sales/current-customer.md` | Sales Domain Owner | `PLANNED` | module catalog, data model |
| طراحی پذیرفته‌شده آینده sales | `SALES_ARCHITECTURE_DRAFT.md` و `DECISION_LOG.md` | `docs/domains/sales/approved-design.md` | Sales Domain Owner | `LEGACY → PLANNED` | future platform, decisions |
| پرسش‌های حل‌نشده sales | بخش‌های «موضوع باز» در sales draft | `docs/domains/sales/open-questions.md` | Sales Domain Owner | `LEGACY → PLANNED` | approved sales design |
| راه‌اندازی و development workflow | `docs/engineering/development.md` | `docs/engineering/development.md` | Engineering Owner | `ACTIVE` | `README.md`, AI instructions |
| testing و quality gates | `docs/engineering/quality.md` | `docs/engineering/quality.md` | Engineering Owner | `ACTIVE` | development guide, release guidance |
| security و privacy | قواعد پراکنده و محدودیت‌های معماری فعلی | `docs/engineering/security-and-privacy.md` | Security Owner | `PLANNED` | persistence, API status, roles and permissions |
| قرارداد مفهومی API آینده | `docs/API_DOCUMENTATION.md` | `docs/future/api-contract-draft.md` | Architecture Owner | `LEGACY → PLANNED` | API status, future platform |
| تاریخچه تصمیمات | `DECISION_LOG.md` | `docs/decisions/DECISION_LOG.md` | Architecture Owner | `HISTORICAL → PLANNED` | همه اسنادی که به rationale نیاز دارند |
| دستورالعمل اجباری AI | `AGENTS.md` و `AI_CONTEXT.md` | `AGENTS.md` | Documentation Architecture | `LEGACY → PLANNED` | `docs/ai/start-here.md`, documentation index |
| مسیریابی task-based برای AI | `docs/AI_CONTEXT.md` و این index | `docs/ai/start-here.md` | Documentation Architecture | `LEGACY → PLANNED` | `AGENTS.md` |

## قواعد جلوگیری از مالکیت دوگانه

1. ستون «سند نهایی authoritative» برای هر موضوع فقط یک مسیر دارد.
2. یک سند می‌تواند مالک چند موضوع مرتبط باشد؛ برای مثال `current-system.md` مالک tech stack و معماری فعلی است.
3. اسناد overview و AI فقط خلاصه ناوبری ارائه می‌کنند و جزئیات موضوع را تکرار نمی‌کنند.
4. کد و package configuration شواهد اعتبارسنجی `CURRENT` هستند، اما جای مستند authoritative را نمی‌گیرند.
5. تا زمانی که یک مقصد `PLANNED` ایجاد و اعتبارسنجی نشده، منبع قدیمی حذف یا `DEPRECATED` نمی‌شود.
6. هر تغییر آینده در مالکیت باید فقط در همین جدول ثبت شود.
