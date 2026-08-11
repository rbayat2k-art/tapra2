import type { SalesCallOutcome, SalesLeadStatus } from '../api/contracts';

export const SALES_LEAD_STATUS_LABELS: Record<SalesLeadStatus, string> = {
  new: 'جدید',
  pending_action: 'در انتظار اقدام',
  callback_scheduled: 'یادآوری تماس',
  overdue: 'عقب‌افتاده',
  in_negotiation: 'در حال مذاکره',
  ready_for_invoice: 'آمادهٔ صدور فاکتور',
  closed_won: 'بسته‌شده (برد)',
  closed_lost: 'بسته‌شده (باخت)',
  wrong_number: 'شماره اشتباه',
  complaint_blocked: 'مسدود (شکایت)',
};

export const SALES_CALL_OUTCOME_LABELS: Record<SalesCallOutcome, string> = {
  not_dialed: 'شماره‌گیری نشد',
  could_not_connect: 'اتصال برقرار نشد',
  switched_off: 'خاموش',
  no_answer: 'پاسخ داده نشد',
  wrong_number: 'شماره اشتباه',
  connected_no_time: 'وصل شد ولی فرصت صحبت نبود',
  real_conversation: 'گفتگوی واقعی و معرفی انجام شد',
  callback_requested: 'درخواست تماس مجدد',
  interested: 'علاقه‌مند',
  ready_for_invoice: 'آمادهٔ صدور فاکتور',
  cancelled: 'انصراف داد',
  complaint: 'شکایت/پشتیبانی',
};

export function formatSalesDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
