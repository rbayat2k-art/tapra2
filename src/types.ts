export type UserRole = 'admin' | 'approver' | 'requestor' | 'treasury_executor' | 'support_agent' | 'financial_approver';

export type SystemPermission = 
  | 'create_request'           // ثبت درخواست جدید
  | 'view_all_requests'        // مشاهده کل درخواست‌های سازمان
  | 'view_branch_requests'     // مشاهده فقط درخواست‌های شعب مجاز
  | 'approve_branch_request'   // تایید اولیه سرپرست شعبه
  | 'approve_treasury'         // تایید نهایی خزانه‌داری
  | 'execute_payment'          // اجرا و واریز بانکی
  | 'return_reject_request'    // عودت و رد درخواست
  | 'manage_cost_centers'      // مدیریت شعب و مراکز هزینه
  | 'manage_companies'         // مدیریت شرکت‌ها
  | 'manage_users'             // مدیریت کاربران و کلمه عبور
  | 'manage_roles'             // مدیریت نقش‌ها و ماتریس دسترسی‌ها
  | 'manage_vendors'           // مدیریت دفترچه ذینفعان و تامین‌کنندگان
  | 'export_archive'           // خروجی اکسل و بایگانی کل
  | 'export_bank_batch'        // خروجی فایل پرداخت گروهی بانکی
  | 'view_analytics'           // مشاهده آمار و نمودارهای خزانه‌داری
  | 'manage_assigned_tasks'    // دسترسی به بخش کارهای محوله و دستورات اداری
  | 'manage_support_cases'     // ثبت و پیگیری پرونده‌های خدمات پس از فروش و شکایات
  | 'financial_approve_support'// تایید مالی مبالغ عودتی پرونده‌های پشتیبانی
  | 'view_support_reports'     // گزارش‌گیری پیشرفته کل پرونده‌های خدمات پس از فروش (ادمین)
  | 'manage_letters'           // دسترسی به سامانه نامه‌نگاری داخلی (ثبت، ارجاع، پاسخ)
  | 'sales_access'             // دسترسی به ماژول فروش (مشتریان، فاکتور فروش)
  | 'impersonate_users'        // ورود ادمین به حساب کاربران دیگر (Impersonation) — فقط برای نقش admin واقعی معنا دارد
  | 'refer_for_payment'        // ارجاع درخواست آماده‌ی پرداخت به یک مسئول پرداخت مشخص
  | 'refer_for_emergency_payment' // ارجاع یک درخواست به مسیر پرداخت فوری (بدون تایید کامل زنجیره عادی)
  | 'execute_emergency_payment'   // اجرای پرداخت فوری برای درخواست ارجاع‌شده به مسیر فوری
  // --- مجوزهای ریزدانه سازمان فروش ---
  | 'view_own_customers'           // دیدن مشتریانی که خودِ کاربر با آن‌ها کار کرده
  | 'view_team_customers'          // دیدن مشتریان زیرمجموعه‌ی مستقیم
  | 'view_descendant_customers'    // دیدن مشتریان کل زیردرخت سازمانی زیرمجموعه
  | 'search_customer_by_phone'     // جستجوی سراسری مشتری بر اساس شماره تماس
  | 'create_customer'              // ثبت مشتری جدید
  | 'edit_customer_basic_info'     // ویرایش اطلاعات پایه مشتری
  | 'view_customer_contact_fields' // مشاهده شماره تماس‌های مشتری
  | 'view_customer_address'        // مشاهده آدرس مشتری
  | 'view_customer_purchase_history'   // مشاهده تاریخچه خرید مشتری
  | 'view_customer_call_history'       // مشاهده تاریخچه تماس مشتری
  | 'view_customer_complaint_summary'  // مشاهده خلاصه شکایات مشتری
  | 'view_customer_complaint_details'  // مشاهده جزئیات کامل شکایات مشتری
  | 'start_sale_cycle'             // شروع چرخه فروش جدید با مشتری
  | 'close_sale_cycle'             // بستن چرخه فروش فعال
  | 'assign_sales_lead'            // ارجاع مستقیم Lead به یک فروشنده/زیرمجموعه (زیرساخت — هنوز بدون صفحه عملیاتی)
  | 'reassign_sales_lead'          // جابه‌جایی/ارجاع مجدد یک Lead (زیرساخت — هنوز بدون صفحه عملیاتی)
  | 'drain_salesperson_queue'      // تخلیه صف Lead های یک فروشنده (زیرساخت — هنوز بدون صفحه عملیاتی)
  | 'view_sales_reports'           // گزارش‌گیری از عملکرد فروش
  | 'configure_sales_field_visibility' // پیکربندی این‌که کدام فیلدهای مشتری برای چه نقشی نمایان باشد
  | 'manage_sales_hierarchy'       // ویرایش زنجیره سرپرستی سازمان فروش
  // --- مجوزهای مدیر داده (زیرساخت آماده، فلو کامل در فاز بعد) ---
  | 'data_management_access'       // دسترسی پایه به بخش مدیریت داده
  | 'import_raw_contacts'          // Import بانک داده خام
  | 'review_import_conflicts'      // بررسی تعارض‌های Import
  | 'view_raw_contact_pool'        // مشاهده مخزن داده خام
  | 'configure_lead_assignment'    // پیکربندی موتور تخصیص Lead
  | 'view_data_reports'            // گزارش‌گیری بانک داده
  // --- مجوزهای اپراتور تبلیغات (زیرساخت آماده، فلو کامل در فاز بعد) ---
  | 'advertising_access'           // دسترسی پایه به بخش تبلیغات
  | 'manage_advertising_campaigns' // ثبت/ویرایش کمپین تبلیغاتی
  | 'review_incoming_leads'        // بررسی اولیه Lead های ورودی
  | 'convert_interaction_to_lead'  // تبدیل تعامل ورودی به Lead
  | 'view_campaign_reports';       // گزارش‌گیری کمپین‌ها

export interface SystemRole {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystemRole?: boolean; // System roles cannot be deleted
  permissions: SystemPermission[];
  userCount?: number;
  // Organizational level within a hierarchy (e.g. sales org: 1=فروشنده ... 5=معاونت فروش) —
  // display/reporting only, never a source of permission by itself.
  organizationalLevel?: number;
  // Which role ids are the "normal" upward reporting targets for a user in this role —
  // informational for admin UI, not enforced automatically.
  allowedParentRoleIds?: string[];
  // 'infrastructure_ready' = role/permissions exist but no operational page/flow yet
  // (e.g. future logistics/delivery roles) — never grant sensitive permissions to these.
  implementationStatus?: 'active' | 'infrastructure_ready';
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  phone: string;
  email: string;
  role: UserRole;
  roleId?: string; // Link to custom SystemRole
  roleTitle: string;
  companyId?: string;
  costCenterId?: string;
  allowedCostCenterIds?: string[]; // Multiple cost centers / branches this approver/user is authorized for
  customPermissions?: SystemPermission[]; // Individual user permission overrides
  isActive: boolean;
  avatarUrl?: string;
  password?: string;
  
  // Custom Task & Directive Permissions set by Admin
  canCreateRequests?: boolean; // آیا مجاز به ایجاد و ثبت درخواست پرداخت جدید است (مستقل از نقش اصلی)
  canIssueTasks?: boolean; // آیا مجاز به صدور و ارجاع دستورات اداری به دیگران است (صادرکننده)
  canExecuteTasks?: boolean; // آیا مجاز به دریافت و انجام کارهای محوله است (مجری)
  
  // Custom Workflow Routing set by Admin
  allowedApproverIds?: string[]; // IDs of approvers this user can send requests to
  approvalChain?: string[]; // Step-by-step user IDs approval sequence (e.g. [step1, step2, step3])
  allowDirectToTreasury?: boolean; // Can send directly to Treasury Manager (Reza Bayat)
  workflowNote?: string; // Admin notes/rules for this user's execution flow

  // Dual-role: this user is simultaneously a requestor AND an approver (set by Admin only)
  isDualRole?: boolean;
  // Marks the single user who is the senior treasury supervisor - the mandatory
  // destination for self-submitted requests of dual-role users
  isSeniorTreasurySupervisor?: boolean;

  // Multi-role access model: extra SystemRole ids granted to this user on top of
  // their base role/roleId (see getEffectiveUserPermissions in utils/permissions.ts)
  additionalRoleIds?: string[];
  // Per-user, per-role permission overrides: for a given roleId, fully replaces that
  // role's permission list (from base role or an additionalRoleIds entry) for this user only
  roleAccessOverrides?: { roleId: string; permissions: SystemPermission[] }[];

  // Sales hierarchy supervisor chain (سرپرست فروش این کاربر) — completely independent of
  // the treasury approvalChain/allowedApproverIds above; used only by src/utils/salesHierarchy.ts
  // to compute which customers a salesperson/supervisor can see.
  salesSupervisorId?: string;

  // Explicit permission denial: subtracted from the union of role/customPermissions in
  // getEffectiveUserPermissions (src/utils/permissions.ts) — deny always wins over allow.
  deniedPermissions?: SystemPermission[];

  // General organizational supervisor chain (used for Archive territory visibility via
  // src/utils/orgHierarchy.ts) — completely independent of salesSupervisorId (sales-only)
  // and approvalChain/allowedApproverIds (treasury approval routing only). This is who this
  // user "reports to" for org-hierarchy/territory purposes, nothing else.
  reportsToUserId?: string;

  // Per-role scope assignment: for a given roleId, how wide this user's data visibility is
  // under that role (see RoleAssignmentScope). Missing entry for a role = 'own' by default —
  // never a silent broader fallback. Computed by src/utils/orgHierarchy.ts:computeVisibleUserIds.
  roleScopes?: { roleId: string; scope: RoleAssignmentScope }[];
}

// Data-visibility scope attached to a specific role assignment. 'own' is always the default
// when no explicit scope is set for a role — 'company'/'branch' only ever apply when an
// admin has explicitly assigned them (never an automatic/implicit fallback).
export type RoleScopeType = 'own' | 'direct_reports' | 'subtree' | 'company' | 'branch';
export interface RoleAssignmentScope {
  scopeType: RoleScopeType;
  companyId?: string;   // required context when scopeType === 'company'
  costCenterId?: string; // required context when scopeType === 'branch'
}

// Impersonation audit trail (Admin → user "login as"). One entry per session: startedAt is
// set when impersonation begins, endedAt when it ends (exit or full logout).
export interface ImpersonationLogEntry {
  id: string;
  adminId: string;
  adminName: string;
  targetUserId: string;
  targetUserName: string;
  startedAt: string;
  endedAt?: string;
}

// Generic audit trail for security/finance-sensitive operations (impersonation lifecycle,
// normal + emergency payment referral/execution). Intentionally NOT a full app-wide audit
// log — see docs/BUSINESS_RULES.md for the documented scope boundary.
export interface AuditLogEntry {
  id: string;
  action: string; // e.g. 'impersonation_start', 'payment_referred', 'emergency_payment_executed'
  effectiveUserId: string;   // who the action appears to be performed by (currentUser at the time)
  effectiveUserName: string;
  impersonatorAdminId?: string; // set only if the effectiveUser was being impersonated by an admin
  impersonatorAdminName?: string;
  effectiveRoleId?: string; // which of the user's active roles granted the permission used
  targetId?: string; // e.g. paymentRequest id, target user id
  details?: string;
  timestamp: string;
}

export interface Company {
  id: string;
  name: string;
  code: string;
  description: string;
}

export interface CompanyBankAccount {
  id: string;
  companyId: string;
  companyName: string;
  bankName: string;         // نام بانک (ملت، ملی، سامان، پاسارگاد، پارسیان، تجارت، ...)
  accountNumber: string;    // شماره حساب بانکی
  shebaNumber: string;      // شماره شبا ۲۴ رقمی
  cardNumber?: string;      // شماره کارت ۱۶ رقمی
  accountTitle: string;     // عنوان یا نوع حساب (مثلا: حساب درآمدی اصلی، حساب مسدودی درگاه، ...)
  isActive: boolean;
}

export interface CostCenter {
  id: string;
  companyId: string;
  name: string;
  code: string;
  description?: string;
  monthlyBudget?: number; // بودجه مصوب ماهانه به ریال
  budgetPeriod?: string;  // دوره بودجه (مثلاً مرداد ۱۴۰۳)
}

export interface Vendor {
  id: string;
  name: string;             // نام تجاری / فروشگاه / شرکت
  category: string;         // گروه (تجهیزات، شوینده، اداری، خدمات فنی، ...)
  companyId?: string;       // شرکت مربوطه (کدام شرکت داخلی این ذینفع را مدیریت می‌کند)
  companyName?: string;     // نام شرکت مربوطه (برای نمایش سریع)
  nationalCode?: string;    // کد ملی / شناسه ملی
  economicCode?: string;    // کد اقتصادی
  shebaNumber: string;      // شماره شبا (مثلاً IR120170000000123456789012)
  cardNumber?: string;      // شماره کارت ۱۶ رقمی
  accountNumber?: string;   // شماره حساب بانکی
  bankName: string;         // نام بانک (ملت، ملی، پاسارگاد، سامان، تجارت، صادرات، ...)
  accountHolderName: string; // نام و نام خانوادگی کامل صاحب حساب
  phone: string;            // شماره تماس
  address?: string;         // آدرس
  totalPaid?: number;       // مجموع واریزی‌های تاریخی
  transactionCount?: number; // تعداد تراکنش‌ها
  notes?: string;           // یادداشت خزانه‌داری
}

export interface VendorCategory {
  id: string;
  name: string; // دسته‌بندی / زمینه فعالیت
}

export type RequestType = 'current_payment' | 'advance_payment' | 'info_request' | 'customer_refund';

// ============================================================
// سامانه نامه‌نگاری داخلی (دبیرخانه)
// ============================================================

export type LetterStatus =
  | 'draft'            // پیش‌نویس
  | 'in_review'        // در حال بررسی
  | 'needs_correction' // نیاز به اصلاح
  | 'approved'         // تایید شده
  | 'sent'             // ارسال شده
  | 'seen'             // مشاهده شده
  | 'replied'          // پاسخ داده شده
  | 'archived'         // بایگانی شده
  | 'cancelled';        // لغو شده

export interface LetterAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface LetterSignature {
  userId: string;
  fullName: string;
  roleTitle: string;
  date: string; // تاریخ
  time: string; // ساعت
}

export interface LetterVersion {
  version: number; // V1, V2, V3...
  subject: string;
  body: string;
  editedAt: string;
  editedById: string;
  editedByName: string;
  note?: string; // چه اصلاحی انجام شد
}

export interface LetterForwardRecord {
  id: string;
  toUserId: string;
  toUserName: string;
  byUserId: string;
  byUserName: string;
  at: string;
  note?: string;
}

export interface LetterSeenRecord {
  userId: string;
  userName: string;
  at: string;
}

export interface LetterTimelineStep {
  id: string;
  actorId?: string;
  actorName: string;
  actorRole: string;
  action: 'created' | 'status_changed' | 'forwarded' | 'replied' | 'seen' | 'versioned' | 'archived' | 'cancelled' | 'commented' | 'signed';
  actionTitle: string;
  comment?: string;
  timestamp: string;
}

export interface Letter {
  id: string;
  letterNumber: string; // شماره نامه - خودکار، مثال: L1001
  threadId: string;      // شناسه گفتگو - نامه ریشه یا خودش اگر ریشه است
  parentLetterId?: string; // اگر این نامه پاسخ به نامه دیگری است

  date: string;  // تاریخ نامه - پیش‌فرض امروز
  time: string;

  subject: string;
  toUnit: string;      // به - واحد گیرنده (دستی)
  toUserId?: string;    // گیرنده مشخص (در صورت ارجاع به شخص)
  toUserName?: string;

  fromUserId: string;
  fromUserName: string;
  fromRoleTitle: string;

  body: string;
  tags: string[];
  attachments: LetterAttachment[];

  status: LetterStatus;
  currentVersion: number;
  versions: LetterVersion[];

  signature?: LetterSignature;
  forwardHistory: LetterForwardRecord[];
  seenBy: LetterSeenRecord[];
  timeline: LetterTimelineStep[];

  createdAt: string;
  updatedAt: string;
}

export type SupportContactType = 'تلفنی' | 'حضوری' | 'پیامکی' | 'آنلاین' | 'ایمیل';
export type SupportReasonType = 'فعال‌سازی' | 'انصراف و عودت وجه' | 'قطع خدمات' | 'شکایت کیفیت' | 'سایر';
export type SupportPriority = 'normal' | 'urgent' | 'critical';
export type SupportCaseStatus = 'open' | 'in_review' | 'needs_correction' | 'closed';
export type SupportSatisfaction = 'satisfied' | 'unsatisfied' | 'neutral';

export type SupportTransactionStatus =
  | 'pending_financial_approval' // در انتظار تایید مالی
  | 'approved_pending_send'      // تایید شد ولی هنوز به خزانه ارسال نشده (کارشناس تایید مالی می‌تواند دسته‌ای ارسال کند)
  | 'financial_approved'         // ارسال شد - در کارتابل خزانه
  | 'financial_rejected'         // رد شده توسط تایید مالی
  | 'needs_correction'           // نیاز به اصلاح توسط پشتیبان
  | 'pending_treasury_payment'   // در کارتابل خزانه (لینک به PaymentRequest)
  | 'paid';                      // پرداخت‌شده

export interface SupportTimelineStep {
  id: string;
  actorId?: string;
  actorName: string;
  actorRole: string;
  action: 'created' | 'transaction_added' | 'financial_approved' | 'financial_rejected' | 'needs_correction' | 'sent_to_treasury' | 'paid' | 'commented' | 'case_closed';
  actionTitle: string;
  comment?: string;
  timestamp: string;
}

export interface SupportCustomField {
  id: string;
  label: string;
  value: string;
}

export interface SupportTransactionRow {
  id: string;
  invoiceCode: string;
  invoiceDate: string;
  totalInvoiceAmount: number;
  preDepositAmount?: number;
  preDepositDate?: string;
  preDepositTime?: string;
  destAccountLast4?: string;
  destAccountCompanyName?: string;
  sourceAccountLast4?: string;
  sourceAccountHolderName?: string;
  customerRefundCardNumber?: string;
  customerRefundShebaNumber: string;
  description?: string;
  totalDeductions?: number;
  litigationCost?: number;
  extraCost?: number;
  doorDeliveryAmount?: number; // مبلغ واریزی درب منزل (اضافه می‌شود به جمع مبلغ عودتی)
  finalRefundAmount: number; // خودکار محاسبه می‌شود: کل فاکتور - کسورات + هزینه دادرسی + هزینه مازاد + واریزی درب منزل
  refundCorrection?: string;
  refundDateAnnouncedToCustomer?: string;
  customFields?: SupportCustomField[]; // فیلدهای سفارشی که کاربر پشتیبانی خودش اضافه می‌کند

  status: SupportTransactionStatus;
  financialApproverId?: string;
  financialApproverName?: string;
  financialApproverNote?: string;
  financialActionAt?: string;

  // Link to the payment created in the existing treasury flow once approved
  paymentRequestId?: string;
  paymentRequestTrackingCode?: string;
  paidAt?: string;
}

export interface SupportCase {
  id: string;
  trackingCode: string; // e.g. S50001
  createdAt: string; // تاریخ و ساعت و ثانیه ثبت - خودکار
  operatorId: string;
  operatorName: string;

  customerFullName: string;
  customerPhone: string;
  province: string;
  city: string;
  address?: string;

  contactType: SupportContactType;
  reasonForContact: SupportReasonType;
  complaintDetail?: string;
  complaintReference?: string;
  complaintStatus: SupportCaseStatus;
  accountBlocked?: boolean; // مشتری با ثبت شکایت (فتا، آگاهی و...) موجب مسدودی حساب(های) شرکت گردیده است
  blockedAccountCompanyIds?: string[]; // کدام شرکت‌ها/پلتفرم‌ها حساب بانکی‌شان مسدود گردیده است
  blockedAccountCompanyNames?: string[]; // نام شرکت‌ها جهت نمایش سریع
  blockedBankAccountIds?: string[]; // شناسه شماره حساب‌های بانکی مسدودشده شرکت
  blockedBankAccounts?: CompanyBankAccount[]; // جزییات شماره حساب‌های بانکی مسدودشده شرکت جهت نمایش کامل در پرونده
  assignedRepresentative?: string;
  referrerName?: string;
  referralDate?: string;
  previousSupportHistoryNote?: string;

  salesPersonName?: string;
  callCenterName?: string;
  seniorSupervisorName?: string;
  salesManagerName?: string;
  branchId?: string;
  branchName?: string;
  dataType?: string;
  promotionType?: string;
  priority: SupportPriority;
  attachments: AttachmentFile[];

  callResult?: string;
  satisfactionStatus?: SupportSatisfaction;
  completedAt?: string;

  transactions: SupportTransactionRow[];
  timeline: SupportTimelineStep[];
  status: SupportCaseStatus;
}

export type RequestStatus =
  | 'pending_approval'        // در انتظار تایید
  | 'returned'                // عودت داده شده / نیاز به اصلاح
  | 'approved_awaiting_payment_assignment' // تایید مالی نهایی شد، هنوز به هیچ مسئول پرداختی ارجاع نشده
  | 'approved_pending_payment'// ارجاع شده به یک مسئول پرداخت مشخص - در انتظار واریز
  | 'emergency_pending_payment' // ارجاع‌شده به مسیر پرداخت فوری (بدون تایید کامل زنجیره عادی)
  | 'paid'                    // واریز شده (دارای فیش)
  | 'completed'               // اتمام کار
  | 'cancelled'                // لغو شده توسط درخواست‌کننده (بایگانی می‌ماند، حذف فیزیکی نمی‌شود)
  | 'rejected';               // رد شده

export interface AttachmentFile {
  id: string;
  name: string;
  url: string; // Data URL or Image placeholder
  type: string;
  size: number;
  uploadedAt: string;
}

export interface RequestTimelineStep {
  id: string;
  actorId?: string;
  actorName: string;
  actorRole: string;
  action: 'submitted' | 'forwarded' | 'returned' | 'rejected' | 'approved' | 'paid' | 'completed' | 'commented' | 'undone'
    | 'referred_for_payment' | 'referred_for_emergency_payment' | 'emergency_paid' | 'cancelled'
    | 'cleanup_requested' | 'cleanup_approved';
  actionTitle: string;
  comment?: string;
  nextActorName?: string;
  timestamp: string;
  reverted?: boolean; // true if this approval/forward step was later undone by its actor
  amountCorrectionNote?: string; // set when the approver corrected the request amount during this step (old → new)
}

export interface RequestBatchItemChangeEntry {
  field: string;
  oldValue: string;
  newValue: string;
  byUserId: string;
  byName: string;
  at: string;
}

export interface RequestBatchItem {
  id: string;
  title: string;
  // amount stays as the row's live/current amount for backward compatibility with every
  // existing sum-over-batchItems call site; originalAmount/currentAmount are the new
  // audit-trail-friendly names — currentAmount is always kept equal to amount.
  amount: number;
  amountInWords: string;
  destinationName: string;
  destinationCard: string; // شماره کارت یا شبا ذینفع این ردیف
  status: 'pending' | 'approved' | 'rejected';
  decidedByUserId?: string;
  decidedByName?: string;
  decidedAt?: string;
  rejectionReason?: string;

  // Row-level correction audit trail (Business rule: approver may correct a row's amount
  // before approving it; every correction is recorded here, never silently overwritten).
  originalAmount?: number; // set once, at row creation — never changes afterward
  currentAmount?: number;  // mirrors `amount`; kept for explicit naming in new code paths
  amountCorrectedByUserId?: string;
  amountCorrectedByName?: string;
  amountCorrectedAt?: string;
  amountCorrectionReason?: string;
  changeHistory?: RequestBatchItemChangeEntry[];
}

export interface CostCenterAllocation {
  id: string;
  companyId: string;
  companyName: string;
  costCenterId: string;
  costCenterName: string;
  amount: number; // مبلغ تخصیص داده شده به این شرکت/مرکز هزینه (به ریال)
  description?: string; // بابت یا توضیح اختصاصی برای این مرکز هزینه
}

export interface PaymentRequest {
  id: string;
  trackingCode: string; // e.g. K50001, K50002
  title: string;
  requestType: RequestType;
  companyId: string;
  companyName: string;
  costCenterId: string;
  costCenterName: string;

  // تقسیم بین چند مرکز هزینه / چند شرکت
  isMultiCostCenter?: boolean;
  costCenterAllocations?: CostCenterAllocation[];

  amount: number; // in Rials
  amountInWords: string; // به حروف
  destinationCardNumber: string;
  destinationAccountName: string;
  destinationSheba?: string; // شماره شبا برای واریز گروهی پایا/ساتنا
  destinationBankName?: string; // نام بانک دریافت‌کننده
  vendorId?: string; // لینک به دفترچه ذینفعان
  vendorName?: string; // نام فروشنده مربوطه
  description: string;
  
  requestorId: string;
  requestorName: string;
  requestorPhone: string;
  
  currentApproverId: string;
  currentApproverName: string;
  currentApproverPhone?: string;
  
  status: RequestStatus;
  createdAt: string; // e.g. 1403/05/10 - 14:30
  updatedAt: string;
  
  initialAttachments: AttachmentFile[]; // تصاویر فاکتورها / صورت‌حساب
  paymentReceiptAttachment?: AttachmentFile; // عکس فیش واریزی
  
  timeline: RequestTimelineStep[];
  returnReason?: string;
  rejectionReason?: string;
  cancellationRequested?: boolean;
  cancellationReason?: string;
  delegatedToExecutorId?: string;
  delegatedToExecutorName?: string;

  // Set when this payment originated from an after-sales refund (خدمات پس از فروش)
  sourceSupportCaseId?: string;
  sourceSupportCaseTrackingCode?: string;
  sourceSupportTransactionId?: string;
  sourceCustomerName?: string;

  // Generic issuing-unit tracking (complements the support-case-specific quartet above,
  // does not replace it) — used by the treasury "مرجع صادرکننده" filter and by
  // src/utils/treasurySourceView.ts to build the minimal treasury-safe view of a request.
  sourceType?: 'support_refund' | 'sales_invoice' | 'manual';
  sourceUnitId?: string;
  sourceUnitName?: string;
  sourceReferenceId?: string;

  // ردیف‌های درخواست تجمیعی (چند فاکتور/ذینفع در یک درخواست)
  batchItems?: RequestBatchItem[];

  // Explicitly recorded when a payment was marked paid with no uploaded receipt image —
  // never a fake/placeholder image; the UI shows this flag instead of a photo.
  paidWithoutReceipt?: boolean;

  // --- مسیر پرداخت فوری (بدون تایید کامل زنجیره عادی) ---
  isEmergencyPayment?: boolean;
  emergencyReason?: string;
  emergencyReferredByUserId?: string;
  emergencyReferredByName?: string;
  emergencyReferredAt?: string;

  // --- لغو (وضعیت 'cancelled') — هرگز به معنای حذف فیزیکی از آرایه requests نیست ---
  cancelledByUserId?: string;
  cancelledByName?: string;
  cancelledAt?: string;

  // --- درخواست/تایید پاکسازی — فقط پرچم؛ در این فاز هیچ عملیاتی رکورد را فیزیکی حذف نمی‌کند ---
  cleanupRequested?: boolean;
  cleanupRequestedByUserId?: string;
  cleanupRequestedByName?: string;
  cleanupRequestedAt?: string;
  cleanupApproved?: boolean;
  cleanupApprovedByUserId?: string;
  cleanupApprovedByName?: string;
  cleanupApprovedAt?: string;
}

export interface WorkflowStepRule {
  id: string;
  stepName: string;
  approverUserId: string;
  approverName: string;
  approverRole: string;
  order: number;
  isDirectToTreasuryAllowed: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  timestamp: string;
  requestId?: string;
  requestTrackingCode?: string;
}

export interface SystemNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  requestId?: string;
  trackingCode?: string;
  colleagueId?: string; // if set, this notification is about a new direct message from this user
  isRead: boolean;
  createdAt: string;
}

export interface DirectMessageAttachment {
  name: string;
  mimeType: string;
  size: number; // bytes
  dataUrl: string; // base64 data URL
  isVoice?: boolean;
  durationSeconds?: number; // for voice notes
}

export interface DirectMessage {
  id: string;
  conversationId: string; // deterministic: [userIdA, userIdB].sort().join('__')
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  content: string; // may be empty if the message is attachment-only
  attachment?: DirectMessageAttachment;
  timestamp: string;
  readAt?: string | null;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected';
export type TaskPriority = 'normal' | 'urgent' | 'immediate';

export interface TaskLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  actionTitle: string;
  detail?: string;
  timestamp: string;
}

export interface TaskMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  letterNumber?: string;
  letterDate?: string;
  timestamp: string;
}

export interface AssignedTask {
  id: string;
  taskNumber: string; // e.g., T1001
  title: string;
  description: string;
  assignerId: string;
  assignerName: string;
  assignerRole: string;
  assigneeId: string;
  assigneeName: string;
  assigneeRole: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  letterNumber?: string;
  letterDate?: string;
  messages: TaskMessage[];
  logs: TaskLogEntry[];
}

// ============================================================
// ماژول فروش (گام اول): مشتری با قفل مالکیت پویا و دید سلسله‌مراتبی
// ============================================================

export interface CustomerActivityLogEntry {
  salespersonId: string;
  invoiceId?: string; // در فاز بعدی (فاکتور فروش) پر می‌شود؛ در این گام هنوز فاکتوری وجود ندارد
  startedAt: string;
  status: 'active' | 'completed';
}

export interface Customer {
  id: string;
  fullName?: string;
  phone1?: string; // کلید شناسایی یکتای مشتری در کل سیستم — اگر پر شود باید یکتا باشد؛ خودِ فیلد اجباری نیست
  phone2?: string;
  address?: string;
  province?: string;
  city?: string;
  postalCode?: string;
  createdAt: string;
  // تاریخچه‌ی کامل همه‌ی چرخه‌های فروش این مشتری با فروشندگان مختلف در طول زمان.
  // مالکیت فعلی مشتری (currentActiveSalespersonId) فیلد ذخیره‌شده نیست؛ از روی همین آرایه
  // با getCurrentActiveSalespersonId در src/utils/salesHierarchy.ts محاسبه می‌شود.
  activityLog?: CustomerActivityLogEntry[];
}

