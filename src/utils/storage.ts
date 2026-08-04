import { 
  User, Company, CompanyBankAccount, CostCenter, PaymentRequest, SystemNotification, 
  ChatMessage, WorkflowStepRule, SystemRole, Vendor, AssignedTask, VendorCategory, DirectMessage, SupportCase, UserRole, Letter 
} from '../types';
import { numberToPersianWords } from './numberToWords';

// Maps each base UserRole to its default SystemRole (used to look up the
// permission set that drives sidebar/page visibility) unless a user has an
// explicit roleId override (e.g. assigned to a custom role an admin created).
export const DEFAULT_ROLE_ID_MAP: Record<UserRole, string> = {
  admin: 'role_super_admin',
  approver: 'role_branch_approver',
  requestor: 'role_purchaser',
  treasury_executor: 'role_treasury_executor',
  support_agent: 'role_support_agent',
  financial_approver: 'role_financial_approver'
};

const STORAGE_KEYS = {
  USERS: 'shavaz_treasury_users_v2',
  ROLES: 'shavaz_treasury_roles_v2',
  COMPANIES: 'shavaz_treasury_companies_v2',
  COMPANY_BANK_ACCOUNTS: 'shavaz_treasury_company_bank_accounts_v1',
  COST_CENTERS: 'shavaz_treasury_cost_centers_v2',
  VENDORS: 'shavaz_treasury_vendors_v2',
  VENDOR_CATEGORIES: 'shavaz_treasury_vendor_categories_v1',
  REQUESTS: 'shavaz_treasury_requests_v2',
  NOTIFICATIONS: 'shavaz_treasury_notifications_v2',
  MESSAGES: 'shavaz_treasury_messages_v2',
  DIRECT_MESSAGES: 'shavaz_treasury_direct_messages_v1',
  SUPPORT_CASES: 'shavaz_treasury_support_cases_v1',
  LETTERS: 'shavaz_treasury_letters_v1',
  WORKFLOW: 'shavaz_treasury_workflow_v2',
  CURRENT_USER: 'shavaz_treasury_current_user_v2',
  REQUEST_COUNTER: 'shavaz_treasury_req_counter_v2',
  SUPPORT_CASE_COUNTER: 'shavaz_treasury_support_case_counter_v1',
  LETTER_COUNTER: 'shavaz_treasury_letter_counter_v1',
  TASKS: 'shavaz_treasury_tasks_v2'
};

// Default System Roles
export const DEFAULT_ROLES: SystemRole[] = [
  {
    id: 'role_super_admin',
    code: 'SUPER_ADMIN',
    name: 'مدیر ارشد کل (Super Admin)',
    description: 'دسترسی کامل به تمامی بخش‌های سیستم، مدیریت کاربران، نقش‌ها و تنظیمات مالی خزانه‌داری',
    isSystemRole: true,
    permissions: [
      'create_request', 'view_all_requests', 'view_branch_requests',
      'approve_branch_request', 'approve_treasury', 'execute_payment',
      'return_reject_request', 'manage_cost_centers', 'manage_companies',
      'manage_users', 'manage_roles', 'manage_vendors', 'export_archive',
      'export_bank_batch', 'view_analytics', 'manage_assigned_tasks',
      'manage_support_cases', 'financial_approve_support', 'view_support_reports', 'manage_letters'
    ]
  },
  {
    id: 'role_treasury_manager',
    code: 'TREASURY_MGR',
    name: 'مدیر خزانه‌داری (Treasury Manager)',
    description: 'تایید نهایی مبالغ، صدور دستور واریز بانکی، عودت فاکتورها و مشاهده گزارشات کامل',
    isSystemRole: true,
    permissions: [
      'create_request', 'view_all_requests', 'approve_treasury',
      'execute_payment', 'return_reject_request', 'manage_cost_centers', 'manage_vendors',
      'export_archive', 'export_bank_batch', 'view_analytics', 'view_support_reports'
    ]
  },
  {
    id: 'role_branch_approver',
    code: 'BRANCH_MGR',
    name: 'مدیر / سرپرست شعبه (Branch Manager)',
    description: 'بررسی و تایید اولیه درخواست‌های خریداران شعب اختصاصی تحت سرپرستی و ارجاع به خزانه‌داری',
    isSystemRole: true,
    permissions: [
      'create_request', 'view_branch_requests', 'approve_branch_request', 'return_reject_request',
      'manage_vendors', 'view_analytics'
    ]
  },
  {
    id: 'role_treasury_executor',
    code: 'BANK_EXEC',
    name: 'کارمند اجرای پرداخت (Bank Executor)',
    description: 'اجرای واریز بانکی پایا / کارت به کارت، آپلود فیش‌های واریزی و ثبت نهایی در سیستم',
    isSystemRole: true,
    permissions: [
      'view_all_requests', 'execute_payment', 'manage_vendors', 'export_archive', 'export_bank_batch'
    ]
  },
  {
    id: 'role_purchaser',
    code: 'PURCHASER',
    name: 'درخواست‌کننده / مسئول خرید شعب',
    description: 'ثبت درخواست جدید پرداخت فاکتور، آپلود مدرک و پیگیری روند تاییدیه خود',
    isSystemRole: true,
    permissions: [
      'create_request', 'view_branch_requests', 'manage_vendors'
    ]
  },
  {
    id: 'role_support_agent',
    code: 'SUPPORT_AGENT',
    name: 'کارشناس پشتیبانی و خدمات پس از فروش',
    description: 'ثبت پرونده‌های تماس مشتریان، پیگیری شکایات و ثبت درخواست عودت وجه جهت تایید مالی',
    isSystemRole: true,
    permissions: [
      'manage_support_cases'
    ]
  },
  {
    id: 'role_financial_approver',
    code: 'FINANCIAL_APPROVER',
    name: 'کارشناس تایید مالی (خدمات پس از فروش)',
    description: 'بررسی و تایید یا رد مبالغ عودتی ثبت‌شده توسط پشتیبانی، پیش از ارسال به کارتابل خزانه‌داری',
    isSystemRole: true,
    permissions: [
      'financial_approve_support'
    ]
  }
];

// Default Companies
export const DEFAULT_COMPANIES: Company[] = [
  { id: 'comp_mother', name: 'شرکت مادر', code: 'MTH', description: 'هلدینگ مرکزی و شرکت مادر' },
  { id: 'comp_shavaz', name: 'شرکت شاواز', code: 'SHV', description: 'تجارت الکترونیک و فروش آنلاین شاواز' },
  { id: 'comp_store', name: 'شرکت استور', code: 'STR', description: 'مدیریت استورها و انبارها' },
  { id: 'comp_sales', name: 'شرکت فروش', code: 'SLS', description: 'مدیریت شعبه‌ها و شبکه فروش' },
  { id: 'comp_maximum', name: 'شرکت ماکسیمم', code: 'MAX', description: 'خدمات لوجستیک ماکسیمم' },
  { id: 'comp_ibazar', name: 'شرکت آی بازار', code: 'IBZ', description: 'پلتفرم تجارت آی بازار' },
];

// Default Company Bank Accounts
export const DEFAULT_COMPANY_BANK_ACCOUNTS: CompanyBankAccount[] = [
  { id: 'cba_1', companyId: 'comp_mother', companyName: 'شرکت مادر', bankName: 'بانک ملی ایران', accountNumber: '0102938475001', shebaNumber: 'IR120170000000102938475001', cardNumber: '6037-9918-1000-2001', accountTitle: 'حساب اصلی خزانه‌داری هلدینگ مرکزی', isActive: true },
  { id: 'cba_2', companyId: 'comp_shavaz', companyName: 'شرکت شاواز', bankName: 'بانک ملت', accountNumber: '021983741002', shebaNumber: 'IR890120000000021983741002', cardNumber: '6104-3378-2000-3002', accountTitle: 'حساب درگاه فروش آنلاین شاواز', isActive: true },
  { id: 'cba_3', companyId: 'comp_shavaz', companyName: 'شرکت شاواز', bankName: 'بانک سامان', accountNumber: '031029382003', shebaNumber: 'IR540570000000031029382003', cardNumber: '6219-8610-3000-4003', accountTitle: 'حساب مسدودی درگاه پلتفرم شاواز', isActive: true },
  { id: 'cba_4', companyId: 'comp_store', companyName: 'شرکت استور', bankName: 'بانک پاسارگاد', accountNumber: '041029383004', shebaNumber: 'IR780560000000041029383004', cardNumber: '5022-2910-4000-5004', accountTitle: 'حساب خریدهای استور و انبارها', isActive: true },
  { id: 'cba_5', companyId: 'comp_sales', companyName: 'شرکت فروش', bankName: 'بانک تجارت', accountNumber: '051029384005', shebaNumber: 'IR180180000000051029384005', cardNumber: '6273-5310-5000-6005', accountTitle: 'حساب واریزی و فروش شعب', isActive: true },
  { id: 'cba_6', companyId: 'comp_maximum', companyName: 'شرکت ماکسیمم', bankName: 'بانک صادرات', accountNumber: '061029385006', shebaNumber: 'IR190190000000061029385006', cardNumber: '6037-6910-6000-7006', accountTitle: 'حساب لجستیک ماکسیمم', isActive: true },
  { id: 'cba_7', companyId: 'comp_ibazar', companyName: 'شرکت آی بازار', bankName: 'بانک پارسیان', accountNumber: '071029386007', shebaNumber: 'IR200200000000071029386007', cardNumber: '6221-0610-7000-8007', accountTitle: 'حساب درگاه پلتفرم آی بازار', isActive: true },
];

// Default Cost Centers (8 Sales Branches + Store + Central) with Monthly Budgets
export const DEFAULT_COST_CENTERS: CostCenter[] = [
  { id: 'cc_saadatabad', companyId: 'comp_sales', name: 'سعادت آباد', code: 'CC-101', description: 'شعبه فروش سعادت آباد', monthlyBudget: 500000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_poonak', companyId: 'comp_sales', name: 'پونک', code: 'CC-102', description: 'شعبه فروش پونک روز', monthlyBudget: 450000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_poonak_night', companyId: 'comp_sales', name: 'پونک شب', code: 'CC-103', description: 'شعبه فروش پونک شیفت شب', monthlyBudget: 350000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_mokhberi_1', companyId: 'comp_sales', name: 'مخبری یک', code: 'CC-104', description: 'شعبه فروش مخبری ۱', monthlyBudget: 300000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_mokhberi_4', companyId: 'comp_sales', name: 'مخبری چهار', code: 'CC-105', description: 'شعبه فروش مخبری ۴', monthlyBudget: 300000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_fakhar', companyId: 'comp_sales', name: 'فخار مقدم', code: 'CC-106', description: 'شعبه فروش فخار مقدم', monthlyBudget: 400000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_azadi', companyId: 'comp_sales', name: 'آزادی', code: 'CC-107', description: 'شعبه فروش آزادی', monthlyBudget: 400000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_store_branch', companyId: 'comp_store', name: 'استور (مرکز هزینه انبار و تجهیزات)', code: 'CC-201', description: 'مرکز هزینه استور و تجهیزات فروشگاهی', monthlyBudget: 1200000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_hq', companyId: 'comp_mother', name: 'دفتر مرکزی / عمومی', code: 'CC-001', description: 'مرکز هزینه ستادی دفتر مرکزی', monthlyBudget: 1500000000, budgetPeriod: 'مرداد ۱۴۰۳' },
];

// Default Vendors Directory
export const DEFAULT_VENDORS: Vendor[] = [
  {
    id: 'vendor_1',
    name: 'فروشگاه شوینده ملل (احمد حسینی)',
    category: 'شوینده و تنظیفات',
    nationalCode: '10103829102',
    economicCode: '411391829302',
    shebaNumber: 'IR120170000000109283740001',
    cardNumber: '6037-9918-2234-8891',
    accountNumber: '109283740001',
    bankName: 'بانک ملی ایران',
    accountHolderName: 'احمد حسینی',
    phone: '02188992211',
    address: 'تهران، خیابان ولیعصر، نرسیده به میدان ونک، پلاک ۱۴',
    totalPaid: 350000000,
    transactionCount: 4,
    notes: 'فروشنده اصلی مواد شوینده و بهداشتی شعب تهران'
  },
  {
    id: 'vendor_2',
    name: 'تجهیزات صنعتی و انبارداری البرز',
    category: 'تجهیزات انبار و فروشگاهی',
    nationalCode: '14002938101',
    economicCode: '411182736451',
    shebaNumber: 'IR890120000000021983746002',
    cardNumber: '6104-3378-9012-4455',
    accountNumber: '021983746002',
    bankName: 'بانک ملت',
    accountHolderName: 'شرکت تجهیزات البرز (مدیریت: رضایی)',
    phone: '02166554433',
    address: 'تهران، جاده قدیم کرج، خیابان فتح ۱۷',
    totalPaid: 850000000,
    transactionCount: 6,
    notes: 'تامین‌کننده قفسه، استند و تجهیزات انبار استور و شعب'
  },
  {
    id: 'vendor_3',
    name: 'تامین اقلام مصرفی و اداری ارمغان',
    category: 'ملزومات اداری و کاغذ',
    nationalCode: '10320491820',
    shebaNumber: 'IR540570000000031029384003',
    cardNumber: '5022-2910-4488-1200',
    accountNumber: '031029384003',
    bankName: 'بانک پاسارگاد',
    accountHolderName: 'مرتضی کریمی ارمغان',
    phone: '02177665544',
    address: 'تهران، خیابان انقلاب، خیابان بهار جنوبی',
    totalPaid: 180000000,
    transactionCount: 3,
    notes: 'تامین کننده زونکن، کاغذ A4 و ملزومات اداری ستاد'
  },
  {
    id: 'vendor_4',
    name: 'شرکت شبکه و خدمات فناوری پارس',
    category: 'خدمات IT و دوربین مداربسته',
    nationalCode: '10108877661',
    shebaNumber: 'IR780560000000041029384004',
    cardNumber: '6219-8610-3344-1212',
    accountNumber: '041029384004',
    bankName: 'بانک سامان',
    accountHolderName: 'شرکت فناوری اطلاعات پارس تک',
    phone: '02188102030',
    address: 'تهران، خیابان مطهری، خیابان میرعماد، پلاک ۸',
    totalPaid: 420000000,
    transactionCount: 2,
    notes: 'پشتیبانی شبکه، دوربین‌های امنیتی و نرم‌افزار صندوق شعب'
  }
];

// Default Vendor Categories (دسته‌بندی و زمینه فعالیت دفترچه ذینفعان)
export const DEFAULT_VENDOR_CATEGORIES: VendorCategory[] = [
  { id: 'vcat_cleaning', name: 'شوینده و تنظیفات' },
  { id: 'vcat_warehouse', name: 'تجهیزات انبار و فروشگاهی' },
  { id: 'vcat_office', name: 'ملزومات اداری و کاغذ' },
  { id: 'vcat_it', name: 'خدمات IT و دوربین مداربسته' },
  { id: 'vcat_payroll', name: 'پرسنل و حقوق' },
  { id: 'vcat_transport', name: 'حمل و نقل و لجستیک' },
  { id: 'vcat_utilities', name: 'قبوض و خدمات شهری' },
  { id: 'vcat_other', name: 'سایر' },
];

// Sample placeholder receipt images (SVG/Data URLs for clear visualization)
const SAMPLE_INVOICE_IMG = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80';
const SAMPLE_BANK_RECEIPT_IMG = 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80';

// Default Users (Admin + Treasury + Approver + Requestors)
export const DEFAULT_USERS: User[] = [
  {
    id: 'user_admin_reza',
    username: 'admin',
    fullName: 'رضا بیات (مدیر ارشد خزانه‌داری)',
    phone: '09330297784',
    email: 'rbayat2k@gmail.com',
    role: 'admin',
    roleTitle: 'مدیر کل خزانه‌داری و ادمین',
    companyId: 'comp_mother',
    costCenterId: 'cc_hq',
    allowedCostCenterIds: ['cc_hq', 'cc_saadatabad', 'cc_poonak', 'cc_mokhberi_1', 'cc_mokhberi_4', 'cc_azadi', 'cc_fakhar'],
    isActive: true,
    password: '123456',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    allowedApproverIds: ['user_admin_reza', 'user_treasury_exec', 'user_approver_sales'],
    approvalChain: ['user_admin_reza', 'user_treasury_exec'],
    allowDirectToTreasury: true,
    isSeniorTreasurySupervisor: true,
    canIssueTasks: true,
    canExecuteTasks: true,
    workflowNote: 'ادمین ارشد سیستم با اختیارات کامل جهت صدور دستور پرداخت و ارسال مستقیم به واریز'
  },
  {
    id: 'user_treasury_exec',
    username: 'treasury',
    fullName: 'امیرحسین رضایی (کارمند اجرای پرداخت)',
    phone: '09121112233',
    email: 'rezaei@shavaz.com',
    role: 'treasury_executor',
    roleTitle: 'کارشناس صدور چک و واریز بانکی',
    companyId: 'comp_mother',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    allowedApproverIds: ['user_admin_reza'],
    approvalChain: ['user_admin_reza', 'user_treasury_exec'],
    allowDirectToTreasury: true,
    canIssueTasks: true,
    canExecuteTasks: true,
    workflowNote: 'مجری عملیات پرداخت بانکی و آپلود فیش‌های پایا / کارت‌به‌کارت'
  },
  {
    id: 'user_approver_sales',
    username: 'manager_sales',
    fullName: 'مهندس احمدی (مدیر فروش شعب)',
    phone: '09123456789',
    email: 'ahmadi@shavaz.com',
    role: 'approver',
    roleTitle: 'سرپرست تایید شعب فروش',
    companyId: 'comp_sales',
    costCenterId: 'cc_saadatabad',
    allowedCostCenterIds: ['cc_saadatabad', 'cc_poonak', 'cc_mokhberi_1', 'cc_mokhberi_4'],
    password: '123456',
    isActive: true,
    allowedApproverIds: ['user_admin_reza', 'user_treasury_exec'],
    approvalChain: ['user_approver_sales', 'user_admin_reza', 'user_treasury_exec'],
    allowDirectToTreasury: true,
    canIssueTasks: true,
    canExecuteTasks: true,
    workflowNote: 'تاییدکننده اول درخواست‌های شعب فروش و ارجاع‌دهنده به خزانه‌داری مرکز'
  },
  {
    id: 'user_requestor_poonak',
    username: 'user_poonak',
    fullName: 'علی محمدی (مسئول خرید شعبه پونک)',
    phone: '09129876543',
    email: 'mohammadi@shavaz.com',
    role: 'requestor',
    roleTitle: 'درخواست‌کننده و مسئول خرید شعبه',
    companyId: 'comp_sales',
    costCenterId: 'cc_poonak',
    password: '123456',
    isActive: true,
    allowedApproverIds: ['user_approver_sales', 'user_admin_reza'],
    approvalChain: ['user_approver_sales', 'user_admin_reza', 'user_treasury_exec'],
    allowDirectToTreasury: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'مسئول خرید شعبه پونک با امکان ارسال به مهندس احمدی یا مستقیم به رضا بیات'
  },
  {
    id: 'user_support_sara',
    username: 'support',
    fullName: 'سارا کریمی (کارشناس پشتیبانی)',
    phone: '09121230001',
    email: 'karimi.support@shavaz.com',
    role: 'support_agent',
    roleId: 'role_support_agent',
    roleTitle: 'کارشناس خدمات پس از فروش و پشتیبانی',
    companyId: 'comp_sales',
    costCenterId: 'cc_saadatabad',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'ثبت‌کننده پرونده‌های تماس مشتریان و درخواست عودت وجه'
  },
  {
    id: 'user_finance_narges',
    username: 'finance_approve',
    fullName: 'نرگس صالحی (کارشناس تایید مالی)',
    phone: '09121230002',
    email: 'salehi.finance@shavaz.com',
    role: 'financial_approver',
    roleId: 'role_financial_approver',
    roleTitle: 'کارشناس تایید مالی خدمات پس از فروش',
    companyId: 'comp_mother',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'بررسی و تایید یا رد مبالغ عودتی ثبت‌شده توسط پشتیبانی'
  }
];

// Initial Workflow Setup
export const DEFAULT_WORKFLOW: WorkflowStepRule[] = [
  { id: 'wf_1', stepName: 'درخواست‌کننده اولیه', approverUserId: 'user_requestor_poonak', approverName: 'علی محمدی', approverRole: 'ثبت درخواست اولیه و آپلود فاکتور', order: 1, isDirectToTreasuryAllowed: true },
  { id: 'wf_2', stepName: 'مدیر تایید واحد/شعبه', approverUserId: 'user_approver_sales', approverName: 'مهندس احمدی', approverRole: 'تایید اول واحد عملیات', order: 2, isDirectToTreasuryAllowed: true },
  { id: 'wf_3', stepName: 'تایید نهایی خزانه‌داری', approverUserId: 'user_admin_reza', approverName: 'رضا بیات', approverRole: 'تایید نهایی و اختصاص بودجه', order: 3, isDirectToTreasuryAllowed: true },
  { id: 'wf_4', stepName: 'کارمند اجرای پرداخت', approverUserId: 'user_treasury_exec', approverName: 'امیرحسین رضایی', approverRole: 'پرداخت بانکی و آپلود فیش واریزی', order: 4, isDirectToTreasuryAllowed: false },
];

// Default Initial Sample Requests
export const DEFAULT_REQUESTS: PaymentRequest[] = [
  {
    id: 'req_10001',
    trackingCode: 'K50001',
    title: 'پرداخت اقلام مصرفی و تنظیفات شعبه پونک شب',
    requestType: 'current_payment',
    companyId: 'comp_sales',
    companyName: 'شرکت فروش',
    costCenterId: 'cc_poonak_night',
    costCenterName: 'پونک شب',
    amount: 125000000, // 125,000,000 Rials
    amountInWords: numberToPersianWords(125000000),
    destinationCardNumber: '6037-9918-2234-8891',
    destinationAccountName: 'فروشگاه شوینده ملل (صاحب حساب: احمد حسینی)',
    description: 'خرید شوینده و کیسه زباله و اقلام مصرفی ماهانه شعبه فروش پونک شب طبق فاکتور ضمیمه شده.',
    requestorId: 'user_requestor_poonak',
    requestorName: 'علی محمدی (مسئول خرید شعبه پونک)',
    requestorPhone: '09129876543',
    currentApproverId: 'user_admin_reza',
    currentApproverName: 'رضا بیات (مدیر ارشد خزانه‌داری)',
    currentApproverPhone: '09330297784',
    status: 'approved_pending_payment',
    createdAt: '1403/05/08 - 10:15',
    updatedAt: '1403/05/09 - 11:30',
    initialAttachments: [
      {
        id: 'att_inv_1',
        name: 'فاکتور_خرید_اقلام_تنظیفات.jpg',
        url: SAMPLE_INVOICE_IMG,
        type: 'image/jpeg',
        size: 1420000,
        uploadedAt: '1403/05/08 - 10:15'
      }
    ],
    timeline: [
      { id: 'tl_1', actorName: 'علی محمدی', actorRole: 'درخواست‌کننده', action: 'submitted', actionTitle: 'ثبت درخواست پرداخت', timestamp: '1403/05/08 - 10:15', comment: 'فاکتورهای رسمی و مهر شده پیوست شد.' },
      { id: 'tl_2', actorName: 'مهندس احمدی', actorRole: 'مدیر فروش شعب', action: 'forwarded', actionTitle: 'تایید اولیه و ارجاع به خزانه‌داری', nextActorName: 'رضا بیات', timestamp: '1403/05/08 - 14:20', comment: 'با اقلام فوق موافقت گردید.' },
      { id: 'tl_3', actorName: 'رضا بیات', actorRole: 'مدیر خزانه‌داری', action: 'approved', actionTitle: 'تایید نهایی خزانه‌داری و صدور دستور پرداخت', nextActorName: 'امیرحسین رضایی', timestamp: '1403/05/09 - 11:30', comment: 'تایید شد. جهت واریز به کارمند اجرا ارجاع گردد.' }
    ]
  },
  {
    id: 'req_10002',
    trackingCode: 'K50002',
    title: 'درخواست مساعده حقوق پرسنل شعبه سعادت آباد',
    requestType: 'advance_payment',
    companyId: 'comp_sales',
    companyName: 'شرکت فروش',
    costCenterId: 'cc_saadatabad',
    costCenterName: 'سعادت آباد',
    amount: 100000000, // 100,000,000 Rials (10 Million Tomans)
    amountInWords: numberToPersianWords(100000000),
    destinationCardNumber: '6219-8610-3344-1212',
    destinationAccountName: 'رضا بیات',
    description: 'درخواست مساعده میان‌ماه پرسنل شعبه سعادت آباد طبق درخواست کتبی امضا شده.',
    requestorId: 'user_admin_reza',
    requestorName: 'رضا بیات',
    requestorPhone: '09330297784',
    currentApproverId: 'user_treasury_exec',
    currentApproverName: 'امیرحسین رضایی (کارمند اجرای پرداخت)',
    currentApproverPhone: '09121112233',
    status: 'paid',
    createdAt: '1403/05/06 - 09:00',
    updatedAt: '1403/05/06 - 15:45',
    initialAttachments: [
      {
        id: 'att_inv_2',
        name: 'فرم_امضا_شده_مساعده.jpg',
        url: SAMPLE_INVOICE_IMG,
        type: 'image/jpeg',
        size: 980000,
        uploadedAt: '1403/05/06 - 09:00'
      }
    ],
    paymentReceiptAttachment: {
      id: 'att_receipt_1',
      name: 'فیش_واریزی_پایا_مساعده.jpg',
      url: SAMPLE_BANK_RECEIPT_IMG,
      type: 'image/jpeg',
      size: 1100000,
      uploadedAt: '1403/05/06 - 15:45'
    },
    timeline: [
      { id: 'tl_4', actorName: 'رضا بیات', actorRole: 'مدیر خزانه‌داری', action: 'submitted', actionTitle: 'ثبت درخواست مساعده', timestamp: '1403/05/06 - 09:00' },
      { id: 'tl_5', actorName: 'رضا بیات', actorRole: 'مدیر خزانه‌داری', action: 'approved', actionTitle: 'تایید و ارسال مستقیم به واریز', nextActorName: 'امیرحسین رضایی', timestamp: '1403/05/06 - 10:00' },
      { id: 'tl_6', actorName: 'امیرحسین رضایی', actorRole: 'کارمند اجرا', action: 'paid', actionTitle: 'واریز بانکی انجام شد و فیش آپلود گردید', timestamp: '1403/05/06 - 15:45', comment: 'کد پیگیری پایا: 88273921' }
    ]
  },
  {
    id: 'req_10003',
    trackingCode: 'K50003',
    title: 'درخواست صورت‌حساب و اطلاعات فاکتورهای ۱۰ نفر پرسنل شرکت استور',
    requestType: 'info_request',
    companyId: 'comp_store',
    companyName: 'شرکت استور',
    costCenterId: 'cc_store_branch',
    costCenterName: 'استور (مرکز هزینه انبار و تجهیزات)',
    amount: 350000000, // 350,000,000 Rials
    amountInWords: numberToPersianWords(350000000),
    destinationCardNumber: '5892-1011-4567-9000',
    destinationAccountName: 'حساب گروهی خریدهای استور',
    description: 'درخواست آپلود فایل صورت‌حساب ترکیبی ۱۰ نفر خریدار تجهیزات انبار شاواز جهت بررسی خزانه‌داری.',
    requestorId: 'user_requestor_poonak',
    requestorName: 'علی محمدی',
    requestorPhone: '09129876543',
    currentApproverId: 'user_admin_reza',
    currentApproverName: 'رضا بیات (مدیر ارشد خزانه‌داری)',
    currentApproverPhone: '09330297784',
    status: 'pending_approval',
    createdAt: '1403/05/10 - 08:30',
    updatedAt: '1403/05/10 - 08:30',
    initialAttachments: [
      {
        id: 'att_inv_3',
        name: 'لیست_لیست_۱۰_نفر_صورتحساب.xlsx',
        url: SAMPLE_INVOICE_IMG,
        type: 'image/jpeg',
        size: 512000,
        uploadedAt: '1403/05/10 - 08:30'
      }
    ],
    timeline: [
      { id: 'tl_7', actorName: 'علی محمدی', actorRole: 'مسئول خرید', action: 'submitted', actionTitle: 'ثبت درخواست اطلاعات صورت‌حساب', timestamp: '1403/05/10 - 08:30', comment: 'اطلاعات ۱۰ صورت‌حساب قرار داده شد.' }
    ]
  }
];

// Initial Chat Messages
export const DEFAULT_MESSAGES: ChatMessage[] = [
  { id: 'msg_1', senderId: 'user_admin_reza', senderName: 'رضا بیات', senderRole: 'مدیر خزانه‌داری', content: 'سلام همکاران گرامی. لطفاً تمامی درخواست‌های پرداخت بالای ۵۰ میلیون تومان را همراه با فایل صورت‌حساب و مهر شعبه ثبت بفرمایید.', timestamp: '1403/05/08 - 09:00' },
  { id: 'msg_2', senderId: 'user_requestor_poonak', senderName: 'علی محمدی', senderRole: 'مسئول خرید', content: 'سلام آقای بیات. درخواست شعبه پونک شب با کد K50001 ثبت شد و فاکتورها آپلود گردید.', timestamp: '1403/05/08 - 10:20', requestId: 'req_10001', requestTrackingCode: 'K50001' },
  { id: 'msg_3', senderId: 'user_treasury_exec', senderName: 'امیرحسین رضایی', senderRole: 'کارمند اجرا', content: 'فیش‌های واریز تمام درخواست‌های تایید شده در سیستم آپلود شده است.', timestamp: '1403/05/09 - 16:00' }
];

// Initial Notifications
export const DEFAULT_NOTIFICATIONS: SystemNotification[] = [
  { id: 'notif_1', userId: 'user_admin_reza', title: 'درخواست جدید نیازمند تایید', message: 'درخواست K50001 مربوط به شرکت فروش در انتظار بررسی شماست.', requestId: 'req_10001', trackingCode: 'K50001', isRead: false, createdAt: '1403/05/08 - 10:15' },
  { id: 'notif_2', userId: 'user_requestor_poonak', title: 'واریز انجام شد', message: 'پرداخت درخواست K50002 انجام گردید و فیش واریز آپلود شد.', requestId: 'req_10002', trackingCode: 'K50002', isRead: true, createdAt: '1403/05/06 - 15:45' }
];

// Initial Assigned Tasks
export const DEFAULT_TASKS: AssignedTask[] = [
  {
    id: 'task_1',
    taskNumber: 'T1001',
    title: 'ارسال و ثبت فاکتورهای خریدهای خرد شعبه سعادت‌آباد',
    description: 'لطفاً فاکتورهای مربوط به خرید ملزومات مصرفی مردادماه شعبه سعادت‌آباد را تا فردا ظهر اسکن نموده و در سیستم بارگذاری فرمایید.',
    assignerId: 'user_admin_reza',
    assignerName: 'رضا بیات',
    assignerRole: 'مدیر خزانه‌داری',
    assigneeId: 'user_approver_saadatabad',
    assigneeName: 'امیر صفی آریان',
    assigneeRole: 'مدیر شعبه سعادت‌آباد',
    priority: 'urgent',
    status: 'in_progress',
    dueDate: '۱۴۰۳/۰۵/۱۲',
    createdAt: '۱۴۰۳/۰۵/۱۰ - ۰۹:۳۰',
    updatedAt: '۱۴۰۳/۰۵/۱۰ - ۱۰:۱۵',
    letterNumber: '۱۰۱/۱۴۰۳/ش',
    letterDate: '۱۴۰۳/۰۵/۱۰',
    messages: [
      {
        id: `msg_t1_1`,
        senderId: 'user_admin_reza',
        senderName: 'رضا بیات',
        senderRole: 'مدیر خزانه‌داری',
        content: 'جناب صفی آریان با سلام، فاکتورهای اصلاحی خریدهای اخیر شعبه ارسال گردد.',
        letterNumber: '۱۰۱/۱۴۰۳/ش',
        timestamp: '۱۴۰۳/۰۵/۱۰ - ۰۹:۳۰'
      },
      {
        id: `msg_t1_2`,
        senderId: 'user_approver_saadatabad',
        senderName: 'امیر صفی آریان',
        senderRole: 'مدیر شعبه سعادت‌آباد',
        content: 'سلام جناب بیات. فاکتورها آماده شده و تا یک ساعت دیگر آپلود می‌شود.',
        timestamp: '۱۴۰۳/۰۵/۱۰ - ۱۰:۱۵'
      }
    ],
    logs: [
      {
        id: 'log_t1_1',
        actorId: 'user_admin_reza',
        actorName: 'رضا بیات',
        actorRole: 'مدیر خزانه‌داری',
        actionTitle: 'ایجاد و ارجاع دستور کار جدید',
        detail: 'ابلاغ به امیر صفی آریان',
        timestamp: '۱۴۰۳/۰۵/۱۰ - ۰۹:۳۰'
      },
      {
        id: 'log_t1_2',
        actorId: 'user_approver_saadatabad',
        actorName: 'امیر صفی آریان',
        actorRole: 'مدیر شعبه سعادت‌آباد',
        actionTitle: 'تغییر وضعیت کار: شروع به انجام کار',
        timestamp: '۱۴۰۳/۰۵/۱۰ - ۱۰:۱۵'
      }
    ]
  }
];

// LocalStorage Helper Methods
export function getStoredData<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Error reading ${key} from localStorage`, e);
    return defaultValue;
  }
}

export function setStoredData<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing ${key} to localStorage`, e);
  }
}

// Global App Storage Accessors
export const storage = {
  getUsers(): User[] {
    return getStoredData(STORAGE_KEYS.USERS, DEFAULT_USERS);
  },
  saveUsers(users: User[]): void {
    setStoredData(STORAGE_KEYS.USERS, users);
  },

  getRoles(): SystemRole[] {
    return getStoredData(STORAGE_KEYS.ROLES, DEFAULT_ROLES);
  },
  saveRoles(roles: SystemRole[]): void {
    setStoredData(STORAGE_KEYS.ROLES, roles);
  },
  
  getCompanies(): Company[] {
    return getStoredData(STORAGE_KEYS.COMPANIES, DEFAULT_COMPANIES);
  },
  saveCompanies(companies: Company[]): void {
    setStoredData(STORAGE_KEYS.COMPANIES, companies);
  },

  getCompanyBankAccounts(): CompanyBankAccount[] {
    return getStoredData(STORAGE_KEYS.COMPANY_BANK_ACCOUNTS, DEFAULT_COMPANY_BANK_ACCOUNTS);
  },
  saveCompanyBankAccounts(accounts: CompanyBankAccount[]): void {
    setStoredData(STORAGE_KEYS.COMPANY_BANK_ACCOUNTS, accounts);
  },
  
  getCostCenters(): CostCenter[] {
    return getStoredData(STORAGE_KEYS.COST_CENTERS, DEFAULT_COST_CENTERS);
  },
  saveCostCenters(centers: CostCenter[]): void {
    setStoredData(STORAGE_KEYS.COST_CENTERS, centers);
  },

  getVendors(): Vendor[] {
    return getStoredData(STORAGE_KEYS.VENDORS, DEFAULT_VENDORS);
  },
  saveVendors(vendors: Vendor[]): void {
    setStoredData(STORAGE_KEYS.VENDORS, vendors);
  },

  getVendorCategories(): VendorCategory[] {
    return getStoredData(STORAGE_KEYS.VENDOR_CATEGORIES, DEFAULT_VENDOR_CATEGORIES);
  },
  saveVendorCategories(categories: VendorCategory[]): void {
    setStoredData(STORAGE_KEYS.VENDOR_CATEGORIES, categories);
  },

  getDirectMessages(): DirectMessage[] {
    return getStoredData(STORAGE_KEYS.DIRECT_MESSAGES, []);
  },
  saveDirectMessages(messages: DirectMessage[]): void {
    setStoredData(STORAGE_KEYS.DIRECT_MESSAGES, messages);
  },

  getSupportCases(): SupportCase[] {
    return getStoredData(STORAGE_KEYS.SUPPORT_CASES, []);
  },
  saveSupportCases(cases: SupportCase[]): void {
    setStoredData(STORAGE_KEYS.SUPPORT_CASES, cases);
  },

  getLetters(): Letter[] {
    return getStoredData(STORAGE_KEYS.LETTERS, []);
  },
  saveLetters(letters: Letter[]): void {
    setStoredData(STORAGE_KEYS.LETTERS, letters);
  },
  
  getRequests(): PaymentRequest[] {
    return getStoredData(STORAGE_KEYS.REQUESTS, DEFAULT_REQUESTS);
  },
  saveRequests(requests: PaymentRequest[]): void {
    setStoredData(STORAGE_KEYS.REQUESTS, requests);
  },

  getWorkflow(): WorkflowStepRule[] {
    return getStoredData(STORAGE_KEYS.WORKFLOW, DEFAULT_WORKFLOW);
  },
  saveWorkflow(wf: WorkflowStepRule[]): void {
    setStoredData(STORAGE_KEYS.WORKFLOW, wf);
  },

  getNotifications(userId?: string): SystemNotification[] {
    const all = getStoredData(STORAGE_KEYS.NOTIFICATIONS, DEFAULT_NOTIFICATIONS);
    if (userId) {
      return all.filter(n => n.userId === userId || n.userId === 'all');
    }
    return all;
  },
  saveNotifications(notifs: SystemNotification[]): void {
    setStoredData(STORAGE_KEYS.NOTIFICATIONS, notifs);
  },

  getMessages(): ChatMessage[] {
    return getStoredData(STORAGE_KEYS.MESSAGES, DEFAULT_MESSAGES);
  },
  saveMessages(msgs: ChatMessage[]): void {
    setStoredData(STORAGE_KEYS.MESSAGES, msgs);
  },

  getTasks(): AssignedTask[] {
    return getStoredData(STORAGE_KEYS.TASKS, DEFAULT_TASKS);
  },
  saveTasks(tasks: AssignedTask[]): void {
    setStoredData(STORAGE_KEYS.TASKS, tasks);
  },

  getCurrentUser(): User | null {
    const user = getStoredData<User | null>(STORAGE_KEYS.CURRENT_USER, null);
    if (!user) {
      // Default auto-login to Reza Bayat (Admin)
      return DEFAULT_USERS[0];
    }
    return user;
  },
  setCurrentUser(user: User | null): void {
    setStoredData(STORAGE_KEYS.CURRENT_USER, user);
  },

  getAndIncrementCounter(): number {
    const current = getStoredData(STORAGE_KEYS.REQUEST_COUNTER, 4);
    setStoredData(STORAGE_KEYS.REQUEST_COUNTER, current + 1);
    return current;
  },

  getAndIncrementSupportCounter(): number {
    const current = getStoredData(STORAGE_KEYS.SUPPORT_CASE_COUNTER, 0);
    setStoredData(STORAGE_KEYS.SUPPORT_CASE_COUNTER, current + 1);
    return current;
  },

  getAndIncrementLetterCounter(): number {
    const current = getStoredData(STORAGE_KEYS.LETTER_COUNTER, 0);
    setStoredData(STORAGE_KEYS.LETTER_COUNTER, current + 1);
    return current;
  }
};
