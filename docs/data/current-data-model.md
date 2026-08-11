# مدل داده فعلی

> Status: CURRENT
> Source of truth: This document for current conceptual data model
> Owner: Data Owner
> Last validated: 2026-08-11 against `agent/sales-backend-slice-1`
> Supersedes: none
> Superseded by: none

در دوره migration دو مدل داده اجراشده هم‌زمان وجود دارند و نباید با هم یکی فرض شوند.

## مدل server-backed Foundation

تعریف دقیق schema در migrationهای `server/migrations/` است:

| مرز | موجودیت‌ها |
|---|---|
| Organization | `workspaces`, `companies` |
| Identity | `persons`, `user_accounts`, `sessions` |
| Access | `memberships`, `roles`, `permissions`, `role_assignments`, `role_permissions` |
| Workspace identity | `customer_identities` و `customer_identity_phones` برای هویت/شماره مرکزی و یکتا در Workspace |
| Company relationship | `customers` رابطه Company با identity؛ `customer_phones` و `customer_addresses` observation و داده عملیاتی Company |
| Provenance | `customer_sources` برای منبع، reference، زمان مشاهده/ورود، confidence و verification foundation |
| Customer history | `customer_timeline_events` برای eventهای server-generated اجراشده |
| Identity reconciliation | `customer_merge_operations` برای merge دارای lineage و unmerge واقعی بدون حذف profile بازنده |
| Sales policy | `sales_policies` برای outcome مؤثر، lock و رفتار assignment بدون hard-code در service |
| Sales operation | `sales_leads`, `sales_lead_assignments`, `sales_call_logs` برای Lead، مالکیت عملیاتی و تماس Company-scoped |
| Sales relationship/history | `sales_customer_relationships`, `sales_customer_relationship_events`, `sales_lead_timeline_events` برای lock و history قابل‌ردیابی |
| Audit | `audit_entries` با actor، context، action، resource و correlation |

شناسه‌ها UUID، زمان‌ها `timestamptz` و ارتباط‌های اصلی با foreign key محافظت می‌شوند. همه جدول‌های Customer 360، عملیات Sales فعلی و AuditEntry دارای PostgreSQL RLS اجباری هستند.

شماره با تابع immutable `normalize_customer_phone` نرمال می‌شود و `customer_identity_phones` مانع تعلق بی‌صدای یک phone به دو identity در همان Workspace است. یک identity می‌تواند برای چند Company رابطه جدا داشته باشد، اما هر Company فقط relationship و داده عملیاتی context خود را از طریق RLS می‌بیند. address دارای search text ساده است، ولی similarity/geocoding اجرا نشده است.

در merge، phone/address/source روی Customer اصلی خود باقی می‌مانند و profile canonical آن‌ها را از رابطه merge فعال جمع می‌کند. `lineage_snapshot` و هر دو ردیف Customer حفظ می‌شوند؛ unmerge رابطه را reverse و profile بازنده را دوباره active می‌کند.

## مدل Prototype

مدل‌های قدیمی مالی، Support، Letters، Chat، Task، Vendor و بخش‌های migrateنشده چرخه فروش در `src/types.ts` باقی مانده و با string ID در مرورگر مرتبط می‌شوند. وجود این typeها به معنی server persistence یا database constraint نیست. قرارداد دقیق Sales اجراشده در migration `0009_sales_lead_queue.sql` است و نباید با typeهای Prototype یکی فرض شود.

## قواعد تغییر

- field دقیق Backend از SQL migration و DTO/service فعلی خوانده می‌شود.
- field دقیق Prototype از `src/types.ts` خوانده می‌شود.
- تغییر schema PostgreSQL فقط با migration جدید انجام می‌شود؛ migration اعمال‌شده بازنویسی نمی‌شود.
- مدل‌های Sales خارج از [عملیات فعلی Lead](../domains/sales/current-lead-operations.md) تا زمان implementation در اسناد `APPROVED-FUTURE` یا `DRAFT` می‌مانند.

## Customer Import staging

`customer_import_jobs` و `customer_import_records` مدل staging مستقل از Customer master هستند. هر دو Workspace/Company-scoped، دارای RLS اجباری و دارای reference به actor هستند. Job وضعیت، hash فایل، schema version، شمارنده‌ها و زمان completion را نگه می‌دارد؛ Record نیز raw row، مقدارهای normalized، reasons، candidateها، پیشنهاد، تصمیم reviewer و نتیجه اعمال را حفظ می‌کند.

`customer_sources.metadata` اطلاعات ساخت‌یافته purchase واردشده را بدون ساخت Invoice نگه می‌دارد. رویدادهای `customer_imported` و `import_data_linked` فقط پس از Approval به timeline اضافه می‌شوند. جزئیات رفتار در [Customer Import](../domains/sales/customer-import.md) است.
