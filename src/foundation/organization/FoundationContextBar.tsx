import { Building2, LogOut, RefreshCw } from 'lucide-react';
import { useFoundationSession } from '../auth/FoundationSessionContext';

export function FoundationContextBar() {
  const { session, logout, selectContext } = useFoundationSession();
  if (!session?.activeContext) return null;
  const current = session.activeContext;
  return (
    <div className="bg-emerald-950 text-emerald-50 border-b border-emerald-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs dir-rtl">
      <div className="flex items-center gap-2"><Building2 size={16} /><strong>{current.workspace.name}</strong><span className="text-emerald-300">/</span><span>{current.company?.name ?? 'Workspace'}</span><span className="rounded bg-emerald-900 px-1.5 py-0.5">{current.organizationUnit?.name ?? current.scope.type}</span></div>
      <div className="flex items-center gap-2">
        {session.memberships.length > 1 && (
          <select aria-label="تغییر محیط کاری" value={current.contextKey} onChange={(event) => {
            const next = session.memberships.find((item) => item.contextKey === event.target.value);
            if (next) void selectContext(next);
          }} className="rounded-lg border border-emerald-700 bg-emerald-900 px-2 py-1">
            {session.memberships.map((item) => <option key={item.contextKey} value={item.contextKey}>{item.workspace.name} / {item.company?.name ?? 'Workspace'} / {item.organizationUnit?.name ?? item.scope.type}</option>)}
          </select>
        )}
        <button onClick={() => void selectContext(current)} title="بازخوانی دسترسی" className="p-1"><RefreshCw size={15} /></button>
        <button onClick={() => void logout()} className="flex items-center gap-1 rounded-lg border border-emerald-700 px-2 py-1"><LogOut size={14} /> خروج امن</button>
      </div>
    </div>
  );
}
