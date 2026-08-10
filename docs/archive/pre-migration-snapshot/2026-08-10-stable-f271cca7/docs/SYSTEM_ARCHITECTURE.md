# 🏗️ معماری سیستم (System Architecture)

## ۱. معماری کلی (Overall Architecture)
این برنامه به صورت یک **Single-Page Application (SPA) تمام‌عیار در سمت کلاینت (Client-Side Architecture)** به همراه لایه مدیریت State متمرکز و سرویس‌های ذخیره‌سازی محلی مقاوم (`localStorage`) پیاده‌سازی شده است. تمام منطق تجاری ERP، موتور تایید درخواست‌ها، سیستم حسابداری و محاسبات ریالی مستقیماً در مرورگر اجرا می‌شوند که باعث سرعت فوق‌العاده بالا و تجربه کاربری بی‌درنگ (Real-time) می‌گردد.

## ۲. معماری فرانت‌اند (Frontend Architecture)
- **Framework**: React 18 با کامپوننت‌های تابعی (Functional Components) و هوک‌های سفارشی (Custom Hooks).
- **Styling**: Tailwind CSS نسخه ۴ به همراه سیستم طراحی واکنش‌گرا (`Responsive Design`) و فونت‌ها و رنگ‌بندی‌های اختصاصی سازمان.
- **Iconography**: کتابخانه `lucide-react` برای آیکون‌های استاندارد و مدرن.
- **Charts & Analytics**: کتابخانه `recharts` برای نمودارهای تحلیلی خزانه‌داری.
- **Date & Calendar**: استفاده از `react-multi-date-picker` و `react-date-object` برای تقویم هجری شمسی دقیق.

## ۳. جریان داده‌ها (Data Flow)
1. **State Management**: وضعیت‌های کلان سیستم (کاربر جاری، لیست درخواست‌ها، شرکت‌ها، مراکز هزینه، نامه‌ها، پرونده‌های پشتیبانی و ذینفعان) از طریق لایه مدیریت حافظه در `src/utils/storage.ts` بارگذاری و به‌روزرسانی می‌شوند.
2. **Persistence**: هرگونه تغییر (ثبت درخواست جدید، تغییر وضعیت تایید، ویرایش کاربر، ثبت نامه جدید) بلافاصله در `localStorage` ذخیره و در سراسر کامپوننت‌ها همگام‌سازی می‌شود.
3. **User Action Lifecycle**:
   - کاربر عملگری را انجام می‌دهد (مثلاً ثبت درخواست وجه).
   - توابع کمکی اعتبارسنجی قوانین تجاری را بررسی می‌کنند (مثل بررسی بودجه مراکز هزینه و نقش دوگانه).
   - وضعیت درخواست به مرحله بعدی در `approvalChain` ارجاع داده می‌شود یا مستقیماً به خزانه‌داری می‌رسد.

## ۴. اجزای اصلی سیستم (Main Components)
- **`App.tsx`**: نقطه ورود اصلی، مدیریت احراز هویت، سوئیچ بین نمای میز کار و پنل ادمین، و مدیریت State سراسری.
- **`src/components/Sidebar.tsx` & `Navbar.tsx`**: ناوبری اصلی، منوی دسترسی سریع، سوئیچ کاربر و حالت تاریک/روشن.
- **`src/components/DashboardView.tsx`**: داشبورد تحلیلی خزانه‌داری و وضعیت بودجه.
- **`src/components/AdminPanel.tsx`**: قلب تپنده مدیریت کاربران، نقش‌ها، مسیرهای تایید و مقصدهای ارجاع.
- **`src/components/LettersView.tsx`**: زیرسیستم دبیرخانه و نامه‌نگاری.
- **`src/components/SupportView.tsx`**: مدیریت خدمات پس از فروش و شکایات.
- **`src/components/VendorsView.tsx`**: دفترچه ذینفعان و حساب‌های بانکی.

## ۵. تکنولوژی استک (Technology Stack)
- **زبان**: TypeScript 5.8
- **کتابخانه UI**: React 19 / 18
- **استایل‌دهی**: Tailwind CSS v4
- **ابزار ساخت**: Vite 6
- **مدیریت تاریخ**: Persian Date Utilities

## ۶. الگوهای طراحی (Design Patterns)
- **Component-Driven Development**: جداسازی کامل اجزا به ماژول‌های مستقل (Modals, Views, Tables).
- **Separation of Concerns**: تفکیک منطق ذخیره‌سازی (`storage.ts`) از کامپوننت‌های نمایشی.
- **Controlled Components**: مدیریت فرم‌ها و ورودی‌ها با Stateهای محترل‌شده ری اکت.
