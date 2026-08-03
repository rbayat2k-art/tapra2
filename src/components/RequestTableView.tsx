import React from 'react';
import { PaymentRequest } from '../types';
import { formatRial } from '../utils/numberToWords';
import { 
  Building, MapPin, Calendar, User as UserIcon, 
  Paperclip, Image as ImageIcon, Eye, CheckCircle2, 
  Clock, XCircle, RefreshCw, CreditCard, ArrowLeftRight 
} from 'lucide-react';

interface RequestTableViewProps {
  requests: PaymentRequest[];
  onSelectRequest: (request: PaymentRequest) => void;
  onOpenPrintModal?: (request: PaymentRequest) => void;
}

export const RequestTableView: React.FC<RequestTableViewProps> = ({
  requests,
  onSelectRequest,
  onOpenPrintModal
}) => {
  const getStatusBadge = (status: PaymentRequest['status']) => {
    switch (status) {
      case 'pending_approval':
        return { label: 'در انتظار تایید', bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: Clock };
      case 'returned':
        return { label: 'عودت داده شده (نیازمند اصلاح)', bg: 'bg-orange-500/15 text-orange-300 border-orange-500/30', icon: RefreshCw };
      case 'approved_pending_payment':
        return { label: 'تایید شده (در انتظار واریز خزانه‌داری)', bg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30', icon: CreditCard };
      case 'paid':
        return { label: 'واریز شد (دارای فیش پرداخت)', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: CheckCircle2 };
      case 'completed':
        return { label: 'اتمام کار', bg: 'bg-slate-700 text-slate-300 border-slate-600', icon: CheckCircle2 };
      case 'rejected':
        return { label: 'رد شده', bg: 'bg-rose-500/15 text-rose-300 border-rose-500/30', icon: XCircle };
      default:
        return { label: 'در جریان', bg: 'bg-slate-800 text-slate-300 border-slate-700', icon: Clock };
    }
  };

  const getRequestTypeTitle = (type: PaymentRequest['requestType']) => {
    switch (type) {
      case 'current_payment': return 'پرداخت جاری (فاکتور)';
      case 'advance_payment': return 'مساعده حقوق';
      case 'info_request': return 'درخواست اطلاعات / صورت‌حساب';
      default: return 'درخواست عمومی';
    }
  };

  if (requests.length === 0) {
    return (
      <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl text-slate-400">
        <ArrowLeftRight className="w-12 h-12 mx-auto mb-3 opacity-40 text-slate-500" />
        <p className="text-sm font-bold text-slate-300">هیچ درخواستی در این بخش یافت نشد.</p>
        <p className="text-xs text-slate-500 mt-1">می‌توانید با دکمه ثبت درخواست جدید، فرم پرداختی را ایجاد کنید.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 dir-rtl">
      {requests.map((req, index) => {
        const statusConfig = getStatusBadge(req.status);
        const StatusIcon = statusConfig.icon;

        return (
          <div
            key={req.id}
            className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-4 sm:p-5 transition shadow-sm hover:shadow-indigo-500/5 group text-right"
          >
            {/* Top Bar: Row Number, Code, Status Badge & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
              
              <div className="flex items-center gap-2">
                {/* Mandatory Row Number Badge */}
                <span className="bg-slate-950 text-slate-400 font-mono font-black text-xs px-2.5 py-1 rounded-xl border border-slate-800">
                  ردیف {index + 1}
                </span>

                {/* Unique Tracking Code */}
                <span className="bg-indigo-600 text-white font-mono font-black text-xs px-3 py-1 rounded-xl shadow border border-indigo-400/40 tracking-wider">
                  کد: {req.trackingCode}
                </span>

                {/* Request Type Badge */}
                <span className="bg-slate-800 text-indigo-300 text-[11px] font-bold px-2.5 py-1 rounded-xl border border-slate-700">
                  {getRequestTypeTitle(req.requestType)}
                </span>

                {/* Multi Cost Center Split Badge */}
                {req.isMultiCostCenter && (
                  <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-black px-2.5 py-1 rounded-xl border border-indigo-500/30">
                    🔀 تقسیم بین {req.costCenterAllocations?.length || 2} مرکز هزینه
                  </span>
                )}
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold ${statusConfig.bg}`}>
                  <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{statusConfig.label}</span>
                </span>

                <button
                  onClick={() => onSelectRequest(req)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>مشاهده جزئیات</span>
                </button>
              </div>

            </div>

            {/* Title & Amount Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
              
              <div className="md:col-span-2">
                <h3 className="text-base font-extrabold text-white group-hover:text-indigo-300 transition leading-snug">
                  {req.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                  {req.description}
                </p>
              </div>

              {/* Amount Box */}
              <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-left flex flex-col justify-center">
                <span className="text-[10px] text-slate-400 block text-right font-medium">
                  مبلغ به ریال:
                </span>
                <span className="text-sm font-mono font-black text-emerald-400 block dir-ltr text-right">
                  {formatRial(req.amount)}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5 block truncate text-right">
                  {req.amountInWords}
                </span>
              </div>

            </div>

            {/* Full Visible Attributes Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-800/80 text-xs">
              
              {/* Company */}
              <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <Building className="w-3 h-3 text-indigo-400" />
                  شرکت:
                </span>
                <span className="font-bold text-slate-200">{req.companyName}</span>
              </div>

              {/* Cost Center / Branch */}
              <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <MapPin className="w-3 h-3 text-amber-400" />
                  مرکز هزینه / شعبه:
                </span>
                <span className="font-bold text-amber-300">{req.costCenterName}</span>
              </div>

              {/* Requestor */}
              <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <UserIcon className="w-3 h-3 text-blue-400" />
                  درخواست‌کننده:
                </span>
                <span className="font-bold text-slate-200 truncate block">{req.requestorName}</span>
              </div>

              {/* Attachments & Receipt Status */}
              <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                    <Paperclip className="w-3 h-3 text-emerald-400" />
                    پیوست‌ها:
                  </span>
                  <span className="font-bold text-slate-200">
                    {req.initialAttachments.length} تصویر/فایل
                  </span>
                </div>
                {req.paymentReceiptAttachment && (
                  <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
                    فیش واریز شد
                  </span>
                )}
              </div>

            </div>

            {/* Footer Date & Current Handler Info */}
            <div className="mt-2 pt-2 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                تاریخ ثبت: {req.createdAt}
              </span>

              <span className="text-slate-400">
                مسئول بررسی فعلی: <strong className="text-slate-200 font-bold">{req.currentApproverName}</strong>
              </span>
            </div>

          </div>
        );
      })}
    </div>
  );
};
