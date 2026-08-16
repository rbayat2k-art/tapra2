# بنیاد فعلی انبار و موجودی

> Status: CURRENT
> Source of truth: این سند برای رفتار اجراشده Warehouse Foundation و مرزهای آن است.
> Owner: Warehouse Domain Owner
> Last validated: 2026-08-16 against migrations `0019`–`0022`, Backend tests and production build
> Supersedes: بخش Warehouse در `docs/domains/sales/fulfillment-policy.md` فقط در محدوده رفتارهای اجراشده این سند
> Superseded by: none

Warehouse Foundation اکنون server-authoritative و PostgreSQL-backed است. UI عملیاتی فارسی و RTL، APIهای `/api/v1/warehouse` و schema این دامنه یک vertical slice واحد هستند. Logistics، Shipment، Delivery، Fleet، Route و Contract engine هنوز CURRENT نیستند.

## مدل موجودی

- `inventory_movements` دفتر append-only و منبع حقیقت موجودی است. movement ثبت‌شده Update/Delete نمی‌شود؛ اصلاح فقط با movement معکوس و Audit انجام می‌شود.
- `inventory_balances` projection قابل بازسازی از ledger است و برای lock و query عملیاتی استفاده می‌شود.
- مقدار در API رشته decimal، در Backend محاسبه دقیق `bigint` با مقیاس شش رقم و در PostgreSQL از نوع `numeric(20,6)` است. محاسبه موجودی با `JavaScript number` مجاز نیست.
- trackingهای `NONE`، `LOT` و `SERIAL` اجرا شده‌اند. مقدار هر movement سریالی دقیقاً `1.000000` است و یک Serial موجود را نمی‌توان دوباره دریافت کرد.
- `stock_identities.owner_company_id` مالک موجودی را از Warehouse operator جدا نگه می‌دارد. عملیات cross-company بدون Workspace authority صریح fail-closed است؛ Contract engine ساخته نشده است.

## عملیات اجراشده

| قابلیت | رفتار CURRENT |
|---|---|
| Warehouse و Location | چند Warehouse و locationهای `RECEIVING`, `STORAGE`, `QUARANTINE`, `DAMAGED`, `RETURNS`, `IN_TRANSIT` پشتیبانی می‌شوند. |
| Inventory Item | کالای پایدار با `sku`, `catalog_reference`, `uom` و tracking mode؛ Line کالای free-text یا unresolved قابل رزرو نیست. |
| Receiving | Purchase Receiving و Manual Receiving؛ حالت Manual به Permission مستقل، reason، evidence و Audit نیاز دارد. |
| Reservation | فقط current Invoice Line کالایی، دارای Inventory Item پایدار و دارای eligibility مالی؛ allocation می‌تواند از چند Warehouse باشد و shortage/partial reservation را ثبت کند. |
| Release | Reservation آزاد می‌شود، اما موجودی فیزیکی تغییر نمی‌کند. |
| Transfer | ایجاد، خروج کامل از مبدأ و دریافت کامل در مقصد؛ schema برای partial receipt سازگار است ولی workflow جزئی در v1 فعال نیست. |
| Adjustment | create/submit/approve با Permissionهای جدا و maker-checker؛ creator یا نشست Impersonation نمی‌تواند تأیید کند. |
| Count | شمارش و approval مستقل؛ اختلاف با balance قفل‌شده هنگام approval به ledger وارد می‌شود. |
| Return | دریافت و inspection با dispositionهای `SELLABLE`, `QUARANTINE`, `DAMAGED`, `RETURN_TO_SUPPLIER`, `SCRAP`. |

## Invoice handoff و همزمانی

- `sales_invoice_lines.inventory_item_id` اتصال پایدار Line کالایی به Inventory Item است.
- reservation فقط برای revision جاری، Line حل‌شده و Invoice دارای payment کامل تأییدشده مجاز است؛ Warehouse وضعیت Payment را تغییر نمی‌دهد.
- allocation با lock قطعی balanceها و `FOR UPDATE` انجام می‌شود؛ رزرو همزمان نمی‌تواند oversell یا موجودی منفی ایجاد کند.
- partial reservation به معنی partial shipment نیست. Shipment/Dispatch عمومی ساخته نشده است؛ stock-out قطعی Shipment در vertical slice آینده تعریف خواهد شد.
- mutationهای create دارای `Idempotency-Key` هستند و transitionهای تکراری امن یا fail-closed می‌شوند.

## Permission، RLS و Audit

Permissionهای `warehouse.read/manage`, `warehouse.item.manage`, receiving، reservation، transfer، adjustment، count، return و movement reversal سمت server enforce می‌شوند. جدول‌های دامنه `ENABLE RLS` و `FORCE RLS` دارند. Scopeهای `BRANCH`, `DEPARTMENT`, `TEAM` و `SELF` تا زمان attribution صریح Warehouse به آن Scopeها fail-closed هستند؛ Scopeهای CURRENT فقط `WORKSPACE` و `COMPANY` هستند.

Audit با `auditIdentity(session)` هویت actor واقعی، effective user و Impersonation را حفظ می‌کند. approvalهای maker-checker در Impersonation ممنوع‌اند. UI فقط presentation boundary است و مرجع امنیت نیست.

## شواهد پیاده‌سازی

- `server/migrations/0019_warehouse_inventory_core.sql` تا `0022_invoice_inventory_item_handoff.sql`
- `server/src/modules/warehouse/`
- `server/tests/warehouse.integration.test.ts`
- `server/tests/warehouse-migration-compatibility.test.ts`
- `src/foundation/warehouse/WarehouseFoundationView.tsx`

## عمداً خارج از Scope

Fleet، Driver، Route، Shipment، Delivery، partial Transfer Receipt UI، Service Fulfillment، Payment Gateway، Contract engine و Inventory valuation/accounting ساخته نشده‌اند. قواعد پذیرفته‌شده مراحل آینده در [Sales Fulfillment Policy](../sales/fulfillment-policy.md) باقی می‌مانند.
