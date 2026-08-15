# فروش، فاکتور و پرداخت فعلی

> Status: CURRENT
> Source of truth: این سند برای رفتار اجراشده `Sale → Invoice → Payment → Financial Review` است.
> Owner: Sales Domain Owner
> Last validated: 2026-08-16 against migrations `0015`–`0017`, Backend tests and browser validation
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
- الزام تأیید سرپرست یک policy در سطح Company و برای فروش‌های جدید به‌طور پیش‌فرض روشن است. مقدار policy هنگام ساخت روی Invoice snapshot می‌شود تا تغییر بعدی سابقه قبلی را عوض نکند.
- وقتی policy روشن باشد فاکتور ابتدا `awaiting_supervisor_approval` است و فروشنده نمی‌تواند فاکتور خودش را تأیید کند. وقتی خاموش باشد Invoice مستقیماً `awaiting_payment` می‌شود.

## revision فاکتور

- تغییر مهم اقلام، تعداد، قیمت یا تخفیف نسخه قبلی را overwrite نمی‌کند.
- هر revision در `sales_invoice_revisions` snapshot مستقل دارد و Lineهای هر revision جدا نگهداری می‌شوند.
- ویرایش draft به `sales.invoice.edit_draft` و اصلاح فاکتور تأییدشده بدون Payment به `sales.invoice.amend` نیاز دارد.
- amendment تأییدشده reason می‌خواهد، revision را افزایش می‌دهد و تأیید سرپرست را دوباره باز می‌کند.
- پس از شروع Payment activity، تغییر مبلغ/اقلام از این Flow fail-closed است تا adjustment/credit policy آینده history را مخدوش نکند.

## Payment و Financial Review

- هر Payment مستقل و دارای مبلغ، زمان، روش، چهار رقم آخر لازم، حساب مقصد، شماره پیگیری، ثبت‌کننده و وضعیت review است.
- همه مبلغ‌های API رشته عدد صحیح decimal در Rial، در Backend از نوع `bigint` و در PostgreSQL از نوع `bigint` هستند؛ مسیر مالی از `JavaScript number` استفاده نمی‌کند.
- روش‌های manual فعلی `card_to_card` و `bank_transfer` هستند. `payment_gateway` فقط برای integration اختصاصی رزرو شده و از مسیر ثبت دستی پذیرفته نمی‌شود.
- `cash`، `cheque` و `cod` در policy توسعه پیش‌فرض غیرفعال‌اند؛ فعال‌سازی آینده نیازمند policy صریح است.
- وضعیت submission/review فقط `submitted`، `approved` یا `needs_correction` است؛ `superseded` فقط lineage نسخه اصلاحی را نشان می‌دهد. تصمیم مستقل `rejected` در این Flow وجود ندارد.
- بازبینی مالی هنگام Impersonation fail-closed است. actor واقعی و user مؤثر سازنده Payment هر دو ثبت می‌شوند و هیچ‌کدام نمی‌تواند همان Payment را review کند.
- تصمیم review فقط `approved` یا `needs_correction` است؛ برگشت برای اصلاح reason اجباری دارد.
- اصلاح Payment برگشتی یک رکورد جدید می‌سازد؛ رکورد قبلی `superseded` و lineage دوطرفه حفظ می‌شود.
- Return فقط همان Payment را تغییر می‌دهد و Paymentهای دیگر یا Invoice را بازنویسی نمی‌کند.

## دروازه مالی اجرا

- status Invoice از Paymentهای واقعی derive می‌شود: `unpaid`، `submitted`، `partial`، `paid` یا `correction_required`.
- Payment جزئی هیچ Line را آزاد نمی‌کند.
- فقط وقتی مجموع Paymentهای `approved` دقیقاً برابر مبلغ نهایی Invoice و مورد unresolved وجود نداشته باشد، Invoice `financially_approved` و Lineهای revision فعلی `eligible` می‌شوند.
- تأیید Payment که مجموع تأییدشده را از مبلغ Invoice بیشتر کند fail-closed است؛ Payment در انتظار review می‌ماند و Lineها `blocked_by_payment` باقی می‌مانند.
- Chargeback، Refund و رفع overpayment هنوز اجرا نشده‌اند و نباید از status فعلی استنباط شوند.

## امنیت و جداسازی

- تمام endpointها context فعال، Role/Permission سمت server و CSRF را enforce می‌کنند.
- Invoice خواندن عادی با seller membership محدود می‌شود؛ `sales.invoice.read_all` نمای Company را می‌دهد.
- تمام جدول‌های جدید `FORCE RLS` دارند و با Workspace/Company context محدودند.
- mutationها `Idempotency-Key`، AuditEntry، Invoice history و Customer timeline متناسب دارند.
- actor واقعی و effective user در Impersonation داخل Audit حفظ می‌شوند.
- Scopeهای `BRANCH`، `DEPARTMENT` و `TEAM` تا زمان attribution صریح Invoice Line به unit برای این Flow fail-closed هستند.
- درخواست‌های idempotent هم‌زمان با advisory lock سری می‌شوند و review هم‌زمان با lock Invoice/Payment فقط یک نتیجه معتبر ایجاد می‌کند.

## تنظیمات عملیاتی Company

- Company تازه در همان transaction دارای `sales_policies`، شش policy روش پرداخت و `sales_invoice_policies` پیش‌فرض می‌شود؛ به seed وابسته نیست.
- کاربر دارای `sales.payment.infrastructure.manage` می‌تواند حساب وصول را ایجاد، ویرایش، فعال یا غیرفعال کند و الزام تأیید سرپرست را برای Invoiceهای بعدی تغییر دهد.
- API فقط reference پوشیده حساب را برمی‌گرداند و شماره کامل حساب/کارت را در این Flow دریافت یا نمایش نمی‌دهد.
- `payment_gateway` فقط schema/policy رزروشده آینده است؛ endpoint اجرای Gateway در این vertical slice ساخته نشده است.

## UI فعلی

- `SaasSalesInvoiceView` مسیر «فاکتور فروش» و «تأیید مالی فروش» را از API دریافت می‌کند.
- labelهای status، روش پرداخت، نوع Line و وضعیت اجرا فارسی و RTL هستند؛ codeهای English فقط در contract داخلی می‌مانند.
- UI مجوز ایجاد نمی‌کند و خطای Backend را به پیام فارسی امن تبدیل می‌کند.
- `SalesInvoiceView` و `SalesFinancialConfirmationView` قدیمی برای بازیابی کد legacy باقی‌اند، اما در این دو مسیر عملیاتی mount نمی‌شوند.

## شواهد

- `server/migrations/0015_sale_invoice_payment.sql`
- `server/migrations/0016_payment_review_safety.sql`
- `server/migrations/0017_sales_collection_policy.sql`
- `server/src/modules/sales/invoice-service.ts`
- `server/src/modules/sales/routes.ts`
- `server/tests/sales.integration.test.ts`
- `server/tests/sales-migration-compatibility.test.ts`
- `src/foundation/sales/SaasSalesInvoiceView.tsx`
- `src/foundation/api/client.ts`
- `src/foundation/sales/labels.ts`
