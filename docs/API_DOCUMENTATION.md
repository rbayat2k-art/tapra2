# 🔌 مستندات API و ارتباطات (API & Service Architecture Documentation)

> در نسخهٔ فعلی API عملیاتی وجود ندارد و مسیرهای این سند قرارداد پیشنهادی Backend هستند. پیاده‌سازی UI یا Permission به معنی وجود API نیست.

دامنه‌های API لازم در مراحل بعد: هویت و Merge/Split مشتری، Import انبوه، کاتالوگ، Promotion Version، فاکتور و پرداخت چندمرحله‌ای، تطبیق بانک، اجرای خدمت، پیامک/OTP، پرتال مشتری، Issabel و Audit Log.

## ۱. ساختار سرویس‌ها و لایه ارتباطی (Architecture)
این سامانه به صورت پیش‌فرض یک **موقعیت Client-Side Single-Page Application** با لایه ذخیره‌سازی محلی مقاوم (`localStorage`) است. در صورتی که اتصال به سرور backend یا پروکسی‌های ابری (مانند Express API Routes یا پایگاه داده ابری) فعال شود، ساختار اندپوینت‌ها به شکل زیر خواهد بود:

---

## ۲. مشخصات اندپوینت‌های فرضی / بک‌اند (`/api/*`)

### الف) احراز هویت و کاربران
- **POST `/api/auth/login`**
  - **Description**: ورود کاربر با نام کاربری و رمز عبور.
  - **Request Body**: `{ username: string, password?: string }`
  - **Response**: `{ success: boolean, user: User, token: string }`

- **GET `/api/users`**
  - **Description**: دریافت لیست تمامی کاربران سازمان (نیازمند پرمیشن `manage_users`).
  - **Response**: `User[]`

- **PUT `/api/users/:id`**
  - **Description**: به‌روزرسانی مشخصات کاربر، نقش دوگانه، مسیر تایید و مقصدهای ارجاع.
  - **Request Body**: Partial<`User`>
  - **Response**: `{ success: boolean, user: User }`

---

### ب) درخواست‌های مالی (`/api/requests`)
- **GET `/api/requests`**
  - **Description**: دریافت لیست درخواست‌های مالی دسترسی‌پذیر بر اساس نقش کاربر.
  - **Response**: `PaymentRequest[]`

- **POST `/api/requests`**
  - **Description**: ثبت درخواست مالی جدید (تنخواه، پیش‌پرداخت، هزینه جاری).
  - **Request Body**: تفکیک اطلاعات درخواست (`title`, `amount`, `costCenterId`, `vendorId`, `beneficiarySheba`, ...)
  - **Response**: `{ success: boolean, request: PaymentRequest }`

- **PUT `/api/requests/:id/approve`**
  - **Description**: تایید یا ارجاع درخواست به مرحله بعد.
  - **Request Body**: `{ comment?: string, nextApproverId?: string }`

- **PUT `/api/requests/:id/reject`**
  - **Description**: رد یا عودت درخواست به درخواست‌کننده.
  - **Request Body**: `{ reason: string }`

---

### ج) خزانه‌داری و پرداخت گروهی (`/api/treasury`)
- **POST `/api/treasury/export-batch`**
  - **Description**: تولید فایل پرداخت دسته‌ای بانکی برای لیست درخواست‌های تایید شده.
  - **Request Body**: `{ requestIds: string[], bankAccountId: string }`
  - **Response**: فایل اکسل با فرمت استاندارد بانکی (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).

---

### د) نامه‌نگاری و دبیرخانه (`/api/letters`)
- **GET `/api/letters`**
  - **Description**: دریافت لیست نامه‌های دریافتی و ارسالی کاربر.
- **POST `/api/letters`**
  - **Description**: ثبت و ارسال نامه جدید با پیوست و امضا.

---

## ۳. احراز هویت و امنیت (Authentication & Security)
- احراز هویت در حال حاضر بر اساس نشست فعال کاربر (`Active Session User`) در حافظه مرورگر انجام می‌شود.
- در نسخه سازمانی ابری، توکن‌های استاندارد `Bearer Token` یا کوکی‌های امن سشن برای احراز هویت APIها مورد استفاده قرار می‌گیرند.
- کنترل دسترسی بر اساس آرایه پرمیشن‌های سیستمی (`SystemPermission`) هر کاربر در سطح فرانت‌اند و اندپوینت‌ها اعمال می‌گردد.
