# 📁 ساختار کد و سازماندهی فایل‌ها (Code Structure & Organization)

## ۱. ساختار پوشه‌ها (Directory Tree)
ساختار پروژه به صورت ماژولار و تمیز در دایرکتوری اصلی سازماندهی شده است:

```text
/
├── .env.example              # نمونه متغیرهای محیطی
├── .gitignore                # فایل‌های نادیده‌گرفته شده در گیت
├── README.md                 # راهنمای عمومی پروژه
├── package.json              # وابستگی‌ها و اسکریپت‌های اجرایی
├── tsconfig.json             # تنظیمات تایپ‌اسکریپت
├── vite.config.ts            # تنظیمات بیلد و ویت
├── metadata.json             # متادیتای برنامک
├── docs/                     # مستندات جامع فنی ERP
│   ├── PROJECT_OVERVIEW.md
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── DATABASE_DOCUMENTATION.md
│   ├── MODULES_DOCUMENTATION.md
│   ├── CODE_STRUCTURE.md
│   ├── API_DOCUMENTATION.md
│   ├── BUSINESS_RULES.md
│   ├── DEVELOPMENT_GUIDE.md
│   └── AI_CONTEXT.md
└── src/
    ├── App.tsx               # کامپوننت اصلی و ریشه برنامک
    ├── main.tsx              # نقطه ورود React DOM
    ├── index.css             # استایل‌های سراسری Tailwind CSS
    ├── types.ts              # تعریف تمامی اینترفیس‌ها، تایپ‌ها و انام‌ها
    ├── components/           # کامپوننت‌های رابط کاربری و ویوها
    │   ├── AdminPanel.tsx              # پنل مدیریت پیشرفته ادمین
    │   ├── DashboardView.tsx           # داشبورد مدیریت و نمودارها
    │   ├── LettersView.tsx             # سامانه نامه‌نگاری و دبیرخانه
    │   ├── SupportView.tsx             # مدیریت خدمات پس از فروش و شکایات
    │   ├── VendorsView.tsx             # دفترچه تامین‌کنندگان
    │   ├── CompaniesView.tsx           # مدیریت شرکت‌ها و بانک‌ها
    │   ├── CostCentersView.tsx         # مدیریت شعب و مراکز هزینه
    │   ├── MyRequestsView.tsx          # ثبت و پیگیری درخواست‌های کاربر
    │   ├── RequestTableView.tsx        # جدول کارتابل درخواست‌های سازمانی
    │   ├── WorkflowChartView.tsx       # نمودار گردش کار تاییدات
    │   ├── RolesAndPermissionsView.tsx # ماتریس نقش‌ها و دسترسی‌ها
    │   ├── Navbar.tsx                  # نوار بالایی و مشخصات کاربر
    │   ├── Sidebar.tsx                 # منوی ناوبری کناری
    │   ├── StyleSettingsView.tsx       # تنظیمات ظاهری
    │   ├── NewRequestModal.tsx         # مودال ثبت درخواست جدید
    │   ├── RequestDetailModal.tsx      # مودال بررسی و تایید درخواست
    │   ├── LetterFormModal.tsx         # مودال ایجاد/ویرایش نامه
    │   ├── LetterDetailModal.tsx       # مودال جزئیات و ارجاع نامه
    │   ├── SupportCaseFormModal.tsx    # مودال ثبت پرونده پشتیبانی
    │   ├── SupportCaseDetailModal.tsx  # مودال بررسی پرونده پشتیبانی
    │   ├── BulkPaymentExportModal.tsx  # مودال خروجی پرداخت گروهی بانکی
    │   ├── PrintRequestModal.tsx       # مودال چاپ رسمی درخواست
    │   └── ... (سایر مودال‌ها و ویوها)
    └── utils/
        ├── storage.ts          # مدیریت حالت سراسری، LocalStorage و دیتای اولیه
        ├── permissions.ts      # محاسبه پرمیشن مؤثر کاربر در مدل چندنقشی (getEffectiveUserPermissions)
        ├── persianDate.ts      # توابع تبدیل و مدیریت تاریخ شمسی
        ├── numberToWords.ts    # تبدیل اعداد مالی به حروف فارسی
        └── bankFormats.ts      # اعتبارسنجی شماره شبا و حساب‌های بانکی
```

## ۲. مسئولیت هر پوشه و فایل (Responsibilities)
- **`src/types.ts`**: مرجع واحد و مرکزی تمام تایپ‌ها، مدل‌ها، پرمیشن‌ها (`SystemPermission`) و نقش‌های سیستم.
- **`src/utils/storage.ts`**: مدیریت دیتای اولیه غنی (کاربران، درخواست‌ها، شرکت‌ها، مراکز هزینه، نامه‌ها، تامین‌کنندگان) و هماهنگ‌سازی با `localStorage`.
- **`src/utils/permissions.ts`**: تابع `getEffectiveUserPermissions(user, roles)` که در مدل چندنقشی کاربران (`User.additionalRoleIds` + `User.roleAccessOverrides`)، پرمیشن مؤثر نهایی یک کاربر را از روی نقش پایه + نقش‌های اضافه + بازنویسی‌های اختصاصی + `customPermissions` محاسبه می‌کند؛ توسط `Sidebar.tsx` برای ساخت منو استفاده می‌شود.
- **`src/components/`**: حاوی ویوهای اصلی (Views) و مودال‌های تعاملی (Modals) که بر اساس وظیفه کسب‌وکاری جداسازی شده‌اند.
- **`src/utils/`**: توابع کمکی محاسباتی، تبدیل اعداد به حروف، اعتبارسنجی بانکی، تقویم و محاسبه دسترسی.

## ۳. نحوه ارتباط فایل‌ها (Communication Flow)
- فایل `App.tsx` به عنوان کنترلر اصلی، کاربر لاگین‌شده را می‌شناسد و بر اساس تب انتخابی در `Sidebar`، ویوی مربوطه را رندر می‌کند.
- کامپوننت‌ها به کمک توابع موجود در `src/utils/storage.ts` اطلاعات را خوانده و با ذخیره مجدد، تغییرات را در کل سیستم بازتاب می‌دهند.
