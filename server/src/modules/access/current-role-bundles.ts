import type { OrganizationScopeType } from '../identity/types.js';

export interface CurrentRoleBundle {
  code: string;
  name: string;
  description: string;
  defaultScope: OrganizationScopeType;
  permissions: readonly string[];
}

// Role names are convenience packages only. Runtime authorization remains
// Permission + Scope + resource policy in the server services.
export const CURRENT_ROLE_BUNDLES = [
  {
    code: 'workspace_admin',
    name: 'مدیر فضای کاری',
    description: 'مدیریت فنی و سازمانی فضای کاری، بدون اختیار ضمنی در دامنه‌های کسب‌وکار',
    defaultScope: 'WORKSPACE',
    permissions: [
      'organization.read',
      'organization.company.manage',
      'organization.unit.manage',
      'organization.user.manage',
      'organization.membership.manage',
      'organization.role.manage',
      'organization.impersonate',
    ],
  },
  {
    code: 'customer_manager',
    name: 'مدیر مشتریان',
    description: 'مدیریت Customer 360 و ورود کنترل‌شده داده در شرکت مجاز',
    defaultScope: 'COMPANY',
    permissions: [
      'customer.read', 'customer.create', 'customer.identity.manage', 'customer.merge',
      'customer.import.read', 'customer.import.create', 'customer.import.review', 'customer.import.approve',
    ],
  },
  {
    code: 'customer_reader',
    name: 'مشاهده‌گر مشتریان',
    description: 'مشاهده Customer 360 بدون اختیار تغییر',
    defaultScope: 'COMPANY',
    permissions: ['customer.read'],
  },
  {
    code: 'data_steward',
    name: 'متولی داده',
    description: 'تطبیق هویت مرکزی مشتری با اختیار صریح در کل مجموعه',
    defaultScope: 'WORKSPACE',
    permissions: ['customer.read', 'customer.merge', 'customer.identity.reconcile'],
  },
  {
    code: 'sales_seller',
    name: 'فروشنده',
    description: 'صف شخصی، تماس، فروش مستقیم، فاکتور و ثبت واریزی بدون اختیار تأیید',
    defaultScope: 'SELF',
    permissions: [
      'customer.read', 'sales.queue.read', 'sales.call.create', 'sales.lead.create',
      'sales.sale.create', 'sales.invoice.read_own', 'sales.invoice.edit_draft', 'sales.payment.record',
    ],
  },
  {
    code: 'sales_supervisor',
    name: 'سرپرست فروش',
    description: 'مدیریت تخصیص Lead و تأیید مستقل فاکتور فروش',
    defaultScope: 'COMPANY',
    permissions: [
      'customer.read', 'sales.lead.read_all', 'sales.lead.assign', 'sales.lead.reassign',
      'sales.invoice.read_all', 'sales.invoice.supervisor_approve',
    ],
  },
  {
    code: 'sales_manager',
    name: 'مدیر فروش',
    description: 'مدیریت Lead و زمینه بازاریابی شرکت بدون اختیار مالی ضمنی',
    defaultScope: 'COMPANY',
    permissions: [
      'customer.read', 'sales.lead.create', 'sales.lead.read_all', 'sales.lead.assign',
      'sales.lead.reassign', 'sales.marketing.link', 'sales.invoice.read_all',
    ],
  },
  {
    code: 'paper_entry_operator',
    name: 'اپراتور ثبت کاغذی',
    description: 'ثبت فروش PAPER_ENTRY برای فروشنده واقعی، بدون اختیار تخصیص یا تأیید',
    defaultScope: 'COMPANY',
    permissions: ['customer.read', 'sales.sale.create_on_behalf', 'sales.invoice.read_all', 'sales.invoice.edit_draft'],
  },
  {
    code: 'payment_recorder',
    name: 'ثبت‌کننده واریزی',
    description: 'ثبت و اصلاح واریزی مشتری، بدون اختیار بررسی مالی',
    defaultScope: 'COMPANY',
    permissions: ['sales.invoice.read_all', 'sales.payment.record'],
  },
  {
    code: 'financial_reviewer',
    name: 'بازبین مالی فروش',
    description: 'بررسی مستقل واریزی و بازگرداندن آن برای اصلاح',
    defaultScope: 'COMPANY',
    permissions: ['sales.invoice.read_all', 'sales.payment.review'],
  },
  {
    code: 'collection_manager',
    name: 'مدیر وصول',
    description: 'مدیریت حساب‌های وصول و سیاست تأیید سرپرست در شرکت',
    defaultScope: 'COMPANY',
    permissions: ['sales.invoice.read_all', 'sales.payment.infrastructure.manage'],
  },
  {
    code: 'warehouse_manager',
    name: 'مدیر انبار',
    description: 'مدیریت انبار، محل و قلم پایدار بدون اختیار عملیاتی یا تأیید ضمنی',
    defaultScope: 'COMPANY',
    permissions: ['warehouse.read', 'warehouse.manage', 'warehouse.item.manage'],
  },
  {
    code: 'receiving_operator',
    name: 'اپراتور دریافت کالا',
    description: 'ایجاد و ثبت قطعی دریافت عادی کالا',
    defaultScope: 'COMPANY',
    permissions: ['warehouse.read', 'warehouse.receiving.create', 'warehouse.receiving.post'],
  },
  {
    code: 'manual_receiving_operator',
    name: 'اپراتور دریافت دستی',
    description: 'ایجاد دریافت دستی مستند؛ ثبت قطعی نیازمند بسته دریافت است',
    defaultScope: 'COMPANY',
    permissions: ['warehouse.read', 'warehouse.receiving.create', 'warehouse.receiving.manual'],
  },
  {
    code: 'reservation_operator',
    name: 'اپراتور رزرو موجودی',
    description: 'رزرو و آزادسازی موجودی برای ردیف مالی واجد شرایط',
    defaultScope: 'COMPANY',
    permissions: ['warehouse.read', 'warehouse.reservation.manage'],
  },
  {
    code: 'transfer_operator',
    name: 'اپراتور انتقال انبار',
    description: 'ایجاد، ارسال و دریافت انتقال داخلی بدون اختیار ثبت معکوس',
    defaultScope: 'COMPANY',
    permissions: ['warehouse.read', 'warehouse.transfer.manage'],
  },
  {
    code: 'inventory_maker',
    name: 'ثبت‌کننده کنترل موجودی',
    description: 'ایجاد و ارسال اصلاح و شمارش موجودی، بدون اختیار تأیید',
    defaultScope: 'COMPANY',
    permissions: ['warehouse.read', 'warehouse.adjustment.create', 'warehouse.count.create'],
  },
  {
    code: 'inventory_approver',
    name: 'تأییدکننده کنترل موجودی',
    description: 'تأیید مستقل اصلاح و شمارش موجودی، بدون اختیار ایجاد',
    defaultScope: 'COMPANY',
    permissions: ['warehouse.read', 'warehouse.adjustment.approve', 'warehouse.count.approve'],
  },
  {
    code: 'return_inspector',
    name: 'بازرس کالای برگشتی',
    description: 'دریافت و بازرسی کالای برگشتی بدون اختیار Refund مالی',
    defaultScope: 'COMPANY',
    permissions: ['warehouse.read', 'warehouse.return.manage'],
  },
  {
    code: 'movement_reversal_officer',
    name: 'مسئول ثبت معکوس موجودی',
    description: 'ثبت معکوس ممیزی‌شده حرکت موجودی بدون اختیار انتقال ضمنی',
    defaultScope: 'COMPANY',
    permissions: ['warehouse.read', 'warehouse.movement.reverse'],
  },
] as const satisfies readonly CurrentRoleBundle[];

export type CurrentRoleBundleCode = typeof CURRENT_ROLE_BUNDLES[number]['code'];

export function getCurrentRoleBundle(code: CurrentRoleBundleCode): CurrentRoleBundle {
  const bundle = CURRENT_ROLE_BUNDLES.find((candidate) => candidate.code === code);
  if (!bundle) throw new Error(`Unknown CURRENT role bundle: ${code}`);
  return bundle;
}
