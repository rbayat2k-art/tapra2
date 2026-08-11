import React, { useCallback, useEffect, useState } from 'react';
import { Database, Loader2, Plus, RefreshCw, Users } from 'lucide-react';
import { FoundationApiError, foundationApi } from '../api/client';
import type { FoundationCustomer } from '../api/contracts';
import { useFoundationSession } from '../auth/FoundationSessionContext';

export function SaasCustomersView() {
  const { session } = useFoundationSession();
  const [customers, setCustomers] = useState<FoundationCustomer[]>([]);
  const [fullName, setFullName] = useState('');
  const [phonePrimary, setPhonePrimary] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = session?.activeContext?.permissions.includes('customer.create') ?? false;
  const load = useCallback(async () => {
    setLoading(true);
    try { setCustomers((await foundationApi.listCustomers()).customers); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'دریافت مشتریان انجام نشد.'); }
    finally { setLoading(false); }
  }, [session?.activeContext?.membershipId]);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    try {
      await foundationApi.createCustomer({ fullName, phonePrimary }, session.csrfToken);
      setFullName(''); setPhonePrimary(''); await load();
    } catch (caught) {
      setError(caught instanceof FoundationApiError ? caught.message : 'ثبت مشتری انجام نشد.');
    } finally { setSaving(false); }
  };

  return (
    <section className="max-w-4xl space-y-5 dir-rtl">
      <header className="rounded-3xl border border-emerald-800/40 bg-slate-900 p-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-400"><Users /></div><div><h2 className="font-extrabold text-lg">مشتریان SaaS</h2><p className="text-xs text-slate-400 mt-1">داده‌ی پایدار PostgreSQL در محیط کاری فعال</p></div></div>
        <button onClick={() => void load()} className="rounded-xl border border-slate-700 p-2 text-slate-300" title="بازخوانی"><RefreshCw size={18} /></button>
      </header>
      {canCreate && <form onSubmit={create} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input aria-label="نام مشتری جدید" value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} required placeholder="نام و نام خانوادگی" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" />
        <input aria-label="شماره تماس مشتری جدید" dir="ltr" value={phonePrimary} onChange={(e) => setPhonePrimary(e.target.value)} minLength={7} required placeholder="09121234567" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" />
        <button disabled={saving} className="rounded-xl bg-emerald-600 px-4 font-bold flex items-center justify-center gap-2 disabled:opacity-60">{saving ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />} ثبت</button>
      </form>}
      {!canCreate && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">دسترسی شما در این محیط فقط خواندنی است.</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
      {loading ? <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-emerald-400" /></div> : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          {customers.length === 0 ? <p className="p-8 text-center text-slate-400">هنوز مشتری‌ای در این شرکت ثبت نشده است.</p> : customers.map((customer) => <article key={customer.id} className="p-4 border-b last:border-b-0 border-slate-800 flex items-center justify-between gap-3"><div><strong className="block">{customer.fullName}</strong><span dir="ltr" className="text-sm text-slate-400">{customer.phonePrimary}</span></div><Database size={17} className="text-emerald-500" /></article>)}
        </div>
      )}
    </section>
  );
}
