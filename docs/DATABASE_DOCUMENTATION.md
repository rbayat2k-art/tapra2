# 🗄️ مستندات پایگاه داده و مدل‌های داده (Database & Data Models Documentation)

> مدل‌های فعلی این سند وضعیت Prototype مبتنی بر `localStorage` را توصیف می‌کنند. موجودیت‌های بخش بعدی مدل هدف‌اند و هنوز نباید پیاده‌سازی‌شده تلقی شوند.

## مدل هدف پروفایل و فروش (برنامه‌ریزی‌شده)

- `CustomerProfile`: شناسهٔ پایدار و وضعیت‌های مستقل هویت، مالی، تماس، فروش، شکایت و رضایت.
- `CustomerIdentityValue` و `CustomerPhone`: نام، کد ملی اختیاری، نشانی و شماره‌ها با مقدار نرمال، منبع، زمان، تأیید مشتری و مقدار اصلی.
- `CustomerMergeRequest` و `CustomerMergeEvent`: نامزدها، امتیاز تطبیق، تصمیم مدیر داده، Snapshot قبل/بعد و اطلاعات جداسازی.
- `ClaimedPurchase`: ادعای خرید/مبلغ، مدرک و وضعیت بررسی؛ تا پیش از تأیید وارد اعتبار و گزارش قطعی نمی‌شود.
- `Promotion` و `PromotionVersion`: تعریف پروموشن و نسخهٔ غیرقابل‌تغییر قواعد، دامنه، تاریخ، تخفیف و اجزای کالا/خدمت.
- `SalesInvoice` و `SalesInvoiceRevision`: کد اصلی ثابت، نسخه‌های تغییر، اقلام و منشأ هر قلم.
- `InvoicePayment` و `PaymentAllocation`: پرداخت‌های چندمرحله‌ای و تخصیص هر پرداخت.
- `ServiceFulfillmentCase`: پروندهٔ هر خدمت، واحد، مدیر پروژه، مجری، SLA، مدرک و تأیید مشتری.
- `SmsEvent` و `SmsDeliveryLog`: تنظیم رویداد و سابقهٔ کامل ارسال و تحویل.
- `CustomerPortalAccount`: حساب متصل به موبایل تأییدشده و پروفایل داخلی.

قیود حیاتی: ادغام نباید کد فاکتور تاریخی را تغییر دهد؛ Merge/Split باید تراکنشی، idempotent، حسابرسی‌شده و قابل بازگشت باشد؛ داده‌های قبلی حذف فیزیکی نمی‌شوند؛ و ذخیرهٔ عملیاتی هدف باید سمت سرور باشد.

## ۱. تکنولوژی ذخیره‌سازی (Database Technology)
این سامانه از **لایه ذخیره‌سازی ساختاریافته محلی (Structured Local Storage / In-Memory State with localStorage Persistence)** بهره می‌برد که مدل‌های داده‌ای کاملاً رابطه‌ای (Relational Models) و شیءگرا را بر اساس فایل `src/types.ts` و نمونه‌داده‌های اولیه غنی در `src/utils/storage.ts` پیاده‌سازی می‌کند.

---

## ۲. مدل‌های داده و جداول (Data Models & Entities)

### الف) جدول کاربران (`User`)
مدیریت پرسنل، مدیران، خزانه‌داران و دسترسی‌های آن‌ها.
- `id` (string, Primary Key): شناسه یکتا (مثلاً `user_admin_reza`)
- `username` (string): نام کاربری ورود
- `fullName` (string): نام و نام خانوادگی کامل
- `phone` (string): شماره تماس
- `email` (string): پست الکترونیک
- `role` (UserRole): نقش اصلی (`admin`, `approver`, `requestor`, `treasury_executor`, `support_agent`, `financial_approver`)
- `roleId` (string, Optional, Foreign Key): شناسه نقش سفارشی از جدول `SystemRole`
- `roleTitle` (string): عنوان نمایشی سمت
- `companyId` (string, Optional): شناسه شرکت مربوطه
- `costCenterId` (string, Optional): شناسه مرکز هزینه پیش‌فرض
- `allowedCostCenterIds` (string[], Optional): لیست مراکز هزینه مجاز برای کاربر
- `customPermissions` (SystemPermission[], Optional): دسترسی‌های خاص تفکیکی
- `isActive` (boolean): وضعیت فعال/غیرفعال بودن حساب
- `canIssueTasks` (boolean): مجاز به صدور دستورات اداری
- `canExecuteTasks` (boolean): مجاز به اجرای کارهای محوله
- `allowedApproverIds` (string[], Optional): مقصدهای مجاز ارجاع در کارتابل
- `approvalChain` (string[], Optional): توالی شناسه تاییدکنندگان درخواست‌های این کاربر — **این آرایه نباید شامل `id` خود کاربر به‌عنوان عنصر اول باشد** (به‌جز کاربرانی مثل ادمین که طبق داده نمونه `req_10002` عمداً پیش از ارجاع به خزانه‌داری، خودشان را به‌عنوان مرحله تاییدیه صوری اول ثبت می‌کنند). برای یک کاربر عادی (`requestor`)، عنصر اول باید شناسه مدیر شعبه/تاییدکننده بالادستی او باشد، وگرنه `currentApproverId` هنگام ثبت درخواست به‌اشتباه به خودِ کاربر تنظیم می‌شود و چون نقش `requestor` اجازه «تایید و ارجاع» ندارد، درخواست در کارتابل او برای همیشه بلاتکلیف می‌ماند (به `NewRequestModal.tsx` خط ۱۵۴ و ۴۴۲ مراجعه شود).
- `allowDirectToTreasury` (boolean, Optional): اجازه ارسال مستقیم به خزانه‌داری
- `isDualRole` (boolean, Optional): نقش دوگانه (درخواست‌کننده و تاییدکننده هم‌زمان) — از نسخه مدل چندنقشی به بعد، این فیلد دیگر توسط ادمین به‌صورت دستی تیک نمی‌خورد؛ در `AdminPanel.tsx` هنگام ذخیره کاربر، از روی ترکیب `role`/`roleId` + `additionalRoleIds` به‌صورت خودکار derive و ذخیره می‌شود (به قانون کسب‌وکار مربوطه در `docs/BUSINESS_RULES.md` مراجعه کنید). خودِ فیلد و معنای آن (برای تمام چک‌های موجود `currentUser.isDualRole` در `Sidebar.tsx`/`ApprovalInboxView.tsx`/`DashboardView.tsx`/`ArchiveView.tsx`/`NewRequestModal.tsx`) دقیقاً مثل قبل معتبر است.
- `isSeniorTreasurySupervisor` (boolean, Optional): سرپرست ارشد خزانه‌داری (مقصد نهایی درخواست‌های کاربران دوگانه) — همچنان یک تیک دستی و مستقل از مدل چندنقشی است.
- `additionalRoleIds` (string[], Optional): نقش‌های سیستمی اضافه‌ای (`SystemRole.id`) که ادمین علاوه بر نقش پایه (`role`/`roleId`) برای همین کاربر فعال کرده است. بخشی از «مدل چندنقشی کاربران» — به `getEffectiveUserPermissions` در `src/utils/permissions.ts` و بخش «نقش‌های چندگانه و دسترسی‌های تفکیکی این کاربر» در `AdminPanel.tsx` مراجعه کنید.
- `roleAccessOverrides` (`{ roleId: string; permissions: SystemPermission[] }[]`, Optional): برای یک `roleId` مشخص (نقش پایه یا یکی از `additionalRoleIds`)، لیست پرمیشن‌های آن نقش را **فقط برای همین کاربر** به‌طور کامل جایگزین می‌کند (نه merge؛ replace کامل) — می‌تواند هم پرمیشن‌های آن نقش را محدود کند و هم پرمیشن‌هایی فراتر از پیش‌فرض همان نقش به آن اضافه کند.
- `salesSupervisorId` (string, Optional): زنجیره‌ی سرپرستی فروش این کاربر (فروشنده ← سرپرست فروش ← مدیر فروش ← ...) — **کاملاً مستقل از `approvalChain`/`allowedApproverIds` خزانه‌داری** و فقط توسط `src/utils/salesHierarchy.ts` برای محاسبه‌ی دید سلسله‌مراتبی مشتریان (`getVisibleCustomerIds`) استفاده می‌شود؛ با گردش کار تایید درخواست پرداخت هیچ ارتباطی ندارد و نباید با آن قاطی شود.

> **یکپارچگی داده نمونه (`DEFAULT_USERS` در `src/utils/storage.ts`)**: مقادیر `allowedCostCenterIds` هر کاربر باید دقیقاً با `id` واقعی موجود در `DEFAULT_COST_CENTERS` مطابقت داشته باشد (مثلاً `cc_mokhberi_1` با آندرلاین، نه `cc_mokhberi1`) و همگی باید به `companyId` همان کاربر یا شرکت‌های در دسترس او تعلق داشته باشند؛ در غیر این صورت آن مرکز هزینه در فیلترهای دسترسی (`ApprovalInboxView`, `ArchiveView`, `CostCentersView`, `DashboardView`, `MyRequestsView`, `NewRequestModal`) هرگز match نمی‌شود و در `AdminPanel.tsx` به‌صورت شناسه خام (raw id) به‌جای نام شعبه نمایش داده می‌شود. در بازبینی داده نمونه کاربران (نگاه کنید به `DECISION_LOG.md`) چند مورد از همین ناسازگاری در `user_admin_reza` و `user_approver_sales` اصلاح شد. هیچ‌کدام از ۶ کاربر نمونه `additionalRoleIds`/`roleAccessOverrides` ندارند (هر دو `undefined`، معادل آرایه خالی)، چون `isDualRole` فعلی همه آن‌ها `false`/`undefined` است و تنها یک نقش دارند؛ `getEffectiveUserPermissions` برای این حالت دقیقاً همان مقدار قبلی (مبتنی‌بر `roleId` تنها) را برمی‌گرداند، پس دسترسی و منوی این کاربران بدون تغییر باقی می‌ماند.

### ب) جدول نقش‌های سیستمی (`SystemRole`)
تعریف نقش‌ها و ماتریس دسترسی‌ها.
- `id` (string, Primary Key): شناسه نقش
- `code` (string): کد سیستمی (مثلاً `ROLE_ADMIN`)
- `name` (string): نام فارسی نقش
- `description` (string): توضیحات
- `isSystemRole` (boolean, Optional): نقش‌های سیستمی غیرقابل حذف
- `permissions` (SystemPermission[]): لیست پرمیشن‌های مجاز (۲۲ پرمیشن سیستم)

### ج) جدول شرکت‌ها (`Company`)
- `id` (string, Primary Key)
- `name` (string): نام شرکت (مثلاً شرکت هلدینگ تجارت الکترونیک)
- `code` (string): کد شرکت
- `description` (string): توضیحات

### د) جدول حساب‌های بانکی شرکت (`CompanyBankAccount`)
- `id` (string, Primary Key)
- `companyId` (string, Foreign Key): مرجع به `Company`
- `companyName` (string): نام شرکت
- `bankName` (string): نام بانک (ملت، ملی، پاسارگاد، ...)
- `accountNumber` (string): شماره حساب
- `shebaNumber` (string): شماره شبا ۲۴ رقمی (با پیشوند IR)
- `cardNumber` (string, Optional): شماره کارت ۱۶ رقمی
- `accountTitle` (string): عنوان حساب (درآمدی، تنخواه، مسدودی)
- `isActive` (boolean): فعال بودن حساب

### هـ) جدول مراکز هزینه و شعب (`CostCenter`)
- `id` (string, Primary Key)
- `companyId` (string, Foreign Key): مرجع به شرکت
- `name` (string): نام مرکز هزینه یا شعبه (مثلاً شعبه ونک، شعبه آزادی)
- `code` (string): کد شعبه
- `description` (string, Optional): توضیحات
- `monthlyBudget` (number): بودجه مصوب ماهانه به ریال
- `budgetPeriod` (string): دوره بودجه (مثلاً مرداد ۱۴۰۳)

### و) جدول ذینفعان و تامین‌کنندگان (`Vendor`)
- `id` (string, Primary Key)
- `name` (string): نام تجاری / شرکت تامین‌کننده
- `category` (string): دسته‌بندی تامین‌کننده
- `companyId` (string, Optional): شناسه شرکت مرتبط
- `nationalCode` (string, Optional): شناسه ملی / کد ملی
- `shebaNumber` (string): شماره شبا بانکی
- `cardNumber` (string, Optional): شماره کارت
- `accountNumber` (string, Optional): شماره حساب
- `bankName` (string): نام بانک
- `accountHolderName` (string): نام صاحب حساب
- `phone` (string): شماره تماس
- `totalPaid` (number, Optional): مجموع واریزی‌ها
- `transactionCount` (number, Optional): تعداد تراکنش‌ها

### ز) جدول درخواست‌های مالی (`PaymentRequest`)
مدیریت درخواست‌های وجه، پیش‌پرداخت، تنخواه و عودت وجه.
- `id` (string, Primary Key)
- `requestNumber` (string): شماره پیگیری درخواست (مثلاً `REQ-1403-001`)
- `requestType` (`current_payment` | `advance_payment` | `info_request` | `customer_refund`)
- `title` (string): موضوع درخواست
- `amount` (number): مبلغ به ریال
- `requestorId` (string, Foreign Key): شناسه کاربر درخواست‌کننده
- `requestorName` (string): نام درخواست‌کننده
- `companyId` (string): شرکت مرتبط
- `costCenterId` (string): مرکز هزینه / شعبه
- `vendorId` (string, Optional): تامین‌کننده مقصد
- `beneficiaryName` (string): نام ذینفع نهایی
- `beneficiarySheba` (string): شماره شبا ذینفع
- `beneficiaryBank` (string): نام بانک ذینفع
- `description` (string): شرح درخواست
- `status` (`draft` | `pending_approval` | `pending_treasury` | `approved` | `rejected` | `paid` | `returned`)
- `currentStepIndex` (number): شاخص مرحله فعلی تایید
- `approvalChain` (string[]): لیست شناسه تاییدکنندگان این درخواست
- `approvalHistory` (Array): تاریخچه کامل تاییدها، ردها و ارجاعات
- `createdAt` (string): تاریخ و زمان ثبت
- `batchItems` (RequestBatchItem[], Optional): ردیف‌های تشکیل‌دهنده درخواست تجمیعی (در صورت ثبت درخواست به‌صورت چند فاکتور/چند ذینفع در یک قالب واحد) — به جدول زیر (ز-۱) مراجعه شود.

### ز-۱) جدول ردیف‌های درخواست تجمیعی (`RequestBatchItem`)
هنگام ثبت یک درخواست پرداخت به‌صورت تجمیعی (Batch) — یعنی چند فاکتور/ذینفع در یک درخواست واحد — هر ردیف به‌صورت مستقل در قالب این ساختار داخل آرایه `batchItems` مربوط به `PaymentRequest` ذخیره و می‌تواند جداگانه تایید یا رد شود.
- `id` (string, Primary Key): شناسه یکتای ردیف داخل درخواست
- `title` (string): عنوان/بابت ردیف (مثلاً «پرداخت بابت فاکتور ۱۲۳۴»)
- `amount` (number): مبلغ این ردیف به ریال
- `amountInWords` (string): مبلغ ردیف به حروف
- `destinationName` (string): نام ذینفع این ردیف
- `destinationCard` (string): شماره کارت یا شبای ذینفع این ردیف
- `status` (`pending` | `approved` | `rejected`): وضعیت تصمیم‌گیری روی این ردیف — پیش‌فرض `pending`
- `decidedByUserId` (string, Optional, Foreign Key): شناسه کاربری که روی ردیف تصمیم گرفته (تایید یا رد)
- `decidedByName` (string, Optional): نام کاربر تصمیم‌گیرنده
- `decidedAt` (string, Optional): تاریخ و زمان تصمیم‌گیری
- `rejectionReason` (string, Optional): دلیل رد ردیف — فقط برای `status: 'rejected'` تکمیل می‌شود

> نکته: تصمیم‌گیری ردیف‌به‌ردیف، مستقل از گردش کار اصلی درخواست (`timeline`) است و در `timeline` ثبت رکورد جداگانه‌ای ایجاد نمی‌کند؛ صرفاً وضعیت هر ردیف در همان آرایه `batchItems` به‌روزرسانی می‌شود. برای قانون کسب‌وکار مرتبط به بخش «تایید ردیف‌به‌ردیف در درخواست‌های تجمیعی» در `docs/BUSINESS_RULES.md` مراجعه کنید.

### ز-۲) جدول گام‌های تاریخچه گردش کار (`RequestTimelineStep`)
هر رکورد این ساختار، یک گام از گردش کار (ثبت، ارجاع، تایید، عودت، رد، واریز، لغو اقدام و ...) را داخل آرایه `timeline` مربوط به `PaymentRequest` نگه می‌دارد و در بخش «تاریخچه و سوابق گردش کار» نمایش داده می‌شود.
- `id` (string, Primary Key): شناسه یکتای گام
- `actorId` (string, Optional, Foreign Key): شناسه کاربر انجام‌دهنده اقدام
- `actorName` (string): نام انجام‌دهنده اقدام
- `actorRole` (string): عنوان سمت انجام‌دهنده در زمان اقدام
- `action` (`submitted` | `forwarded` | `returned` | `rejected` | `approved` | `paid` | `completed` | `commented` | `undone`)
- `actionTitle` (string): عنوان نمایشی اقدام (مثلاً «تایید و ارجاع به مرحله بعد»)
- `comment` (string, Optional): یادداشت آزاد انجام‌دهنده اقدام
- `nextActorName` (string, Optional): نام نفر بعدی که پرونده به او ارجاع شده
- `timestamp` (string): تاریخ و زمان ثبت گام
- `reverted` (boolean, Optional): true اگر این گام بعداً توسط همان انجام‌دهنده لغو/بازگردانی شده باشد
- `amountCorrectionNote` (string, Optional): وقتی تاییدکننده هنگام «تایید و ارجاع» (`handleApproveAndForward`) مبلغ درخواست را اصلاح می‌کند، همین گام حاوی این یادداشت خودکار (شامل مبلغ قبلی و مبلغ جدید) می‌شود؛ کاملاً مستقل از فیلد `comment` است و در غیاب اصلاح مبلغ همیشه `undefined` می‌ماند.

### ح) جدول نامه‌ها و مکاتبات (`Letter`)
- `id` (string, Primary Key)
- `letterNumber` (string): شماره نامه دبیرخانه
- `subject` (string): موضوع نامه
- `body` (string): متن نامه
- `senderId` / `senderName`: فرستنده
- `recipientIds`: گیرندگان نامه
- `status` (`draft`, `in_review`, `approved`, `sent`, `archived`, ...)
- `attachments`: فایل‌های پیوست
- `versions`: تاریخچه نسخه‌های نامه

### ط) جدول پرونده‌های پشتیبانی و شکایات (`SupportCase`)
- `id` (string, Primary Key)
- `caseNumber` (string): شماره پرونده
- `customerName` / `customerPhone`: اطلاعات مشتری
- `issueType`: نوع مشکل
- `claimAmount`: مبلغ مطالبه / عودتی
- `financialApprovalStatus`: وضعیت تایید مالی مبلغ
- `status`: وضعیت پرونده

### ي) جدول مشتریان ماژول فروش (`Customer`) — گام اول
اولین موجودیت پیاده‌سازی‌شده از ماژول فروش (به `docs/SALES_ARCHITECTURE_DRAFT.md` بخش ۱۰ مراجعه کنید: «مشتری یک رکورد دائمی و متمرکز است»). ذخیره‌سازی در کلید مستقل `STORAGE_KEYS.CUSTOMERS` در `src/utils/storage.ts` (`getCustomers`/`saveCustomers`)، کاملاً جدا از هر کلید دیگر.
- `id` (string, Primary Key)
- `fullName` (string, Optional): نام و نام خانوادگی — اختیاری
- `phone1` (string, Optional): **کلید شناسایی یکتای مشتری در کل سیستم** — اگر پر شود باید در کل سیستم یکتا باشد (چک یکتایی توسط `findCustomerByPhone` در `src/utils/salesHierarchy.ts` انجام می‌شود، نه با یک constraint دیتابیسی چون این پروژه از localStorage استفاده می‌کند)؛ خودِ فیلد اجباری نیست
- `phone2` (string, Optional): شماره تماس دوم — در جستجوی یکتایی هم بررسی می‌شود
- `address` / `province` / `city` / `postalCode` (string, Optional)
- `createdAt` (string): تاریخ و زمان اولین ثبت مشتری
- `activityLog` (`CustomerActivityLogEntry[]`, Optional): تاریخچه‌ی کامل همه‌ی چرخه‌های فروش این مشتری با فروشندگان مختلف در طول زمان. هر آیتم: `{ salespersonId, invoiceId?, startedAt, status: 'active' | 'completed' }`. `invoiceId` در فاز بعدی (فاکتور فروش) پر می‌شود؛ در این گام هنوز خالی می‌ماند.

> **مالکیت فعلی مشتری بدون فیلد ذخیره‌شده**: `currentActiveSalespersonId` یک فیلد ذخیره‌شده روی `Customer` نیست — همیشه از روی `activityLog` با تابع `getCurrentActiveSalespersonId` در `src/utils/salesHierarchy.ts` محاسبه می‌شود (اولین entry با `status: 'active'`؛ اگر هیچ‌کدام active نبود، `null` یعنی مشتری آزاد است). این طراحی عمدی است تا مالکیت هیچ‌گاه از تاریخچه‌ی واقعی چرخه‌ها out-of-sync نشود. برای قانون کسب‌وکار «قفل مالکیت پویا» به `docs/BUSINESS_RULES.md` مراجعه کنید.

---

## ۳. روابط بین موجودیت‌ها (Entity Relationships)
- هر **کاربر (`User`)** متعلق به یک **شرکت (`Company`)** و یک **مرکز هزینه (`CostCenter`)** پیش‌فرض است.
- هر **مرکز هزینه (`CostCenter`)** متعلق به یک **شرکت (`Company`)** است.
- هر **حساب بانکی شرکت (`CompanyBankAccount`)** به یک شرکت متصل است.
- هر **درخواست مالی (`PaymentRequest`)** توسط یک کاربر ثبت شده و به یک مرکز هزینه، یک شرکت و احتمالاً یک تامین‌کننده (`Vendor`) متصل است و توالی تایید آن از طریق `approvalChain` مدیریت می‌شود.
- هر **مشتری (`Customer`)** ممکن است در طول زمان با چند **کاربر فروشنده (`User`)** مختلف در ارتباط بوده باشد (از طریق `activityLog[].salespersonId`)؛ در هر لحظه حداکثر یک چرخه‌ی فروش `active` می‌تواند وجود داشته باشد (قفل مالکیت پویا). دید سلسله‌مراتبی روی مشتریان از طریق `User.salesSupervisorId` (زنجیره‌ی مستقل از `approvalChain`) محاسبه می‌شود، نه از طریق `companyId`/`costCenterId`.
