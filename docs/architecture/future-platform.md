# معماری آینده Platform و Backend

> Status: DRAFT
> Source of truth: این سند برای جهت معماری platform/backend آینده و مرز آن با سیستم فعلی است.
> Owner: Architecture Owner
> Last validated: 2026-08-11 against `stable@cea6514` and legacy design sources
> Supersedes: none
> Superseded by: none

این سند پیاده‌سازی موجود را توصیف نمی‌کند. وضعیت اجرایی در [current system](current-system.md) و [API status](api-status.md) است.

## مسئله‌ای که معماری آینده باید حل کند

معماری client-only فعلی برای داده سازمانی مشترک، کنترل دسترسی قابل اتکا، هم‌زمانی چند کاربر، audit مقاوم، backup و integration خارجی کافی نیست. platform آینده باید بدون مخلوط‌کردن قواعد دامنه با transport، این نیازها را پوشش دهد.

## مرزهای پیشنهادی

| لایه | مسئولیت پیشنهادی |
|---|---|
| Web client | UI فارسی/RTL، تجربه task-based و نمایش داده مجاز؛ نه مرجع نهایی authorization. |
| Application API | use caseها، validation، authorization و orchestration دامنه. |
| Domain services | مالی، پشتیبانی، فروش، مشتری، catalog، fulfillment و settlement با مرزهای مستقل. |
| Persistence | دیتابیس مرکزی، transaction، migration نسخه‌دار، backup و retention. |
| Identity & access | احراز هویت server-side، session/token امن، role/permission و data scope. |
| Audit & integration | event/audit غیرقابل‌بازنویسی، اعلان، بانک، Issabel، پیامک، پست و import. |

## اصول پذیرفته‌شده از دانش پروژه

- زنجیره خزانه‌داری، سلسله‌مراتب فروش و قلمرو سازمانی مفاهیم مستقل‌اند.
- رفتار هر domain باید از contract و eventهای صریح عبور کند؛ تغییر مستقیم storage مشترک بین domainها مجاز نیست.
- تاریخچه مالی، فروش، تخصیص و ساختار سازمانی باید snapshot زمان رخداد را حفظ کند.
- کالا و خدمت در فاکتور ترکیبی مسیر اجرای مستقل دارند.
- داده حساس و authorization باید server-side کنترل شود.
- migration از `localStorage` باید برنامه استخراج، پاک‌سازی، mapping و reconciliation داشته باشد؛ migration خودکار فعلی وجود ندارد.

## مسیر تکاملی پیشنهادی

1. تعریف identity، organization scope، audit و قراردادهای نسخه‌دار.
2. انتقال persistence از browser به database با import کنترل‌شده.
3. انتقال use caseهای مالی و پشتیبانی با حفظ tracking/history.
4. ساخت Customer/Lead/Sales domains بر اساس طراحی پذیرفته‌شده و حل پرسش‌های باز.
5. افزودن integrationها پس از تثبیت domain contracts.

## موارد حل‌نشده معماری

- انتخاب database، hosting، deployment topology و فناوری backend.
- شکل دقیق tenant/company isolation و retention.
- ترتیب migration داده‌های browser و راهبرد coexistence.
- سطح consistency برای عملیات بانکی، inventory و settlement.
- قرارداد identity provider، token/session و بازیابی حساب.

تا زمان تصمیم رسمی، هیچ محصول یا فناوری نمونه در اسناد legacy الزام معماری محسوب نمی‌شود. endpointهای پیشنهادی در [API contract draft](../future/api-contract-draft.md) DRAFT هستند.
