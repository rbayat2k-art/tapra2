import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, CheckCircle2, Eye, KeyRound, LogIn, Network, Pencil, Plus, RefreshCw,
  ShieldCheck, ToggleLeft, ToggleRight, UserPlus, Users, X,
} from 'lucide-react';
import { foundationApi, FoundationApiError } from '../api/client';
import type { OrganizationScopeType, OrganizationSnapshot } from '../api/contracts';
import { useFoundationSession } from '../auth/FoundationSessionContext';

type Tab = 'companies' | 'units' | 'users' | 'roles';

const scopeLabels: Record<OrganizationScopeType, string> = {
  WORKSPACE: 'کل Workspace', COMPANY: 'Company', BRANCH: 'Branch', DEPARTMENT: 'Department', TEAM: 'Team', SELF: 'خود کاربر',
};
const unitLabels = { BRANCH: 'شعبه', DEPARTMENT: 'دپارتمان', TEAM: 'تیم', SHARED_SERVICE: 'خدمت مشترک' } as const;

export function OrganizationAdminView({ initialTab = 'companies' }: { initialTab?: Tab }) {
  const { session, refresh: refreshSession, startImpersonation } = useFoundationSession();
  const [snapshot, setSnapshot] = useState<OrganizationSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporaryCredential, setTemporaryCredential] = useState<{ email: string; password: string } | null>(null);
  const [impersonationForm, setImpersonationForm] = useState({ userId: '', reason: '', durationMinutes: 15 });

  const [companyForm, setCompanyForm] = useState({ code: '', name: '', description: '' });
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState({ type: 'BRANCH' as OrganizationSnapshot['units'][number]['type'], companyId: '', code: '', name: '', serviceKind: 'MIS' as 'HR' | 'DATA' | 'MIS' | 'OTHER' });
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ fullName: '', email: '' });
  const [membershipForm, setMembershipForm] = useState({ personId: '', companyId: '' });
  const [roleForm, setRoleForm] = useState({ code: '', name: '', permissionCodes: [] as string[] });
  const [assignmentForm, setAssignmentForm] = useState({ membershipId: '', roleId: '', scopeType: 'COMPANY' as OrganizationScopeType, scopeId: '' });

  const permissions = session?.activeContext?.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);
  const workspaceScope = session?.activeContext?.scope.type === 'WORKSPACE';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await foundationApi.readOrganization();
      setSnapshot(response.organization);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'اطلاعات سازمان دریافت نشد.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load, session?.activeContext?.contextKey]);

  const mutate = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await operation(); await Promise.all([load(), refreshSession()]); }
    catch (caught) {
      const message = caught instanceof FoundationApiError ? caught.message : caught instanceof Error ? caught.message : 'عملیات انجام نشد.';
      setError(message);
    } finally { setBusy(false); }
  };

  const companiesById = useMemo(() => new Map(snapshot?.companies.map((company) => [company.id, company]) ?? []), [snapshot]);
  const rolesById = useMemo(() => new Map(snapshot?.roles.map((role) => [role.id, role]) ?? []), [snapshot]);

  const assignmentScopeId = () => {
    if (!snapshot) return undefined;
    if (assignmentForm.scopeType === 'WORKSPACE') return snapshot.workspace.id;
    if (assignmentForm.scopeType === 'SELF') {
      const membership = snapshot.memberships.find((item) => item.id === assignmentForm.membershipId);
      return membership?.personId;
    }
    return assignmentForm.scopeId || undefined;
  };

  const impersonationTarget = (user: OrganizationSnapshot['users'][number]) => {
    if (!snapshot) return null;
    for (const membership of snapshot.memberships.filter((item) => item.personId === user.personId && item.status === 'active')) {
      const assignment = snapshot.assignments.find((item) => item.membershipId === membership.id);
      if (!assignment) continue;
      const scopeId = assignment.scopeType === 'WORKSPACE' ? snapshot.workspace.id
        : assignment.scopeType === 'SELF' ? user.personId
          : assignment.organizationUnitId ?? assignment.companyId;
      if (scopeId) return { membershipId: membership.id, scopeType: assignment.scopeType, scopeId };
    }
    return null;
  };
  const requestedImpersonationUser = snapshot?.users.find((user) => user.id === impersonationForm.userId);
  const requestedImpersonationTarget = requestedImpersonationUser ? impersonationTarget(requestedImpersonationUser) : null;

  if (loading && !snapshot) return <div className="p-8 text-center text-slate-400">در حال دریافت ساختار سازمانی از Backend…</div>;
  if (!snapshot) return <div className="p-6 rounded-2xl border border-rose-800 bg-rose-950/30 text-rose-200">{error ?? 'داده سازمانی در دسترس نیست.'}</div>;

  return (
    <section className="space-y-5 dir-rtl text-right">
      <header className="rounded-3xl border border-slate-800 bg-slate-900 p-5 flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-lg font-black text-white flex items-center gap-2"><Network className="text-emerald-400" /> سازمان و مدیریت Server-backed</h2><p className="text-xs text-slate-400 mt-1">{snapshot.workspace.name} · {scopeLabels[snapshot.activeScope.type]}</p></div>
        <button onClick={() => void load()} className="p-2 rounded-xl border border-slate-700 text-slate-300" title="بازخوانی"><RefreshCw size={17} /></button>
      </header>
      {error && <div className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-xs text-rose-200">{error}</div>}
      {temporaryCredential && (
        <div className="rounded-2xl border border-amber-600/50 bg-amber-950/40 p-4 text-xs text-amber-100">
          <strong className="block mb-2 flex items-center gap-2"><KeyRound size={16} /> Credential موقت فقط همین یک‌بار نمایش داده می‌شود</strong>
          <div className="grid gap-2 sm:grid-cols-2 dir-ltr"><input readOnly value={temporaryCredential.email} className="rounded-lg bg-slate-950 border border-amber-800 p-2" /><input readOnly value={temporaryCredential.password} className="rounded-lg bg-slate-950 border border-amber-800 p-2 font-mono" /></div>
          <button onClick={() => setTemporaryCredential(null)} className="mt-2 underline">بستن امن</button>
        </div>
      )}
      <nav className="flex flex-wrap gap-2">
        {([['companies', 'Companyها', Building2], ['units', 'ساختار و Shared Services', Network], ['users', 'User و Membership', Users], ['roles', 'Role و Scope', ShieldCheck]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${tab === id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}><Icon size={15} />{label}</button>
        ))}
      </nav>

      {tab === 'companies' && <div className="space-y-4">
        {can('organization.company.manage') && (workspaceScope || editingCompanyId) && (
          <form onSubmit={(event) => { event.preventDefault(); void mutate(async () => {
            const editing = snapshot.companies.find((company) => company.id === editingCompanyId);
            if (editing) await foundationApi.updateCompany(editing.id, { ...companyForm, isActive: editing.isActive }, session!.csrfToken);
            else await foundationApi.createCompany(companyForm, session!.csrfToken);
            setCompanyForm({ code: '', name: '', description: '' }); setEditingCompanyId(null);
          }); }} className="grid gap-2 md:grid-cols-[1fr_2fr_3fr_auto_auto] rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <input required placeholder="Code" value={companyForm.code} onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value })} className="input-shell" />
            <input required placeholder="نام Company" value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} className="input-shell" />
            <input placeholder="توضیح" value={companyForm.description} onChange={(e) => setCompanyForm({ ...companyForm, description: e.target.value })} className="input-shell" />
            <button disabled={busy} className="rounded-xl bg-emerald-600 px-4 text-white" title={editingCompanyId ? 'ذخیره ویرایش Company' : 'ایجاد Company'}>{editingCompanyId ? <Pencil /> : <Plus />}</button>
            {editingCompanyId && <button type="button" onClick={() => { setEditingCompanyId(null); setCompanyForm({ code: '', name: '', description: '' }); }} className="rounded-xl border border-slate-700 px-3 text-slate-300" title="لغو ویرایش"><X /></button>}
          </form>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{snapshot.companies.map((company) => <article key={company.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between"><strong className="text-white">{company.name}</strong><span className="text-[10px] font-mono text-indigo-300">{company.code}</span></div><p className="mt-2 min-h-8 text-xs text-slate-400">{company.description || 'بدون توضیح'}</p>
          <div className="mt-3 flex items-center justify-between text-xs"><span className={company.isActive ? 'text-emerald-400' : 'text-rose-400'}>{company.isActive ? 'فعال' : 'غیرفعال'}</span>{can('organization.company.manage') && <div className="flex items-center gap-1"><button disabled={busy} onClick={() => { setEditingCompanyId(company.id); setCompanyForm({ code: company.code, name: company.name, description: company.description ?? '' }); }} className="p-1 text-slate-300" title="ویرایش Company"><Pencil /></button><button disabled={busy} onClick={() => void mutate(async () => { await foundationApi.updateCompany(company.id, { code: company.code, name: company.name, description: company.description ?? '', isActive: !company.isActive }, session!.csrfToken); })} className="p-1 text-slate-300" title="فعال/غیرفعال">{company.isActive ? <ToggleRight /> : <ToggleLeft />}</button></div>}</div>
        </article>)}</div>
      </div>}

      {tab === 'units' && <div className="space-y-4">
        {can('organization.unit.manage') && (
          <form onSubmit={(event) => { event.preventDefault(); void mutate(async () => {
            const input = { type: unitForm.type, companyId: unitForm.type === 'SHARED_SERVICE' ? undefined : unitForm.companyId, code: unitForm.code, name: unitForm.name, serviceKind: unitForm.type === 'SHARED_SERVICE' ? unitForm.serviceKind : undefined };
            const editing = snapshot.units.find((unit) => unit.id === editingUnitId);
            if (editing) await foundationApi.updateOrganizationUnit(editing.id, { ...input, isActive: editing.isActive }, session!.csrfToken);
            else await foundationApi.createOrganizationUnit(input, session!.csrfToken);
            setUnitForm({ ...unitForm, code: '', name: '' }); setEditingUnitId(null);
          }); }} className="grid gap-2 md:grid-cols-2 lg:grid-cols-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <select value={unitForm.type} onChange={(e) => setUnitForm({ ...unitForm, type: e.target.value as typeof unitForm.type })} className="input-shell">{Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            {unitForm.type === 'SHARED_SERVICE' ? <select value={unitForm.serviceKind} onChange={(e) => setUnitForm({ ...unitForm, serviceKind: e.target.value as typeof unitForm.serviceKind })} className="input-shell"><option value="HR">HR</option><option value="DATA">Data</option><option value="MIS">MIS</option><option value="OTHER">Other</option></select> : <select required value={unitForm.companyId} onChange={(e) => setUnitForm({ ...unitForm, companyId: e.target.value })} className="input-shell"><option value="">Company…</option>{snapshot.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>}
            <input required placeholder="Code" value={unitForm.code} onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })} className="input-shell" /><input required placeholder="نام واحد" value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} className="input-shell" /><button disabled={busy || (unitForm.type === 'SHARED_SERVICE' && !workspaceScope)} className="rounded-xl bg-emerald-600 px-4 text-white">{editingUnitId ? 'ذخیره' : 'افزودن'}</button>{editingUnitId && <button type="button" onClick={() => { setEditingUnitId(null); setUnitForm({ ...unitForm, code: '', name: '' }); }} className="rounded-xl border border-slate-700 px-3 text-slate-300" title="لغو ویرایش"><X /></button>}
          </form>
        )}
        <div className="overflow-x-auto rounded-2xl border border-slate-800"><table className="w-full text-xs"><thead className="bg-slate-900 text-slate-400"><tr><th className="p-3">نوع</th><th>نام</th><th>Company/Service</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{snapshot.units.map((unit) => <tr key={unit.id} className="border-t border-slate-800"><td className="p-3">{unitLabels[unit.type]}</td><td>{unit.name} <span className="text-slate-500">({unit.code})</span></td><td>{unit.companyId ? companiesById.get(unit.companyId)?.name : unit.serviceKind}</td><td className={unit.isActive ? 'text-emerald-400' : 'text-rose-400'}>{unit.isActive ? 'فعال' : 'غیرفعال'}</td><td><div className="flex gap-1"><button disabled={busy} onClick={() => { setEditingUnitId(unit.id); setUnitForm({ type: unit.type, companyId: unit.companyId ?? '', code: unit.code, name: unit.name, serviceKind: unit.serviceKind ?? 'OTHER' }); }} className="p-1.5 rounded-lg bg-slate-800" title="ویرایش واحد"><Pencil size={15} /></button><button disabled={busy} onClick={() => void mutate(async () => { await foundationApi.updateOrganizationUnit(unit.id, { type: unit.type, companyId: unit.companyId ?? undefined, code: unit.code, name: unit.name, serviceKind: unit.serviceKind ?? undefined, isActive: !unit.isActive }, session!.csrfToken); })} className="p-1.5 rounded-lg bg-slate-800" title="فعال/غیرفعال">{unit.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}</button></div></td></tr>)}</tbody></table></div>
      </div>}

      {tab === 'users' && <div className="space-y-4">
        {can('organization.user.manage') && workspaceScope && <form onSubmit={(event) => { event.preventDefault(); void mutate(async () => { const created = await foundationApi.createOrganizationUser(userForm, session!.csrfToken); setTemporaryCredential({ email: created.account.email, password: created.temporaryPassword }); setUserForm({ fullName: '', email: '' }); }); }} className="grid gap-2 md:grid-cols-[2fr_2fr_auto] rounded-2xl border border-slate-800 bg-slate-900 p-4"><input required placeholder="نام کامل" value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} className="input-shell" /><input required type="email" placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="input-shell dir-ltr" /><button disabled={busy} className="rounded-xl bg-indigo-600 px-4 text-white flex items-center gap-2"><UserPlus size={16} />ایجاد User</button></form>}
        {can('organization.membership.manage') && <form onSubmit={(event) => { event.preventDefault(); void mutate(async () => { await foundationApi.createMembership({ personId: membershipForm.personId, companyId: membershipForm.companyId || undefined }, session!.csrfToken); }); }} className="grid gap-2 md:grid-cols-[2fr_2fr_auto] rounded-2xl border border-slate-800 bg-slate-900 p-4"><select required value={membershipForm.personId} onChange={(e) => setMembershipForm({ ...membershipForm, personId: e.target.value })} className="input-shell"><option value="">User…</option>{snapshot.users.map((user) => <option key={user.id} value={user.personId}>{user.fullName}</option>)}</select><select value={membershipForm.companyId} onChange={(e) => setMembershipForm({ ...membershipForm, companyId: e.target.value })} className="input-shell"><option value="">Workspace-level</option>{snapshot.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><button disabled={busy} className="rounded-xl bg-emerald-600 px-4 text-white">ثبت Membership</button></form>}
        <div className="overflow-x-auto rounded-2xl border border-slate-800"><table className="w-full text-xs"><thead className="bg-slate-900 text-slate-400"><tr><th className="p-3">User</th><th>Email</th><th>Membership/Role</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{snapshot.users.map((user) => { const memberships = snapshot.memberships.filter((item) => item.personId === user.personId); const target = impersonationTarget(user); return <tr key={user.id} className="border-t border-slate-800"><td className="p-3 font-bold text-white">{user.fullName}</td><td className="dir-ltr">{user.email}</td><td>{memberships.map((membership) => { const roleNames = snapshot.assignments.filter((item) => item.membershipId === membership.id).map((item) => rolesById.get(item.roleId)?.name).filter(Boolean); return <div key={membership.id}>{membership.companyId ? companiesById.get(membership.companyId)?.name : 'Workspace'} · {roleNames.join('، ') || 'بدون Role'}</div>; })}</td><td className={user.isActive ? 'text-emerald-400' : 'text-rose-400'}>{user.isActive ? 'فعال' : 'غیرفعال'}</td><td><div className="flex gap-1">{can('organization.user.manage') && workspaceScope && user.id !== session?.actor.id && <button onClick={() => void mutate(async () => { await foundationApi.updateOrganizationUserStatus(user.id, !user.isActive, session!.csrfToken); })} className="p-1.5 rounded-lg bg-slate-800" title="فعال/غیرفعال">{user.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}</button>}{can('organization.impersonate') && !session?.impersonation && user.id !== session?.actor.id && user.isActive && target && <button onClick={() => setImpersonationForm({ userId: user.id, reason: '', durationMinutes: 15 })} className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600 hover:text-white" title={`ورود محدود و ثبت‌شده به نمای ${user.fullName}`}><LogIn size={15} /></button>}</div></td></tr>; })}</tbody></table></div>
      </div>}

      {tab === 'roles' && <div className="space-y-4">
        {can('organization.role.manage') && workspaceScope && <form onSubmit={(event) => { event.preventDefault(); void mutate(async () => { await foundationApi.createRole(roleForm, session!.csrfToken); setRoleForm({ code: '', name: '', permissionCodes: [] }); }); }} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3"><div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]"><input required placeholder="role.code" value={roleForm.code} onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })} className="input-shell dir-ltr" /><input required placeholder="نام Role" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} className="input-shell" /><button disabled={busy} className="rounded-xl bg-indigo-600 px-4 text-white">ایجاد Role</button></div><div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3 max-h-40 overflow-y-auto">{snapshot.permissions.map((permission) => <label key={permission.code} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={roleForm.permissionCodes.includes(permission.code)} onChange={(e) => setRoleForm({ ...roleForm, permissionCodes: e.target.checked ? [...roleForm.permissionCodes, permission.code] : roleForm.permissionCodes.filter((code) => code !== permission.code) })} />{permission.code}</label>)}</div></form>}
        {can('organization.role.manage') && <form onSubmit={(event) => { event.preventDefault(); const scopeId = assignmentScopeId(); void mutate(async () => { await foundationApi.assignRole({ membershipId: assignmentForm.membershipId, roleId: assignmentForm.roleId, scopeType: assignmentForm.scopeType, scopeId }, session!.csrfToken); }); }} className="grid gap-2 md:grid-cols-2 xl:grid-cols-5 rounded-2xl border border-slate-800 bg-slate-900 p-4"><select required value={assignmentForm.membershipId} onChange={(e) => setAssignmentForm({ ...assignmentForm, membershipId: e.target.value })} className="input-shell"><option value="">Membership…</option>{snapshot.memberships.filter((item) => item.status === 'active').map((membership) => { const user = snapshot.users.find((item) => item.personId === membership.personId); return <option key={membership.id} value={membership.id}>{user?.fullName} / {membership.companyId ? companiesById.get(membership.companyId)?.name : 'Workspace'}</option>; })}</select><select required value={assignmentForm.roleId} onChange={(e) => setAssignmentForm({ ...assignmentForm, roleId: e.target.value })} className="input-shell"><option value="">Role…</option>{snapshot.roles.filter((role) => role.isActive).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><select value={assignmentForm.scopeType} onChange={(e) => setAssignmentForm({ ...assignmentForm, scopeType: e.target.value as OrganizationScopeType, scopeId: '' })} className="input-shell">{Object.entries(scopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{assignmentForm.scopeType === 'COMPANY' ? <select required value={assignmentForm.scopeId} onChange={(e) => setAssignmentForm({ ...assignmentForm, scopeId: e.target.value })} className="input-shell"><option value="">Company…</option>{snapshot.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select> : ['BRANCH', 'DEPARTMENT', 'TEAM'].includes(assignmentForm.scopeType) ? <select required value={assignmentForm.scopeId} onChange={(e) => setAssignmentForm({ ...assignmentForm, scopeId: e.target.value })} className="input-shell"><option value="">واحد…</option>{snapshot.units.filter((unit) => unit.type === assignmentForm.scopeType).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select> : <div className="input-shell text-slate-500">Target خودکار</div>}<button disabled={busy} className="rounded-xl bg-emerald-600 px-4 text-white">تخصیص Scope</button></form>}
        <div className="grid gap-3 md:grid-cols-2">{snapshot.roles.map((role) => <article key={role.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between"><strong className="text-white">{role.name}</strong>{role.isSystem && <ShieldCheck size={16} className="text-amber-400" />}</div><p className="text-[10px] text-slate-500 dir-ltr mt-1">{role.code}</p><div className="mt-2 flex flex-wrap gap-1">{role.permissions.map((permission) => <span key={permission} className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{permission}</span>)}</div></article>)}</div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h3 className="font-bold text-white flex items-center gap-2"><Eye size={16} /> وضعیت mapping نقش‌های legacy</h3>{snapshot.legacyRoleMappings.length ? snapshot.legacyRoleMappings.map((mapping) => <div key={mapping.legacyRoleCode} className="mt-2 text-xs text-slate-300">{mapping.legacyRoleCode} → {mapping.migrationStatus}</div>) : <p className="mt-2 text-xs text-amber-300">Mappingهای legacy هنوز ثبت نشده‌اند؛ نقش‌ها حذف نشده‌اند و در Prototype محفوظ‌اند.</p>}</div>
      </div>}
      {requestedImpersonationUser && requestedImpersonationTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="impersonation-title"><form onSubmit={(event) => { event.preventDefault(); void (async () => { setBusy(true); setError(null); try { await startImpersonation({ targetUserAccountId: requestedImpersonationUser.id, targetMembershipId: requestedImpersonationTarget.membershipId, targetScopeType: requestedImpersonationTarget.scopeType, targetScopeId: requestedImpersonationTarget.scopeId, reason: impersonationForm.reason.trim(), durationMinutes: impersonationForm.durationMinutes }); setImpersonationForm({ userId: '', reason: '', durationMinutes: 15 }); } catch (caught) { setError(caught instanceof Error ? caught.message : 'شروع Impersonation انجام نشد.'); } finally { setBusy(false); } })(); }} className="w-full max-w-lg space-y-4 rounded-3xl border border-emerald-700 bg-slate-900 p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h3 id="impersonation-title" className="font-black text-white">ورود ممیزی‌شده به نمای {requestedImpersonationUser.fullName}</h3><p className="mt-1 text-xs text-slate-400">Permissionها از اشتراک دسترسی Admin و User هدف بیشتر نخواهند شد.</p></div><button type="button" onClick={() => setImpersonationForm({ userId: '', reason: '', durationMinutes: 15 })} className="rounded-lg p-1 text-slate-400" title="بستن"><X /></button></div><label className="block text-xs font-bold text-slate-200">دلیل الزامی<textarea aria-label="دلیل Impersonation" required minLength={3} maxLength={500} value={impersonationForm.reason} onChange={(event) => setImpersonationForm({ ...impersonationForm, reason: event.target.value })} className="input-shell mt-2 min-h-24 w-full" /></label><label className="block text-xs font-bold text-slate-200">مدت<select aria-label="مدت Impersonation" value={impersonationForm.durationMinutes} onChange={(event) => setImpersonationForm({ ...impersonationForm, durationMinutes: Number(event.target.value) })} className="input-shell mt-2 w-full"><option value={5}>۵ دقیقه</option><option value={15}>۱۵ دقیقه</option><option value={30}>۳۰ دقیقه</option></select></label><button disabled={busy || impersonationForm.reason.trim().length < 3} className="w-full rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-50">شروع نمای محدود و ثبت‌شده</button></form></div>}
      <footer className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-3 text-[11px] text-emerald-200 flex items-center gap-2"><CheckCircle2 size={15} />تمام تغییرات این صفحه از API، PostgreSQL، Authorization و Audit عبور می‌کنند.</footer>
    </section>
  );
}
