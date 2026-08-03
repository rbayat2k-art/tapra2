# 🗄️ مستندات پایگاه داده و مدل‌های داده (Database & Data Models Documentation)

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
- `approvalChain` (string[], Optional): توالی شناسه تاییدکنندگان درخواست‌های این کاربر
- `allowDirectToTreasury` (boolean, Optional): اجازه ارسال مستقیم به خزانه‌داری
- `isDualRole` (boolean, Optional): نقش دوگانه (درخواست‌کننده و تاییدکننده هم‌زمان)
- `isSeniorTreasurySupervisor` (boolean, Optional): سرپرست ارشد خزانه‌داری (مقصد نهایی درخواست‌های کاربران دوگانه)

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

---

## ۳. روابط بین موجودیت‌ها (Entity Relationships)
- هر **کاربر (`User`)** متعلق به یک **شرکت (`Company`)** و یک **مرکز هزینه (`CostCenter`)** پیش‌فرض است.
- هر **مرکز هزینه (`CostCenter`)** متعلق به یک **شرکت (`Company`)** است.
- هر **حساب بانکی شرکت (`CompanyBankAccount`)** به یک شرکت متصل است.
- هر **درخواست مالی (`PaymentRequest`)** توسط یک کاربر ثبت شده و به یک مرکز هزینه، یک شرکت و احتمالاً یک تامین‌کننده (`Vendor`) متصل است و توالی تایید آن از طریق `approvalChain` مدیریت می‌شود.
