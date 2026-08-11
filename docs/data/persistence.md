# Persistence فعلی

> Status: CURRENT
> Source of truth: This document for current persistence model
> Owner: Data Owner
> Last validated: 2026-08-11 against `agent/sales-backend-slice-1`
> Supersedes: none
> Superseded by: none

Tapra2 اکنون persistence دوگانه و صریح دارد.

## PostgreSQL

- session، Organization/Access foundation، Customer 360/Import، عملیات فعلی Sales Lead و AuditEntry در PostgreSQL ذخیره می‌شوند.
- migrationها checksum، ترتیب نام و advisory lock دارند و تکرار اجرای آن‌ها idempotent است.
- service runtime با نقش محدود `tapra2_app` و migration با `tapra2_owner` اجرا می‌شود.
- تمام relationهای Customer 360، Sales فعلی و AuditEntry در transaction دارای tenant context اجرا و با RLS محدود می‌شوند.
- ایجاد profile، افزودن phone/address و merge/unmerge همراه timeline و AuditEntry در transaction واحد انجام می‌شوند.
- migration `0004_customer_360_identity.sql` ردیف‌های Sprint 1 را بدون حذف backfill می‌کند و اجرای تکراری migration runner با checksum کنترل می‌شود.
- migration `0008_customer_identity_scope.sql` identity را Workspace-wide و relationship را Company-scoped می‌کند؛ backfill داده موجود زیر transaction انجام و `FORCE RLS` پیش از commit بازگردانده می‌شود.
- migration `0009_sales_lead_queue.sql` policy، Lead، assignment، Call Log، relationship و history فروش را Company-scoped اضافه می‌کند؛ assignment/call/relationship/audit در transaction واحد به‌روزرسانی می‌شوند.
- Docker Compose روش reproducible رسمی development است؛ native PostgreSQL فقط fallback محلی از طریق environment است.

## localStorage

سایر قابلیت‌های Prototype همچنان از `src/utils/storage.ts` و کلیدهای موجود مرورگر استفاده می‌کنند. هیچ پاک‌سازی، تبدیل یا انتقال خودکار داده قدیمی اجرا نشده است. مسیر عادی Customer و صفحه‌های جدید Lead/Queue فقط PostgreSQL را استفاده می‌کنند؛ storage قدیمی Customer/Sales صرفاً برای compatibility، قابلیت‌های migrateنشده و migration evidence در code باقی است.

## محدودیت‌ها

- backup/restore production، retention و disaster recovery هنوز پیاده‌سازی نشده‌اند.
- migration خودکار داده Prototype به PostgreSQL هنوز وجود ندارد؛ داده جدید Sales در schema جدید ساخته می‌شود.
- هم‌زیستی backingها موقت است، اما UI یک محصول واحد نشان می‌دهد؛ backing status در مستندات migration ثبت می‌شود و انتخاب فناوری به کاربر عادی واگذار نمی‌شود.
- `localStorage` همچنان برای داده حساس واقعی یا enforcement امنیتی مناسب نیست.

## Persistence مربوط به Import

- migrationهای `0005` و `0006` staging، completion counts و structured purchase provenance را بدون حذف Customer 360 موجود اضافه می‌کنند.
- staging و Approval در PostgreSQL هستند؛ فایل روی filesystem برنامه ذخیره نمی‌شود.
- Approval همه تغییرات master، provenance، timeline و audit را در transaction tenant-scoped انجام می‌دهد.
- اجرای مجدد migration با checksum و اجرای مجدد Approval با state/idempotency کنترل می‌شود.
