# 🤖 دستورالعمل‌ها و مقررات پروژه (AGENTS.md)

این فایل حاوی قوانین پروژه، معماری سیستم، منطق کارتابل‌ها و استانداردهای طراحی UI/UX برای عامل هوش مصنوعی (AI Studio Agent) است.

## 📌 قوانین کلیدی کارتابل و ارجاعات (Inbox & Referral Rules)
1. **تفکیک باز و بسته (Open & Closed Tabs)**:
   - تمامی کارتابل‌ها (درخواست‌های من، کارتابل ارجاع‌شده/تاییدات، و پرداخت‌های خزانه‌داری) باید به دو زیربخش اصلی **درخواست‌ها/پرداخت‌های باز** (جاری در دست اقدام) و **درخواست‌ها/پرداخت‌های بسته** (واریزشده، اتمام‌یافته، عودت یا ردشده) تقسیم شوند.

2. **کنترل ارجاع اختصاصی پرونده (Referral Assignment)**:
   - اگر پرونده‌ای به شخص خاصی ارجاع شده باشد (`currentApproverId`)، فقط و فقط برای همان شخص (و مدیر ارشد سیستم `admin`) در کارتابل باز نمایش داده می‌شود.
   - اگر پرونده‌ای به فرد ارجاع نشده باشد یا در حوزه دسترسی وی نباشد، نباید در کارتابل باز او دیده شود.
   - کاربرانی که قبلاً عملیاتی روی پرونده انجام داده‌اند (بر اساس `timeline`)، سابقه آن پرونده را در تب **بسته** مشاهده خواهند کرد.

3. **جستجوی سراسری پیشرفته (Universal Search)**:
   - کادر جستجو بالای هر فرم و جدول باید امکان جستجو روی تمام مشخصات درون فرم‌ها را داشته باشد:
     - کد پیگیری (Tracking Code)
     - عنوان و شرح درخواست (Title & Description)
     - نام متقاضی، نام شرکت، نام مرکز هزینه / شعبه (Requestor, Company, Cost Center)
     - نام ذینفع، شماره کارت، شماره شبا، بانک (Vendor, Card, Sheba, Bank)
     - مبلغ عددی و مبلغ به حروف (Amount & Amount in Words)

4. **طراحی UI مدرن و باریک (Slim Compact Table UI)**:
   - ردیف‌های جدول در تمام نمای درخواست‌ها باید به صورت فشرده، ارگونومیک و باریک (Slim) نمایش داده شوند.
   - شرح درخواست باید به صورت دائمی و خوانا (بدون افتادن در حالت Hover/Popover ناخواسته) نمایش داده شود.
   - امکان تغییر نما بین **نمای باریک فشرده (Slim Table)** و **نمای کارت پرجزئیات (Card View)** وجود داشته باشد.

5. **پایداری مستندات**:
   - تمامی تغییرات معماری و فیچرهای جدید باید بلافاصله در `DECISION_LOG.md` و این فایل (`AGENTS.md`) ثبت و بروزرسانی شوند.

6. **تایید ردیف‌به‌ردیف درخواست‌های تجمیعی (Batch Request Row-Level Approval)**:
   - درخواست‌های دارای آرایه `batchItems` (`PaymentRequest.batchItems: RequestBatchItem[]`) باید در `RequestDetailModal` جدول ردیف‌ها را با وضعیت مستقل هر ردیف (`pending` / `approved` / `rejected`) نمایش دهند.
   - دکمه سراسری «تایید و ارجاع» فقط زمانی برای مسئول فعلی درخواست فعال است که همه ردیف‌های `batchItems` تعیین‌تکلیف شده باشند (هیچ ردیف `pending` باقی نمانده باشد).
   - رد هر ردیف نیازمند دلیل رد است؛ تصمیم روی هر ردیف (تایید/رد) تا پیش از ارجاع نهایی کل درخواست قابل بازگشت به `pending` است.
   - این قانون فقط روی درخواست‌های تجمیعی اعمال می‌شود؛ رفتار درخواست‌های عادی (بدون `batchItems`) نباید تحت تاثیر قرار گیرد.

7. **مرتب‌سازی کارتابل تایید و پرداخت بر اساس تاریخ واقعی (Approval Inbox Sort by Real Date)**:
   - در `ApprovalInboxView.tsx`، مرتب‌سازی «جدیدترین»/«قدیمی‌ترین» هرگز نباید بر اساس مقایسه رشته‌ای `id` درخواست انجام شود؛ باید از تابع کمکی که رشته `createdAt` (فرمت شمسی `YYYY/MM/DD - HH:MM`) را به مقدار عددی قابل‌مقایسه تبدیل می‌کند استفاده شود.
   - این کامپوننت تنها کارتابل مشترک دسترسی‌های `approve_branch_request`، `approve_treasury` و `execute_payment` است؛ هیچ کامپوننت دیگری (مثل `AssignedTasksView.tsx`) نباید این کارتابل خاص را دوباره پیاده‌سازی یا مرتب‌سازی مجزا برایش تعریف کند.

8. **دسترسی منوی کارتابل تایید و پرداخت برای کاربر دورشغلی (Dual-Role Approval Inbox Menu Visibility)**:
   - در `Sidebar.tsx`، اگر `currentUser.isDualRole === true` باشد، آیتم منوی «کارتابل تایید و پرداخت» باید صرف‌نظر از پرمیشن‌های نقش پایه کاربر (`approve_branch_request`/`approve_treasury`/`execute_payment`) نمایش داده شود.
   - این قانون فقط روی نمایش آیتم منو در `hasAccess` اثر می‌گذارد؛ فیلترینگ محتوای داخلی کارتابل بر اساس `isDualRole` (در `ApprovalInboxView`/`DashboardView`/`ArchiveView`) مستقل است و نباید تغییر کند.

9. **یکپارچگی داده نمونه کاربران/نقش‌ها (`DEFAULT_USERS` Referential Integrity)**:
   - هر مقدار داخل `allowedCostCenterIds` یک کاربر در `src/utils/storage.ts` باید دقیقاً با یک `id` واقعی در `DEFAULT_COST_CENTERS` یکی باشد (بدون خطای تایپی مثل حذف/جابجایی آندرلاین) و به شرکت مرتبط با آن کاربر تعلق داشته باشد؛ شناسه نامعتبر بدون هیچ خطایی همان مرکز هزینه را از دید کاربر کاملاً پنهان می‌کند.
   - عنصر اول `approvalChain` یک کاربر معمولی (`requestor`، یا `approver`ی که زیرمجموعه نفر دیگری است) هرگز نباید `id` خودِ همان کاربر باشد؛ چون `NewRequestModal.tsx` مستقیماً از همین عنصر برای `currentApproverId` استفاده می‌کند و نقش‌هایی که اجازه «تایید و ارجاع» ندارند (مثل `requestor`) عملاً درخواست را برای همیشه بلاتکلیف نگه می‌دارند. خودارجاعی فقط برای نقش‌هایی که خودشان اجازه تایید/ارجاع روی خودشان را دارند (مثل `admin` طبق الگوی داده نمونه `req_10002`) قابل قبول است.
   - تغییرات در مقادیر `DEFAULT_USERS` هرگز نباید تعداد یا `id` کاربران/نقش‌های موجود را عوض کند، مگر ناسازگاری واقعی و مستند (مثل ارجاع به `id` نامعتبر) پیدا شود؛ فقط مقدار نادرست اصلاح شود، نه ساختار `approvalChain`/`allowedApproverIds`.
   - چون داده‌ها در `localStorage` مرورگر ذخیره می‌شوند و در `storage.ts` هیچ مکانیزم migrate/overwrite خودکاری وجود ندارد، اصلاح `DEFAULT_USERS` در کد فقط برای کاربران تازه (بدون داده قبلی در `localStorage`) اعمال می‌شود؛ کاربرانی که از قبل داده ذخیره‌شده دارند باید کلید مربوطه (`shavaz_treasury_users_v2`) را از `localStorage` پاک کنند تا مقادیر اصلاح‌شده جایگزین شود.

10. **ویرایش ردیفی درخواست تجمیعی (Batch Request Row-Level Editing in `RequestDetailModal`)**:
    - وقتی `request.batchItems` غیرخالی است و شرط موجود `canEditOrDeleteInitial` برقرار است (پیش از هر اقدام تاییدکننده)، فرم ویرایش باید به‌جای فرم تک‌فیلدی عنوان/مبلغ، یک فرم ردیفی نشان دهد که عنوان، مبلغ، نام ذینفع و شماره کارت/شبای هر ردیف را مستقلاً قابل ویرایش کند.
    - پس از ذخیره، `amount`/`amountInWords` کل درخواست باید از مجموع مبالغ ردیف‌های جدید بازمحاسبه شود (با `numberToPersianWords`، مثل `batchTotalAmount` در `NewRequestModal.tsx`)؛ فیلدهای تصمیم هر ردیف (`status`/`decidedByUserId`/`decidedByName`/`decidedAt`/`rejectionReason`) نباید توسط ویرایش عنوان/مبلغ/ذینفع بازنویسی شوند.
    - `request.id` و `request.trackingCode` در هیچ مسیر ویرایشی (چه ردیفی، چه تک‌فیلدی) نباید تغییر کنند.
    - این فرم ردیفی فقط تحت شرط `canEditOrDeleteInitial` فعال است، نه `canEditOrDeleteReturned`؛ درخواست تجمیعی عودت‌داده‌شده همچنان از فرم تک‌فیلدی قدیمی استفاده می‌کند. درخواست‌های غیرتجمیعی (بدون `batchItems`) باید همیشه از همان فرم تک‌فیلدی قبلی، بدون هیچ تغییری، استفاده کنند.

11. **اصلاح مبلغ توسط تاییدکننده هنگام تایید و ارجاع (Approver Amount Correction on Forward)**:
    - فیلد اختیاری «اصلاح مبلغ» در کارت «تایید و ارجاع» (`handleApproveAndForward` در `RequestDetailModal`) فقط باید برای کاربری قابل مشاهده/استفاده باشد که در حال حاضر `canApproveAndForward` برایش true است (تاییدکننده فعلی/مسئول فعلی درخواست) — نه درخواست‌کننده، نه نقش‌های دیگر.
    - این فیلد باید به‌صورت پیش‌فرض با `amount` فعلی درخواست پر شود؛ اگر تاییدکننده آن را دست‌نخورده رها کند (شامل `info_request` با `amount=0`)، هیچ اعتبارسنجی یا تغییری اعمال نشود — رفتار پیش‌فرض باید دقیقاً مثل نبود این فیچر بماند.
    - اگر مقدار تغییر کند، `amount`/`amountInWords` درخواست باید با `numberToPersianWords` به‌روزرسانی شود و همان گام `forwarded` در `timeline`، فیلد اختیاری `amountCorrectionNote` (روی `RequestTimelineStep`، بدون rename هیچ فیلد دیگری) را با مبلغ قبلی/جدید پر کند؛ فیلد `comment` (یادداشت آزاد) باید کاملاً مستقل و دست‌نخورده باقی بماند.
    - برای درخواست‌های تجمیعی، این اصلاح فقط سطح کل درخواست (`amount`/`amountInWords`) است؛ `batchItems` و وضعیت تایید/رد هر ردیف نباید در این مسیر لمس شوند.
    - این قابلیت فقط در `handleApproveAndForward` فعال باشد، نه در «تایید نهایی خزانه‌داری»/«تایید واریز»؛ `forwardTargetUsers`/`selectedForwardUserId` نباید تغییر کنند.

12. **ناوبری چندتبی شبیه مرورگر (Multi-Tab Navigation Model)**:
    - ناوبری سطح برنامه (`src/App.tsx`) بر پایه `openTabs`/`activeTabId` + `openTab(tabId, label?)`/`closeTab(tabId)` است، نه یک متغیر تک‌مقصدی. `dashboard` همیشه اولین تب و هرگز از طریق `closeTab` قابل‌بستن نیست.
    - هر View فقط وقتی mount می‌شود که در `openTabs` حضور داشته باشد؛ تا وقتی تبش باز است، با سوییچ تب فعال unmount نمی‌شود — فقط با `style={{ display: ... }}` مخفی می‌شود، تا اسکرول/فیلتر/فرم نیمه‌کاره هر تب حفظ شود. هیچ‌جا نباید به رندر شرطی تک‌مقصدی قدیمی (`activeTab === 'x' &&`) برگردد.
    - `Sidebar.tsx`/`Navbar.tsx` پراپ `onOpenTab(tabId, label?)` دارند نه `setActiveTab`؛ هر ناوبری جدیدی که به این دو فایل یا `App.tsx` اضافه می‌شود باید از `openTab`/`onOpenTab` استفاده کند، نه تنظیم مستقیم یک state تب. آیکون/لیبل هر تب باید در رجیستری مشترک `TAB_DEFINITIONS` (در `src/components/TabBar.tsx`) اضافه/به‌روزرسانی شود، نه به‌صورت پراکنده در چند فایل.
    - **قانون امنیتی الزامی**: هر نقطه‌ای که هویت کاربر لاگین‌شده عوض می‌شود (شبیه‌سازی دسترسی ادمین، خروج از شبیه‌سازی، لاگین/لاگ‌اوت) باید قبل از باز کردن تب مقصد جدید، `resetTabsToDashboard()` را صدا بزند تا تب‌های باقی‌مانده از هویت قبلی (که ممکن است برای کاربر جدید مجاز نباشند) پاک شوند — چون انتخاب یک تبِ ازقبل‌باز (`onSelectTab`) دوباره `hasAccess` را چک نمی‌کند.
    - این تغییر فقط لایه نمایش/ناوبری است؛ منطق `hasAccess` و شرط نمایش هیچ آیتم منویی در `Sidebar.tsx` نباید بابت این مدل تغییر کند.

13. **ویجت «پرکاربردترین منوهای شما» و شمارش استفاده از تب‌ها (Tab Usage Widget)**:
    - شمارش استفاده باید همیشه از داخل خودِ `openTab` در `App.tsx` انجام شود (`storage.recordTabUsage(currentUser.id, tabId)`)، نه از هر نقطه‌ی فراخوانی‌کننده به‌صورت جداگانه — تا هیچ مسیر ناوبری جدیدی که از `openTab` عبور می‌کند از قلم نیفتد.
    - داده مصرف در کلید مستقل `TAB_USAGE` (در `src/utils/storage.ts`، شیء `STORAGE_KEYS`) ذخیره می‌شود؛ هیچ‌کدام از کلیدهای موجود `STORAGE_KEYS` نباید برای این منظور تغییر کنند یا بازاستفاده شوند. نوع داده (`TabUsageCounts`) در `storage.ts` تعریف می‌شود، نه در `src/types.ts` (این تله‌متری UI است، نه مدل داده اصلی سیستم).
    - ویجت (در `DashboardView.tsx`) باید per-user باشد (فقط شمارنده کاربر لاگین‌شده فعلی، نه کاربران دیگر) و **فقط** وقتی کاربر حداقل ۳ تب متفاوت باز کرده باشد رندر شود؛ برای کاربر تازه/کم‌سابقه نباید هیچ ویجت خالی یا پیام جایگزین نمایش داده شود — کل بلوک باید حذف شود.
    - آیکون/عنوان هر آیتم ویجت باید از رجیستری مشترک `TAB_DEFINITIONS` (`src/components/TabBar.tsx`) خوانده شود، نه رشته‌های جدا تعریف‌شده در `DashboardView.tsx`؛ اگر یک `tabId` دیگر در `TAB_DEFINITIONS` نباشد (حذف/تغییرنام‌یافته)، آن ورودی باید فیلتر شود، نه اینکه با آیکون/عنوان شکسته نمایش داده شود.
    - کلیک روی هر آیتم ویجت باید از همان `openTab`/`onNavigateTab` موجود عبور کند (نه منطق ناوبری مجزا)، تا تب واقعاً باز/فعال شود و رفتار مدل چندتبی (قانون ۱۲) حفظ بماند.
14. **مدل چندنقشی کاربران و derive خودکار `isDualRole`/`canIssueTasks`/`canExecuteTasks` (Multi-Role Access Model)**:
    - `User.additionalRoleIds` (نقش‌های اضافه بر نقش پایه) و `User.roleAccessOverrides` (جایگزینی کامل پرمیشن یک نقش خاص، فقط برای همان کاربر) منبع واحد مدل چندنقشی هستند. هر منطقی که پرمیشن مؤثر یک کاربر را می‌خواهد، باید از `getEffectiveUserPermissions(user, roles)` در `src/utils/permissions.ts` استفاده کند، نه اینکه دوباره `roleId`/`role.permissions` را مستقیم lookup کند.
    - در `AdminPanel.tsx`، بخش «نقش‌های چندگانه و دسترسی‌های تفکیکی این کاربر» تنها محل تعریف `additionalRoleIds`/`roleAccessOverrides` است. نقش پایه همیشه در این چک‌لیست تیک‌خورده و غیرقابل‌حذف است.
    - `isDualRole` دیگر چک‌باکس دستی ندارد؛ در `handleSaveUser`، اگر نقش‌های فعال (پایه + اضافه) هم شامل یک نقش «درخواست‌کننده-مانند» (`role_purchaser` یا `role === 'requestor'`) و هم یک نقش «تاییدکننده-مانند» (`role_branch_approver`, `role_treasury_manager` یا `role === 'approver'`) باشند، `isDualRole` باید `true` ذخیره شود، وگرنه `false` (`deriveIsDualRoleFromRoles`). خودِ فیلد `isDualRole` در `types.ts` و همه چک‌های موجودش (`Sidebar.tsx`, `ApprovalInboxView.tsx`, `DashboardView.tsx`, `ArchiveView.tsx`, `NewRequestModal.tsx`) نباید rename یا حذف شوند.
    - `canIssueTasks`/`canExecuteTasks` باید با تغییر نقش‌های انتخابی به‌صورت پیشنهادی بازمحاسبه شوند (`deriveTaskAccessFromRoles`)، اما همیشه یک چک‌باکس مستقل برای override دستی توسط ادمین باید در دسترس بماند — این دو مقدار هرگز 100% قفل‌شده روی مقدار مشتق‌شده نباشند.
    - `approvalChain`، `allowedApproverIds` و بخش «شعب و مراکز مجاز» (`allowedCostCenterIds`) کاملاً مستقل از مدل چندنقشی‌اند و نباید توسط تغییرات این مدل لمس شوند.
    - چون هیچ‌کدام از ۶ کاربر نمونه `DEFAULT_USERS` مقدار `additionalRoleIds`/`roleAccessOverrides` ندارند، `getEffectiveUserPermissions` برایشان دقیقاً همان نتیجه منطق قدیمی (`roleId` تنها) را می‌دهد؛ رفتار/دسترسی این ۶ کاربر نباید با این تغییر عوض شود.
    - `ApprovalInboxView.tsx`, `DashboardView.tsx`, `ArchiveView.tsx` هنوز به `getEffectiveUserPermissions` مهاجرت نکرده‌اند (فقط `Sidebar.tsx` مهاجرت کرد) — این یک بدهی فنی شناخته‌شده است، نه یک باگ؛ در تسک بعدی باید انجام شود.

## اصل بررسی کامل فلو (برای هر فیچر/تغییر جدید، به‌خصوص ماژول فروش)
هنگام طراحی یا پیاده‌سازی هر فلوی جدید در این پروژه، باید همیشه:
- تمام نقش‌ها/دسترسی‌های مرتبط با آن فلو شناسایی و بررسی شوند، از ابتدای فلو تا انتهای آن.
- ارتباط و وابستگی بین این نقش‌ها (چه کسی به چه کسی ارجاع می‌دهد، چه کسی منتظر چه کسی می‌ماند) به‌طور کامل مشخص باشد.
- به این تفکر تک‌بعدی (فقط حل یک مسئله‌ی مشخص بدون دیدن کل فلو و کل نقش‌های درگیر) پرهیز شود.
این اصل مکمل خط قرمزهای موجود (isDualRole، approvalChain، allowedApproverIds، rename نکردن اینترفیس‌ها) است و باید در طراحی هر فیچر جدید رعایت شود.

15. **ماژول فروش: مشتری با قفل مالکیت پویا و دید سلسله‌مراتبی (`Customer` — گام اول)**:
    - `User.salesSupervisorId` (زنجیره‌ی سرپرستی فروش: فروشنده ← سرپرست فروش ← مدیر فروش) **کاملاً مستقل** از `approvalChain`/`allowedApproverIds` خزانه‌داری است. این دو زنجیره هرگز نباید با هم قاطی، merge یا جایگزین یکدیگر شوند؛ هر منطقی که دید سلسله‌مراتبی فروش می‌خواهد باید از `getVisibleCustomerIds` در `src/utils/salesHierarchy.ts` استفاده کند، نه از `approvalChain`.
    - قفل مالکیت پویا: تا وقتی یک مشتری چرخه‌ی فروش `active` دارد (`Customer.activityLog`)، هیچ فروشنده‌ی دیگری نباید بتواند چرخه‌ی فروش جدیدی برایش ثبت کند (`canStartNewSale` باید قبل از هر `startNewSaleCycle` چک شود). `currentActiveSalespersonId` هرگز نباید به‌عنوان فیلد ذخیره‌شده اضافه شود؛ همیشه باید از روی `activityLog` با `getCurrentActiveSalespersonId` محاسبه شود.
    - جستجوی مشتری بر اساس شماره تماس (`findCustomerByPhone`) باید سراسری (مستقل از دید سلسله‌مراتبی) بماند؛ فقط «لیست مشتریان قابل‌مشاهده» (`getVisibleCustomerIds`) باید بر اساس زنجیره‌ی `salesSupervisorId` محدود شود. این دو مسیر دسترسی را با هم قاطی نکنید.
    - `SystemPermission` جدید `sales_access` فقط باید از طریق `customPermissions`/رجیستری پرمیشن‌ها اعمال شود؛ برای این گام اول نیازی به افزودن مقدار جدید به `UserRole` نیست (سه کاربر نمونه‌ی فروش همگی `role: 'requestor'` با `customPermissions: ['sales_access']` هستند).
    - «تکمیل‌شدن» یک چرخه‌ی فروش در این گام صرفاً دستی/تستی است (`closeSaleCycle`، فقط توسط فروشنده‌ی مالک فعلی)؛ منطق واقعی («فاکتور تکمیل شد» بر اساس وضعیت ردیف‌های کالا/خدمت) در فاز فاکتور فروش اضافه می‌شود — به `docs/SALES_ARCHITECTURE_DRAFT.md` بخش ۱۴ مراجعه کنید.

16. **بازسازی امنیتی روی `stable` واقعی: چندنقشی/Deny/قلمرو/Impersonation/پرداخت (`fix/multi-role-permissions-v2`)**:
    - `getEffectiveUserPermissions` (در `src/utils/permissions.ts`) اکنون منبع واحد مجوز مؤثر است: اتحاد نقش پایه + `additionalRoleIds` + `customPermissions`، سپس تفریق `User.deniedPermissions` (Deny همیشه بر Allow غالب است). هیچ کامپوننتی نباید مستقیماً `role.permissions`/`roleId` را lookup کند؛ باید از `getEffectiveUserPermissions`/`hasPermission`/`canAccessNavItem` عبور کند.
    - Impersonation فقط با `canStartImpersonation` (در `src/utils/auth.ts`) مجاز است: نقش پایه‌ی واقعی کاربر باید `admin` باشد (نه صرفاً داشتن مجوز `impersonate_users`)، نشست تودرتو ممنوع، مقصد باید فعال باشد. همین تابع هم در دکمه‌ی `AdminPanel.tsx` و هم در ابتدای `handleImpersonateUser` (`App.tsx`) صدا زده می‌شود. شروع/پایان هر Impersonation در `IMPERSONATION_LOG`/`AUDIT_LOG` (`src/utils/auditLog.ts`) با هویت واقعی ثبت می‌شود.
    - قلمرو دسترسی (Territory) یک ساختار داده‌ی واقعی و مصرف‌شده است، نه فقط تزئینی: `User.roleScopes` (`{roleId, scope:{scopeType, companyId?, costCenterId?}}`) + `User.reportsToUserId` (زنجیره‌ی عمومی گزارش‌دهی، **مستقل** از `salesSupervisorId` و `approvalChain`) در `src/utils/orgHierarchy.ts`'s `computeVisibleUserIds` مصرف می‌شوند. پیش‌فرض هر نقش بدون تخصیص صریح `roleScopes`، `'own'` است — هرگز fallback خودکار به «هم‌شعبه‌ای» نیست. `ArchiveView.tsx` این تابع را جایگزین شرط‌های قدیمی «هم‌مرکز‌هزینه» کرده است.
    - خزانه هرگز `SupportCase` خام دریافت نمی‌کند؛ فقط `TreasuryPaymentSourceView` (`src/utils/treasurySourceView.ts`، فیلدهای مجاز محدود) برای درخواست‌های `sourceType==='support_refund'`. فیلتر «مرجع صادرکننده» (`PaymentRequest.sourceType/sourceUnitId/sourceUnitName`) روی درخواست‌ها و آرشیو خزانه واقعاً اعمال می‌شود.
    - فلوی پرداخت عادی دو مرحله‌ای است: تایید نهایی (`handleFinalApproval` در `RequestDetailModal.tsx`) هرگز مسئول پرداخت را خودکار انتخاب نمی‌کند (بدون `users[0]`/اولین `treasury_executor`) — فقط وضعیت را به `approved_awaiting_payment_assignment` می‌برد؛ فقط ادمین یا دارنده‌ی صریح `refer_for_payment` می‌تواند با `handleReferForPayment` مسئول مشخص را انتخاب کند (و مقصد باید واقعاً `execute_payment` داشته باشد). پرداخت فوری کاملاً مستقل است (`refer_for_emergency_payment`/`execute_emergency_payment`، دلیل اجباری، منع خودارجاعی صریح در `handleReferForEmergencyPayment`).
    - پرداخت بدون فیش مجاز است اما هرگز با تصویر جعلی جایگزین نمی‌شود؛ `PaymentRequest.paidWithoutReceipt: true` علامت صادق است (`handleMarkPaid`/`handleExecuteEmergencyPayment`).
    - درخواست تجمیعی: `RequestBatchItem.originalAmount/currentAmount/amountCorrectedBy*/changeHistory` تاریخچه‌ی کامل اصلاح مبلغ هر ردیف را نگه می‌دارند (`applyRowAmountCorrection` در `src/utils/batchCalculations.ts`)؛ `computeBatchTotals` بعد از **هر** تصمیم/اصلاح ردیف صدا زده می‌شود تا `request.amount`/`amountInWords` هرگز stale نماند؛ `canFinalizeBatch` هم در UI (دکمه غیرفعال) و هم در ابتدای `handleFinalApproval`/`handleApproveAndForward` چک می‌شود — تا ردیف بلاتکلیف هست، تایید نهایی مسدود است. مبلغ کل یک درخواست تجمیعی هرگز مستقل از ردیف‌ها edit نمی‌شود.
    - لغو (`RequestStatus: 'cancelled'`) هرگز حذف فیزیکی نیست؛ `cancelledByUserId/Name/At` ثبت می‌شود و رکورد در آرشیو/بایگانی لغوشده‌ها باقی می‌ماند (`App.tsx`'s `handleCancelRequest`، جایگزین فیلتر فیزیکی قدیمی).
    - نقش‌های سازمان فروش/مدیر داده/اپراتور تبلیغات/نقش‌های آینده رکورد واقعی `SystemRole` هستند (نه صرفاً `customPermissions`)، با Migration افزایشی idempotent (`ensureDefaultRolesMigrated`، نسخه‌بندی‌شده) که هرگز نقش سفارشی موجود را overwrite نمی‌کند. جزئیات کامل در `docs/SALES_ARCHITECTURE_DRAFT.md` بخش‌های ۴۳-۴۵.
    - **بدهی فنی شناخته‌شده**: `@types/react`/`@types/react-dom` قبلاً در پروژه نصب نبودند، یعنی `tsc --noEmit` هرگز خطای Prop نادرست/گمشده JSX را نمی‌گرفت (فقط منطق خالص `.ts` چک می‌شد). این دو پکیج در همین شاخه به `devDependencies` اضافه شدند؛ از این پس `npm run lint` واقعاً Propهای کامپوننت را هم چک می‌کند — قبل از merge به `stable`، `stable` هم باید همین‌طور به‌روزرسانی و از نو `tsc --noEmit` روی آن اجرا شود، چون ممکن است خطاهای پنهان مشابه (که در همین شاخه یافت و رفع شدند: `ArchiveView.tsx`, `AllCommunicationsAuditView.tsx`, `AdminPanel.tsx`, `NewRequestModal.tsx` و غیره) هنوز در `stable` وجود داشته باشند.

## مرج نهایی سه فیچر به `stable` (۱۴۰۵/۰۵/۱۴)
شاخه‌های `feature/multi-tab-navigation` (قانون ۱۲-۱۳ بالا) و `feature/multi-role-permissions` (قانون ۱۴-۱۵ بالا، به همراه فیچر مشتری) هر دو با موفقیت داخل `stable` merge شدند (اولی fast-forward بدون conflict، دومی با ۶ conflict حل‌شده در `AGENTS.md`, `DECISION_LOG.md`, `docs/MODULES_DOCUMENTATION.md`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/utils/storage.ts` — همه با «حفظ هر دو فیچر» حل شدند، نه با حذف یکی به‌نفع دیگری). هر دو مدل اکنون هم‌زمان در `stable` فعال‌اند: ناوبری چندتبی (`openTabs`/`TabBar`) **و** مدل چندنقشی + ماژول فروش مشتری. یک شکاف کوچک هنگام حل conflict پیدا و رفع شد: تب `customers` در رجیستری `TAB_DEFINITIONS` (`src/components/TabBar.tsx`) وجود نداشت — اضافه شد. هیچ‌کدام از خط‌قرمزها (`isDualRole`, `approvalChain`, `allowedApproverIds`, rename اینترفیس، ۶ کاربر نمونه خزانه‌داری) در این merge لمس نشدند.
