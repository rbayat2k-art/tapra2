import React, { useState } from 'react';
import { PaymentRequest } from '../types';
import { formatRial } from '../utils/numberToWords';
import { 
  Building, MapPin, Calendar, User as UserIcon, 
  Paperclip, Eye, CheckCircle2, Clock, XCircle, 
  RefreshCw, CreditCard, ArrowLeftRight, LayoutList, LayoutGrid, Printer
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
  const [viewDensity, setViewDensity] = useState<'slim' | 'card'>('slim');

  const getStatusBadge = (status: PaymentRequest['status']) => {
    switch (status) {
      case 'pending_approval':
        return { label: 'در انتظار تایید', bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: Clock };
      case 'returned':
        return { label: 'عودت داده شده', bg: 'bg-orange-500/15 text-orange-300 border-orange-500/30', icon: RefreshCw };
      case 'approved_pending_payment':
        return { label: 'تایید شده (انتظار واریز)', bg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30', icon: CreditCard };
      case 'paid':
        return { label: 'واریز شد', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: CheckCircle2 };
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
      case 'current_payment': return 'فاکتور جاری';
      case 'advance_payment': return 'مساعده حقوق';
      case 'info_request': return 'درخواست اطلاعات';
      default: return 'عمومی';
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
      
      {/* Top Controls: View Density Switcher */}
      <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-400 border-b border-slate-800/80 pb-2">
        <span className="font-bold">
          تعداد درخواست‌ها: <strong className="text-white font-mono">{requests.length}</strong> مورد
        </span>

        <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl">
          <button
            onClick={() => setViewDensity('slim')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              viewDensity === 'slim'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>نمای باریک فشرده (جدولی)</span>
          </button>

          <button
            onClick={() => setViewDensity('card')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              viewDensity === 'card'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>نمای کارت پرجزئیات</span>
          </button>
        </div>
      </div>

      {/* SLIM TABLE ROW VIEW (DEFAULT & COMPACT) */}
      {viewDensity === 'slim' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/70 shadow-sm">
          {requests.map((req, index) => {
            const statusConfig = getStatusBadge(req.status);
            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={req.id}
                onClick={() => onSelectRequest(req)}
                className="p-3 sm:px-4 sm:py-3.5 bg-slate-900 hover:bg-slate-800/70 transition-colors flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 cursor-pointer group"
              >
                {/* 1. Row Index & Tracking Code & Type */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="bg-slate-950 text-slate-400 font-mono font-bold text-[11px] px-2 py-1 rounded-lg border border-slate-800 min-w-[32px] text-center">
                    #{index + 1}
                  </span>

                  <span className="bg-indigo-600/90 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg border border-indigo-500/40 shadow-sm">
                    {req.trackingCode}
                  </span>

                  <span className="hidden sm:inline-block bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-700">
                    {getRequestTypeTitle(req.requestType)}
                  </span>
                </div>

                {/* 2. Title & Description (Permanently visible, clean truncating, NO hover flicker!) */}
                <div className="flex-1 min-w-[200px] max-w-xl">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {req.title}
                    </h4>
                    {req.isMultiCostCenter && (
                      <span className="text-[9px] bg-indigo-500/20 text-indigo-300 font-bold px-1.5 py-0.5 rounded border border-indigo-500/30 shrink-0">
                        چندمرکزی
                      </span>
                    )}
                  </div>
                  
                  {/* Clean permanent description preview */}
                  {req.description ? (
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 font-normal">
                      {req.description}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic mt-0.5">بدون توضیحات اضافی</p>
                  )}
                </div>

                {/* 3. Company & Cost Center Branch */}
                <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-300 shrink-0">
                  <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                    <Building className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span className="font-medium text-[11px]">{req.companyName}</span>
                    <span className="text-slate-600">•</span>
                    <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="font-bold text-amber-300 text-[11px]">{req.costCenterName}</span>
                  </div>
                </div>

                {/* 4. Requestor & Date */}
                <div className="hidden lg:flex flex-col text-right shrink-0 min-w-[120px]">
                  <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1">
                    <UserIcon className="w-3 h-3 text-slate-400" />
                    {req.requestorName}
                  </span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 font-mono">
                    <Calendar className="w-3 h-3" />
                    {req.createdAt}
                  </span>
                </div>

                {/* 5. Amount (Formatted Rial) */}
                <div className="text-left shrink-0 min-w-[130px] font-mono">
                  <span className="text-xs sm:text-sm font-black text-emerald-400 block dir-ltr text-right">
                    {formatRial(req.amount)}
                  </span>
                  {req.initialAttachments?.length > 0 && (
                    <span className="text-[9px] text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                      <Paperclip className="w-2.5 h-2.5 text-slate-400" />
                      {req.initialAttachments.length} پیوست
                    </span>
                  )}
                </div>

                {/* 6. Status & Quick Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${statusConfig.bg}`}>
                    <StatusIcon className="w-3 h-3 shrink-0" />
                    <span>{statusConfig.label}</span>
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRequest(req);
                    }}
                    className="p-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg border border-indigo-500/30 transition cursor-pointer"
                    title="مشاهده جزئیات کامل"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {onOpenPrintModal && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPrintModal(req);
                      }}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition cursor-pointer"
                      title="چاپ فرم پرداخت"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        /* EXPANDED CARD VIEW */
        <div className="space-y-3">
          {requests.map((req, index) => {
            const statusConfig = getStatusBadge(req.status);
            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={req.id}
                className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-4 transition shadow-sm group text-right"
              >
                {/* Top Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-950 text-slate-400 font-mono font-bold text-xs px-2.5 py-1 rounded-xl border border-slate-800">
                      ردیف {index + 1}
                    </span>
                    <span className="bg-indigo-600 text-white font-mono font-black text-xs px-3 py-1 rounded-xl border border-indigo-400/40">
                      کد: {req.trackingCode}
                    </span>
                    <span className="bg-slate-800 text-indigo-300 text-[11px] font-bold px-2.5 py-1 rounded-xl border border-slate-700">
                      {getRequestTypeTitle(req.requestType)}
                    </span>
                  </div>

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

                {/* Title & Amount */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  <div className="md:col-span-2">
                    <h3 className="text-base font-extrabold text-white group-hover:text-indigo-300 transition leading-snug">
                      {req.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {req.description || 'بدون توضیحات اضافی'}
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-left flex flex-col justify-center">
                    <span className="text-[10px] text-slate-400 block text-right font-medium">مبلغ به ریال:</span>
                    <span className="text-sm font-mono font-black text-emerald-400 block dir-ltr text-right">{formatRial(req.amount)}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block truncate text-right">{req.amountInWords}</span>
                  </div>
                </div>

                {/* Details Footer */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-800/80 text-xs">
                  <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5"><Building className="w-3 h-3 text-indigo-400" /> شرکت:</span>
                    <span className="font-bold text-slate-200">{req.companyName}</span>
                  </div>
                  <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5"><MapPin className="w-3 h-3 text-amber-400" /> مرکز هزینه:</span>
                    <span className="font-bold text-amber-300">{req.costCenterName}</span>
                  </div>
                  <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5"><UserIcon className="w-3 h-3 text-blue-400" /> درخواست‌کننده:</span>
                    <span className="font-bold text-slate-200 truncate block">{req.requestorName}</span>
                  </div>
                  <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5"><Paperclip className="w-3 h-3 text-emerald-400" /> پیوست‌ها:</span>
                      <span className="font-bold text-slate-200">{req.initialAttachments?.length || 0} فایل</span>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
