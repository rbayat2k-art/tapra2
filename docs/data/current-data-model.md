# مدل داده فعلی

> Status: CURRENT
> Source of truth: This document for current conceptual data model
> Owner: Data Owner
> Last validated: 2026-08-15 against `agent/organization-access-foundation`
> Supersedes: none
> Superseded by: none

در دوره migration دو مدل داده اجراشده هم‌زمان وجود دارند و نباید با هم یکی فرض شوند.

## مدل server-backed Foundation

تعریف دقیق schema در migrationهای `server/migrations/` است:

| مرز | موجودیت‌ها |
|---|---|
| Organization | `workspaces`, `companies`, `organization_units` برای `BRANCH`، `DEPARTMENT`، `TEAM` و `SHARED_SERVICE` |
| Identity | `persons`, `user_accounts`, `sessions` |
| Access | `memberships`, `roles`, `permissions`, `role_assignments`, `role_permissions` و `legacy_role_mappings` |
| Workspace identity | `customer_identities` و `customer_identity_phones` برای هویت/شماره مرکزی و یکتا در Workspace |
| Company relationship | `customers` رابطه Company با identity؛ `customer_phones` و `customer_addresses` observation و داده عملیاتی Company |
| Provenance | `customer_sources` برای منبع، reference، زمان مشاهده/ورود، confidence و verification foundation |
| Customer history | `customer_timeline_events` برای eventهای server-generated اجراشده |
| Identity reconciliation | `customer_merge_operations` برای merge دارای lineage و unmerge واقعی بدون حذف profile بازنده |
| Impersonation | `session_impersonations` برای نمای زمان‌دار، دلیل، actor/target context و پایان نشست |
| Audit | `audit_entries` با actor واقعی، user مؤثر، impersonation، context، action، resource و correlation |

شناسه‌ها UUID، زمان‌ها `timestamptz` و ارتباط‌های اصلی با foreign key محافظت می‌شوند. همه جدول‌های Customer 360 و AuditEntry دارای PostgreSQL RLS اجباری هستند.

`Company` واحد تجاری/حقوقی است. `Shared Service` شرکت مصنوعی نیست و به‌صورت `organization_units.unit_type = 'SHARED_SERVICE'` با `company_id = NULL` در سطح Workspace ثبت می‌شود. واحدهای `BRANCH`، `DEPARTMENT` و `TEAM` به Company تعلق دارند و می‌توانند parent داشته باشند.

یک `UserAccount` می‌تواند از طریق چند `Membership` و چند `role_assignment` در Scopeهای `WORKSPACE`، `COMPANY`، `BRANCH`، `DEPARTMENT`، `TEAM` و `SELF` نقش متفاوت داشته باشد. assignment قدیمی بدون Scope هنگام migration بر اساس Company عضویت به Scope سازگار تبدیل می‌شود؛ assignment جدید Scope صریح دارد. Session، context فعال را با `membership + scope type + scope id` نگه می‌دارد، نه فقط Company.

شماره با تابع immutable `normalize_customer_phone` نرمال می‌شود و `customer_identity_phones` مانع تعلق بی‌صدای یک phone به دو identity در همان Workspace است. یک identity می‌تواند برای چند Company رابطه جدا داشته باشد، اما هر Company فقط relationship و داده عملیاتی context خود را از طریق RLS می‌بیند. address دارای search text ساده است، ولی similarity/geocoding اجرا نشده است.

در merge، phone/address/source روی Customer اصلی خود باقی می‌مانند و profile canonical آن‌ها را از رابطه merge فعال جمع می‌کند. `lineage_snapshot` و هر دو ردیف Customer حفظ می‌شوند؛ unmerge رابطه را reverse و profile بازنده را دوباره active می‌کند.

## مدل Prototype

مدل‌های قدیمی مالی، Support، Letters، Chat، Task، Vendor و چرخه فروش در `src/types.ts` باقی مانده و با string ID در مرورگر مرتبط می‌شوند. وجود این typeها به معنی server persistence یا database constraint نیست.

## قواعد تغییر

- field دقیق Backend از SQL migration و DTO/service فعلی خوانده می‌شود.
- field دقیق Prototype از `src/types.ts` خوانده می‌شود.
- تغییر schema PostgreSQL فقط با migration جدید انجام می‌شود؛ migration اعمال‌شده بازنویسی نمی‌شود.
- مدل‌های Sales آینده تا زمان implementation در اسناد `APPROVED-FUTURE` یا `DRAFT` می‌مانند.

## Customer Import staging

`customer_import_jobs` و `customer_import_records` مدل staging مستقل از Customer master هستند. هر دو Workspace/Company-scoped، دارای RLS اجباری و دارای reference به actor هستند. Job وضعیت، hash فایل، schema version، شمارنده‌ها و زمان completion را نگه می‌دارد؛ Record نیز raw row، مقدارهای normalized، reasons، candidateها، پیشنهاد، تصمیم reviewer و نتیجه اعمال را حفظ می‌کند.

`customer_sources.metadata` اطلاعات ساخت‌یافته purchase واردشده را بدون ساخت Invoice نگه می‌دارد. رویدادهای `customer_imported` و `import_data_linked` فقط پس از Approval به timeline اضافه می‌شوند. جزئیات رفتار در [Customer Import](../domains/sales/customer-import.md) است.
