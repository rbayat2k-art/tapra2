import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send, UserPlus, Users2 } from 'lucide-react';
import { FoundationApiError, foundationApi } from '../api/client';
import type { FoundationCustomer, SalesAssignee, SalesLead, SalesLeadDetail } from '../api/contracts';
import { useFoundationSession } from '../auth/FoundationSessionContext';
import { formatSalesDate, SALES_LEAD_STATUS_LABELS } from './labels';

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'عملیات Sales انجام نشد.';
}

export function SaasLeadAssignmentView() {
  const { session } = useFoundationSession();
  const permissions = session?.activeContext?.permissions ?? [];
  const canCreate = permissions.includes('sales.lead.create');
  const canAssign = permissions.includes('sales.lead.assign');
  const canReassign = permissions.includes('sales.lead.reassign');
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [customers, setCustomers] = useState<FoundationCustomer[]>([]);
  const [assignees, setAssignees] = useState<SalesAssignee[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [targetMembershipId, setTargetMembershipId] = useState('');
  const [reason, setReason] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [source, setSource] = useState('دستی');
  const [declaredInterest, setDeclaredInterest] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [campaignReference, setCampaignReference] = useState('');
  const [lastDetail, setLastDetail] = useState<SalesLeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadResponse, customerResponse, assigneeResponse] = await Promise.all([
        foundationApi.listSalesLeads(),
        canCreate ? foundationApi.listCustomers() : Promise.resolve({ customers: [] }),
        canAssign || canReassign ? foundationApi.listSalesAssignees() : Promise.resolve({ assignees: [] }),
      ]);
      setLeads(leadResponse.leads);
      setCustomers(customerResponse.customers);
      setAssignees(assigneeResponse.assignees);
      setError(null);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }, [canAssign, canCreate, canReassign, session?.activeContext?.membershipId]);

  useEffect(() => { void load(); }, [load]);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  const createLead = async () => {
    if (!session || !customerId || declaredInterest.trim().length < 2) {
      setError('Customer و علاقهٔ خرید را کامل کنید.');
      return;
    }
    setSaving(true);
    try {
      const response = await foundationApi.createSalesLead({
        customerId,
        source: source.trim(),
        declaredInterest: declaredInterest.trim(),
        priority,
        campaignReference: campaignReference.trim() || undefined,
        context: { ui: 'lead_assignment' },
      }, session.csrfToken);
      setLastDetail(response.lead);
      setSelectedLeadId(response.lead.id);
      setDeclaredInterest('');
      setCampaignReference('');
      await load();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setSaving(false);
    }
  };

  const assignLead = async () => {
    if (!session || !selectedLead || !targetMembershipId) {
      setError('یک Lead و فروشندهٔ مقصد انتخاب کنید.');
      return;
    }
    if (selectedLead.currentAssignee && reason.trim().length < 3) {
      setError('برای بازتخصیص Lead ثبت دلیل الزامی است.');
      return;
    }
    setSaving(true);
    try {
      const response = await foundationApi.assignSalesLead(selectedLead.id, {
        targetMembershipId,
        reason: reason.trim() || undefined,
      }, session.csrfToken);
      setLastDetail(response.lead);
      setReason('');
      setTargetMembershipId('');
      await load();
    } catch (caught) {
      if (caught instanceof FoundationApiError && caught.code === 'sales_lead_already_assigned') {
        setError('این Lead هم‌اکنون به همین فروشنده تخصیص دارد.');
      } else {
        setError(messageFrom(caught));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate && !canAssign && !canReassign) {
    return <div className="p-6 text-slate-500">دسترسی server-side لازم برای مدیریت Lead را ندارید.</div>;
  }

  return <div className="space-y-6 dir-rtl" dir="rtl">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800"><Users2 className="h-5 w-5" />تخصیص و انتقال Lead</h2>
        <p className="mt-1 text-sm text-slate-500">Lead و تاریخچهٔ تخصیص در PostgreSQL ثبت می‌شوند؛ بازتخصیص فقط با مجوز مدیر و دلیل انجام می‌شود.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />بازخوانی
      </button>
    </header>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

    {canCreate && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><UserPlus className="h-4 w-4" />ایجاد Lead برای Customer 360</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <select aria-label="Customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">-- انتخاب Customer --</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName} — {customer.phonePrimary}</option>)}
        </select>
        <input aria-label="علاقه خرید" value={declaredInterest} onChange={(event) => setDeclaredInterest(event.target.value)} placeholder="علاقه یا نیاز اعلام‌شده" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input aria-label="منبع Lead" value={source} onChange={(event) => setSource(event.target.value)} placeholder="منبع" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input aria-label="کمپین یا context" value={campaignReference} onChange={(event) => setCampaignReference(event.target.value)} placeholder="کد کمپین (اختیاری)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select aria-label="اولویت" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="low">کم</option><option value="normal">عادی</option><option value="high">زیاد</option>
        </select>
      </div>
      <button type="button" onClick={() => void createLead()} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">ایجاد Lead</button>
    </section>}

    {(canAssign || canReassign) && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">تخصیص یا بازتخصیص قابل ردیابی</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <select aria-label="Lead" value={selectedLeadId} onChange={(event) => setSelectedLeadId(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">-- انتخاب Lead --</option>
          {leads.filter((lead) => !['closed_won', 'closed_lost', 'wrong_number', 'complaint_blocked'].includes(lead.status)).map((lead) => (
            <option key={lead.id} value={lead.id}>{lead.trackingCode} — {lead.customerName} — {lead.currentAssignee?.name ?? 'تخصیص‌نیافته'}</option>
          ))}
        </select>
        <select aria-label="فروشنده مقصد" value={targetMembershipId} onChange={(event) => setTargetMembershipId(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">-- فروشنده مقصد --</option>
          {assignees.map((assignee) => <option key={assignee.membershipId} value={assignee.membershipId}>{assignee.fullName}</option>)}
        </select>
        <input aria-label="دلیل بازتخصیص" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={selectedLead?.currentAssignee ? 'دلیل بازتخصیص (الزامی)' : 'توضیح (اختیاری)'} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <button type="button" onClick={() => void assignLead()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />ثبت تخصیص</button>
    </section>}

    {lastDetail && <section aria-label="آخرین تاریخچه تخصیص" className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
      <strong>{lastDetail.trackingCode}</strong> — {lastDetail.assignments.length} رویداد تخصیص؛ آخرین تغییر {formatSalesDate(lastDetail.updatedAt)}
    </section>}

    <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
      {loading ? <p className="py-8 text-center text-slate-400">در حال دریافت Leadها…</p> : <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-200 text-right text-slate-500"><th className="px-2 py-2">کد</th><th className="px-2 py-2">Customer</th><th className="px-2 py-2">وضعیت</th><th className="px-2 py-2">مالک فعلی</th><th className="px-2 py-2">کمپین/context</th><th className="px-2 py-2">آخرین تغییر</th></tr></thead>
        <tbody>{leads.map((lead) => <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50">
          <td className="px-2 py-2 font-mono">{lead.trackingCode}</td><td className="px-2 py-2">{lead.customerName}</td>
          <td className="px-2 py-2">{SALES_LEAD_STATUS_LABELS[lead.status]}</td><td className="px-2 py-2">{lead.currentAssignee?.name ?? 'تخصیص‌نیافته'}</td>
          <td className="px-2 py-2">{lead.campaignReference ?? lead.source}</td><td className="px-2 py-2 text-slate-500">{formatSalesDate(lead.updatedAt)}</td>
        </tr>)}</tbody>
      </table>}
    </section>
  </div>;
}
