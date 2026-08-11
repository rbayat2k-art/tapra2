# مدل داده فعلی

> Status: CURRENT
> Source of truth: This document for current conceptual data model
> Owner: Data Owner
> Last validated: 2026-08-11 against `agent/foundation-sprint-1@c5b8de6`
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
| Customer | `customers` با scope اجباری Workspace/Company |
| Audit | `audit_entries` با actor، context، action، resource و correlation |

شناسه‌ها UUID، زمان‌ها `timestamptz` و ارتباط‌های اصلی با foreign key محافظت می‌شوند. Customer و AuditEntry دارای PostgreSQL RLS اجباری هستند.

## مدل Prototype

مدل‌های قدیمی مالی، Support، Letters، Chat، Task، Vendor و چرخه فروش در `src/types.ts` باقی مانده و با string ID در مرورگر مرتبط می‌شوند. وجود این typeها به معنی server persistence یا database constraint نیست.

## قواعد تغییر

- field دقیق Backend از SQL migration و DTO/service فعلی خوانده می‌شود.
- field دقیق Prototype از `src/types.ts` خوانده می‌شود.
- تغییر schema PostgreSQL فقط با migration جدید انجام می‌شود؛ migration اعمال‌شده بازنویسی نمی‌شود.
- مدل‌های Sales آینده تا زمان implementation در اسناد `APPROVED-FUTURE` یا `DRAFT` می‌مانند.
