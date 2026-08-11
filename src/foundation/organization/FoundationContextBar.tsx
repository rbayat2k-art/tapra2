import { Building2, LogOut, RefreshCw } from 'lucide-react';
import { useFoundationSession } from '../auth/FoundationSessionContext';

export function FoundationContextBar() {
  const { session, logout, selectContext } = useFoundationSession();
  if (!session?.activeContext) return null;
  const current = session.activeContext;
  return (
    <div className="bg-emerald-950 text-emerald-50 border-b border-emerald-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs dir-rtl">
      <div className="flex items-center gap-2"><Building2 size={16} /><strong>{current.workspace.name}</strong><span className="text-emerald-300">/</span><span>{current.company?.name ?? 'بدون شرکت'}</span></div>
      <div className="flex items-center gap-2">
        {session.memberships.length > 1 && <select aria-label="تغییر محیط کاری" value={current.membershipId} onChange={(e) => void selectContext(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-900 px-2 py-1"><option value={current.membershipId}>محیط فعلی</option>{session.memberships.filter((item) => item.membershipId !== current.membershipId).map((item) => <option key={item.membershipId} value={item.membershipId}>{item.workspace.name} / {item.company?.name}</option>)}</select>}
        <button onClick={() => void selectContext(current.membershipId)} title="بازخوانی دسترسی" className="p-1"><RefreshCw size={15} /></button>
        <button onClick={() => void logout()} className="flex items-center gap-1 rounded-lg border border-emerald-700 px-2 py-1"><LogOut size={14} /> خروج امن</button>
      </div>
    </div>
  );
}
