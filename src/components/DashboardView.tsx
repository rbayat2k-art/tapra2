import React from 'react';
import { PaymentRequest, User, Company, CostCenter } from '../types';
import { formatRial } from '../utils/numberToWords';
import { 
  CreditCard, CheckCircle2, Clock, RefreshCw, 
  Building, MapPin, PlusCircle, Archive, ArrowUpRight, 
  TrendingUp, Layers, Users, Sparkles, ShieldCheck 
} from 'lucide-react';

interface DashboardViewProps {
  requests: PaymentRequest[];
  currentUser: User | null;
  companies: Company[];
  costCenters: CostCenter[];
  onOpenNewRequest: () => void;
  onNavigateTab: (tab: string) => void;
  onSelectRequest: (req: PaymentRequest) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  requests,
  currentUser,
  companies,
  costCenters,
  onOpenNewRequest,
  onNavigateTab,
  onSelectRequest
}) => {
  const pendingCount = requests.filter(r => r.status === 'pending_approval' || r.status === 'approved_pending_payment').length;
  const paidRequests = requests.filter(r => r.status === 'paid');
  const totalPaidAmount = paidRequests.reduce((sum, r) => sum + r.amount, 0);
  const returnedCount = requests.filter(r => r.status === 'returned').length;

  // Security & Privacy: Filter cost centers based on user branch permissions
  const displayedCostCenters = costCenters.filter(cc => {
    if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'treasury_executor') return true;
    if (currentUser.allowedCostCenterIds && currentUser.allowedCostCenterIds.length > 0) {
      return currentUser.allowedCostCenterIds.includes(cc.id);
    }
    if (currentUser.costCenterId) {
      return cc.id === currentUser.costCenterId;
    }
    return true;
  });

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Welcome Hero Banner */}
      <div className="p-6 sm:p-8 bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 border border-emerald-700/50 dark:border-slate-800 rounded-3xl shadow-xl relative overflow-hidden text-white">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-emerald-100 text-xs font-bold border border-white/20 backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
              <span>سامانه یکپارچه خزانه‌داری tapra</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              خوش آمدید، {currentUser?.fullName || 'مدیر گرامی'}
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100 dark:text-slate-200 leading-relaxed font-medium">
              مدیریت و تایید درخواست‌های پرداخت شعبه‌های فروش (سعادت آباد، پونک، مخبری، آزادی، فخار مقدم)، شرکت‌های هلدینگ و بایگانی فیش‌های واریزی خزانه‌داری.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Pending Card */}
        <div 
          onClick={() => onNavigateTab('approval_inbox')}
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 rounded-2xl shadow-sm transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">در انتظار بررسی / واریز</span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-300">{pendingCount} <span className="text-xs text-slate-400 font-normal">درخواست</span></div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">نیازمند تایید یا واریز خزانه‌داری</p>
        </div>

        {/* Total Paid Amount */}
        <div 
          onClick={() => onNavigateTab('archive')}
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 rounded-2xl shadow-sm transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">مجموع واریزی‌های انجام شده</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-lg font-mono font-black text-emerald-600 dark:text-emerald-400 truncate">{formatRial(totalPaidAmount)}</div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">{paidRequests.length} درخواست نهایی با فیش واریزی</p>
        </div>

        {/* Returned Count */}
        <div 
          onClick={() => onNavigateTab('my_requests')}
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-orange-500/50 rounded-2xl shadow-sm transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">نیازمند اصلاح (عودت شده)</span>
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
              <RefreshCw className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-orange-600 dark:text-orange-300">{returnedCount} <span className="text-xs text-slate-400 font-normal">درخواست</span></div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">علت ایراد در جزئیات ذکر شده است</p>
        </div>

        {/* Companies Count */}
        <div 
          onClick={() => onNavigateTab('workflow')}
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 rounded-2xl shadow-sm transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">مراکز هزینه و شرکت‌ها</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Building className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800 dark:text-indigo-300">۶ شرکت | ۸ شعبه</div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">tapra store، شرکت فروش و شعب</p>
        </div>

      </div>

      {/* Cost Centers Breakdown Cards with Budget vs. Actual Variance */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 gap-2">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span>کنترل و انحراف بودجه شعب (Budget vs. Actual Variance)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              مقایسه بودجه مصوب ماهانه با مصارف واقعی و واریز شده هر شعبه (دوره جاری)
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('cost_centers')}
            className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>مدیریت سقف بودجه شعب</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {displayedCostCenters.map((cc) => {
            const ccApprovedRequests = requests.filter(r => r.costCenterId === cc.id && (r.status === 'paid' || r.status === 'approved_pending_payment'));
            const usedAmount = ccApprovedRequests.reduce((sum, r) => sum + r.amount, 0);
            const budget = cc.monthlyBudget || 400000000;
            const usagePercent = Math.round((usedAmount / budget) * 100);
            const isOverBudget = usagePercent >= 100;
            const isWarningBudget = usagePercent >= 80 && usagePercent < 100;

            let barColor = 'bg-emerald-500';
            let badgeBg = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
            if (isOverBudget) {
              barColor = 'bg-rose-500';
              badgeBg = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
            } else if (isWarningBudget) {
              barColor = 'bg-amber-500';
              badgeBg = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
            }

            return (
              <div key={cc.id} className="p-4 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                    {cc.name}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badgeBg}`}>
                    {usagePercent}% مصرف
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${barColor} transition-all duration-500 rounded-full`}
                      style={{ width: `${Math.min(usagePercent, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                    <span>مصرف: {formatRial(usedAmount)}</span>
                    <span>بودجه: {formatRial(budget)}</span>
                  </div>
                </div>

                {isOverBudget && (
                  <div className="text-[10px] font-bold text-rose-500 flex items-center gap-1 pt-1 border-t border-slate-200 dark:border-slate-800/60">
                    <span>⚠️ هشدار: عبور از سقف بودجه مصوب شعبه!</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
