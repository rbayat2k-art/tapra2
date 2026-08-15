# فروش، فاکتور و پرداخت فعلی

> Status: CURRENT
> Source of truth: این سند برای رفتار اجراشده `Sale → Invoice → Payment → Financial Review` است.
> Owner: Sales Domain Owner
> Last validated: 2026-08-15 against migration `0015`, Backend tests and browser validation
> Supersedes: بخش اجراشده Invoice/Payment در اسناد آینده Sales
> Superseded by: none

## مرز اجراشده

مسیر عملیاتی `Sale → Invoice → Payment → Financial Review` اکنون در Backend و PostgreSQL اجرا شده است. Warehouse، Shipment، Service execution، Cancellation orchestration، Refund، Commission و accounting ledger هنوز در این سند CURRENT نیستند و در [Fulfillment Policy](fulfillment-policy.md) آینده باقی می‌مانند.

## Sale و Invoice

- ثبت Sale همیشه در همان transaction یک Invoice می‌سازد؛ برای هر Sale دقیقاً یک Invoice وجود دارد.
- Sale به `canonical_identity_id` پایدار Workspace و `customer_id` رابطه عملیاتی Company متصل است.
- `DIRECT` فروشنده و actor را از membership فعال می‌گیرد.
- `PAPER_ENTRY` فقط با `sales.sale.create_on_behalf` مجاز است و seller واقعی را جدا از actor ثبت‌کننده نگه می‌دارد.
- اگر Sale از Lead ساخته شود، Customer آن باید همان رابطه Company باشد و فروش مستقیم فقط برای assignee فعلی مجاز است.
- فاکتور ابتدا `awaiting_supervisor_approval` است. فروشنده نمی‌تواند فاکتور خودش را تأیید کند.

## revision فاکتور

- تغییر مهم اقلام، تعداد، قیمت یا تخفیف نسخه قبلی را overwrite نمی‌کند.
- هر revision در `sales_invoice_revisions` snapshot مستقل دارد و Lineهای هر revision جدا نگهداری می‌شوند.
- ویرایش draft به `sales.invoice.edit_draft` و اصلاح فاکتور تأییدشده بدون Payment به `sales.invoice.amend` نیاز دارد.
- amendment تأییدشده reason می‌خواهد، revision را افزایش می‌دهد و تأیید سرپرست را دوباره باز می‌کند.
- پس از شروع Payment activity، تغییر مبلغ/اقلام از این Flow fail-closed است تا adjustment/credit policy آینده history را مخدوش نکند.

## Payment و Financial Review

- هر Payment مستقل و دارای مبلغ، زمان، روش، چهار رقم آخر لازم، حساب مقصد، شماره پیگیری، ثبت‌کننده و وضعیت review است.
- روش‌های manual فعلی `card_to_card` و `bank_transfer` هستند. `payment_gateway` فقط برای integration اختصاصی رزرو شده و از مسیر ثبت دستی پذیرفته نمی‌شود.
- `cash`، `cheque` و `cod` در policy توسعه پیش‌فرض غیرفعال‌اند؛ فعال‌سازی آینده نیازمند policy صریح است.
- ثبت‌کننده Payment نمی‌تواند همان Payment را review کند.
- تصمیم review یکی از `approved`، `needs_correction` یا `rejected` است. دو حالت غیرتأیید reason اجباری دارند.
- اصلاح Payment برگشتی یک رکورد جدید می‌سازد؛ رکورد قبلی `superseded` و lineage دوطرفه حفظ می‌شود.
- Return فقط همان Payment را تغییر می‌دهد و Paymentهای دیگر یا Invoice را بازنویسی نمی‌کند.

## دروازه مالی اجرا

- status Invoice از Paymentهای واقعی derive می‌شود: `unpaid`، `declared`، `partial`، `paid`، `overpaid` یا `correction_required`.
- Payment جزئی هیچ Line را آزاد نمی‌کند.
- فقط وقتی مجموع Paymentهای `approved` دقیقاً برابر مبلغ نهایی Invoice و مورد unresolved وجود نداشته باشد، Invoice `financially_approved` و Lineهای revision فعلی `eligible` می‌شوند.
- اضافه‌پرداخت Invoice را در `overpayment_hold` نگه می‌دارد و Lineها `blocked_by_payment` باقی می‌مانند.
- Chargeback، Refund و رفع overpayment هنوز اجرا نشده‌اند و نباید از status فعلی استنباط شوند.

## امنیت و جداسازی

- تمام endpointها context فعال، Role/Permission سمت server و CSRF را enforce می‌کنند.
- Invoice خواندن عادی با seller membership محدود می‌شود؛ `sales.invoice.read_all` نمای Company را می‌دهد.
- تمام جدول‌های جدید `FORCE RLS` دارند و با Workspace/Company context محدودند.
- mutationها `Idempotency-Key`، AuditEntry، Invoice history و Customer timeline متناسب دارند.
- actor واقعی و effective user در Impersonation داخل Audit حفظ می‌شوند.
- Scopeهای `BRANCH`، `DEPARTMENT` و `TEAM` تا زمان attribution صریح Invoice Line به unit برای این Flow fail-closed هستند.

## UI فعلی

- `SaasSalesInvoiceView` مسیر «فاکتور فروش» و «تأیید مالی فروش» را از API دریافت می‌کند.
- labelهای status، روش پرداخت، نوع Line و وضعیت اجرا فارسی و RTL هستند؛ codeهای English فقط در contract داخلی می‌مانند.
- UI مجوز ایجاد نمی‌کند و خطای Backend را به پیام فارسی امن تبدیل می‌کند.
- `SalesInvoiceView` و `SalesFinancialConfirmationView` قدیمی برای بازیابی کد legacy باقی‌اند، اما در این دو مسیر عملیاتی mount نمی‌شوند.

## شواهد

- `server/migrations/0015_sale_invoice_payment.sql`
- `server/src/modules/sales/invoice-service.ts`
- `server/src/modules/sales/routes.ts`
- `server/tests/sales.integration.test.ts`
- `src/foundation/sales/SaasSalesInvoiceView.tsx`
- `src/foundation/api/client.ts`
- `src/foundation/sales/labels.ts`
