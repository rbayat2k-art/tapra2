import React, { useState } from 'react';
import { PaymentRequest, Company, CostCenter, User, SupportCase, Letter, Vendor } from '../types';
import { formatRial } from '../utils/numberToWords';
import * as XLSX from 'xlsx';
import { 
  Archive, Search, Filter, Printer, 
  Building, MapPin, Calendar, CheckCircle2, FileSpreadsheet, Eye,
  ShieldCheck, LifeBuoy, Mail, Users, FileText, Download, Sparkles
} from 'lucide-react';

interface ArchiveViewProps {
  requests: PaymentRequest[];
  companies: Company[];
  costCenters: CostCenter[];
  currentUser: User | null;
  supportCases?: SupportCase[];
  letters?: Letter[];
  vendors?: Vendor[];
  users?: User[];
  onSelectRequest: (req: PaymentRequest) => void;
  onOpenPrintModal: (req: PaymentRequest) => void;
}

type ArchiveSection = 'requests' | 'support' | 'letters' | 'vendors' | 'cost_centers';

export const ArchiveView: React.FC<ArchiveViewProps> = ({
  requests,
  companies,
  costCenters,
  currentUser,
  supportCases = [],
  letters = [],
  vendors = [],
  users = [],
  onSelectRequest,
  onOpenPrintModal
}) => {
  const [activeSection, setActiveSection] = useState<ArchiveSection>('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('all');
  const [selectedCostCenterId, setSelectedCostCenterId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');

  const isAdmin = currentUser?.role === 'admin';

  // Available branches for current user
  const availableCostCenters = costCenters.filter(cc => {
    if (!currentUser || isAdmin || currentUser.role === 'treasury_executor') return true;
    if (currentUser.allowedCostCenterIds && currentUser.allowedCostCenterIds.length > 0) {
      return currentUser.allowedCostCenterIds.includes(cc.id);
    }
    if (currentUser.costCenterId) {
      return cc.id === currentUser.costCenterId;
    }
    return true;
  });

  // -------------------------------------------------------------
  // 1. FILTERING PAYMENT REQUESTS ACCORDING TO ROLE & PERMISSIONS
  // -------------------------------------------------------------
  const accessibleRequests = requests.filter(req => {
    if (!currentUser) return false;
    if (isAdmin) return true;

    // Requestors ONLY see their own requests (created by them)
    if (currentUser.role === 'requestor' && !currentUser.isDualRole) {
      return req.requestorId === currentUser.id || req.requestorName === currentUser.fullName || req.createdById === currentUser.id;
    }

    // Approvers (Branch Managers / Supervisors) see requests created by themselves, assigned to them, in their cost center branch, or where they acted
    if (currentUser.role === 'approver' || currentUser.isDualRole) {
      const isMyOwn = req.requestorId === currentUser.id || req.requestorName === currentUser.fullName || req.createdById === currentUser.id;
      const isAssigned = req.currentApproverId === currentUser.id;
      const isMyBranch = currentUser.allowedCostCenterIds?.includes(req.costCenterId) || req.costCenterId === currentUser.costCenterId;
      const isInTimeline = req.timeline?.some(t => t.actorId === currentUser.id || t.actorName === currentUser.fullName);
      return isMyOwn || isAssigned || isMyBranch || isInTimeline;
    }

    // Treasury Executors see requests in treasury stages, assigned to them, created by them, or in their cost center branch
    if (currentUser.role === 'treasury_executor') {
      const isMyOwn = req.requestorId === currentUser.id || req.requestorName === currentUser.fullName || req.createdById === currentUser.id;
      const isAssigned = req.currentApproverId === currentUser.id;
      const isTreasuryStage = ['approved_pending_payment', 'paid', 'completed'].includes(req.status);
      const isMyBranch = currentUser.allowedCostCenterIds?.includes(req.costCenterId) || req.costCenterId === currentUser.costCenterId;
      const isInTimeline = req.timeline?.some(t => t.actorId === currentUser.id || t.actorName === currentUser.fullName);
      return isMyOwn || isAssigned || isTreasuryStage || isMyBranch || isInTimeline;
    }

    return req.requestorId === currentUser.id || req.requestorName === currentUser.fullName;
  });

  const filteredRequests = accessibleRequests.filter(req => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      req.trackingCode.toLowerCase().includes(q) ||
      req.title.toLowerCase().includes(q) ||
      req.requestorName.toLowerCase().includes(q) ||
      req.description.toLowerCase().includes(q) ||
      (req.destinationAccountName && req.destinationAccountName.toLowerCase().includes(q)) ||
      (req.destinationCardNumber && req.destinationCardNumber.includes(q));

    const matchesCompany = selectedCompanyId === 'all' || req.companyId === selectedCompanyId;
    const matchesCostCenter = selectedCostCenterId === 'all' || req.costCenterId === selectedCostCenterId;
    const matchesStatus = selectedStatus === 'all' || req.status === selectedStatus;
    const matchesType = selectedType === 'all' || req.requestType === selectedType;

    return matchesSearch && matchesCompany && matchesCostCenter && matchesStatus && matchesType;
  });

  // -------------------------------------------------------------
  // 2. FILTERING SUPPORT CASES
  // -------------------------------------------------------------
  const accessibleSupportCases = supportCases.filter(c => {
    if (!currentUser || isAdmin || currentUser.role === 'treasury_executor') return true;
    if (currentUser.role === 'support') return true;
    const isMyBranch = currentUser.allowedCostCenterIds?.includes(c.costCenterId) || c.costCenterId === currentUser.costCenterId;
    return isMyBranch;
  });

  const filteredSupportCases = accessibleSupportCases.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.trackingCode.toLowerCase().includes(q) ||
      c.customerName.toLowerCase().includes(q) ||
      c.customerPhone.includes(q) ||
      (c.complaintDetail && c.complaintDetail.toLowerCase().includes(q)) ||
      (c.reasonTitle && c.reasonTitle.toLowerCase().includes(q))
    );
  });

  // -------------------------------------------------------------
  // 3. FILTERING LETTERS
  // -------------------------------------------------------------
  const accessibleLetters = letters.filter(l => {
    if (!currentUser || isAdmin) return true;
    const isMyOwn = l.creatorId === currentUser.id || l.toUserId === currentUser.id;
    return isMyOwn;
  });

  const filteredLetters = accessibleLetters.filter(l => {
    const q = searchQuery.toLowerCase();
    return (
      l.letterNumber.toLowerCase().includes(q) ||
      l.subject.toLowerCase().includes(q) ||
      l.creatorName.toLowerCase().includes(q) ||
      l.body.toLowerCase().includes(q)
    );
  });

  // -------------------------------------------------------------
  // EXPORT EXCEL LOGIC BY SECTION
  // -------------------------------------------------------------
  const handleExportExcel = () => {
    let excelData: any[] = [];
    let sheetName = 'خروجی_اکسل';
    let fileName = `خروجی_${activeSection}_${Date.now()}.xlsx`;

    if (activeSection === 'requests') {
      sheetName = 'درخواست‌های_پرداخت';
      fileName = `بایگانی_درخواست‌های_پرداخت_${Date.now()}.xlsx`;
      excelData = filteredRequests.map(req => ({
        'کد پیگیری (شناسه یونیک)': req.trackingCode,
        'عنوان درخواست': req.title,
        'نوع درخواست': req.requestType === 'current_payment' ? 'پرداخت جاری' : req.requestType === 'advance_payment' ? 'مساعده' : req.requestType === 'customer_refund' ? 'عودت وجه مشتری' : 'درخواست اطلاعات',
        'شرکت': req.companyName,
        'مرکز هزینه / شعبه': req.costCenterName,
        'مبلغ (ریال)': req.amount,
        'مبلغ به حروف': req.amountInWords,
        'شماره کارت مقصد': req.destinationCardNumber,
        'نام صاحب حساب': req.destinationAccountName,
        'درخواست‌کننده': req.requestorName,
        'مسئول بررسی فعلی': req.currentApproverName,
        'وضعیت': req.status === 'paid' ? 'واریز شده' : req.status === 'pending_approval' ? 'در انتظار تایید' : req.status,
        'تاریخ ثبت': req.createdAt,
        'فیش واریزی بانک': req.paymentReceiptAttachment ? 'دارد' : 'ندارد',
        'توضیحات': req.description
      }));
    } else if (activeSection === 'support') {
      sheetName = 'پرونده‌های_پشتیبانی';
      fileName = `بایگانی_شکایات_پشتیبانی_${Date.now()}.xlsx`;
      excelData = filteredSupportCases.map(c => ({
        'کد پیگیری پرونده': c.trackingCode,
        'نام مشتری': c.customerName,
        'شماره تماس': c.customerPhone,
        'استان / شهر': `${c.province || ''} - ${c.city || ''}`,
        'علت مراجعه': c.reasonTitle,
        'مرجع شکایت': c.complaintReference || '-',
        'مسدودی حساب شرکت با شکایت مشتری': c.accountBlocked ? 'بله' : 'خیر',
        'حساب‌های مسدود شده شرکت': (c.blockedAccountCompanyNames || []).join(' ، '),
        'وضعیت شکایت': c.complaintStatus,
        'اپراتور ثبت‌کننده': c.createdByName,
        'تاریخ ثبت': c.createdAt,
        'شرح کامل شکایت': c.complaintDetail || '-'
      }));
    } else if (activeSection === 'letters') {
      sheetName = 'مکاتبات_اداری';
      fileName = `بایگانی_مکاتبات_و_نامه‌ها_${Date.now()}.xlsx`;
      excelData = filteredLetters.map(l => ({
        'شماره نامه': l.letterNumber,
        'عنوان / موضوع': l.subject,
        'واحد فرستنده': l.fromUnit,
        'امضاکننده / نویسنده': l.creatorName,
        'واحد/شخص گیرنده': l.toUnit,
        'طبقه بندی': l.classification,
        'تاریخ ایجاد': l.createdAt,
        'متن نامه': l.body
      }));
    } else if (activeSection === 'vendors') {
      sheetName = 'فروشندگان';
      fileName = `لیست_تامین_کنندگان_${Date.now()}.xlsx`;
      excelData = vendors.map(v => ({
        'نام فروشنده / شرکت': v.name,
        'دسته‌بندی': v.categoryName || '-',
        'شماره تماس': v.phone || '-',
        'کد ملی / شناسه ملی': v.nationalCode || '-',
        'شماره حساب / شبا': v.bankAccount || '-',
        'نام بانک': v.bankName || '-'
      }));
    } else if (activeSection === 'cost_centers') {
      sheetName = 'شعب_و_مراکز_هزینه';
      fileName = `لیست_شعب_و_مراکز_هزینه_${Date.now()}.xlsx`;
      excelData = availableCostCenters.map(cc => ({
        'کد مرکز هزینه': cc.code,
        'نام شعبه / مرکز هزینه': cc.name,
        'سقف اعتباری تنخواه (ریال)': cc.pettyCashLimit,
        'نام سرپرست / مدیر شعبه': cc.managerName,
        'آدرس': cc.address || '-'
      }));
    }

    if (excelData.length === 0) {
      alert('داده‌ای برای خروجی اکسل یافت نشد.');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Top Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center font-bold">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white">
                سامانه جستجوی پیشرفته و خروجی اکسل بایگانی
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                isAdmin 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}>
                {isAdmin ? 'دسترسی کل ادمین' : `دسترسی: ${currentUser?.roleTitle || 'کاربر سیستم'}`}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              مرکز جستجوی جامع و استخراج فایل‌های Excel طبق سطوح دسترسی سازمانی (درخواست‌های پرداخت، شکایات، نامه‌ها، تامین‌کنندگان و شعب)
            </p>
          </div>
        </div>

        {/* Global Excel Export Button */}
        <button
          onClick={handleExportExcel}
          className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-emerald-600/20 transition flex items-center gap-2 cursor-pointer"
        >
          <FileSpreadsheet className="w-5 h-5 text-emerald-100" />
          <span>دانلود خروجی کامل اکسل ({activeSection === 'requests' ? 'درخواست‌ها' : activeSection === 'support' ? 'پشتیبانی' : activeSection === 'letters' ? 'نامه‌ها' : activeSection === 'vendors' ? 'فروشندگان' : 'شعب'})</span>
        </button>
      </div>

      {/* Domain Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setActiveSection('requests')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSection === 'requests'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>درخواست‌های پرداخت ({filteredRequests.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('support')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSection === 'support'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          <LifeBuoy className="w-4 h-4" />
          <span>شکایات و پشتیبانی ({filteredSupportCases.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('letters')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSection === 'letters'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>مکاتبات و نامه‌ها ({filteredLetters.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('vendors')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSection === 'vendors'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>فروشندگان و تامین‌کنندگان ({vendors.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('cost_centers')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSection === 'cost_centers'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>شعب و مراکز هزینه ({availableCostCenters.length})</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          
          {/* Main Search Bar */}
          <div className="md:col-span-2 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو کد پیگیری، عنوان، نام، توضیحات، شماره تماس..."
              className="w-full bg-slate-800 text-white text-xs rounded-xl pr-9 pl-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          </div>

          {activeSection === 'requests' && (
            <>
              {/* Company Filter */}
              <div>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-2 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">همه شرکت‌ها</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Cost Center Filter */}
              <div>
                <select
                  value={selectedCostCenterId}
                  onChange={(e) => setSelectedCostCenterId(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-2 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">همه شعب / مراکز هزینه مجاز</option>
                  {availableCostCenters.map(cc => (
                    <option key={cc.id} value={cc.id}>{cc.name}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-2 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">همه وضعیت‌ها</option>
                  <option value="pending_approval">در انتظار تایید</option>
                  <option value="approved_pending_payment">تایید شده - در انتظار واریز</option>
                  <option value="paid">واریز شده (دارای فیش)</option>
                  <option value="returned">عودت داده شده</option>
                  <option value="rejected">رد شده</option>
                </select>
              </div>
            </>
          )}

        </div>
      </div>

      {/* Table Results Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        
        {/* 1. Payment Requests Table */}
        {activeSection === 'requests' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">کد یونیک</th>
                  <th className="p-3.5">عنوان درخواست</th>
                  <th className="p-3.5">شرکت و مرکز هزینه</th>
                  <th className="p-3.5">مبلغ (ریال)</th>
                  <th className="p-3.5">درخواست‌کننده</th>
                  <th className="p-3.5">وضعیت</th>
                  <th className="p-3.5">فیش واریز</th>
                  <th className="p-3.5 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5">
                      <span className="bg-indigo-600 text-white font-mono font-bold px-2.5 py-1 rounded-lg">
                        {req.trackingCode}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-white max-w-xs truncate">{req.title}</div>
                      <span className="text-[10px] text-slate-500">{req.createdAt}</span>
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-200">{req.companyName}</div>
                      <div className="text-[10px] text-amber-300">{req.costCenterName}</div>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-emerald-400">
                      {formatRial(req.amount)}
                    </td>
                    <td className="p-3.5 font-medium text-slate-200">
                      {req.requestorName}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          req.status === 'paid' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                          req.status === 'pending_approval' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                          req.status === 'emergency_pending_payment' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {req.status === 'paid' ? 'واریز شده' : req.status === 'pending_approval' ? 'در انتظار' : req.status === 'emergency_pending_payment' ? 'در انتظار پرداخت فوری' : req.status}
                        </span>
                        {req.isEmergencyPayment && (
                          <span className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold bg-rose-600 text-white">فوری</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5">
                      {req.paymentReceiptAttachment ? (
                        <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          موجود
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">ندارد</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onSelectRequest(req)}
                          className="p-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white rounded-lg transition cursor-pointer"
                          title="مشاهده جزئیات"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onOpenPrintModal(req)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
                          title="چاپ برگه رسمی"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. Support Cases Table */}
        {activeSection === 'support' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">کد پرونده</th>
                  <th className="p-3.5">نام مشتری</th>
                  <th className="p-3.5">شماره تماس</th>
                  <th className="p-3.5">علت مراجعه</th>
                  <th className="p-3.5">مسدودی حساب شرکت</th>
                  <th className="p-3.5">ثبت‌کننده</th>
                  <th className="p-3.5">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredSupportCases.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 font-mono font-bold text-amber-400">{c.trackingCode}</td>
                    <td className="p-3.5 font-bold text-white">{c.customerName}</td>
                    <td className="p-3.5 font-mono text-slate-300">{c.customerPhone}</td>
                    <td className="p-3.5 text-slate-200">{c.reasonTitle}</td>
                    <td className="p-3.5">
                      {c.accountBlocked ? (
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px] border border-rose-500/30">
                          بله - (مسدود)
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">خیر</span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-300">{c.createdByName}</td>
                    <td className="p-3.5 text-slate-400 text-[10px]">{c.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Letters Table */}
        {activeSection === 'letters' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">شماره نامه</th>
                  <th className="p-3.5">عنوان / موضوع</th>
                  <th className="p-3.5">نویسنده</th>
                  <th className="p-3.5">گیرنده</th>
                  <th className="p-3.5">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredLetters.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 font-mono font-bold text-indigo-400">{l.letterNumber}</td>
                    <td className="p-3.5 font-bold text-white">{l.subject}</td>
                    <td className="p-3.5 text-slate-200">{l.creatorName}</td>
                    <td className="p-3.5 text-amber-300">{l.toUnit}</td>
                    <td className="p-3.5 text-slate-400 text-[10px]">{l.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. Vendors Table */}
        {activeSection === 'vendors' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">نام تامین‌کننده</th>
                  <th className="p-3.5">دسته‌بندی</th>
                  <th className="p-3.5">شماره تماس</th>
                  <th className="p-3.5">شماره کارت / شبا</th>
                  <th className="p-3.5">بانک</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 font-bold text-white">{v.name}</td>
                    <td className="p-3.5 text-amber-300">{v.categoryName || '-'}</td>
                    <td className="p-3.5 font-mono text-slate-300">{v.phone || '-'}</td>
                    <td className="p-3.5 font-mono text-emerald-400">{v.bankAccount || '-'}</td>
                    <td className="p-3.5 text-slate-400">{v.bankName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Cost Centers Table */}
        {activeSection === 'cost_centers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">کد مرکز هزینه</th>
                  <th className="p-3.5">نام شعبه</th>
                  <th className="p-3.5">سقف تنخواه</th>
                  <th className="p-3.5">سرپرست شعبه</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {availableCostCenters.map((cc) => (
                  <tr key={cc.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 font-mono font-bold text-indigo-400">{cc.code}</td>
                    <td className="p-3.5 font-bold text-white">{cc.name}</td>
                    <td className="p-3.5 font-mono font-bold text-emerald-400">{formatRial(cc.pettyCashLimit)}</td>
                    <td className="p-3.5 text-slate-200">{cc.managerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
};
