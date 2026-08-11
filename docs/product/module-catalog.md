# فهرست ماژول‌های فعلی

> Status: CURRENT
> Source of truth: این سند برای فهرست ماژول‌های پیاده‌سازی‌شده و مرز مسئولیت آن‌ها است.
> Owner: Product Owner
> Last validated: 2026-08-11 against `agent/customer-import-sprint-3`
> Supersedes: none
> Superseded by: none

این فهرست فقط قابلیت‌هایی را ثبت می‌کند که در SPA فعلی مسیر اجرایی دارند. جزئیات قواعد هر دامنه در سند همان دامنه نگهداری می‌شود.

## ماژول‌های عملیاتی

| حوزه | Viewهای اصلی | مسئولیت فعلی | قواعد authoritative |
|---|---|---|---|
| Foundation SaaS | `FoundationLogin`, `ContextSelector`, `FoundationContextBar` | login سروری، انتخاب Workspace/Company و نمایش context فعال | [current system](../architecture/current-system.md) و [security](../engineering/security-and-privacy.md) |
| Dashboard | `DashboardView` | خلاصه وضعیت، میان‌برها و منوهای پرکاربرد هر کاربر | [current-system](../architecture/current-system.md) |
| درخواست مالی | `NewRequestModal`, `MyRequestsView`, `RequestTableView` | ثبت و پیگیری درخواست‌های پرداخت عادی و تجمیعی | [finance business rules](../domains/finance/business-rules.md) |
| تأیید و پرداخت | `ApprovalInboxView`, `RequestDetailModal`, `BulkPaymentExportModal` | بررسی، ارجاع، عودت، تأیید و ثبت پرداخت | [finance business rules](../domains/finance/business-rules.md) |
| کارهای محوله | `AssignedTasksView` | صدور، دریافت و پیگیری وظایف داخلی | [roles and permissions](../domains/finance/roles-and-permissions.md) |
| ساختار سازمانی | `CompaniesView`, `CostCentersView` | شرکت‌ها، حساب‌های بانکی و مراکز هزینه | [current data model](../data/current-data-model.md) |
| ذی‌نفعان | `VendorsView`, `VendorCategoriesView` | دفترچه ذی‌نفعان و دسته‌بندی آن‌ها | [current data model](../data/current-data-model.md) |
| پشتیبانی | `SupportView`, `SupportCaseFormModal`, `SupportCaseDetailModal` | پرونده شکایت/عودت و ارسال ردیف تأییدشده به خزانه | [support business rules](../domains/support/business-rules.md) |
| مشتریان | `CustomerSourceView`, `SaasCustomerWorkspace`, `SaasCustomersView`, `CustomerImportView`, `CustomersView` | Customer 360 سروری، CSV staging/reconciliation/approval و دسترسی جداگانه به چرخه فروش Prototype | [current customer](../domains/sales/current-customer.md)، [Customer Import](../domains/sales/customer-import.md) |
| نامه‌نگاری | `LettersView` و modalهای مرتبط | ثبت، نسخه‌بندی، ارجاع و پیگیری نامه | مدل‌های `Letter` در `src/types.ts` |
| ارتباطات | `ChatView`, `ColleaguesView`, `AllCommunicationsAuditView` | گفت‌وگوی عمومی، مستقیم و مشاهده مدیریتی ارتباطات | [security and privacy](../engineering/security-and-privacy.md) |
| مدیریت دسترسی | `AdminPanel`, `RolesAndPermissionsView` | کاربران، نقش‌ها، permissionها و مسیرهای تأیید | [roles and permissions](../domains/finance/roles-and-permissions.md) |
| بایگانی و گزارش | `ArchiveView`, `WorkflowChartView` | جست‌وجو، خروجی و نمایش گردش کار | [quality](../engineering/quality.md) |
| تنظیمات ظاهری | `StyleSettingsView` | تنظیم ظاهر و فونت در سطح client | [persistence](../data/persistence.md) |

## زیرساخت مشترک UI

- `App.tsx` وضعیت اصلی، persistence و اتصال Viewها را نگه می‌دارد.
- `Sidebar.tsx` مسیرهای قابل‌نمایش را بر اساس دسترسی محاسبه می‌کند.
- `TabBar.tsx` رجیستری `TAB_DEFINITIONS` و ناوبری چندتبی را نگه می‌دارد.
- View بازشده تا زمان بستن tab، mount می‌ماند و هنگام تعویض tab فقط مخفی می‌شود.
- با تغییر هویت کاربر، tabها باید به `dashboard` بازنشانی شوند تا tab متعلق به هویت قبلی باقی نماند.
- هر فراخوانی `openTab` مصرف همان tab را برای current user در `TAB_USAGE` ثبت می‌کند.
- Dashboard فقط وقتی حداقل سه tab معتبر متفاوت ثبت شده باشد، حداکثر پنج مورد پرکاربرد را از `TAB_DEFINITIONS` نمایش می‌دهد؛ شناسه حذف‌شده فیلتر می‌شود.

## خارج از وضعیت فعلی

Backend و API Foundation اکنون CURRENT هستند، اما فاکتور فروش، Lead، انبار، لجستیک، Outbox و endpointهای سایر domainها هنوز CURRENT نیستند. وضعیت آن‌ها در [future platform](../architecture/future-platform.md) و اسناد future فروش ثبت می‌شود.
