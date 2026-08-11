# ماتریس حفظ محصول Legacy در Tapra2 Canonical

> Status: CURRENT
> Source of truth: این سند فقط برای تصمیم‌های preservation و traceability ادغام محصول legacy با معماری SaaS است.
> Owner: Product Integration
> Last validated: 2026-08-11 against `agent/canonical-product-integration`, legacy ZIP SHA-256 `0B8A6C51938C90AE88C5FA37F76F1D73B132EE48923A9DE01CAE1C9903A1D207`, legacy HEAD `4eefb5c1`, stash `684c3a67`
> Supersedes: none
> Superseded by: none

این سند رفتار محصول را تعریف نمی‌کند. اسناد authoritative در [Documentation Index](../README.md) مشخص شده‌اند. هدف این ماتریس این است که هیچ قابلیت یا تصمیم معنادار legacy هنگام شکل‌گیری محصول واحد Tapra2 گم نشود.

## منابع شواهد

| شناسه | منبع | ماهیت |
|---|---|---|
| `L-H` | legacy Git HEAD `4eefb5c1bf29cb0b9ed451b8e4a066a5d85f70fc` | محتوای committed در branch `feature/after-sales-case-operations-v1` |
| `L-S` | legacy stash `684c3a67` | تغییرات tracked پس از HEAD، شامل آخرین تغییرهای قابل‌بازیابی محصول |
| `L-U` | stash untracked parent `33bdab8` | فایل‌های untracked بازیابی‌شده، از جمله catalog و refund workflow |
| `C` | branch فعلی `agent/canonical-product-integration` | معماری SaaS/PostgreSQL و shell موجود پیش از ادغام UI |

`docs/README.md` در ZIP دارای حالت حل‌نشده `AA` بود؛ بنابراین برای رفتار محصول از source code و سه لایه شواهد بالا استفاده شده و آن فایل به‌عنوان وضعیت نهایی محصول فرض نشده است.

## معنای وضعیت‌ها

| وضعیت | معنی و اقدام پیش‌فرض |
|---|---|
| `PRESERVED_CURRENT` | قابلیت هم‌اکنون در canonical وجود دارد و باید بدون عقب‌گرد حفظ شود. |
| `REIMPLEMENTED_IN_SAAS` | رفتار legacy با Backend/PostgreSQL و کنترل server-side جایگزین شده است. |
| `LEGACY_UI_NEEDS_REWIRE` | UI ارزشمند است و باید به shell واحد یا API جدید متصل شود. |
| `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | منطق prototype ارزشمند است، اما پیش از production باید server-side شود. |
| `SUPERSEDED_BY_NEW_MODEL` | مدل جدید همان نیاز را با invariant قوی‌تر پوشش می‌دهد. |
| `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | فقط طراحی آینده است و نباید CURRENT معرفی شود. |
| `GENUINELY_MISSING_REGRESSION` | قابلیت پیاده‌سازی‌شده legacy از تجربه visible فعلی ناپدید شده و باید بازیابی شود. |
| `OBSOLETE_BY_APPROVED_DECISION` | رفتار قدیمی با تصمیم معماری پذیرفته‌شده ناسازگار و نباید احیا شود. |
| `UNKNOWN_REQUIRES_REVIEW` | شاهد کافی برای تصمیم وجود ندارد؛ در این ممیزی هیچ قابلیت substantive در این وضعیت نمانده است. |

## Application و UX

| قابلیت | شاهد legacy | شاهد canonical پیش از ادغام | رفتار کسب‌وکار | تصمیم | اقدام ادغام |
|---|---|---|---|---|---|
| RTL و رابط فارسی | `L-H: src/App.tsx`, componentها | `C: src/App.tsx`, componentها | تجربه اصلی فارسی و راست‌به‌چپ | `PRESERVED_CURRENT` | حفظ RTL و واژگان فارسی در shell واحد |
| Theme و تنظیمات ظاهری | `L-H: StyleSettingsView`, `ThemeContext` | componentهای متناظر موجودند | انتخاب ظاهر و تنظیمات شخصی | `PRESERVED_CURRENT` | حفظ بدون تغییر backing |
| Multi-tab shell | `L-H: TabBar`, navigation registry | `C: App`, `TabBar` با catalog محدودتر | نگه‌داشتن چند فضای کاری هم‌زمان | `GENUINELY_MISSING_REGRESSION` | بازیابی registry و tabهای غنی، با حفظ session جدید |
| منوی ماژول‌ها | `L-H: navigationRegistry.ts`, `Sidebar.tsx` | منوی canonical بخشی از ماژول‌ها را نشان می‌دهد | کشف Sales/Finance/Support/Organization | `GENUINELY_MISSING_REGRESSION` | بازیابی navigation registry و گروه‌بندی دامنه‌ای |
| Dashboard بالغ | `L-H: Dashboard.tsx` و role profiles | Dashboard فعلی نسخه محدودتر است | KPI، quick action و نمای نقش‌محور | `GENUINELY_MISSING_REGRESSION` | بازیابی Dashboard غنی و اتصال به identity فعلی |
| Quick actions | `L-H: Dashboard`, registry | فقط بخشی قابل مشاهده است | دسترسی سریع بر اساس نقش | `LEGACY_UI_NEEDS_REWIRE` | اتصال به routeهای canonical و permission display |
| Role dashboards | `L-H: Dashboard` برای treasury/sales/registration/coordination/sales-finance | server session وجود دارد ولی presentation کامل نیست | نمای کاری متناسب با مسئولیت | `LEGACY_UI_NEEDS_REWIRE` | نگاشت role presentation به server permissions |
| Login محلی prototype | `L-H: LoginRegisterModal`, localStorage users | `C: FoundationSessionProvider` و session server | ورود کاربر | `OBSOLETE_BY_APPROVED_DECISION` | حذف از مسیر عادی؛ فقط Foundation login معتبر است |
| Impersonation/backdoor محلی | `L-H: Admin/Navbar` | session و authorization server-side | ابزار نمایشی prototype | `OBSOLETE_BY_APPROVED_DECISION` | در مسیر production احیا نشود؛ ابزار امن آینده نیازمند design جداست |
| انتخاب فنی `Prototype / SaaS` | `C: CustomerSourceView` | در UI فعلی دیده می‌شود | انتخاب منبع ذخیره‌سازی توسط کاربر | `OBSOLETE_BY_APPROVED_DECISION` | حذف از تجربه عادی؛ technology implementation detail است |

## Organization و Access

| قابلیت | شاهد legacy | شاهد canonical پیش از ادغام | رفتار کسب‌وکار | تصمیم | اقدام ادغام |
|---|---|---|---|---|---|
| کاربران و حساب‌های سازمانی | `L-H: Colleagues/AdminPanel/storage` | `users`, sessions و memberships در PostgreSQL | هویت کاربر و عضویت | `LEGACY_UI_NEEDS_REWIRE` | حفظ UI؛ migration کامل مدیریت حساب به Backend در slice جدا |
| نقش‌های چندگانه | `L-H: roles/permissions utils` | server Membership/Permission/Scope | یک کاربر با چند مسئولیت | `SUPERSEDED_BY_NEW_MODEL` | presentation legacy به permissionهای server نگاشت شود؛ server authority باقی بماند |
| deny/allow و scope | `L-H: permissions.ts` client-side | permission enforcement و scope در API/RLS | کنترل دسترسی | `REIMPLEMENTED_IN_SAAS` | UI فقط قابلیت discoverability؛ تصمیم نهایی همیشه server-side |
| UI مدیریت RBAC | `L-H: RolesAndPermissionsView` کامل‌تر | component موجود اما در shell محدود | مشاهده/تنظیم نقش‌های کسب‌وکار | `GENUINELY_MISSING_REGRESSION` | UI بالغ بازیابی و prototype-backed بودن تغییرات مشخص شود |
| Company | `L-H: CompaniesView/storage` | Company context در PostgreSQL | مرز عملیاتی شرکت | `REIMPLEMENTED_IN_SAAS` | context server مرجع؛ UI legacy فقط در صورت اتصال مجدد |
| Branch و Cost Center | `L-H: CostCenters`, hierarchy fields | ماژول prototype موجود، مدل SaaS کامل نیست | ساختار شعبه و مرکز هزینه | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | UI حفظ؛ backing فعلاً prototype و صریح علامت‌گذاری شود |
| Sales hierarchy پنج‌سطحی | `L-H: SalesOrganizationView`, `salesHierarchy.ts` | در SaaS foundation مدل تخصصی Sales وجود ندارد | salesperson تا deputy و snapshot سازمانی | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | UI/قواعد حفظ؛ Backend vertical slice آینده |
| Sales personnel lifecycle | `L-H: SalesPersonnelLifecycleView` | در canonical visible نیست | استخدام/انتقال/خروج و حفظ تاریخچه | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | UI بازیابی؛ persistence server آینده |
| HR structure | `L-H: ERP_CRM_MASTER_SPEC` | implementation یافت نشد | ساختار منابع انسانی | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | فقط در future backlog؛ CURRENT نشود |
| Finance organization structure | `L-H: ERP_CRM_MASTER_SPEC` | ساختار کامل implementation ندارد | نقش‌ها و واحدهای مالی | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | نگه‌داری به‌عنوان طراحی آینده |

## Customer، Data و Import

| قابلیت | شاهد legacy | شاهد canonical پیش از ادغام | رفتار کسب‌وکار | تصمیم | اقدام ادغام |
|---|---|---|---|---|---|
| Customer profile پایه | `L-H: CustomersView`, localStorage | Customer 360 API/UI در PostgreSQL | ایجاد و مشاهده مشتری | `REIMPLEMENTED_IN_SAAS` | SaaS Customer 360 تجربه اصلی شود |
| Workspace identity مرکزی | legacy مدل company-local بود | migrationهای `0002`, `0007`, `0008` و service | عدم تکرار identity میان Companyها | `SUPERSEDED_BY_NEW_MODEL` | invariant جدید حفظ؛ local model authority نیست |
| Company relationship | legacy Customer رکورد مستقیم بود | `customers.identity_id` و رابطه company-scoped | رابطه مستقل هر Company با identity | `REIMPLEMENTED_IN_SAAS` | query/visibility فقط در Company context و RLS |
| Phone و Address و provenance | `L-H: Customer` فیلدهای prototype | Customer 360 phones/addresses/sources | داده تماس با منبع و قابلیت ممیزی | `REIMPLEMENTED_IN_SAAS` | API/PostgreSQL مرجع؛ UI profile به آن متصل بماند |
| Timeline و Audit مشتری | تاریخچه محلی در چند workflow | timeline و `AuditEntry` server-side | ردگیری تغییر و اقدام | `REIMPLEMENTED_IN_SAAS` | server audit مرجع؛ timeline در UI حفظ شود |
| Merge/Unmerge | `L-H: merge candidates/review queue` | Sprint 2 سرویس و PostgreSQL transaction | تشخیص و ادغام هویت با امکان بازگشت | `REIMPLEMENTED_IN_SAAS` | UI canonical استفاده شود؛ workflow قدیمی authority نیست |
| CSV Import staging | `L-H: RawContactRepository`, import base/demo | Sprint 3 batches/records/permissions | staging، بررسی و reconcile قبل از Customer | `REIMPLEMENTED_IN_SAAS` | Import به‌طور طبیعی داخل Customers قرار گیرد |
| Raw Contact Repository UI | `L-H: RawContactRepositoryView` | API جدید staging وجود دارد، UI legacy در shell نیست | مشاهده ورودی خام و provenance | `LEGACY_UI_NEEDS_REWIRE` | الگوی UI حفظ و فقط به API امن import متصل شود |
| Purchase claim review | `L-H: PurchaseClaimReviewView` | Backend تخصصی claim وجود ندارد | نسبت‌دادن خرید/سرنخ به Customer | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | UI/واژگان حفظ؛ منطق server در slice بعدی |
| Customer localStorage repository | `L-H: storage.ts` | Customer SaaS در PostgreSQL | persistence قدیمی Customer | `OBSOLETE_BY_APPROVED_DECISION` | داده حذف نشود؛ ingestion خودکار هم انجام نشود؛ adapter فقط migration/dev |

## Sales

| قابلیت | شاهد legacy | شاهد canonical پیش از ادغام | رفتار کسب‌وکار | تصمیم | اقدام ادغام |
|---|---|---|---|---|---|
| Campaigns | `L-H: CampaignsView` | route visible فعلی ندارد | تعریف کمپین و ورودی فروش | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | UI بازیابی و backing prototype مشخص شود |
| Lead assignment | `L-H: LeadAssignmentView` | Backend Sales ندارد | تخصیص lead با قواعد نقش/سهم | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | flow حفظ؛ server transaction آینده |
| Sales queue و call log | `L-H: SalesQueueView` | در shell canonical ناپدید است | صف پیگیری و ثبت تماس | `GENUINELY_MISSING_REGRESSION` | navigation/UI بازیابی؛ داده فعلاً prototype |
| Issabel integration واقعی | `L-H: master spec` فقط hook/demo | integration server یافت نشد | تماس تلفنی واقعی | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | هیچ ادعای CURRENT نشود |
| Products catalog | `L-H: ProductsView` | در visible shell نیست | catalog محصول نسخه‌پذیر | `GENUINELY_MISSING_REGRESSION` | UI بازیابی؛ backing prototype |
| Services catalog | `L-H: ServicesView` | در visible shell نیست | catalog خدمت | `GENUINELY_MISSING_REGRESSION` | UI بازیابی؛ backing prototype |
| Promotions | `L-H: PromotionsView` | در visible shell نیست | قواعد promotion و audit نمایشی | `GENUINELY_MISSING_REGRESSION` | UI بازیابی؛ migration backend آینده |
| Invoice single/proxy/batch | `L-H: SalesInvoiceView`, `BatchInvoiceImportView` | Backend Sales invoice ندارد | ثبت صورتحساب و paper/batch flow | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | UI/validation حفظ؛ production نیازمند transaction server |
| Supervisor mandatory gate | `L-H: invoice workflow` | server permission متناظر کامل نیست | تأیید اجباری سرپرست | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | rule حفظ و در backend Sales آینده enforce شود |
| Coordination inbox | `L-H: CoordinationInboxView` | visible route فعلی ندارد | هماهنگی عملیات پس از فروش | `GENUINELY_MISSING_REGRESSION` | UI/route بازیابی؛ backing prototype |
| Sales financial confirmation | `L-H: SalesFinancialConfirmationView` | Backend workflow ندارد | تعیین تکلیف مالی ردیف‌ها | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | UI حفظ؛ server workflow آینده |
| Fulfillment cases | `L-H: FulfillmentCasesView`، commit HEAD | canonical visible نیست | assignment، evidence، customer confirmation، review/return | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | آخرین UI committed بازیابی؛ transaction/SLA server آینده |
| After-sales refund slice | `L-S: Support views`, `L-U: supportRefundWorkflow.ts` | canonical نسخه قبل از hardening دارد | row decision تا treasury request و payment sync | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | آخرین stash معتبر حفظ و UI بازیابی؛ backend قبل از production |
| Service package/card/upsell | `L-H: master spec` | implementation کامل یافت نشد | بسته خدمت و فروش تکمیلی | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | فقط future design |

## Finance

| قابلیت | شاهد legacy | شاهد canonical پیش از ادغام | رفتار کسب‌وکار | تصمیم | اقدام ادغام |
|---|---|---|---|---|---|
| Finance requests | `L-H: MyRequests`, forms, storage` | componentهای prototype موجود | ایجاد درخواست مالی | `PRESERVED_CURRENT` | shell حفظ؛ backing prototype صریح بماند |
| Approval inbox و referral | `L-H: ApprovalInbox/RequestDetail` | componentها موجود ولی navigation محدودتر | approve/reject/return/referral | `PRESERVED_CURRENT` | UI و قواعد فعلی حفظ؛ server migration آینده |
| Treasury manager/executor | `L-H: role views/permissions` | presentation محلی موجود | تفکیک تصمیم و اجرا | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | نقش و UI حفظ؛ authorization نهایی باید server-side شود |
| Bank executor و payment registration | `L-H: requests/payment fields` | اتصال واقعی بانک وجود ندارد | ثبت نتیجه پرداخت | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | UI حفظ؛ integration بانکی future |
| Purchasing و financial approval | `L-H: PURCHASER/FINANCIAL_APPROVER` | roleهای server تخصصی هنوز کامل نیست | خرید و تأیید مالی | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` | نگاشت نقش و prototype UI؛ backend آینده |
| Batch payment/invoice finance | `L-H: BulkPayment`, batch rows | componentهای prototype موجود | پردازش گروهی با تصمیم ردیفی | `PRESERVED_CURRENT` | قابلیت visible حفظ و regression test افزوده شود |
| Urgent payment و amount correction | `L-H: request workflows` | قواعد prototype موجود | فوریت و اصلاح مبلغ با history | `PRESERVED_CURRENT` | حفظ behavior؛ backing status prototype |
| Vendors و vendor categories | `L-H: VendorsView` | componentها/route موجودند | طرف تجاری خرید | `PRESERVED_CURRENT` | navigation حفظ؛ backend migration مستقل |
| Bank matching واقعی | `L-H: master spec` آینده | implementation واقعی یافت نشد | تطبیق صورتحساب بانک | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | CURRENT نشود |
| GL/AR/AP/period/revenue | `L-H: master spec` آینده | implementation یافت نشد | حسابداری رسمی | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | خارج از این integration |

## Support و Service

| قابلیت | شاهد legacy | شاهد canonical پیش از ادغام | رفتار کسب‌وکار | تصمیم | اقدام ادغام |
|---|---|---|---|---|---|
| Support cases و complaints | `L-H: SupportView/forms/detail` | Support prototype موجود | ثبت، assign و پیگیری شکایت | `PRESERVED_CURRENT` | آخرین UI بدون rollback SaaS حفظ شود |
| Service fulfillment operations | `L-H: FulfillmentCasesView` | در navigation فعلی نیست | اجرا، انتظار، evidence، تأیید مشتری و review | `GENUINELY_MISSING_REGRESSION` | visible route بازیابی؛ backing prototype |
| Refund handoff به Treasury | `L-S`, `L-U: supportRefundWorkflow` | تغییرهای stash در canonical نیست | انتقال تصمیم refund به درخواست پرداخت و sync نتیجه | `GENUINELY_MISSING_REGRESSION` | آخرین evidence بازیابی و تست؛ backend migration بعدی |
| Hold/RMA/inspection/allocation/resume جامع | `L-H: master spec` | implementation کامل یافت نشد | چرخه جامع after-sales | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | فقط future design، نه CURRENT |
| SLA و skill-based assignment | `L-H: master spec` | implementation server یافت نشد | زمان‌بندی و تخصیص مهارتی | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | در vertical slice آینده طراحی/پیاده‌سازی شود |

## Communications و Records

| قابلیت | شاهد legacy | شاهد canonical پیش از ادغام | رفتار کسب‌وکار | تصمیم | اقدام ادغام |
|---|---|---|---|---|---|
| Letters | `L-H: LettersView` | component/route موجود | مکاتبات سازمانی | `PRESERVED_CURRENT` | shell و local data حفظ؛ backend آینده |
| Chat و Colleagues | `L-H: Chat/Colleagues` | component/route موجود | ارتباط همکاران | `PRESERVED_CURRENT` | navigation حفظ و prototype status روشن |
| Communication audit | `L-H: AllCommunicationsAudit` | component/route موجود | مشاهده history ارتباطات | `PRESERVED_CURRENT` | visible route و access display حفظ |
| Archive | `L-H: ArchiveView` | component/route موجود | بایگانی درخواست‌ها/رکوردها | `PRESERVED_CURRENT` | regression جلوگیری شود |

## Platform، Security و قابلیت‌های آینده

| قابلیت | شاهد legacy | شاهد canonical پیش از ادغام | رفتار کسب‌وکار | تصمیم | اقدام ادغام |
|---|---|---|---|---|---|
| Backend و PostgreSQL | legacy master آن را blocker می‌دانست | Express/PG/migrations موجود | persistence و API معتبر | `SUPERSEDED_BY_NEW_MODEL` | معماری جدید authority بماند |
| Session/Auth server | login محلی prototype | session server و testهای auth | هویت قابل اعتماد | `REIMPLEMENTED_IN_SAAS` | تنها login عادی محصول |
| Workspace/Company context | legacy فاقد tenant enforcement بود | context server و UI switcher | انتخاب tenant/company مجاز | `REIMPLEMENTED_IN_SAAS` | shell بالغ به همین context متصل شود |
| Tenant isolation و RLS | در legacy client-side بود | PostgreSQL RLS و تست‌ها | جداسازی داده | `REIMPLEMENTED_IN_SAAS` | هیچ UI legacy نباید آن را دور بزند |
| AuditEntry | history محلی پراکنده | audit server در mutationها | ردپای قابل اتکا | `REIMPLEMENTED_IN_SAAS` | برای ماژول‌های SaaS مرجع؛ migration سایر ماژول‌ها بعدی |
| Real bank integration | master spec آینده | وجود ندارد | اتصال بانک | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | future فقط |
| SMS/OTP/Customer portal | master spec آینده | وجود ندارد | کانال مشتری | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | future فقط |
| Inventory/shipping | master spec آینده | وجود ندارد | موجودی و ارسال | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | future فقط |
| Commission ledger | master spec آینده | وجود ندارد | محاسبه و تسویه پورسانت | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | future فقط |
| Supplier/intercompany settlement | master spec آینده | وجود ندارد | تسویه تأمین‌کننده/بین‌شرکتی | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | future فقط |
| Audit Center و semantic reports | legacy پایه ناقص/آینده | implementation جامع ندارد | ممیزی و گزارش تحلیلی | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | future فقط |
| Privacy/retention | open/future در master | policy اجرایی جامع ندارد | چرخه عمر داده | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | تصمیم security جدا لازم است |
| DR/observability | در master missing | implementation production یافت نشد | پایداری عملیاتی | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | engineering roadmap |
| BPMN/workflow versioning | در master missing | implementation یافت نشد | نسخه‌بندی گردش‌کار | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | future architecture |
| Performance/load acceptance | در master پذیرفته نشده | load gate وجود ندارد | ظرفیت و SLA | `DOCUMENTED_FUTURE_NOT_IMPLEMENTED` | پیش از production اندازه‌گیری شود |

## نگاشت نقش‌های legacy به مجوزهای server

این جدول مسئولیت و وضعیت migration را ثبت می‌کند؛ وجود یک role در UI به‌تنهایی مجوز دسترسی به API نیست. permission نهایی همیشه در Backend و در صورت کاربرد با RLS اعمال می‌شود.

| Legacy role | مسئولیت کسب‌وکار | permissionهای legacy شاخص | permissionهای server مرتبط فعلی | وضعیت migration |
|---|---|---|---|---|
| `SUPER_ADMIN` | مدیریت کل prototype | دسترسی سراسری UI و تنظیمات | مجوزهای Membership موجود؛ super-admin سراسری SaaS هنوز تعریف نشده | `LEGACY_UI_NEEDS_REWIRE`؛ bypass محلی ممنوع |
| `TREASURY_MANAGER` | تصمیم و مدیریت خزانه | finance review/assign/payment oversight | مجوز تخصصی Finance server هنوز موجود نیست | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` |
| `BRANCH_MANAGER` | مدیریت شعبه و درخواست‌های زیرمجموعه | branch-scoped view/approve | scope عمومی Membership موجود؛ scope شعبه تخصصی نیست | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` |
| `BANK_EXEC` | اجرای پرداخت بانکی | payment execute/result | permission server تخصصی وجود ندارد | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` |
| `PURCHASER` | خرید و تکمیل مدارک | purchase/request actions | permission server تخصصی وجود ندارد | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` |
| `FINANCIAL_APPROVER` | کنترل و تأیید مالی | finance approve/reject/return | permission server تخصصی وجود ندارد | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` |
| `SUPPORT_AGENT` | رسیدگی به case و complaint | support view/update/assign | permission server تخصصی Support وجود ندارد | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` |
| `SALESPERSON` | lead/customer/invoice پیگیری‌شده | sales own queue/customer/invoice | `customer.read/create` و Import فقط در scope server؛ Sales کامل نیست | `LEGACY_UI_NEEDS_REWIRE` |
| `SALES_SUPERVISOR` | نظارت تیم و gate صورتحساب | team queue/assign/invoice approve | Customer permissions موجود؛ supervisor workflow نیست | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` |
| `SENIOR_SALES_SUPERVISOR` | نظارت چند تیم | hierarchy/team oversight | scope تخصصی hierarchy وجود ندارد | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` |
| `SALES_MANAGER` | مدیریت فروش و allocation | campaign/allocation/confirmation oversight | Customer/Import permissions موجود؛ Sales workflow کامل نیست | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` |
| `SALES_DEPUTY` | سیاست و کنترل کل فروش | cross-team hierarchy/approvals | نقش متناظر server هنوز تعریف نشده | `LEGACY_LOGIC_NEEDS_BACKEND_MIGRATION` |

## وضعیت backing ماژول‌ها هنگام ادغام

| دسته | ماژول‌ها | وضعیت backing |
|---|---|---|
| Foundation | Login، Workspace، Company، Membership/Permission، context | `SaaS-backed` |
| Customers | Customer 360، identity، relationship، phone، address، source، timeline، merge/unmerge | `SaaS-backed` |
| Customer Import | upload/staging/review/approve/reconciliation | `SaaS-backed` |
| Product shell | Dashboard، navigation، tabs، theme | `Hybrid`؛ session جدید + UI state محلی |
| Organization/RBAC UI | roles، hierarchy، personnel | `Prototype-backed` تا migration تخصصی Backend |
| Sales | campaign، queue، catalog، invoice، coordination، fulfillment | `Prototype-backed`؛ Customer/Import زیرمجموعه SaaS-backed است |
| Finance | requests، approval، treasury، payment UI | `Prototype-backed` |
| Support | cases، complaints، refund flow | `Prototype-backed` |
| Communications | letters، chat، colleagues، communication logs | `Prototype-backed` |
| موارد صریح بخش Platform آینده | bank/Issabel/SMS/portal/inventory/commission/GL/DR/BPMN/load | `Future` |

## جمع‌بندی تصمیم preservation

- تمام capabilityهای substantive کشف‌شده دقیقاً یک status دارند.
- هیچ ردیفی `UNKNOWN_REQUIRES_REVIEW` نمانده است.
- معماری Backend/PostgreSQL، session، tenant، RLS، Customer 360 و Import هرگز به localStorage عقب‌گرد نمی‌کنند.
- UI و منطق prototype حذف نمی‌شوند؛ status backing آن‌ها برای جلوگیری از ادعای production نادرست ثبت شده است.
- فایل ZIP، Git objectها، stash و latest evidence فقط خواندنی باقی می‌مانند و این سند جای آن شواهد تاریخی را نمی‌گیرد.
