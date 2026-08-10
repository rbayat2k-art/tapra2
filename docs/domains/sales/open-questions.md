# پرسش‌های باز طراحی فروش

> Status: DRAFT
> Source of truth: این سند برای تصمیم‌های حل‌نشده فروش است.
> Owner: Sales Domain Owner
> Last validated: 2026-08-11 against `docs/SALES_ARCHITECTURE_DRAFT.md`
> Supersedes: none
> Superseded by: none

این موارد نباید به‌عنوان requirement قطعی یا رفتار CURRENT پیاده‌سازی شوند. پس از تصمیم، نتیجه به [approved design](approved-design.md) منتقل و rationale در [decision log](../../decisions/DECISION_LOG.md) ثبت می‌شود.

## فاکتور، قیمت و مالی

- آیا سطوح بالاتر فروش فقط گزارش می‌بینند یا روی فاکتور اقدام/تأیید اضافه دارند؟
- جزئیات DTO، state machine و permission کارتابل «تأیید واریزی مشتری» چیست؟
- محاسبه سود تأمین‌کننده برای هر کالا/دسته اختلاف قیمت است یا درصد و چگونه تنظیم می‌شود؟
- سیاست کسر/شناسایی مبلغ فاکتور وقتی کالا تحویل شده ولی خدمت باقی است چیست؟
- reconciliation بانکی، chargeback و اختلاف مبلغ چگونه مدیریت می‌شوند؟

## Customer و Import

- قواعد normalization شماره تماس، چند شماره برای یک شخص و شناسایی بدون شماره چیست؟
- در تعارض داده‌های import، اولویت منبع و workflow بازبینی چیست؟
- ساختار سابقه خرید legacy و وضعیت شماره نامعتبر، blocked یا do-not-contact چیست؟
- linkage بین پروفایل‌های چند شرکت چه سطحی از merge، visibility و consent دارد؟

## Lead و تخصیص

- scope دقیق مدیر دیتا و همه سطوح فروش برای مشاهده، تخصیص و override چیست؟
- حداقل تعداد/فاصله تلاش ناموفق و سیاست بازیافت Lead چیست؟
- جزئیات Rule، وزن‌دهی، ظرفیت، fairness و override موتور تخصیص چیست؟
- فرصت Upsell به فروشنده اصلی، تیم تخصصی یا سرپرست تخصیص می‌یابد؟
- SLA پایان شیفت، Lead دیرتخصیص‌یافته و تشخیص تلاش صوری چگونه محاسبه می‌شود؟

## شکایت و پشتیبانی

- دوره حفاظتی پس از بستن شکایت چقدر است و چه کسی آزادسازی نهایی را تأیید می‌کند؟
- شدت شکایت چگونه روی دوره انتظار اثر می‌گذارد؟
- چرخه/فاکتور نیمه‌کاره هنگام ثبت شکایت چه transitionهایی دارد؟
- ارتباط دقیق Sales Invoice با `SupportCase` فعلی و محاسبه عودت ردیفی چیست؟

## کالا، خدمت، انبار و ارسال

- روش فعال‌سازی هر خدمت از catalog ثابت است یا مشتری میان self-service و تماس انتخاب می‌کند؟
- schema وضعیت، مسئول، مدرک و retry فعال‌سازی چیست؟
- reservation و کسر موجودی چه زمانی رخ می‌دهد و فروش کالای ناموجود چگونه کنترل می‌شود؟
- قرارداد شرکت پستی، fallback، مرجوعی و reconciliation تحویل چیست؟
- مسئولیت و کنترل بدهی/کسری موجودی امانی نماینده چگونه تفکیک می‌شود؟

## Platform و rollout

- آیا CRM یا داده خارجی باید sync/import شود یا system of record از صفر این platform است؟
- ترتیب delivery فازهای Customer، Lead، Invoice، catalog، fulfillment و settlement چیست؟
- انتخاب backend/database، tenant isolation و migration از `localStorage` چیست؟
- معیار پذیرش و تست end-to-end هر نقش در کل flow چیست؟
