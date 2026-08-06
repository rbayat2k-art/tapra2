import React, { useState } from 'react';
import { SystemRole, SystemPermission, User } from '../types';
import { DEFAULT_ROLE_ID_MAP } from '../utils/storage';
import {
  ShieldCheck, ShieldPlus, KeyRound, Users, Edit2,
  Trash2, CheckCircle2, Lock, Sparkles, Check, X, ShieldAlert
} from 'lucide-react';

// A user counts toward a role if it's their explicit roleId, an additionalRoleIds entry, or
// (for accounts predating the multi-role model) the DEFAULT_ROLE_ID_MAP fallback for their
// base UserRole — never a fragile roleTitle string match.
const userHasRole = (u: User, roleId: string): boolean =>
  u.roleId === roleId ||
  (u.additionalRoleIds || []).includes(roleId) ||
  (!u.roleId && DEFAULT_ROLE_ID_MAP[u.role] === roleId);

interface RolesAndPermissionsViewProps {
  roles: SystemRole[];
  users: User[];
  currentUser: User | null;
  onUpdateRoles: (updatedRoles: SystemRole[]) => void;
}

export const ALL_PERMISSIONS: { key: SystemPermission; title: string; category: string; description: string }[] = [
  // Request Operations
  { key: 'create_request', title: 'ثبت درخواست جدید', category: 'عملیات درخواست‌ها', description: 'امکان ایجاد و ارسال فاکتور و درخواست پرداخت جدید' },
  { key: 'view_all_requests', title: 'مشاهده تمامی درخواست‌های کل سازمان', category: 'عملیات درخواست‌ها', description: 'دسترسی کامل به بایگانی و کارتابل کل شرکت‌ها و شعب' },
  { key: 'view_branch_requests', title: 'مشاهده درخواست‌های شعب مجاز', category: 'عملیات درخواست‌ها', description: 'دسترسی محدود فقط به درخواست‌های شعب تحت سرپرستی کاربر' },
  
  // Approval & Treasury
  { key: 'approve_branch_request', title: 'تایید اولیه سرپرست / مدیر شعبه', category: 'تایید و واریز مالی', description: 'بررسی اولویت و تایید فاکتور خریداران شعب' },
  { key: 'approve_treasury', title: 'تایید نهایی و تخصیص بودجه خزانه‌داری', category: 'تایید و واریز مالی', description: 'تایید مبلغ توسط رضا بیات (مدیر خزانه‌داری)' },
  { key: 'execute_payment', title: 'اجرای واریز بانکی و آپلود فیش', category: 'تایید و واریز مالی', description: 'صدور واریز پایا/کارت‌به‌کارت و آپلود فیش تسویه' },
  { key: 'return_reject_request', title: 'عودت / رد درخواست‌های دارای اشکال', category: 'تایید و واریز مالی', description: 'امکان برگشت به متقاضی جهت اصلاح یا لغو سفارش' },

  // Management & Config
  { key: 'manage_cost_centers', title: 'مدیریت شعب و مراکز هزینه', category: 'مدیریت و پیکربندی', description: 'تعریف شعبه جدید، کدینگ و تخصیص بودجه' },
  { key: 'manage_companies', title: 'مدیریت شرکت‌های هلدینگ شاواز', category: 'مدیریت و پیکربندی', description: 'افزودن و ویرایش شرکت‌های زیرمجموعه' },
  { key: 'manage_users', title: 'مدیریت کاربران و کلمه عبور', category: 'مدیریت و پیکربندی', description: 'افزودن کاربر جدید، غیرفعالسازی و تغییر رمز' },
  { key: 'manage_roles', title: 'مدیریت نقش‌ها و ماتریس دسترسی‌ها', category: 'مدیریت و پیکربندی', description: 'تعریف نقش‌های شغلی جدید و تغییر سطح دسترسی' },
  { key: 'manage_vendors', title: 'مدیریت دفترچه ذینفعان و دسته‌بندی‌ها', category: 'مدیریت و پیکربندی', description: 'افزودن/ویرایش ذینفعان، و مدیریت دسته‌بندی‌های دفترچه (فقط ادمین)' },

  // After-sales service & complaints
  { key: 'manage_support_cases', title: 'ثبت و پیگیری پرونده‌های خدمات پس از فروش', category: 'خدمات پس از فروش و شکایات', description: 'ثبت تماس مشتری، شکایت و درخواست عودت وجه توسط پشتیبانی' },
  { key: 'financial_approve_support', title: 'تایید مالی مبالغ عودتی پشتیبانی', category: 'خدمات پس از فروش و شکایات', description: 'بررسی و تایید/رد/نیاز اصلاح هر ردیف تراکنش پیش از ارسال به خزانه' },
  { key: 'view_support_reports', title: 'گزارش‌گیری پیشرفته خدمات پس از فروش', category: 'خدمات پس از فروش و شکایات', description: 'مشاهده و خروجی گزارش کامل همه پرونده‌ها با فیلتر پیشرفته (ادمین)' },

  // Internal correspondence (نامه‌نگاری داخلی)
  { key: 'manage_letters', title: 'دسترسی به سامانه نامه‌نگاری داخلی', category: 'نامه‌نگاری داخلی (دبیرخانه)', description: 'ثبت نامه جدید، ارجاع، پاسخ و پیگیری مکاتبات با واحدهای دیگر' },

  // Reports & Archive
  { key: 'export_archive', title: 'خروجی اکسل و گزارش‌گیری پیشرفته', category: 'گزارشات و بایگانی', description: 'دانلود خروجی جامع اکسل و پرینت فرم‌های پرداخت' },
  { key: 'export_bank_batch', title: 'خروجی فایل پرداخت گروهی بانکی', category: 'گزارشات و بایگانی', description: 'تولید فایل دسته‌ای پایا/ساتنا جهت ارسال به سامانه بانکی' },
  { key: 'view_analytics', title: 'مشاهده نمودارها و داشبورد مدیریتی', category: 'گزارشات و بایگانی', description: 'تحلیل آمار و مانده اعتبارات خزانه‌داری' },
  { key: 'manage_assigned_tasks', title: 'مدیریت و دسترسی به کارهای محوله و دستورات اداری', category: 'دستورات اداری و کارهای محوله', description: 'امکان ارجاع کار بین کاربران، چت، ارسال نامه و تاییدیه انجام' },

  // Security & Impersonation
  { key: 'impersonate_users', title: 'ورود به حساب سایر کاربران (Impersonation)', category: 'امنیت و Impersonation', description: 'فقط برای هویت واقعی ادمین معنا دارد؛ نشست تودرتو مجاز نیست و در Audit Log ثبت می‌شود' },

  // Payment referral (normal + emergency)
  { key: 'refer_for_payment', title: 'ارجاع درخواست آماده به یک مسئول پرداخت مشخص', category: 'تایید و واریز مالی', description: 'پس از تایید نهایی، انتخاب صریح مسئول پرداخت (بدون انتخاب خودکار)' },
  { key: 'refer_for_emergency_payment', title: 'ارجاع به مسیر پرداخت فوری', category: 'تایید و واریز مالی', description: 'ارجاع به فرد دیگر با ذکر دلیل اجباری؛ خودارجاعی ممنوع' },
  { key: 'execute_emergency_payment', title: 'اجرای پرداخت فوری', category: 'تایید و واریز مالی', description: 'فقط توسط فردی که پرداخت فوری صراحتاً به او ارجاع شده است' },

  // Sales organization — customer-facing
  { key: 'sales_access', title: 'دسترسی پایه به ماژول فروش', category: 'سازمان فروش — مشتریان', description: 'ورود به بخش مشتریان و فاکتور فروش' },
  { key: 'view_own_customers', title: 'مشاهده مشتریان خودم', category: 'سازمان فروش — مشتریان', description: 'مشتریانی که خودِ کاربر با آن‌ها کار کرده' },
  { key: 'view_team_customers', title: 'مشاهده مشتریان زیرمجموعه مستقیم', category: 'سازمان فروش — مشتریان', description: 'دید سرپرست روی فروشندگان تحت نظارت مستقیم' },
  { key: 'view_descendant_customers', title: 'مشاهده مشتریان کل زیردرخت سازمانی', category: 'سازمان فروش — مشتریان', description: 'دید کامل زیرشاخه سازمانی فروش' },
  { key: 'search_customer_by_phone', title: 'جستجوی سراسری مشتری با شماره تماس', category: 'سازمان فروش — مشتریان', description: 'جستجوی مشتری در کل بانک مشتریان با شماره تماس' },
  { key: 'create_customer', title: 'ثبت مشتری جدید', category: 'سازمان فروش — مشتریان', description: 'ایجاد رکورد مشتری جدید' },
  { key: 'edit_customer_basic_info', title: 'ویرایش اطلاعات پایه مشتری', category: 'سازمان فروش — مشتریان', description: 'ویرایش نام، آدرس و اطلاعات پایه' },
  { key: 'view_customer_contact_fields', title: 'مشاهده شماره تماس مشتری', category: 'سازمان فروش — مشتریان', description: 'دسترسی به فیلدهای تماس مشتری' },
  { key: 'view_customer_address', title: 'مشاهده آدرس مشتری', category: 'سازمان فروش — مشتریان', description: 'دسترسی به آدرس ثبت‌شده مشتری' },
  { key: 'view_customer_purchase_history', title: 'مشاهده تاریخچه خرید مشتری', category: 'سازمان فروش — مشتریان', description: 'دسترسی به سوابق خرید مشتری' },
  { key: 'view_customer_call_history', title: 'مشاهده تاریخچه تماس مشتری', category: 'سازمان فروش — مشتریان', description: 'دسترسی به سوابق تماس مشتری' },
  { key: 'view_customer_complaint_summary', title: 'مشاهده خلاصه شکایات مشتری', category: 'سازمان فروش — مشتریان', description: 'خلاصه شکایات ثبت‌شده برای مشتری' },
  { key: 'view_customer_complaint_details', title: 'مشاهده جزئیات کامل شکایات مشتری', category: 'سازمان فروش — مشتریان', description: 'دسترسی کامل به متن و جزئیات شکایات' },
  { key: 'start_sale_cycle', title: 'شروع چرخه فروش جدید', category: 'سازمان فروش — مشتریان', description: 'آغاز چرخه فروش با مشتری (قفل مالکیت پویا)' },
  { key: 'close_sale_cycle', title: 'بستن چرخه فروش فعال', category: 'سازمان فروش — مشتریان', description: 'اتمام و بستن چرخه فروش جاری' },

  // Sales organization — management / infrastructure-ready
  { key: 'assign_sales_lead', title: 'ارجاع مستقیم Lead (زیرساخت آماده)', category: 'سازمان فروش — مدیریت', description: 'هنوز بدون صفحه عملیاتی — فقط زیرساخت مجوز' },
  { key: 'reassign_sales_lead', title: 'ارجاع مجدد Lead (زیرساخت آماده)', category: 'سازمان فروش — مدیریت', description: 'هنوز بدون صفحه عملیاتی — فقط زیرساخت مجوز' },
  { key: 'drain_salesperson_queue', title: 'تخلیه صف Lead فروشنده (زیرساخت آماده)', category: 'سازمان فروش — مدیریت', description: 'هنوز بدون صفحه عملیاتی — فقط زیرساخت مجوز' },
  { key: 'view_sales_reports', title: 'گزارش‌گیری عملکرد فروش', category: 'سازمان فروش — مدیریت', description: 'گزارش عملکرد سازمان فروش' },
  { key: 'configure_sales_field_visibility', title: 'پیکربندی نمایش فیلدهای مشتری بر اساس نقش', category: 'سازمان فروش — مدیریت', description: 'تعیین این‌که کدام فیلد مشتری برای کدام نقش نمایان باشد' },
  { key: 'manage_sales_hierarchy', title: 'مدیریت زنجیره سرپرستی سازمان فروش', category: 'سازمان فروش — مدیریت', description: 'ویرایش زنجیره سرپرستی فروشندگان و سرپرستان' },

  // Data manager — infrastructure-ready, no operational page yet
  { key: 'data_management_access', title: 'دسترسی پایه به مدیریت داده (زیرساخت آماده)', category: 'مدیر داده (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },
  { key: 'import_raw_contacts', title: 'Import بانک داده خام (زیرساخت آماده)', category: 'مدیر داده (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },
  { key: 'review_import_conflicts', title: 'بررسی تعارض‌های Import (زیرساخت آماده)', category: 'مدیر داده (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },
  { key: 'view_raw_contact_pool', title: 'مشاهده مخزن داده خام (زیرساخت آماده)', category: 'مدیر داده (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },
  { key: 'configure_lead_assignment', title: 'پیکربندی موتور تخصیص Lead (زیرساخت آماده)', category: 'مدیر داده (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },
  { key: 'view_data_reports', title: 'گزارش‌گیری بانک داده (زیرساخت آماده)', category: 'مدیر داده (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },

  // Advertising operator — infrastructure-ready, no operational page yet
  { key: 'advertising_access', title: 'دسترسی پایه به بخش تبلیغات (زیرساخت آماده)', category: 'اپراتور تبلیغات (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },
  { key: 'manage_advertising_campaigns', title: 'ثبت/ویرایش کمپین تبلیغاتی (زیرساخت آماده)', category: 'اپراتور تبلیغات (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },
  { key: 'review_incoming_leads', title: 'بررسی اولیه Lead های ورودی (زیرساخت آماده)', category: 'اپراتور تبلیغات (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },
  { key: 'convert_interaction_to_lead', title: 'تبدیل تعامل ورودی به Lead (زیرساخت آماده)', category: 'اپراتور تبلیغات (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },
  { key: 'view_campaign_reports', title: 'گزارش‌گیری کمپین‌ها (زیرساخت آماده)', category: 'اپراتور تبلیغات (زیرساخت آماده)', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' }
];

const PERMISSION_CATEGORIES = [
  'عملیات درخواست‌ها', 'تایید و واریز مالی', 'مدیریت و پیکربندی',
  'خدمات پس از فروش و شکایات', 'نامه‌نگاری داخلی (دبیرخانه)', 'گزارشات و بایگانی',
  'دستورات اداری و کارهای محوله', 'امنیت و Impersonation',
  'سازمان فروش — مشتریان', 'سازمان فروش — مدیریت',
  'مدیر داده (زیرساخت آماده)', 'اپراتور تبلیغات (زیرساخت آماده)'
];

const ORG_LEVEL_LABELS: Record<number, string> = {
  1: 'سطح ۱ — فروشنده',
  2: 'سطح ۲ — سرپرست',
  3: 'سطح ۳ — سرپرست ارشد',
  4: 'سطح ۴ — مدیر فروش',
  5: 'سطح ۵ — معاونت فروش'
};

export const RolesAndPermissionsView: React.FC<RolesAndPermissionsViewProps> = ({
  roles,
  users,
  currentUser,
  onUpdateRoles
}) => {
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<SystemRole | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);

  // Form State
  const [roleName, setRoleName] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<SystemPermission[]>([]);

  const handleOpenCreateModal = () => {
    setIsCreatingNew(true);
    setSelectedRoleForEdit(null);
    setRoleName('');
    setRoleCode(`ROLE_${Date.now().toString().slice(-4)}`);
    setRoleDesc('');
    setSelectedPermissions(['create_request', 'view_branch_requests']);
  };

  const handleOpenEditModal = (role: SystemRole) => {
    setIsCreatingNew(false);
    setSelectedRoleForEdit(role);
    setRoleName(role.name);
    setRoleCode(role.code);
    setRoleDesc(role.description);
    setSelectedPermissions(role.permissions || []);
  };

  const handleTogglePermission = (permKey: SystemPermission) => {
    if (selectedPermissions.includes(permKey)) {
      setSelectedPermissions(selectedPermissions.filter(p => p !== permKey));
    } else {
      setSelectedPermissions([...selectedPermissions, permKey]);
    }
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) {
      alert('لطفاً عنوان نقش را وارد کنید.');
      return;
    }

    if (isCreatingNew) {
      const newRole: SystemRole = {
        id: `role_${Date.now()}`,
        code: roleCode.trim().toUpperCase() || 'CUSTOM_ROLE',
        name: roleName.trim(),
        description: roleDesc.trim() || 'نقش کاربری سفارشی در سیستم خزانه‌داری',
        isSystemRole: false,
        permissions: selectedPermissions
      };
      onUpdateRoles([...roles, newRole]);
      alert(`نقش جدید "${newRole.name}" با موفقیت ایجاد شد.`);
    } else if (selectedRoleForEdit) {
      // System role id/code are never editable from the UI, even if the readOnly input were
      // bypassed — the handler itself re-enforces this, not just the disabled field.
      const updated = roles.map(r => r.id === selectedRoleForEdit.id ? {
        ...r,
        name: roleName.trim(),
        code: r.isSystemRole ? r.code : (roleCode.trim().toUpperCase() || r.code),
        description: roleDesc.trim(),
        permissions: selectedPermissions
      } : r);
      onUpdateRoles(updated);
      alert(`نقش "${roleName}" با موفقیت ویرایش گردید.`);
    }

    setIsCreatingNew(false);
    setSelectedRoleForEdit(null);
  };

  const handleDeleteRole = (roleId: string, roleNameStr: string) => {
    if (currentUser?.role !== 'admin') {
      alert('تنها ادمین ارشد سیستم اجازه حذف نقش‌های شغلی و دسترسی‌ها را دارد.');
      return;
    }

    const roleObj = roles.find(r => r.id === roleId);
    const assignedUsers = users.filter(u =>
      u.roleId === roleId ||
      u.role === roleObj?.code?.toLowerCase() ||
      (u.additionalRoleIds || []).includes(roleId)
    );

    if (assignedUsers.length > 0) {
      alert(`امکان حذف نقش "${roleNameStr}" وجود ندارد.\n\nتعداد ${assignedUsers.length} کاربر در سیستم دارای این نقش شغلی می‌باشند. برای حذف نقش، ابتدا نقش کاربران مربوطه را تغییر دهید.`);
      return;
    }

    if (confirm(`آیا از حذف کامل نقش "${roleNameStr}" اطمینان دارید؟`)) {
      onUpdateRoles(roles.filter(r => r.id !== roleId));
      alert(`نقش "${roleNameStr}" با موفقیت حذف گردید.`);
    }
  };

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Page Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <span>مدیریت نقش‌ها و ماتریس دسترسی‌ها (RBAC)</span>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-bold">
                استاندارد سازمانی
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              تعریف نقش‌های سیستمی و تعیین دقیق اختیارات و دسترسی‌های ریز هر نقش به صورت تفکیک‌شده
            </p>
          </div>
        </div>

        {currentUser?.role === 'admin' && (
          <button
            onClick={handleOpenCreateModal}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-2xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition cursor-pointer"
          >
            <ShieldPlus className="w-4 h-4" />
            <span>تعریف نقش جدید</span>
          </button>
        )}
      </div>

      {/* Roles Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map((r) => {
          const userCount = users.filter(u => userHasRole(u, r.id)).length;

          return (
            <div key={r.id} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 hover:border-indigo-500/40 transition group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-400 shrink-0 font-bold">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white">{r.name}</h3>
                    <span className="text-[10px] text-indigo-400 font-mono bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-900/60">
                      {r.code}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  {r.isSystemRole && (
                    <span className="text-[9px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold">
                      سیستمی
                    </span>
                  )}
                  {r.implementationStatus === 'infrastructure_ready' && (
                    <span className="text-[9px] bg-slate-700/40 text-slate-300 px-2 py-0.5 rounded-full border border-slate-600/40 font-bold whitespace-nowrap">
                      زیرساخت آماده — در انتظار پیاده‌سازی
                    </span>
                  )}
                  {r.organizationalLevel !== undefined && (
                    <span className="text-[9px] bg-sky-500/10 text-sky-300 px-2 py-0.5 rounded-full border border-sky-500/20 font-bold whitespace-nowrap">
                      {ORG_LEVEL_LABELS[r.organizationalLevel] || `سطح سازمانی ${r.organizationalLevel}`}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-400 min-h-[36px] line-clamp-2">
                {r.description}
              </p>

              {/* Active Permissions Summary Badges */}
              <div className="pt-2 border-t border-slate-800">
                <div className="text-[10px] font-bold text-slate-500 mb-1.5 flex items-center justify-between">
                  <span>دسترسی‌های فعال ({r.permissions?.length || 0}):</span>
                  <span className="text-slate-400 flex items-center gap-1">
                    <Users className="w-3 h-3 text-indigo-400" />
                    <strong>{userCount}</strong> کاربر
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {r.permissions?.map(pKey => {
                    const permObj = ALL_PERMISSIONS.find(ap => ap.key === pKey);
                    return (
                      <span key={pKey} className="text-[9.5px] bg-slate-950 text-slate-300 px-2 py-0.5 rounded-md border border-slate-800 flex items-center gap-1 font-bold">
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                        <span>{permObj?.title || pKey}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              {currentUser?.role === 'admin' && (
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenEditModal(r)}
                    className="flex-1 py-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>ویرایش دسترسی‌ها</span>
                  </button>

                  {!r.isSystemRole && (
                    <button
                      onClick={() => handleDeleteRole(r.id, r.name)}
                      className="p-1.5 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white rounded-xl text-xs transition cursor-pointer"
                      title="حذف نقش"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Permission Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden p-6 space-y-4 mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>ماتریس جامع مقایسه دسترسی نقش‌ها (Full Permissions Matrix)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              جدول تفکیکی اختیارات ریز هر نقش کاربری در کل سیستم خزانه‌داری
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3">عنوان دسترسی / اختیار</th>
                <th className="p-3">دسته‌بندی</th>
                {roles.map(r => (
                  <th key={r.id} className="p-3 text-center min-w-[120px]">
                    <span className="text-white block font-extrabold">{r.name}</span>
                    <span className="text-[9px] text-indigo-400 font-mono font-normal">{r.code}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {ALL_PERMISSIONS.map(perm => (
                <tr key={perm.key} className="hover:bg-slate-800/40 transition">
                  <td className="p-3 font-bold text-white">
                    <div>{perm.title}</div>
                    <div className="text-[10px] text-slate-500 font-normal">{perm.description}</div>
                  </td>

                  <td className="p-3">
                    <span className="text-[10px] bg-slate-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-900/60 font-bold">
                      {perm.category}
                    </span>
                  </td>

                  {roles.map(r => {
                    const hasPerm = r.permissions?.includes(perm.key);
                    return (
                      <td key={r.id} className="p-3 text-center">
                        {hasPerm ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <Check className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-950 text-slate-600">
                            <X className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Role Modal */}
      {(isCreatingNew || selectedRoleForEdit) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full p-6 text-right space-y-4 max-h-[90vh] overflow-y-auto my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <span>{isCreatingNew ? 'تعریف نقش و سطح دسترسی جدید' : `ویرایش نقش: ${selectedRoleForEdit?.name}`}</span>
              </h3>
              <button
                onClick={() => { setIsCreatingNew(false); setSelectedRoleForEdit(null); }}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    عنوان نقش <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    required
                    placeholder="مثال: سرپرست انبار و استور"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    کد اختصاری سیستمی {selectedRoleForEdit?.isSystemRole && <span className="text-[10px] text-slate-500 font-normal">(نقش سیستمی — غیرقابل ویرایش)</span>}
                  </label>
                  <input
                    type="text"
                    value={roleCode}
                    onChange={(e) => setRoleCode(e.target.value)}
                    readOnly={!!selectedRoleForEdit?.isSystemRole}
                    placeholder="STORE_SUPERVISOR"
                    className={`w-full text-xs rounded-xl px-3 py-2 border font-mono text-left focus:outline-none ${
                      selectedRoleForEdit?.isSystemRole
                        ? 'bg-slate-950 text-slate-500 border-slate-800 cursor-not-allowed'
                        : 'bg-slate-800 text-indigo-200 border-slate-700 focus:border-indigo-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  توضیحات و شرح وظایف نقش
                </label>
                <input
                  type="text"
                  value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                  placeholder="توضیح کوتاه در خصوص حیطه مسئولیت‌های این نقش..."
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Permissions Checklist Grouped by Category */}
              <div className="pt-2 space-y-3">
                <label className="block text-xs font-extrabold text-indigo-300">
                  انتخاب دسترسی‌ها و اختیارات این نقش:
                </label>

                {PERMISSION_CATEGORIES.map(cat => {
                  const catPerms = ALL_PERMISSIONS.filter(p => p.category === cat);
                  return (
                    <div key={cat} className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                      <div className="text-[11px] font-bold text-slate-400 border-b border-slate-800 pb-1">
                        {cat}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {catPerms.map(p => {
                          const isChecked = selectedPermissions.includes(p.key);
                          return (
                            <label
                              key={p.key}
                              className={`p-2 rounded-xl border text-xs font-bold flex items-start gap-2 cursor-pointer transition ${
                                isChecked
                                  ? 'bg-indigo-600/20 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleTogglePermission(p.key)}
                                className="w-4 h-4 text-indigo-600 rounded border-slate-700 bg-slate-800 mt-0.5 focus:ring-indigo-500"
                              />
                              <div>
                                <div>{p.title}</div>
                                <div className="text-[9.5px] text-slate-500 font-normal leading-tight mt-0.5">
                                  {p.description}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setIsCreatingNew(false); setSelectedRoleForEdit(null); }}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  ذخیره نقش
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
