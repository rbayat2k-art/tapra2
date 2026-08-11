# Persistence فعلی

> Status: CURRENT
> Source of truth: This document for current persistence model
> Owner: Data Owner
> Last validated: 2026-08-11 against `agent/foundation-sprint-1@c5b8de6`
> Supersedes: none
> Superseded by: none

Tapra2 اکنون persistence دوگانه و صریح دارد.

## PostgreSQL

- session، Organization/Access foundation، Customer SaaS و AuditEntry در PostgreSQL ذخیره می‌شوند.
- migrationها checksum، ترتیب نام و advisory lock دارند و تکرار اجرای آن‌ها idempotent است.
- service runtime با نقش محدود `tapra2_app` و migration با `tapra2_owner` اجرا می‌شود.
- Customer و AuditEntry در transaction دارای tenant context اجرا و با RLS محدود می‌شوند.
- ایجاد Customer و AuditEntry مربوط به آن در یک transaction انجام می‌شود.
- Docker Compose روش reproducible رسمی development است؛ native PostgreSQL فقط fallback محلی از طریق environment است.

## localStorage

سایر قابلیت‌های Prototype همچنان از `src/utils/storage.ts` و کلیدهای موجود مرورگر استفاده می‌کنند. هیچ پاک‌سازی، تبدیل یا انتقال خودکار داده قدیمی اجرا نشده است. صفحه Customer نیز مسیر Prototype را جداگانه حفظ می‌کند.

## محدودیت‌ها

- backup/restore production، retention و disaster recovery هنوز پیاده‌سازی نشده‌اند.
- migration داده Prototype به PostgreSQL هنوز وجود ندارد.
- هم‌زیستی دو منبع داده موقت است و UI باید منبع را آشکار نشان دهد.
- `localStorage` همچنان برای داده حساس واقعی یا enforcement امنیتی مناسب نیست.
