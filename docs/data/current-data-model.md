# مدل داده فعلی

> Status: CURRENT
> Source of truth: This document for current conceptual data model
> Owner: Data Owner
> Last validated: 2026-08-11 against `agent/customer-import-sprint-3`
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
| Customer identity | `customers` به‌عنوان profile والد؛ `customer_phones` و `customer_addresses` برای داده چندتایی |
| Provenance | `customer_sources` برای منبع، reference، زمان مشاهده/ورود، confidence و verification foundation |
| Customer history | `customer_timeline_events` برای eventهای server-generated اجراشده |
| Identity reconciliation | `customer_merge_operations` برای merge دارای lineage و unmerge واقعی بدون حذف profile بازنده |
| Audit | `audit_entries` با actor، context، action، resource و correlation |

شناسه‌ها UUID، زمان‌ها `timestamptz` و ارتباط‌های اصلی با foreign key محافظت می‌شوند. همه جدول‌های Customer 360 و AuditEntry دارای PostgreSQL RLS اجباری هستند.

شماره با تابع immutable `normalize_customer_phone` نرمال می‌شود و index یکتای `(workspace_id, normalized_value)` مانع تعلق بی‌صدای یک phone به دو profile در همان Workspace است. visibility همچنان Company-scoped است. address دارای search text ساده است، ولی similarity/geocoding اجرا نشده است.

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
