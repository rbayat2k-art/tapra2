# ردگیری حفظ دانش در مهاجرت مستندات

> Status: CURRENT
> Source of truth: این سند برای traceability مهاجرت، طبقه‌بندی legacy و شواهد حفظ دانش است.
> Owner: Documentation Architecture
> Last validated: 2026-08-11 against `agent/docs-migration@a485125` and snapshot commit `bdfd165`
> Supersedes: none
> Superseded by: none

این سند رفتار محصول را تعریف نمی‌کند. authority هر موضوع در [docs index](../README.md) قرار دارد. هدف این فایل اثبات این است که دانش legacy یا به یک authority معتبر منتقل شده، یا به‌عنوان future/history حفظ شده است.

## نتیجه ممیزی

- ۱۳ منبع legacy اولیه، شامل نسخه pre-migration از `AGENTS.md`، بررسی شدند.
- همه سرفصل‌های substantive و ۱۴ تصمیم ثبت‌شده map شده‌اند.
- هیچ بخش معناداری بدون مقصد باقی نمانده است.
- هیچ فایل legacy یا Snapshot در Step 6 حذف، منتقل یا بازنویسی نشده است.
- مقدار `UNRESOLVED` در جدول‌های traceability وجود ندارد؛ پرسش‌های طراحی فروش به authority دارای وضعیت `DRAFT` منتقل شده‌اند.

## معنای Classification

| Classification | معنی |
|---|---|
| `PRESERVED_CURRENT` | قاعده معتبر فعلی در authority CURRENT حفظ شده است. |
| `PRESERVED_FUTURE` | طراحی یا پرسش آینده در authority `APPROVED-FUTURE` یا `DRAFT` حفظ شده است. |
| `PRESERVED_HISTORICAL` | متن یا rationale در مرجع تاریخی و Snapshot حفظ شده است. |
| `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | ادعای legacy قدیمی/مخلوط است و authority جدید با code آن را اصلاح کرده است. |
| `DUPLICATE` | دانشی است که بدون ارزش مستقل در authority دیگری تکرار شده است. |
| `UNRESOLVED` | مقصد یا اعتبار هنوز تعیین نشده است؛ نتیجه این ممیزی برای هیچ ردیفی نیست. |

## بررسی checksum مربوط به Sales Draft

فایل بررسی‌شده: `docs/SALES_ARCHITECTURE_DRAFT.md`

| شاهد | نتیجه |
|---|---|
| مقدار ثبت‌شده در `checksums.sha256` | `4241d1bb0b100a0a5b97e796b80b7e8d9f5cf3db041bbdfa6c8794358caaeda6` |
| SHA-256 فایل legacy فعال | همان مقدار |
| SHA-256 نسخه Snapshot | همان مقدار |
| اندازه هر دو فایل | `47320` bytes |
| مقایسه byte-by-byte | یکسان (`True`) |
| Git blob در `f271cca7`, `bdfd165` و `HEAD` | `db1327853ac819d5b5565fa146fb7a0728830174` برای هر چهار مسیر/نسخه |
| line ending | `116` خط `CRLF` و `163` خط `LF` در هر دو فایل |
| SHA-256 پس از تبدیل همه خطوط به `LF` | `7d1265f46d16c38a460742de4cc0d83f7d25af48cdae664b18627d4779f4b054` |
| SHA-256 پس از تبدیل همه خطوط به `CRLF` | `a26a6eb1bf996dcbf61f16b777e862cf3128f71d31d37aa2502bc16948bbcd5c` |

نتیجه: manifest صحیح است و هیچ anomaly یا تغییر تاریخی وجود ندارد. false positive قبلی از validatorی ایجاد شد که قبل از hash، line endingهای فایل mixed را normalize کرد و سپس hash جدید را با checksum خام مقایسه کرد. روش امن، hash کردن byteهای خام است. بنابراین `checksums.sha256` و محتوای immutable Snapshot نباید تغییر کنند؛ همین سند audit trail اصلاح روش بررسی است.

## Root README و دستورالعمل AI پیش از مهاجرت

| Legacy file / section | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| `README.md` — معرفی AI Studio و اجرای محلی | [product overview](../product/overview.md)، [development](../engineering/development.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | هدف محصول و فرمان‌های واقعی از code/package جدا شده‌اند؛ لینک `.env.local` در README قدیمی یک فایل محلی تولیدشونده است. |
| Snapshot `root/AGENTS.md` — ۱. باز/بسته | [finance rules](../domains/finance/business-rules.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | وضعیت `returned` با code فعلی اصلاح و صریح شده است. |
| Snapshot `root/AGENTS.md` — ۲. ارجاع اختصاصی و سابقه | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | `currentApproverId` و `timeline` ثبت شده‌اند. |
| Snapshot `root/AGENTS.md` — ۳. Universal Search | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | فیلدهای جست‌وجوی واقعی و تفاوت Viewها ثبت شده‌اند. |
| Snapshot `root/AGENTS.md` — ۴. Slim/Card UI | [finance rules](../domains/finance/business-rules.md)، [module catalog](../product/module-catalog.md) | `PRESERVED_CURRENT` | رفتار `RequestTableView` با code تطبیق داده شده است. |
| Snapshot `root/AGENTS.md` — ۵. پایداری مستندات | [current AGENTS](../../AGENTS.md)، [docs index](../README.md) | `PRESERVED_CURRENT` | maintenance rule اکنون لینک‌محور و بدون تکرار دامنه است. |
| Snapshot `root/AGENTS.md` — ۶. تأیید ردیفی Batch | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | تصمیم، reset و شرط تعیین تکلیف همه ردیف‌ها حفظ شده‌اند. |
| Snapshot `root/AGENTS.md` — ۷. Sort کارتابل | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | `ApprovalInboxView` بر اساس `createdAt` و technical debt مربوط به `MyRequestsView` هر دو ثبت شده‌اند. |
| Snapshot `root/AGENTS.md` — ۸. منوی Dual Role | [roles and permissions](../domains/finance/roles-and-permissions.md) | `PRESERVED_CURRENT` | استثنای نمایش از authorization داخلی جدا شده است. |
| Snapshot `root/AGENTS.md` — ۹. Referential integrity داده نمونه | [finance rules](../domains/finance/business-rules.md)، [persistence](../data/persistence.md) | `PRESERVED_CURRENT` | اعتبار IDها و نبود migration خودکار حفظ شده است. |
| Snapshot `root/AGENTS.md` — ۱۰. ویرایش Batch | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | پنجره ویرایش، محاسبه مبلغ و فیلدهای immutable حفظ شده‌اند. |
| Snapshot `root/AGENTS.md` — ۱۱. اصلاح مبلغ approver | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | scope اقدام، timeline note و استقلال batch حفظ شده‌اند. |
| Snapshot `root/AGENTS.md` — ۱۲. Multi-tab | [current system](../architecture/current-system.md)، [module catalog](../product/module-catalog.md) | `PRESERVED_CURRENT` | mount/hide، registry و reset هویت ثبت شده‌اند. |
| Snapshot `root/AGENTS.md` — ۱۳. Tab Usage Widget | [module catalog](../product/module-catalog.md)، [persistence](../data/persistence.md) | `PRESERVED_CURRENT` | per-user، حداقل سه tab، top five و registry filtering حفظ شده‌اند. |
| Snapshot `root/AGENTS.md` — ۱۴. Multi-role | [roles and permissions](../domains/finance/roles-and-permissions.md) | `PRESERVED_CURRENT` | derive، override و محدودیت مهاجرت Viewها حفظ شده‌اند. |
| Snapshot `root/AGENTS.md` — اصل بررسی کامل flow | [current AGENTS](../../AGENTS.md) | `PRESERVED_CURRENT` | به‌عنوان قاعده اجباری سراسری باقی مانده است. |
| Snapshot `root/AGENTS.md` — ۱۵. Customer | [current customer](../domains/sales/current-customer.md) | `PRESERVED_CURRENT` | hierarchy، ownership lock، search و permission حفظ شده‌اند. |
| Snapshot `root/AGENTS.md` — merge نهایی featureها | [decision log](../decisions/DECISION_LOG.md) | `PRESERVED_HISTORICAL` | متن merge در تاریخچه verbatim و Snapshot موجود است. |

## Decision Log قدیمی

تمام متن `DECISION_LOG.md` قدیمی پس از metadata در [decision log authoritative](../decisions/DECISION_LOG.md) به‌صورت verbatim حفظ شده است.

| Entry | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| 2026-08-02 — SPA و `localStorage` | [decision log](../decisions/DECISION_LOG.md)، [current system](../architecture/current-system.md)، [persistence](../data/persistence.md) | `PRESERVED_HISTORICAL` | rationale تاریخی و وضعیت فعلی هر دو محفوظ‌اند. |
| 2026-08-02 — Approval Chain و Dual Role | [decision log](../decisions/DECISION_LOG.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_HISTORICAL` | rule جاری جداگانه code-validated است. |
| 2026-08-02 — Tailwind و component modularity | [decision log](../decisions/DECISION_LOG.md)، [current system](../architecture/current-system.md) | `PRESERVED_HISTORICAL` | نسخه stack از `package.json` اصلاح شده است. |
| 2026-08-03 — Inbox، referral، search و compact UI | [decision log](../decisions/DECISION_LOG.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_HISTORICAL` | تفاوت `returned` با وضعیت code توسط authority CURRENT روشن شده است. |
| 2026-08-04 — Batch row approval | [decision log](../decisions/DECISION_LOG.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_HISTORICAL` | تصمیم و قرارداد جاری هر دو حفظ شده‌اند. |
| 2026-08-04 — Approval sort و Dual Role menu | [decision log](../decisions/DECISION_LOG.md)، [finance rules](../domains/finance/business-rules.md)، [roles](../domains/finance/roles-and-permissions.md) | `PRESERVED_HISTORICAL` | یادداشت technical debt `MyRequestsView` نیز به authority CURRENT منتقل شد. |
| 2026-08-04 — اصلاح referential integrity نمونه‌ها | [decision log](../decisions/DECISION_LOG.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_HISTORICAL` | IDهای مورد اصلاح و علت در تاریخچه باقی مانده‌اند. |
| 2026-08-04 — Batch row editing | [decision log](../decisions/DECISION_LOG.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_HISTORICAL` | جزئیات implementation در تاریخچه و rule جاری در authority است. |
| 2026-08-04 — Approver amount correction | [decision log](../decisions/DECISION_LOG.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_HISTORICAL` | contract timeline حفظ شده است. |
| 2026-08-04 — Multi-tab navigation | [decision log](../decisions/DECISION_LOG.md)، [module catalog](../product/module-catalog.md) | `PRESERVED_HISTORICAL` | rationale UI و وضعیت جاری جدا شده‌اند. |
| 2026-08-04 — Multi-role access | [decision log](../decisions/DECISION_LOG.md)، [roles](../domains/finance/roles-and-permissions.md) | `PRESERVED_HISTORICAL` | تصمیم کامل و مدل جاری محفوظ‌اند. |
| 2026-08-04 — Tab usage widget | [decision log](../decisions/DECISION_LOG.md)، [module catalog](../product/module-catalog.md) | `PRESERVED_HISTORICAL` | جزئیات telemetry در تاریخچه باقی مانده است. |
| 2026-08-04 — Customer step one | [decision log](../decisions/DECISION_LOG.md)، [current customer](../domains/sales/current-customer.md) | `PRESERVED_HISTORICAL` | مرز CURRENT/FUTURE صریح است. |
| 2026-08-05 — merge نهایی featureها | [decision log](../decisions/DECISION_LOG.md) | `PRESERVED_HISTORICAL` | conflict resolution بدون بازنویسی حفظ شده است. |

## AI Context قدیمی

| Legacy section | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| ۱. ماهیت پروژه | [product overview](../product/overview.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | دامنه Customer فعلی و نبود ادعای production اصلاح شده است. |
| ۲. Technology Stack | [current system](../architecture/current-system.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | React 19 و نبود Recharts با package تطبیق داده شده است. |
| ۳. Architecture Rules | [current AGENTS](../../AGENTS.md)، [current system](../architecture/current-system.md) | `PRESERVED_CURRENT` | فقط قواعد اجباری در AGENTS مانده‌اند. |
| ۴. خطوط قرمز | [current AGENTS](../../AGENTS.md)، [roles](../domains/finance/roles-and-permissions.md) | `PRESERVED_CURRENT` | قراردادهای حساس و زنجیره‌ها حفظ شده‌اند. |
| ۵. تصمیمات مهم | [decision log](../decisions/DECISION_LOG.md) | `DUPLICATE` | rationale کامل‌تر در Decision Log وجود دارد. |
| ۶. Future Roadmap | [future platform](../architecture/future-platform.md)، [sales approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | موارد آینده دیگر CURRENT تلقی نمی‌شوند. |

## API Documentation قدیمی

| Legacy section | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| ۱. Client-side architecture و امکان backend | [API status](../architecture/api-status.md)، [future platform](../architecture/future-platform.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | نبود API اجرایی با code ثابت شده است. |
| ۲-الف. Auth و User endpoints | [API contract draft](../future/api-contract-draft.md) | `PRESERVED_FUTURE` | endpointها کاندیدا و نیازمند redesign امنیتی‌اند. |
| ۲-ب. Request endpoints | [API contract draft](../future/api-contract-draft.md) | `PRESERVED_FUTURE` | contract فرضی با برچسب DRAFT حفظ شده است. |
| ۲-ج. Treasury export endpoint | [API contract draft](../future/api-contract-draft.md) | `PRESERVED_FUTURE` | audit و حفاظت داده بانکی به‌عنوان نیاز افزوده شده است. |
| ۲-د. Letter endpoints | [API contract draft](../future/api-contract-draft.md) | `PRESERVED_FUTURE` | attachment/security هنوز تصمیم آینده است. |
| ۳. Authentication و Security | [security](../engineering/security-and-privacy.md)، [API contract draft](../future/api-contract-draft.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | session فعلی client-only و کنترل آینده server-side از هم جدا شده‌اند. |

## Business Rules قدیمی

| Legacy section / rule | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| ۱.۱ Approval Chain | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | routing اولیه و مرز آن با destinationهای مجاز حفظ شده است. |
| ۱.۲ Dual Role و مسیر شخصی | [finance rules](../domains/finance/business-rules.md)، [roles](../domains/finance/roles-and-permissions.md) | `PRESERVED_CURRENT` | derive جدید و fallback فعلی ثبت شده‌اند. |
| ۱.۲-الف Multi-role | [roles](../domains/finance/roles-and-permissions.md) | `PRESERVED_CURRENT` | union، replacement override و debt مهاجرت Viewها حفظ شده‌اند. |
| ۱.۳ Senior Treasury Supervisor | [roles](../domains/finance/roles-and-permissions.md) | `PRESERVED_CURRENT` | قاعده حداکثر یک کاربر حفظ شده است. |
| ۱.۴ Allowed Approver IDs | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | از `approvalChain` جدا ثبت شده است. |
| ۱.۴-الف Referential Integrity | [finance rules](../domains/finance/business-rules.md)، [persistence](../data/persistence.md) | `PRESERVED_CURRENT` | self-reference و ID مرکز هزینه map شده‌اند. |
| ۱.۵ Batch approval | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | rule کامل منتقل شده است. |
| ۱.۶ Approval Inbox sorting | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | `createdAt` و scope دقیق View ثبت شده‌اند. |
| ۱.۷ Batch editing | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | immutable IDs و statusهای ردیف حفظ شده‌اند. |
| ۱.۸ Amount correction | [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | action scope و timeline note حفظ شده‌اند. |
| ۲. Budget، number-to-words و Sheba | [finance rules](../domains/finance/business-rules.md)، [current data model](../data/current-data-model.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | authority جدید از ادعای کنترل سخت بودجه یا validation سراسریِ اثبات‌نشده پرهیز می‌کند. |
| ۳. Permissions و system roles | [roles](../domains/finance/roles-and-permissions.md)، [security](../engineering/security-and-privacy.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | تعداد واقعی ۲۱ و محدودیت client-side ثبت شده است. |
| ۴. Form validation | [finance rules](../domains/finance/business-rules.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | استثنای `info_request` با مبلغ صفر مانع تعمیم قاعده legacy است. |
| ۵. Customer rules | [current customer](../domains/sales/current-customer.md) | `PRESERVED_CURRENT` | قفل، search، hierarchy و persistence map شده‌اند. |

## Code Structure قدیمی

| Legacy section | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| ۱. Directory Tree | [current system](../architecture/current-system.md)، [module catalog](../product/module-catalog.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | tree دستی سریعاً stale می‌شود؛ repository شاهد دقیق فایل‌هاست. |
| ۲. مسئولیت folder/file | [current system](../architecture/current-system.md)، [module catalog](../product/module-catalog.md) | `PRESERVED_CURRENT` | مرز `App`, components, types و storage حفظ شده است. |
| ۳. Communication Flow | [current system](../architecture/current-system.md)، [persistence](../data/persistence.md) | `PRESERVED_CURRENT` | state → View → storage و مدل multi-tab ثبت شده‌اند. |

## Database Documentation قدیمی

| Legacy section | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| ۱. Database Technology | [persistence](../data/persistence.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | `localStorage` به‌عنوان persistence مرورگر، نه database server، توصیف شده است. |
| ۲-الف. `User` | [current data model](../data/current-data-model.md)، [roles](../domains/finance/roles-and-permissions.md) | `PRESERVED_CURRENT` | field contract در `src/types.ts` و قواعد دسترسی در authority دامنه‌اند. |
| ۲-ب. `SystemRole` | [current data model](../data/current-data-model.md)، [roles](../domains/finance/roles-and-permissions.md) | `PRESERVED_CURRENT` | مدل و نقش‌های default map شده‌اند. |
| ۲-ج. `Company` | [current data model](../data/current-data-model.md) | `PRESERVED_CURRENT` | مدل مفهومی حفظ و جزئیات field به code ارجاع شده است. |
| ۲-د. `CompanyBankAccount` | [current data model](../data/current-data-model.md)، [security](../engineering/security-and-privacy.md) | `PRESERVED_CURRENT` | موجودیت و حساسیت اطلاعات بانکی هر دو پوشش دارند. |
| ۲-هـ. `CostCenter` | [current data model](../data/current-data-model.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | budget field و referential integrity حفظ شده‌اند. |
| ۲-و. `Vendor` | [current data model](../data/current-data-model.md)، [module catalog](../product/module-catalog.md) | `PRESERVED_CURRENT` | entity و module responsibility map شده‌اند. |
| ۲-ز. `PaymentRequest` | [current data model](../data/current-data-model.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | مدل مفهومی و state rules جدا شده‌اند. |
| ۲-ز-۱. `RequestBatchItem` | [current data model](../data/current-data-model.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | field-level truth در code و workflow در authority است. |
| ۲-ز-۲. `RequestTimelineStep` | [current data model](../data/current-data-model.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | history و `amountCorrectionNote` حفظ شده‌اند. |
| ۲-ح. `Letter` | [current data model](../data/current-data-model.md)، [module catalog](../product/module-catalog.md) | `PRESERVED_CURRENT` | مدل‌ها و مسئولیت module map شده‌اند. |
| ۲-ط. `SupportCase` | [current data model](../data/current-data-model.md)، [support rules](../domains/support/business-rules.md) | `PRESERVED_CURRENT` | entity و workflow عودت پوشش داده شده‌اند. |
| ۲-ی. `Customer` | [current data model](../data/current-data-model.md)، [current customer](../domains/sales/current-customer.md) | `PRESERVED_CURRENT` | ownership مشتق‌شده و storage جداگانه حفظ شده‌اند. |
| ۳. Entity Relationships | [current data model](../data/current-data-model.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | relationها logical ID هستند و database constraint ندارند. |

## Development Guide قدیمی

| Legacy section | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| ۱. Prerequisites | [development](../engineering/development.md) | `PRESERVED_CURRENT` | Node/npm بدون ادعای نسخه تثبیت‌نشده ثبت شده‌اند. |
| ۲. Installation | [development](../engineering/development.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | فرمان و متغیر محیط با repository تطبیق داده شده‌اند. |
| ۳. Build | [development](../engineering/development.md)، [quality](../engineering/quality.md) | `PRESERVED_CURRENT` | build و محدودیت تضمین موفقیت ثبت شده‌اند. |
| ۴. Lint/Type Check | [quality](../engineering/quality.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | `lint` واقعاً `tsc --noEmit` است، نه ESLint. |

## Modules Documentation قدیمی

| Legacy section | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| ۱. Dashboard | [module catalog](../product/module-catalog.md) | `PRESERVED_CURRENT` | مسئولیت و tab usage map شده‌اند. |
| ۲. Financial Requests | [module catalog](../product/module-catalog.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | module و rules از هم جدا شده‌اند. |
| ۳. Treasury/Batch Export | [module catalog](../product/module-catalog.md)، [finance rules](../domains/finance/business-rules.md) | `PRESERVED_CURRENT` | قابلیت جاری حفظ شده است. |
| ۴. Letters | [module catalog](../product/module-catalog.md)، [current data model](../data/current-data-model.md) | `PRESERVED_CURRENT` | View و مدل‌ها map شده‌اند. |
| ۵. Support | [module catalog](../product/module-catalog.md)، [support rules](../domains/support/business-rules.md) | `PRESERVED_CURRENT` | workflow مالی دقیق‌تر شده است. |
| ۶. Vendors | [module catalog](../product/module-catalog.md)، [current data model](../data/current-data-model.md) | `PRESERVED_CURRENT` | قابلیت و entity حفظ شده‌اند. |
| ۷. Companies/Cost Centers | [module catalog](../product/module-catalog.md)، [current data model](../data/current-data-model.md) | `PRESERVED_CURRENT` | scope جاری حفظ شده است. |
| ۸. Users/Permissions | [module catalog](../product/module-catalog.md)، [roles](../domains/finance/roles-and-permissions.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | تعداد permission و محاسبه مؤثر با code اصلاح شده‌اند. |
| ۹. Multi-tab | [module catalog](../product/module-catalog.md)، [current system](../architecture/current-system.md) | `PRESERVED_CURRENT` | registry، mount/hide و reset هویت حفظ شده‌اند. |
| ۱۰. Customer | [module catalog](../product/module-catalog.md)، [current customer](../domains/sales/current-customer.md) | `PRESERVED_CURRENT` | گام اول از future sales جدا شده است. |

## Project Overview قدیمی

| Legacy section | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| ۱. Project Purpose | [product overview](../product/overview.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | دامنه فعلی بدون ادعای production ثبت شده است. |
| ۲. Business Goals | [product overview](../product/overview.md) | `PRESERVED_CURRENT` | هدف سطح بالا حفظ شده است. |
| ۳. Main Features | [module catalog](../product/module-catalog.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | فهرست با Viewهای واقعی تطبیق داده شده است. |
| ۴. Target Users | [product overview](../product/overview.md)، [roles](../domains/finance/roles-and-permissions.md) | `PRESERVED_CURRENT` | مخاطب و دسترسی از هم جدا شده‌اند. |
| ۵. Development Status | [product overview](../product/overview.md)، [quality](../engineering/quality.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | ادعاهای قدیمی مانند Production-Ready حذف شده‌اند. |

## Sales Architecture Draft قدیمی

هر ۴۲ بخش به‌صورت byte-identical در legacy و Snapshot باقی مانده است. تصمیم‌های پذیرفته‌شده در [approved design](../domains/sales/approved-design.md) و پرسش‌ها در [open questions](../domains/sales/open-questions.md) قرار دارند.

| Legacy section | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| ۱. زمینه و انگیزه | [current customer](../domains/sales/current-customer.md)، [approved design](../domains/sales/approved-design.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | جمله «هیچ ماژول فروش واقعی وجود ندارد» برای Customer دیگر مطلقاً درست نیست؛ Invoice/Lead همچنان future هستند. |
| ۲. زنجیره سلسله‌مراتب | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | hierarchy پذیرفته و اختیار اقدام هنوز DRAFT است. |
| ۳. مالی فاکتور | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | card transfer و gateway حفظ شده‌اند. |
| ۴. دو کارتابل مالی | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | استقلال permission و جزئیات contract آینده ثبت شده‌اند. |
| ۵. Goods/Service/Mixed | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | نوع ردیف و derive نوع فاکتور حفظ شده‌اند. |
| ۶. Shipping | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | دو روش و contract حل‌نشده map شده‌اند. |
| ۷. Consignment Inventory | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | موجودی امانی، COD و تفکیک پنل حفظ شده‌اند. |
| ۸. موضوعات باز اولیه | [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | پرسش‌ها DRAFT مانده‌اند. |
| ۹. روش پیاده‌سازی مرحله‌ای | [current AGENTS](../../AGENTS.md)، [open questions](../domains/sales/open-questions.md) | `DUPLICATE` | اصل flow و نیاز به تصمیم قبل از code حفظ شده است. |
| ۱۰. Customer دائمی | [current customer](../domains/sales/current-customer.md)، [approved design](../domains/sales/approved-design.md) | `PRESERVED_CURRENT` | بخش پیاده‌شده از lifecycle آینده جدا شده است. |
| ۱۱. Behavioral Reporting | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | MIS و dashboard آینده پوشش دارد. |
| ۱۲. Invoice و SupportCase | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | اصل linkage پذیرفته و contract دقیق باز است. |
| ۱۳. Service Activation Role | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | مسئول، پیگیری و pricing به future منتقل شده‌اند. |
| ۱۴. جریان مستقل کالا/خدمت | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | parallel fulfillment و refund ردیفی حفظ شده‌اند. |
| ۱۵. Warehouse | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | in-product warehouse و reservation باز ثبت شده‌اند. |
| ۱۶. فیش نادرست/جعلی | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | transition به `returned` حفظ شده است. |
| ۱۷. Inter-company Structure | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | نقش شرکت‌ها و تعداد پویا حفظ شده‌اند. |
| ۱۸. Inter-company Settlement | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | بدهی و دوره تسویه pair-specific حفظ شده‌اند. |
| ۱۹. Multi-company Customer | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | profile مستقل و linkage بدون merge اجباری حفظ شده‌اند. |
| ۲۰. موضوعات باز جدید | [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | upsell و profit model باز مانده‌اند. |
| ۲۱. حداقل اطلاعات Customer در Invoice | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | optional/progressive fields حفظ شده‌اند. |
| ۲۲. Discount/Invoice Code Delegation | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | delegation سلسله‌مراتبی حفظ شده است. |
| ۲۳. Invoice Workflow | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | supervisor → finance → fulfillment و transitionهای خطا map شده‌اند. |
| ۲۴. Customer Cancellation | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | status مستقل حفظ شده است. |
| ۲۵. Long-term Roadmap | [approved design](../domains/sales/approved-design.md)، [future platform](../architecture/future-platform.md) | `PRESERVED_FUTURE` | roadmap پس از هسته فروش حفظ شده است. |
| ۲۶. Full Sales Hierarchy | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | پنج سطح و استقلال خزانه‌داری حفظ شده‌اند. |
| ۲۷. Central Data/Ads/MIS | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | pipeline و scope دسترسی باز حفظ شده‌اند. |
| ۲۸. Import Identity/Merge | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | phone matching و conflict policy map شده‌اند. |
| ۲۹. Complaint Quarantine | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | quarantine پذیرفته و release details DRAFT هستند. |
| ۳۰. Multi-channel Lead Detection | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | raw interaction، classification و human review حفظ شده‌اند. |
| ۳۱. Lead Assignment Engine | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | rule-based/manual allocation و جزئیات weighting حفظ شده‌اند. |
| ۳۲. Hierarchy/Data Scope/Dashboard | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | permission/scope/hierarchy separation و drill-down حفظ شده‌اند. |
| ۳۳. Reassignment/Effective Contact | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | outcome buckets و retry policy map شده‌اند. |
| ۳۴. Organizational Move/Immutable History | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | dated membership، drain و immutable snapshot حفظ شده‌اند. |
| ۳۵. Simple UI/Complete Backstage | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | اصل طراحی سراسری حفظ شده است. |
| ۳۶. Issabel Outbound Desk | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | 360 view و call log حفظ شده‌اند. |
| ۳۷. Support Inbound as Lead Source | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | lead creation کوتاه و تخصیص توسط data management حفظ شده‌اند. |
| ۳۸. End-of-shift Zero Untouched Leads | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | اصل SLA و جزئیات محاسبه باز map شده‌اند. |
| ۳۹. Flexible Row-by-row Sale | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | Promotion، cross-sell و invoice مستقیم حفظ شده‌اند. |
| ۴۰. Product Catalog/Purchase Price Security | [approved design](../domains/sales/approved-design.md) | `PRESERVED_FUTURE` | catalog منعطف، permission قیمت خرید و price snapshot حفظ شده‌اند. |
| ۴۱. Progressive Lead Profile | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | provenance، optional enrichment و conflict policy حفظ شده‌اند. |
| ۴۲. Service Catalog/Activation Paths | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) | `PRESERVED_FUTURE` | catalog، statusها و انتخاب activation method حفظ شده‌اند. |

## System Architecture قدیمی

| Legacy section | New authoritative destination | Classification | Preservation evidence / note |
|---|---|---|---|
| ۱. Overall Architecture | [current system](../architecture/current-system.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | SPA و نبود backend اجرایی با code اثبات شده‌اند. |
| ۲. Frontend Architecture | [current system](../architecture/current-system.md)، [module catalog](../product/module-catalog.md) | `PRESERVED_CURRENT` | component/type/storage boundaries حفظ شده‌اند. |
| ۳. Data Flow | [current system](../architecture/current-system.md)، [persistence](../data/persistence.md) | `PRESERVED_CURRENT` | state و browser persistence ثبت شده‌اند. |
| ۴. Main Components | [module catalog](../product/module-catalog.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | catalog با Viewهای واقعی به‌روز شده است. |
| ۵. Technology Stack | [current system](../architecture/current-system.md) | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | React 19، Tailwind 4 و dependencies واقعی جایگزین ادعاهای قدیمی‌اند. |
| ۶. Design Patterns | [current system](../architecture/current-system.md)، [current AGENTS](../../AGENTS.md) | `PRESERVED_CURRENT` | modularity، RTL و مرز storage حفظ شده‌اند. |

## طبقه‌بندی آینده فایل‌های legacy

این جدول توصیه تصویب‌شده Step 6 است. وضعیت اجرای آن در بخش Step 7 پایین ثبت شده است.

| Legacy document | Future action | چرا دانش امن است |
|---|---|---|
| `README.md` | `KEEP` | entry استاندارد repository است؛ در مرحله آینده باید به overview/development لینک دهد، نه حذف شود. |
| نسخه pre-migration `AGENTS.md` در Snapshot | `ARCHIVE` | قواعد فعال استخراج شده‌اند و متن کامل immutable در Snapshot باقی می‌ماند؛ `AGENTS.md` فعلی authority است. |
| `DECISION_LOG.md` | `DEPRECATED_REDIRECT` | نسخه authoritative شامل متن verbatim است؛ مسیر root می‌تواند بعداً redirect سازگار باشد. |
| `docs/AI_CONTEXT.md` | `DEPRECATED_REDIRECT` | محتوای درست میان `AGENTS.md`, `ai/start-here`, overview و architecture تقسیم شده است. |
| `docs/API_DOCUMENTATION.md` | `DEPRECATED_REDIRECT` | همه endpointهای فرضی در API DRAFT map شده و نسخه اصلی در Snapshot حفظ است. |
| `docs/BUSINESS_RULES.md` | `DEPRECATED_REDIRECT` | قواعد به finance، roles، support و sales تقسیم و اختلاف‌ها با code اصلاح شده‌اند. |
| `docs/CODE_STRUCTURE.md` | `RETIRE_LATER` | tree دستی ارزش authoritative ندارد؛ current system، module catalog، Git history و Snapshot دانش را حفظ می‌کنند. |
| `docs/DATABASE_DOCUMENTATION.md` | `DEPRECATED_REDIRECT` | مدل مفهومی، persistence و قواعد دامنه مقصدهای روشن دارند؛ field truth در `src/types.ts` است. |
| `docs/DEVELOPMENT_GUIDE.md` | `DEPRECATED_REDIRECT` | development و quality authorityهای code-validated موجودند. |
| `docs/MODULES_DOCUMENTATION.md` | `DEPRECATED_REDIRECT` | module catalog و اسناد دامنه تمام بخش‌ها را پوشش می‌دهند. |
| `docs/PROJECT_OVERVIEW.md` | `DEPRECATED_REDIRECT` | overview و module catalog ادعاهای قدیمی را اصلاح کرده‌اند. |
| `docs/SALES_ARCHITECTURE_DRAFT.md` | `ARCHIVE` | سند chronology و nuance طراحی ارزش تاریخی مستقل دارد؛ approved/open authorities مشتق شده‌اند و Snapshot byte-identical است. |
| `docs/SYSTEM_ARCHITECTURE.md` | `DEPRECATED_REDIRECT` | current system authority با code و package تطبیق داده شده است. |

## ممیزی consistency authority

- ownership map دارای ۲۳ topic و برای هر topic دقیقاً یک مسیر authoritative موجود است.
- مسیرهای legacy فقط در بخش فهرست legacy، traceability یا به‌عنوان historical source دیده می‌شوند؛ هیچ‌کدام در ownership map authority نیستند.
- اسناد `CURRENT` آینده پیاده‌سازی‌نشده را فقط به‌صورت «وجود ندارد/محدودیت» یا link به future بیان می‌کنند.
- `future-platform.md`, `api-contract-draft.md`, `approved-design.md` و `open-questions.md` وضعیت غیر-CURRENT صریح دارند.
- قواعد مهم AGENTS قدیمی، Business Rules، Database و Modules در authorityهای CURRENT map شده‌اند.
- [AGENTS.md](../../AGENTS.md) کوتاه است و AI را ابتدا به [start-here](../ai/start-here.md) و سپس ownership map می‌فرستد.
- [docs README](../README.md) authorityهای فعال و نقش legacy را نمایش می‌دهد.

## تعارض‌های شناخته‌شده و reconciliation

| Conflict | Code evidence | Current authority | Legacy statement | Classification | Future action |
|---|---|---|---|---|---|
| `returned` باز یا بسته | `MyRequestsView.tsx`: `returned` در `openRequests` | [finance rules](../domains/finance/business-rules.md) | AGENTS قدیمی آن را بسته می‌نامد | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | redirect سند rule قدیمی؛ behavior تغییر نکند. |
| تعداد permission | `src/types.ts`: ۲۱ literal در `SystemPermission` | [roles](../domains/finance/roles-and-permissions.md) | legacy اعداد ۲۰ و ۲۲ دارد | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | redirect docs قدیمی و شمارش از code. |
| Customer در برابر «نبود sales module» | `Customer`, `CustomersView`, `CUSTOMERS`, `salesHierarchy.ts` | [current customer](../domains/sales/current-customer.md) | بخش ۱ Sales Draft نبود ماژول فروش واقعی را مطلق می‌گوید | `SUPERSEDED_BY_CODE_VALIDATED_AUTHORITY` | Draft به‌عنوان history archive شود؛ Invoice/Lead future بمانند. |
| endpointهای `/api/*` | نبود server entrypoint/route/client در scope بررسی‌شده | [API status](../architecture/api-status.md)، [API draft](../future/api-contract-draft.md) | API legacy endpointهای فرضی فهرست می‌کند | `PRESERVED_FUTURE` | deprecated redirect؛ هیچ endpoint CURRENT نشود. |
| checksum Sales Draft | raw SHA-256 هر دو فایل و Git blobها یکسان | همین سند و Snapshot manifest | گزارش Step 5 mismatch را مطرح کرد | `PRESERVED_HISTORICAL` | manifest تغییر نکند؛ validator فقط raw bytes را hash کند. |

## نتیجه Step 6 برای cleanup

Step 6 نتیجه گرفت که آماده‌سازی metadata/redirect و archive از نظر integrity و پوشش دانش امن است، اما حذف فیزیکی مجاز نیست. این نتیجه مبنای اجرای کنترل‌شده Step 7 شد.

## اجرای Step 7

- root `README.md` و `AGENTS.md` با action `KEEP` باقی ماندند؛ README به entry کوتاه authorityها تبدیل شد.
- ده مسیر `DEPRECATED_REDIRECT` به compatibility document کوتاه با `Status: DEPRECATED` تبدیل شدند.
- متن تاریخی Sales Draft با SHA-256 ثبت‌شده به‌صورت byte-identical در [archive دائمی فروش](sales/README.md) حفظ شد و مسیر قبلی آن redirect شد.
- `CODE_STRUCTURE.md` حذف یا بازنشسته نشد؛ فقط banner انتقالی `RETIRE_LATER` و replacementهای نهایی دریافت کرد.
- Snapshot pre-migration دست‌نخورده باقی ماند.
- هیچ application code، package/config یا runtime behavior تغییر نکرد.

پس از Step 7، cleanup کنترل‌شده redirect/archive اجرا شده است. حذف فیزیکی همچنان خارج از scope است و `CODE_STRUCTURE.md` تنها مورد `RETIRE_LATER` باقی‌مانده است.
