# نقش‌ها و دسترسی‌های فعلی

> Status: CURRENT
> Source of truth: این سند برای مدل نقش، permission و محدودیت‌های دسترسی فعلی است.
> Owner: Access Control Owner
> Last validated: 2026-08-16 against `agent/admin-organization-completion`
> Supersedes: none
> Superseded by: none

این پروژه در دوره migration دو مدل دسترسی اجراشده دارد. مدل Server-backed از migrationهای `server/migrations/` و `server/src/modules/access/` خوانده می‌شود؛ مدل legacy Prototype از `src/types.ts` و نقش‌های پیش‌فرض `src/utils/storage.ts` خوانده می‌شود. این دو فهرست نباید هم‌معنی فرض شوند.

## مدل Server-backed

- `Membership` می‌تواند Workspace-level (`company_id = NULL`) یا Company-level باشد.
- Provisioning اولیهٔ `UserAccount`، credential موقتِ یک‌بارنمایش و Membership انتخاب‌شده در یک تراکنش انجام می‌شود؛ بنابراین UserAccount جدید بدون Membership معتبر در Workspace رها نمی‌شود. تغییر credential اجباری در اولین ورود همچنان server-side است.
- `role_assignments` Scope صریح `WORKSPACE`، `COMPANY`، `BRANCH`، `DEPARTMENT`، `TEAM` یا `SELF` دارد.
- یک UserAccount می‌تواند بدون ساخت account دوم، Role متفاوت در چند Company/Scope داشته باشد.
- Permission سمت server محاسبه می‌شود؛ در Impersonation نتیجه به اشتراک Permissionهای Admin و target محدود می‌شود.
- Permissionهای Organization فعلی: `organization.read`، `organization.company.manage`، `organization.unit.manage`، `organization.user.manage`، `organization.membership.manage`، `organization.role.manage` و `organization.impersonate`.
- نقش‌های legacy حذف یا به‌صورت حدسی تبدیل نشده‌اند. `legacy_role_mappings` وضعیت `UNMAPPED/PARTIAL/MAPPED/REVIEW_REQUIRED` را برای migration تدریجی نگه می‌دارد؛ تا ثبت mapping، نقش legacy فقط در Prototype معتبر است.

## ماتریس واقعی Role/Permission/Scope

این جدول وضعیت enforcement فعلی را نشان می‌دهد، نه Role bundle پیشنهادی. Roleهای Server سفارشی‌اند و فقط Permission/Scope صریح اختیار می‌دهد؛ نام‌هایی مانند Data Manager، MIS یا Supervisor به‌تنهایی Permission ایجاد نمی‌کنند.

| سناریوی نقش | چه چیزی می‌بیند/انجام می‌دهد | چه چیزی نمی‌بیند/انجام نمی‌دهد | Scope و enforcement فعلی |
|---|---|---|---|
| Super Admin | Organization و contextهای Company همان Workspace مطابق Permissionهای صریح | Workspace مستقل دیگر؛ Permission اضافه target در Impersonation | Server؛ `WORKSPACE` و permission intersection |
| Workspace Manager | Companyها و Shared Serviceهای همان Workspace طبق `organization.*` | mutation فاقد Permission؛ Tenant دیگر | Server؛ `WORKSPACE` |
| Data Manager | Customer/Import چندCompany فقط با `customer.*` و `customer.import.*` صریح | Sales assignment یا Organization mutation ضمنی؛ داده Workspace دیگر | Server؛ معمولاً `WORKSPACE`، exact bundle هنوز policy جدا می‌خواهد |
| MIS | نمای مجاز سازمانی/تجمیعی فقط با Permission صریح | Customer mutation یا دسترسی business ضمنی | Server foundation می‌تواند `WORKSPACE` را enforce کند؛ Role bundle نهایی تعریف نشده است |
| Sales Manager | Leadهای Company، assignment/reassignment و marketing linkage با Permissionهای Sales | Lead Company دیگر؛ Permission Organization ضمنی | Server؛ `COMPANY`؛ Audit و RLS فعال |
| Supervisor | context دقیق Branch/Department/Team در access engine | گسترش Scope واحد به کل Company یا واحد هم‌سطح دیگر | Server scope engine؛ Sales Lead فعلی تا attribution صریح واحد fail-closed است |
| Salesperson | Customer مجاز، صف خود و Call Log Lead تخصیص‌یافته | self-claim، صف فروشنده دیگر، reassignment و Cross-Company | Server؛ `COMPANY` یا `SELF` دارای Company |
| Finance User | صفحات و actionهای Prototype طبق legacy RBAC | هیچ Permission Backend صرفاً از نام نقش legacy دریافت نمی‌کند | Prototype/client-side؛ هنوز security boundary SaaS نیست |
| Support User | پرونده‌های Prototype طبق permissionهای Support legacy | هیچ Customer/Organization Permission Backend ضمنی دریافت نمی‌کند | Prototype/client-side؛ هنوز security boundary SaaS نیست |

فایل `server/tests/access-matrix.test.ts` سی سناریوی صریح `A01` تا `A30` را روی projection واقعی Scope و Permission در `limitContextToActor` اجرا می‌کند. سناریوها Alpha/Beta، Workspace، Shared Services، Company، Branch، Department، Team، SELF، permission intersection، Customer/Import privacy و جلوگیری از نشت Roleهای Finance/Support Prototype به Backend را پوشش می‌دهند. تست‌های PostgreSQL در `server/tests/foundation.integration.test.ts` نیز Unauthorized mutation، Impersonation ممیزی‌شده، RLS، Customer privacy و Import privacy را در سطح HTTP/database بررسی می‌کنند.

این validation به معنی نهایی‌شدن mapping کسب‌وکار Roleهای Data/MIS/Supervisor/Finance/Support نیست. mappingهای حل‌نشده باید در `legacy_role_mappings` باقی بمانند و بدون تصمیم دامنه به `MAPPED` تغییر نکنند.

## مدل مؤثر دسترسی Prototype

`getEffectiveUserPermissions(user, roles)` مجموعه بدون تکرار زیر را می‌سازد:

1. permissionهای نقش پایه `roleId`؛ در نبود آن، نقش متناظر با `User.role`.
2. permissionهای همه `additionalRoleIds`.
3. اگر برای نقشی `roleAccessOverrides` وجود داشته باشد، فهرست همان entry به‌طور کامل جایگزین permissionهای پیش‌فرض آن نقش می‌شود.
4. `customPermissions` به نتیجه افزوده می‌شود.

`Sidebar.tsx` از این محاسبه استفاده می‌کند و admin را unrestricted در نظر می‌گیرد. استثناهای نمایشی فعلی شامل `canCreateRequests`، قابلیت task و نمایش کارتابل برای `isDualRole` است. همه Viewها هنوز یکسان به این utility مهاجرت نکرده‌اند؛ بنابراین نمایش منو به‌تنهایی تضمین authorization سراسری نیست.

## نقش‌های پیش‌فرض

| Role ID | هدف |
|---|---|
| `role_super_admin` | مدیریت فراگیر؛ فهرست پیش‌فرض آن همه permissionها به‌جز `sales_access` را دارد، ولی `User.role === 'admin'` در UI bypass می‌شود. |
| `role_treasury_manager` | تأیید نهایی، پرداخت، عودت و گزارش خزانه‌داری. |
| `role_branch_approver` | تأیید اولیه درخواست‌های شعب و ارجاع. |
| `role_treasury_executor` | اجرای پرداخت و خروجی بانکی. |
| `role_purchaser` | ایجاد و پیگیری درخواست و مدیریت ذی‌نفعان. |
| `role_support_agent` | ثبت و پیگیری پرونده پشتیبانی. |
| `role_financial_approver` | تأیید مالی ردیف‌های عودت پشتیبانی. |

`SystemPermission` در زمان این validation دارای ۱۲۱ مقدار قابل‌کامپایل است. فهرست دقیق و authoritative آن در `src/types.ts` است؛ عدد این سند فقط snapshot اعتبارسنجی است و هنگام تغییر type باید دوباره محاسبه شود.

## مدل چندنقشی

- نقش پایه همیشه فعال است و در `additionalRoleIds` تکرار نمی‌شود.
- `isDualRole` هنگام ذخیره کاربر derive می‌شود: وجود هم‌زمان نقش درخواست‌کننده‌مانند و تأییدکننده‌مانند.
- `canIssueTasks` و `canExecuteTasks` با تغییر نقش‌ها پیشنهاد می‌شوند، اما admin می‌تواند آن‌ها را دستی override کند.
- `isSeniorTreasurySupervisor` مستقل است و ذخیره admin تضمین می‌کند حداکثر یک کاربر این پرچم را داشته باشد.
- `approvalChain`, `allowedApproverIds` و `allowedCostCenterIds` از مدل چندنقشی مستقل‌اند.
- `salesSupervisorId` زنجیره مستقل فروش است و نباید برای خزانه‌داری استفاده شود.

## قواعد تغییر دسترسی

- نقش‌های دارای `isSystemRole` پایه‌های پیش‌فرض‌اند و UI آن‌ها را مانند نقش سفارشی قابل حذف تلقی نمی‌کند.
- هر تغییر permission باید هم مسیر نمایش و هم تمام guardهای اقدام مربوط را بررسی کند.
- تغییر هویت، impersonation، login یا logout باید tabها را به dashboard بازگرداند؛ دلیل امنیتی در [module catalog](../../product/module-catalog.md) ثبت شده است.
- محدودیت‌های امنیت واقعی این مدل client-side در [security and privacy](../../engineering/security-and-privacy.md) توضیح داده شده است.
