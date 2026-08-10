# رفتار فعلی مشتری فروش

> Status: CURRENT
> Source of truth: این سند برای قابلیت پیاده‌سازی‌شده Customer و چرخه فروش فعلی است.
> Owner: Sales Domain Owner
> Last validated: 2026-08-11 against `stable@cea6514`
> Supersedes: none
> Superseded by: none

این مرحله فقط `Customer` را پیاده‌سازی کرده است؛ فاکتور فروش، Lead، Promotion، انبار و لجستیک هنوز CURRENT نیستند.

## مدل و persistence

- `Customer` اطلاعات اختیاری هویت و نشانی، `createdAt` و `activityLog` دارد.
- `phone1` در UI نقطه شروع جست‌وجو/ثبت است و توضیح type آن را در صورت وجود یکتا می‌داند؛ storage قید دیتابیس واقعی برای uniqueness ندارد.
- داده با `STORAGE_KEYS.CUSTOMERS` در `localStorage` ذخیره می‌شود.
- مالک فعال فیلد ذخیره‌شده نیست و با `getCurrentActiveSalespersonId` از entry دارای `status: 'active'` derive می‌شود.

## جست‌وجو و قفل مالکیت

- `findCustomerByPhone` روی `phone1` و `phone2` جست‌وجوی سراسری انجام می‌دهد و عمداً به دید سلسله‌مراتبی محدود نیست.
- `canStartNewSale` فقط وقتی true است که چرخه active وجود نداشته باشد.
- `startNewSaleCycle` در وجود چرخه active تغییری ایجاد نمی‌کند؛ caller باید پیام قفل مالکیت را نمایش دهد.
- فقط فروشنده مالک چرخه active می‌تواند آن را با `closeSaleCycle` به `completed` ببرد.
- بستن چرخه در وضعیت فعلی دستی/آزمایشی است و به تکمیل فاکتور متصل نیست.

## دید سلسله‌مراتبی

- زنجیره فروش فقط از `User.salesSupervisorId` ساخته می‌شود.
- `getVisibleCustomerIds` مشتریانی را برمی‌گرداند که current user یا زیرمجموعه‌های او entryای در `activityLog` دارند.
- admin همه مشتریان را می‌بیند.
- این زنجیره کاملاً مستقل از `approvalChain` و `allowedApproverIds` خزانه‌داری است.

## دسترسی

- مسیر «مشتریان» برای `sales_access` نمایش داده می‌شود و admin در UI bypass دارد.
- کاربران نمونه فروش، `User.role: 'requestor'` و `customPermissions: ['sales_access']` دارند؛ `UserRole` مخصوص فروش اضافه نشده است.

طراحی ادامه فروش در [approved design](approved-design.md) و ابهام‌های آن در [open questions](open-questions.md) است. منبع تاریخی کامل در [legacy sales draft](../../SALES_ARCHITECTURE_DRAFT.md) و Snapshot باقی می‌ماند.
