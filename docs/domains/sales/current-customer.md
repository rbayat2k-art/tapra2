# رفتار فعلی مشتری فروش

> Status: CURRENT
> Source of truth: این سند برای قابلیت پیاده‌سازی‌شده Customer identity/profile و relationship شرکت است.
> Owner: Sales Domain Owner
> Last validated: 2026-08-11 against `agent/sales-backend-slice-1`
> Supersedes: none
> Superseded by: none

محصول visible فقط یک مسیر Customer دارد: Customer 360 سروری. Lead، صف، assignment و Call Log محدود نیز server-backed شده‌اند و authority آن‌ها [عملیات فعلی Lead](current-lead-operations.md) است. UIهای فاکتور فروش، Promotion، Campaign کامل و Fulfillment از legacy بازیابی شده‌اند، اما backing آن‌ها prototype است و Backend Sales کامل را اثبات نمی‌کنند.

## Customer SaaS / PostgreSQL

- کاربر ابتدا login و یک membership مجاز را به‌عنوان Workspace/Company context انتخاب می‌کند.
- permissionهای `customer.read`، `customer.create`، `customer.identity.manage` و `customer.merge` در server enforce می‌شوند.
- Customer profile والد است و phone/addressهای چندتایی و source/provenance دارد.
- identity و normalized phone در Workspace یکتا هستند؛ هر Company relationship مستقل دارد و Company visibility/RLS مانع مشاهده داده عملیاتی context دیگر می‌شوند.
- timeline فعلی eventهای `customer_created`، `phone_added`، `address_added`، `customer_merged` و `customer_split` را server-generated ثبت می‌کند.
- duplicate check شماره دقیق را `EXACT_MATCH` و نام دقیق را فقط به‌عنوان `POSSIBLE_DUPLICATE` برای بررسی انسانی برمی‌گرداند؛ merge خودکار وجود ندارد.
- merge دارای permission، confirmation UI، transaction، AuditEntry و انتخاب deterministic canonical است. profile بازنده حذف نمی‌شود و unmerge واقعی داده و استقلال آن را بازمی‌گرداند.
- UI فقط Customer 360 و Import طبیعی داخل همان workspace را نشان می‌دهد و هیچ انتخاب فناوری database ندارد.

fuzzy matching، ارتباط هویت میان Workspaceها، import انبوه، AI entity resolution و جریان کامل Prospect/Opportunity هنوز CURRENT نیستند. وجود Lead محدود فعلی به معنی پیاده‌سازی کامل موتور Campaign/Opportunity نیست.

## Customer Prototype / localStorage compatibility

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

- tab visible «مشتریان» همیشه `SaasCustomerWorkspace` را باز می‌کند؛ permission و داده Customer در Foundation مستقل و server-side است.
- کاربران نمونه فروش، `User.role: 'requestor'` و `customPermissions: ['sales_access']` دارند؛ `UserRole` مخصوص فروش اضافه نشده است.

هیچ داده `localStorage` به‌طور خودکار migrate یا حذف نشده است. طراحی ادامه فروش در [approved design](approved-design.md) و ابهام‌های آن در [open questions](open-questions.md) است. منبع تاریخی کامل در [Sales Draft archive](../../archive/sales/SALES_ARCHITECTURE_DRAFT.md) و Snapshot باقی می‌ماند.

## Customer Import فعلی

Customer workspace اکنون upload محدود CSV، staging، validation، duplicate detection، reconciliation و Approval صریح دارد. staging هیچ Customer اصلی نمی‌سازد و ردیف‌های مبهم auto-merge نمی‌شوند. permissionهای مستقل Import سمت server enforce می‌شوند. منبع authoritative این رفتار [Customer Import](customer-import.md) است.
