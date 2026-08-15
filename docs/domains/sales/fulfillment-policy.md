# سیاست پذیرفته‌شده Invoice و Fulfillment فروش

> Status: APPROVED-FUTURE
> Source of truth: این سند برای قواعد پذیرفته‌شده Invoice release، Warehouse، Logistics، Service execution و لغو است.
> Owner: Sales Domain Owner
> Last validated: 2026-08-15 against confirmed business decisions
> Supersedes: بخش‌های متناقض Payment return و COD در طراحی قدیمی Sales
> Superseded by: none

این سند رفتار CURRENT نیست. تا زمانی که migration، Backend، Permission، RLS، Audit، test و UI مرتبط تکمیل و اعتبارسنجی نشده‌اند، Invoice، Payment و Fulfillment جدید `APPROVED-FUTURE` باقی می‌مانند.

## دروازه مالی Fulfillment

- هر Invoice می‌تواند چند Payment مستقل داشته باشد و هر Payment جداگانه بررسی می‌شود.
- هیچ Invoice Line پیش از برابری دقیق مجموع Paymentهای `APPROVED` با مبلغ نهایی Invoice وارد اجرا نمی‌شود.
- Payment ناقص، حتی اگر مبلغ آن با یک Line برابر باشد، همان Line را آزاد نمی‌کند.
- اضافه‌پرداخت اجرای Invoice را آزاد نمی‌کند؛ مبلغ اضافه در پرونده `OVERPAYMENT` برای Refund، Customer credit یا تخصیص مجاز آینده تعیین تکلیف می‌شود.
- Payment برگشتی یا Chargeback بعد از شروع اجرا، تاریخچه را بازنویسی نمی‌کند. Line شروع‌نشده روی financial hold می‌رود، Line در حال اجرا برای تصمیم انسانی علامت‌گذاری و تعهد تکمیل‌شده حفظ می‌شود.
- `COD` باید در مدل قابل پشتیبانی باشد، ولی در Flow عادی فعلی غیرفعال است و فعال‌سازی آینده آن به policy، Permission، Contract، settlement و Audit مستقل نیاز دارد.

## Invoice و نسخه‌بندی

- ثبت Sale یک Invoice مرتبط ایجاد می‌کند؛ seller واقعی، actor ثبت‌کننده و entry mode مستقل ثبت می‌شوند.
- Permission ویرایش بر پایه Role و Scope در Backend محاسبه می‌شود و پنهان‌کردن دکمه در UI مجوز ایجاد نمی‌کند.
- تغییر مهم مانند Customer، seller، Company، Line، تعداد، قیمت، تخفیف، مبلغ، شرایط پرداخت یا نشانی مؤثر بر ارسال، Invoice قبلی را overwrite نمی‌کند؛ revision تازه می‌سازد و Approvalهای مرتبط را دوباره باز می‌کند.
- تغییر کم‌خطر مانند یادداشت داخلی یا اطلاعات تکمیلی غیرمؤثر بر تعهد، با Audit ثبت می‌شود و Approval را بی‌دلیل باطل نمی‌کند.
- Permissionهای مستقل `edit draft`، `correct returned invoice` و `amend approved invoice` لازم‌اند.

## شروع و استقلال Lineها

- پس از تکمیل دروازه مالی، هر Line مسیر اجرایی مستقل دارد.
- Line کالای ناموجود در `AWAITING_STOCK` می‌ماند و اجرای Lineهای خدمت را متوقف نمی‌کند.
- وضعیت کلی Invoice از وضعیت Payment و Lineهای اجرایی derive می‌شود و یک flag دستی مبهم نیست.
- تمام statusهای داخلی code/API/database English و پایدارند؛ UI، پیام‌ها و گزارش‌های کاربر فارسی و RTL هستند و از یک label map مرکزی استفاده می‌کنند.

## Warehouse و مالکیت

- Inventory فقط بعد از پرداخت کامل و Financial Approval رزرو می‌شود؛ Invoice پرداخت‌نشده موجودی را مسدود نمی‌کند.
- Warehouse یک محل عملیاتی مستقل است. `owner_company`، `seller_company`، `fulfillment_company`، `operator_unit` و محل نگهداری مفاهیم جدا هستند.
- در Workspace تک‌شرکتی، نقش‌های شرکتی پشت‌صحنه به همان Company resolve و پیچیدگی آن‌ها در UI عادی مخفی می‌شود.
- در Workspace چندشرکتی، Contract مجوز فروش، نگهداری، اجرا، دسترسی و settlement را تعیین می‌کند؛ موجودی مالکان مختلف در ledger مخلوط نمی‌شود.
- Shared Service شرکت مصنوعی نیست و می‌تواند operator یک Warehouse باشد.

## Shipment و تحویل

- پیش‌فرض، ارسال کامل مقدار یک Line است.
- یک Line می‌تواند با Permission، دلیل و تأیید Customer میان چند Shipment تقسیم شود. مقدار ordered، reserved، shipped، delivered و remaining جدا ثبت می‌شود.
- تحویل ناموفق وارد `DELIVERY_FAILED` می‌شود و Refund، لغو یا retry خودکار نمی‌سازد.
- اقدام بعدی می‌تواند هماهنگی مجدد، اصلاح Audit‌شده نشانی، تغییر carrier، بازگشت به Warehouse یا ارجاع به Support باشد.
- تا تحویل موفق یا بازگشت تأییدشده، custody کالا نزد عامل حمل باقی می‌ماند.

## اجرای Service

- Catalog و Contract روش‌های مجاز اجرا و نوع `ONE_TIME` یا `SUBSCRIPTION` را تعیین می‌کنند؛ Customer هنگام Sale از میان گزینه‌های مجاز انتخاب می‌کند.
- روش انتخاب‌شده روی Invoice Line snapshot می‌شود و واحد اجرا نمی‌تواند آن را یک‌طرفه تغییر دهد.
- کارشناس نتیجه و Evidence را ثبت و مدیر مسئول آن را review می‌کند.
- Catalog/Contract مشخص می‌کند Customer Confirmation اجباری است یا خیر. نبود پاسخ خودکار تأیید یا رد نمی‌شود و وارد SLA escalation می‌گردد.
- نقطه `BILLABLE` برای Service activation-based، execution-based یا customer-confirmed از policy همان Service به دست می‌آید و مبنای settlement بین‌شرکتی است.

## لغو، مرجوعی و Refund

- درخواست لغو در همه مراحل ممکن است، اما اثر آن بر اساس وضعیت واقعی هر Line تعیین می‌شود.
- پس از Financial Approval یا شروع اجرا، لغو مستقیم و مخرب Invoice مجاز نیست؛ یک Support Case رسمی ایجاد می‌شود.
- کالای ارسال‌نشده لغو و reservation آن آزاد می‌شود؛ کالای در حمل وارد توقف/بازگشت و کالای تحویل‌شده وارد return/inspection می‌شود.
- Service شروع‌نشده لغو، Service در حال اجرا برای توقف ارجاع و Service فعال در صورت امکان غیرفعال می‌شود. خدمت مصرف‌شده یا غیرقابل‌بازگشت به‌دروغ حذف نمی‌شود.
- نتیجه می‌تواند لغو کامل، لغو جزئی، انتظار بازگشت کالا، انتظار غیرفعال‌سازی، اقلام غیرقابل‌عودت یا انتظار Refund باشد.
- Invoice، Payment و Fulfillment اصلی حذف یا overwrite نمی‌شوند؛ correction، return و Refund رکورد و history مستقل دارند.

## مرز Implementation

Vertical sliceها باید به این ترتیب پیش بروند:

1. `Sale → Invoice → Payment → Financial Review`؛
2. Warehouse ledger و reservation پس از پرداخت کامل؛
3. Product Shipment/Delivery؛
4. Service Execution/Activation؛
5. Cancellation orchestration، Return و Refund؛
6. Contract-driven cross-company settlement.

هر slice باید Permission سمت server، Company/Workspace isolation، PostgreSQL RLS، Audit، idempotency، تست منفی و UI فارسی داشته باشد.
