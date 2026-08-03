import React, { useState } from 'react';
import { User, Company, CostCenter, UserRole, PaymentRequest, SystemPermission, SystemRole } from '../types';
import { storage, DEFAULT_ROLE_ID_MAP } from '../utils/storage';
import { CompaniesView } from './CompaniesView';
import { CostCentersView } from './CostCentersView';
import { 
  ShieldCheck, UserPlus, Key, Phone, Mail, 
  Building, Building2, MapPin, CheckCircle2, UserX, Edit2, Plus, 
  Trash2, Lock, Eye, EyeOff, ShieldAlert, Sparkles, Send, ChevronDown, ChevronUp 
} from 'lucide-react';

interface AdminPanelProps {
  users: User[];
  companies: Company[];
  costCenters: CostCenter[];
  requests: PaymentRequest[];
  roles: SystemRole[];
  currentUser: User | null;
  onUpdateUsers: (newUsers: User[]) => void;
  onUpdateCompanies: (newComp: Company[]) => void;
  onUpdateCostCenters: (newCC: CostCenter[]) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  users,
  companies,
  costCenters,
  requests,
  roles,
  currentUser,
  onUpdateUsers,
  onUpdateCompanies,
  onUpdateCostCenters
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'cost_centers' | 'companies'>('users');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  
  // Modals State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordChangeUser, setPasswordChangeUser] = useState<User | null>(null);
  
  // Show password toggle
  const [showPasswordMap, setShowPasswordMap] = useState<{ [key: string]: boolean }>({});

  // Form State for User Creation/Edit
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('approver');
  const [roleId, setRoleId] = useState<string>('role_branch_approver');
  const [roleTitle, setRoleTitle] = useState('مدیر تاییدکننده شعبه');
  const [companyId, setCompanyId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [allowedCostCenterIds, setAllowedCostCenterIds] = useState<string[]>([]);
  
  // Custom User Workflow Route State
  const [allowedApproverIds, setAllowedApproverIds] = useState<string[]>([]);
  const [chainStepsCount, setChainStepsCount] = useState<1 | 2 | 3>(1);
  const [step1ApproverId, setStep1ApproverId] = useState<string>('');
  const [step2ApproverId, setStep2ApproverId] = useState<string>('user_admin_reza');
  const [step3ApproverId, setStep3ApproverId] = useState<string>('user_treasury_exec');
  const [allowDirectToTreasury, setAllowDirectToTreasury] = useState<boolean>(true);
  const [workflowNote, setWorkflowNote] = useState<string>('');

  // Task & Directive Permissions State
  const [canIssueTasks, setCanIssueTasks] = useState<boolean>(true);
  const [canExecuteTasks, setCanExecuteTasks] = useState<boolean>(true);

  // Extra permissions granted on top of the user's base role (e.g. give a
  // branch approver support-case access without changing their main role)
  const [customPermissions, setCustomPermissions] = useState<SystemPermission[]>([]);

  // Dual-role (requestor + approver) & senior treasury supervisor designation
  const [isDualRole, setIsDualRole] = useState<boolean>(false);
  const [isSeniorTreasurySupervisor, setIsSeniorTreasurySupervisor] = useState<boolean>(false);

  // Quick Password Change State
  const [newPasswordValue, setNewPasswordValue] = useState('');

  // Accordion / Collapsible states for User Modal sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    branches: false,
    tasks: false,
    customPerms: false,
    dualRole: true,
    forward: true,
    chain: true,
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAllSections = () => {
    setOpenSections({
      branches: true,
      tasks: true,
      customPerms: true,
      dualRole: true,
      forward: true,
      chain: true,
    });
  };

  const collapseAllSections = () => {
    setOpenSections({
      branches: false,
      tasks: false,
      customPerms: false,
      dualRole: false,
      forward: false,
      chain: false,
    });
  };

  const toggleShowPassword = (id: string) => {
    setShowPasswordMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenAddUser = () => {
    setEditingUser(null);
    setFullName('');
    setUsername('');
    setPassword('123456');
    setPhone('');
    setEmail('');
    setRole('approver');
    setRoleId(DEFAULT_ROLE_ID_MAP['approver']);
    setRoleTitle('مدیر تاییدکننده شعبه');
    setCompanyId(companies[0]?.id || 'comp_sales');
    setCostCenterId(costCenters[0]?.id || 'cc_saadatabad');
    setAllowedCostCenterIds(costCenters.map(cc => cc.id));
    setAllowedApproverIds(['user_admin_reza', 'user_approver_sales']);
    setChainStepsCount(1);
    setStep1ApproverId('user_approver_sales');
    setStep2ApproverId('user_admin_reza');
    setStep3ApproverId('user_treasury_exec');
    setAllowDirectToTreasury(true);
    setWorkflowNote('ارجاع بر اساس فرم چارت گردش کار استاندارد سیستم');
    setCanIssueTasks(true);
    setCanExecuteTasks(true);
    setIsDualRole(false);
    setIsSeniorTreasurySupervisor(false);
    setCustomPermissions([]);
    setShowAddUserModal(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setFullName(u.fullName);
    setUsername(u.username);
    setPassword(u.password || '123456');
    setPhone(u.phone);
    setEmail(u.email);
    setRole(u.role);
    setRoleId(u.roleId || DEFAULT_ROLE_ID_MAP[u.role]);
    setRoleTitle(u.roleTitle);
    setCompanyId(u.companyId || companies[0]?.id || 'comp_sales');
    setCostCenterId(u.costCenterId || costCenters[0]?.id || 'cc_saadatabad');
    setAllowedCostCenterIds(u.allowedCostCenterIds || (u.costCenterId ? [u.costCenterId] : costCenters.map(cc => cc.id)));
    
    // Workflow state
    const currentCount = u.approvalChain ? u.approvalChain.length : 1;
    setChainStepsCount(currentCount === 2 ? 2 : currentCount === 3 ? 3 : 1);
    setAllowedApproverIds(u.allowedApproverIds || ['user_admin_reza', 'user_approver_sales']);
    setStep1ApproverId(u.approvalChain?.[0] || 'user_approver_sales');
    setStep2ApproverId(u.approvalChain?.[1] || 'user_admin_reza');
    setStep3ApproverId(u.approvalChain?.[2] || 'user_treasury_exec');
    setAllowDirectToTreasury(u.allowDirectToTreasury ?? true);
    setWorkflowNote(u.workflowNote || '');
    setCanIssueTasks(u.canIssueTasks ?? true);
    setCanExecuteTasks(u.canExecuteTasks ?? true);
    setIsDualRole(u.isDualRole ?? false);
    setIsSeniorTreasurySupervisor(u.isSeniorTreasurySupervisor ?? false);
    setCustomPermissions(u.customPermissions || []);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !username.trim()) {
      alert('لطفاً نام و نام کاربری را وارد کنید.');
      return;
    }

    let chain: string[] = [];
    if (chainStepsCount === 1) {
      chain = [step1ApproverId || users.find(u => u.role === 'approver' || u.role === 'admin')?.id || users[0].id];
    } else if (chainStepsCount === 2) {
      chain = [step1ApproverId, step2ApproverId].filter(Boolean);
    } else {
      chain = [step1ApproverId, step2ApproverId, step3ApproverId].filter(Boolean);
    }
    // Respect an intentionally empty branch list (e.g. a task-only worker with no branch tie)
    // instead of forcing a fallback branch on them.
    const finalAllowedBranches = allowedCostCenterIds;

    if (editingUser) {
      // Update existing user
      let updated = users.map(u => u.id === editingUser.id ? {
        ...u,
        fullName: fullName.trim(),
        username: username.trim(),
        password: password.trim() || '123456',
        phone: phone.trim() || u.phone,
        email: email.trim() || u.email,
        role,
        roleTitle: roleTitle.trim() || u.roleTitle,
        companyId,
        costCenterId,
        allowedCostCenterIds: finalAllowedBranches,
        allowedApproverIds,
        approvalChain: chain,
        allowDirectToTreasury,
        workflowNote: workflowNote.trim(),
        canIssueTasks,
        canExecuteTasks,
        isDualRole,
        isSeniorTreasurySupervisor,
        customPermissions,
        roleId
      } : u);

      // Only one user may hold the senior treasury supervisor designation at a time
      if (isSeniorTreasurySupervisor) {
        updated = updated.map(u => u.id === editingUser.id ? u : { ...u, isSeniorTreasurySupervisor: false });
      }

      onUpdateUsers(updated);
      storage.saveUsers(updated);
      setEditingUser(null);
      alert('اطلاعات، دسترسی‌ها و وضعیت کاربری با موفقیت بروزرسانی شد.');
    } else {
      // Add new user
      const newUser: User = {
        id: `user_${Date.now()}`,
        username: username.trim(),
        password: password.trim() || '123456',
        fullName: fullName.trim(),
        phone: phone.trim() || '09120000000',
        email: email.trim() || `${username}@shavaz.com`,
        role,
        roleTitle: roleTitle.trim() || 'کاربر سیستم',
        companyId,
        costCenterId,
        allowedCostCenterIds: finalAllowedBranches,
        isActive: true,
        allowedApproverIds,
        approvalChain: chain,
        allowDirectToTreasury,
        workflowNote: workflowNote.trim(),
        canIssueTasks,
        canExecuteTasks,
        isDualRole,
        isSeniorTreasurySupervisor,
        customPermissions,
        roleId
      };

      let updated = [...users, newUser];
      if (isSeniorTreasurySupervisor) {
        updated = updated.map(u => u.id === newUser.id ? u : { ...u, isSeniorTreasurySupervisor: false });
      }
      onUpdateUsers(updated);
      storage.saveUsers(updated);
      setShowAddUserModal(false);
      alert('کاربر جدید با مسیر تاییدات اختصاصی ایجاد گردید.');
    }
  };

  const handleQuickPasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordChangeUser || !newPasswordValue.trim()) return;

    const updated = users.map(u => u.id === passwordChangeUser.id ? {
      ...u,
      password: newPasswordValue.trim()
    } : u);

    onUpdateUsers(updated);
    storage.saveUsers(updated);
    setPasswordChangeUser(null);
    setNewPasswordValue('');
    alert('رمز عبور جدید کاربر با موفقیت ثبت گردید.');
  };

  const handleToggleUserActive = (userId: string) => {
    const updated = users.map(u => {
      if (u.id === userId) {
        return { ...u, isActive: !u.isActive };
      }
      return u;
    });
    onUpdateUsers(updated);
    storage.saveUsers(updated);
  };

  const handleDeleteUser = (u: User) => {
    if (u.id === currentUser?.id || u.username === 'admin') {
      alert('نمی‌توانید حساب کاربری ادمین اصلی جاری را حذف فیزیکی یا تغییر نام دهید.');
      return;
    }

    // Check user activities & logs across system
    const userRequests = requests.filter(r => 
      r.requestorId === u.id || 
      r.currentApproverId === u.id || 
      r.approvalHistory?.some(h => h.actorId === u.id) ||
      r.timeline?.some(t => t.actorName === u.fullName || t.nextActorName === u.fullName)
    );
    const userTasks = storage.getTasks().filter(t => 
      t.assignerId === u.id || 
      t.assigneeId === u.id ||
      t.messages?.some(m => m.senderId === u.id)
    );

    if (userRequests.length > 0 || userTasks.length > 0) {
      alert(`⛔ امکان حذف حساب کاربری "${u.fullName}" وجود ندارد!\n\nعلت: این کاربر دارای سوابق اجرایی و لاگ ثبت‌شده در سیستم می‌باشد (تعداد ${userRequests.length} درخواست پرداخت و ${userTasks.length} دستور اداری/کار محوله مربوط به این کاربر ثبت شده است).\n\nبرای حفظ یکپارچگی اطلاعات، اسناد مالی و سوابق پیگیری، امکان حذف فیزیکی وجود ندارد. شما به عنوان ادمین می‌توانید روی دکمه «غیرفعال‌سازی» کلیک کنید تا حساب کاربر مسدود شده و به تب «کاربران غیرفعال» منتقل گردد.`);
      return;
    }

    if (confirm(`آیا از حذف کامل و دائمی حساب کاربری بدون لاگ "${u.fullName}" اطمینان دارید؟`)) {
      const updated = users.filter(user => user.id !== u.id);
      onUpdateUsers(updated);
      storage.saveUsers(updated);
      alert('حساب کاربری جدید که فاقد هرگونه لاگ در سیستم بود، با موفقیت حذف گردید.');
    }
  };

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Admin Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">
              پنل مدیریت ارشد ادمین (Super Admin Management)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              مدیریت کامل دسترسی کاربران، ویرایش رمز عبور، شعب فروش، مراکز هزینه و شرکت‌های هلدینگ
            </p>
          </div>
        </div>

        {/* Super Admin Info Badge */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 flex items-center gap-3">
          <Key className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <div className="font-bold">ادمین ارشد سیستم: رضا بیات</div>
            <div className="text-[10px] text-amber-300">نام کاربری: admin | تلفن: 09330297784</div>
          </div>
        </div>
      </div>

      {/* Pending Approval Notice Banner */}
      {users.filter(u => !u.isActive).length > 0 && (
        <div className="p-4 bg-amber-500/15 border border-amber-500/40 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-amber-300 text-xs font-bold">
            <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400" />
            <span>تعداد {users.filter(u => !u.isActive).length} کاربر جدید ثبت‌نام نموده و در انتظار بررسی و تایید دسترسی شما هستند.</span>
          </div>
          <button
            onClick={() => setActiveSubTab('users')}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl transition shrink-0 cursor-pointer"
          >
            مشاهده و تایید کاربران
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('users')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'users' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-indigo-300" />
          <span>مدیریت کاربران و دسترسی‌ها ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('cost_centers')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'cost_centers' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          <MapPin className="w-4 h-4 text-amber-400" />
          <span>شعب فروش و مراکز هزینه ({costCenters.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('companies')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'companies' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          <Building className="w-4 h-4 text-indigo-400" />
          <span>شرکت‌های گروه ({companies.length})</span>
        </button>
      </div>

      {/* Users Sub-Tab Content */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>مدیریت حساب‌های کاربری</span>
              </h3>
              
              {/* User Status Filter Switcher */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold mr-2">
                <button
                  onClick={() => setUserStatusFilter('all')}
                  className={`px-3 py-1 rounded-xl transition cursor-pointer ${
                    userStatusFilter === 'all' 
                      ? 'bg-indigo-600 text-white shadow' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  همه کاربران ({users.length})
                </button>
                <button
                  onClick={() => setUserStatusFilter('active')}
                  className={`px-3 py-1 rounded-xl transition cursor-pointer flex items-center gap-1 ${
                    userStatusFilter === 'active' 
                      ? 'bg-emerald-600 text-white shadow' 
                      : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  <span>کاربران فعال</span>
                  <span className="bg-emerald-950 px-1.5 py-0.2 rounded-full text-[10px] text-emerald-300">
                    {users.filter(u => u.isActive).length}
                  </span>
                </button>
                <button
                  onClick={() => setUserStatusFilter('inactive')}
                  className={`px-3 py-1 rounded-xl transition cursor-pointer flex items-center gap-1 ${
                    userStatusFilter === 'inactive' 
                      ? 'bg-amber-600 text-white shadow' 
                      : 'text-amber-400 hover:text-amber-300'
                  }`}
                >
                  <span>کاربران غیرفعال / مسدود</span>
                  <span className="bg-amber-950 px-1.5 py-0.2 rounded-full text-[10px] text-amber-300">
                    {users.filter(u => !u.isActive).length}
                  </span>
                </button>
              </div>
            </div>

            <button
              onClick={handleOpenAddUser}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>افزودن کاربر جدید</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">نام و نام خانوادگی</th>
                    <th className="p-3.5">نام کاربری</th>
                    <th className="p-3.5">رمز عبور</th>
                    <th className="p-3.5">تلفن و ایمیل</th>
                    <th className="p-3.5">نقش / عنوان شغلی</th>
                    <th className="p-3.5">شرکت و شعبه مربوطه</th>
                    <th className="p-3.5">وضعیت</th>
                    <th className="p-3.5 text-center">عملیات ادمین</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users
                    .filter(u => {
                      if (userStatusFilter === 'active') return u.isActive;
                      if (userStatusFilter === 'inactive') return !u.isActive;
                      return true;
                    })
                    .map((u) => {
                    const comp = companies.find(c => c.id === u.companyId);
                    const cc = costCenters.find(c => c.id === u.costCenterId);
                    const isPassVisible = showPasswordMap[u.id];

                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3.5 font-bold text-white flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-300 font-bold flex items-center justify-center shrink-0">
                            {u.fullName.slice(0, 1)}
                          </div>
                          <span>{u.fullName}</span>
                        </td>

                        <td className="p-3.5 font-mono font-bold text-indigo-300">{u.username}</td>

                        <td className="p-3.5 font-mono">
                          <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-1 rounded border border-slate-800 w-fit">
                            <span>{isPassVisible ? (u.password || '123456') : '••••••••'}</span>
                            <button
                              onClick={() => toggleShowPassword(u.id)}
                              className="text-slate-400 hover:text-white"
                              title={isPassVisible ? 'مخفی کردن' : 'نمایش رمز'}
                            >
                              {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <div className="font-mono text-slate-200">{u.phone}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{u.email}</div>
                        </td>

                        <td className="p-3.5">
                          <span className="font-bold text-slate-200 block">{u.roleTitle}</span>
                          <span className="text-[10px] text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/50">
                            {u.role === 'admin' ? 'ادمین ارشد' : u.role === 'approver' ? 'تاییدکننده' : u.role === 'treasury_executor' ? 'مجری واریز' : 'درخواست‌کننده'}
                          </span>
                        </td>

                        <td className="p-3.5 max-w-[220px]">
                          {u.allowedCostCenterIds && u.allowedCostCenterIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.allowedCostCenterIds.slice(0, 3).map(ccId => {
                                const branchObj = costCenters.find(c => c.id === ccId);
                                return (
                                  <span key={ccId} className="text-[10px] bg-slate-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-900/60 font-bold">
                                    {branchObj?.name || ccId}
                                  </span>
                                );
                              })}
                              {u.allowedCostCenterIds.length > 3 && (
                                <span className="text-[10px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800 font-bold">
                                  +{u.allowedCostCenterIds.length - 3} شعبه دیگر
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-slate-300 font-bold">{cc?.name || 'دفتر مرکزی'}</div>
                          )}
                          <div className="text-[10px] text-slate-500 mt-0.5">{comp?.name || 'گروه شاواز'}</div>
                        </td>

                        <td className="p-3.5">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1 w-fit ${
                            u.isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                          }`}>
                            {u.isActive ? 'فعال' : 'در انتظار تایید ادمین'}
                          </span>
                        </td>

                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Edit Button */}
                            <button
                              onClick={() => handleOpenEditUser(u)}
                              className="p-1.5 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white rounded-lg transition"
                              title="ویرایش اطلاعات کاربر"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Quick Change Password */}
                            <button
                              onClick={() => {
                                setPasswordChangeUser(u);
                                setNewPasswordValue(u.password || '');
                              }}
                              className="p-1.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-slate-950 rounded-lg transition"
                              title="تغییر سریع رمز عبور"
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>

                            {/* Active/Inactive Toggle */}
                            <button
                              onClick={() => handleToggleUserActive(u.id)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition flex items-center gap-1 cursor-pointer ${
                                u.isActive 
                                  ? 'bg-slate-800 text-slate-400 hover:text-rose-300 hover:bg-rose-950/50' 
                                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                              }`}
                            >
                              {u.isActive ? 'غیرفعال‌سازی' : 'تایید و فعال‌سازی'}
                            </button>

                            {/* Delete User */}
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white rounded-lg transition"
                              title="حذف کاربر"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cost Centers Sub-Tab Content */}
      {activeSubTab === 'cost_centers' && (
        <CostCentersView
          costCenters={costCenters}
          companies={companies}
          requests={requests}
          currentUser={currentUser}
          onUpdateCostCenters={onUpdateCostCenters}
        />
      )}

      {/* Companies Sub-Tab Content */}
      {activeSubTab === 'companies' && (
        <CompaniesView
          companies={companies}
          currentUser={currentUser}
          onUpdateCompanies={onUpdateCompanies}
        />
      )}

      {/* Add / Edit User Modal */}
      {(showAddUserModal || editingUser) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 text-right space-y-4 max-h-[90vh] overflow-y-auto my-8">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-400" />
              <span>{editingUser ? 'ویرایش کاربر و تعیین دسترسی' : 'افزودن کاربر و تعریف دسترسی جدید'}</span>
            </h3>
            
            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">نام و نام خانوادگی</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="رضا حسینی"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">نام کاربری (نام ورود)</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="r.hoseini"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">رمز عبور کاربر</label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="123456"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">شماره همراه (موبایل)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09121112233"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">ایمیل</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hoseini@shavaz.com"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">نقش و سطح دسترسی سیستم</label>
                <select
                  value={role}
                  onChange={(e) => {
                    const newRole = e.target.value as UserRole;
                    setRole(newRole);
                    setRoleId(DEFAULT_ROLE_ID_MAP[newRole]);
                  }}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="requestor">درخواست‌کننده (مسئول خرید / پرسنل شعب)</option>
                  <option value="approver">تاییدکننده (مدیر واحد / سرپرست شعبه)</option>
                  <option value="treasury_executor">کارمند اجرای واریز خزانه‌داری</option>
                  <option value="support_agent">کارشناس پشتیبانی و خدمات پس از فروش</option>
                  <option value="financial_approver">کارشناس تایید مالی (خدمات پس از فروش)</option>
                  <option value="admin">مدیر کل خزانه‌داری (Super Admin)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">نقش دقیق سیستمی (RBAC)</label>
                <span className="text-[10px] text-slate-400 block mb-1">
                  همان دسترسی‌هایی که در «نقش‌ها و دسترسی‌ها» تعریف کرده‌اید، اینجا اعمال می‌شود — چیزی که تیک نخورده باشد، این کاربر اصلاً نمی‌بیند. برای اکثر کاربران نیازی به تغییر این گزینه نیست؛ فقط برای نقش‌های سفارشی استفاده کنید.
                </span>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}{r.isSystemRole ? '' : ' (سفارشی)'}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">عنوان شغلی رسمی</label>
                <input
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="مثال: سرپرست فروش شعب یا مسول خرید"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-0.5">شرکت مربوطه (پیش‌فرض)</label>
                  <span className="text-[10px] text-slate-400 block mb-1">پیش‌فرض اولیه در ثبت درخواست</span>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700"
                  >
                    <option value="">— بدون شرکت خاص (کاربر عمومی سیستم) —</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-0.5">مرکز هزینه / شعبه اصلی (پیش‌فرض)</label>
                  <span className="text-[10px] text-slate-400 block mb-1">شعبه اصلی کاربر در فرم اولیه</span>
                  <select
                    value={costCenterId}
                    onChange={(e) => setCostCenterId(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700"
                  >
                    <option value="">— بدون شعبه خاص —</option>
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Accordion Expand/Collapse All */}
              <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                <span className="font-bold text-slate-300">تنظیمات پیشرفته و سطوح دسترسی (کشویی):</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandAllSections}
                    className="text-indigo-400 hover:underline font-bold cursor-pointer"
                  >
                    باز کردن همه کشوها
                  </button>
                  <span>|</span>
                  <button
                    type="button"
                    onClick={collapseAllSections}
                    className="text-rose-400 hover:underline font-bold cursor-pointer"
                  >
                    بستن همه کشوها
                  </button>
                </div>
              </div>

              {/* Multi-Select Branches Box */}
              <div className="p-3.5 bg-slate-950/90 border border-indigo-500/30 rounded-2xl space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection('branches')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-xs font-extrabold text-indigo-300 truncate">
                      {role === 'requestor'
                        ? 'شعب و مراکزی که این درخواست‌کننده مجاز به ثبت درخواست در آن‌هاست'
                        : role === 'approver'
                        ? 'شعب و مراکزی که این تاییدکننده مجاز به بررسی و تایید آن‌هاست'
                        : 'دسترسی شعب و مراکز هزینه (مدیریت کل)'}
                    </span>
                    <span className="text-[10px] font-bold bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-800/60 shrink-0">
                      {allowedCostCenterIds.length} شعبه مجاز
                    </span>
                  </div>
                  {openSections.branches ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.branches && (
                  <div className="pt-2 border-t border-slate-800 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-end gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setAllowedCostCenterIds(costCenters.map(cc => cc.id))}
                        className="text-indigo-400 hover:underline font-bold cursor-pointer"
                      >
                        انتخاب همه شعب
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setAllowedCostCenterIds([])}
                        className="text-rose-400 hover:underline font-bold cursor-pointer"
                      >
                        پاک کردن
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      {role === 'requestor'
                        ? 'تیک تمام شعب و مراکز هزینه‌ای که این شخص مجاز است برای آن‌ها درخواست پرداخت ثبت کند را بزنید:'
                        : role === 'approver'
                        ? 'تیک تمام شعب و مراکز هزینه‌ای که این شخص مجاز است فاکتورها و درخواست‌هایشان را تایید کند بزنید:'
                        : 'کاربر با این نقش، مدیر کل سیستم بوده و به تمامی شعب و مراکز هزینه دسترسی کامل دارد.'}
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-1">
                      {costCenters.map((cc) => {
                        const isSelected = allowedCostCenterIds.includes(cc.id);
                        return (
                          <label
                            key={cc.id}
                            className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                              isSelected
                                ? 'bg-indigo-600/30 border-indigo-500 text-white shadow'
                                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAllowedCostCenterIds([...allowedCostCenterIds, cc.id]);
                                } else {
                                  setAllowedCostCenterIds(allowedCostCenterIds.filter(id => id !== cc.id));
                                }
                              }}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-700 bg-slate-800 focus:ring-indigo-500"
                            />
                            <span className="truncate">{cc.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Task & Directive Permissions Box (صادرکننده / مجری کارهای محوله) */}
              <div className="p-3.5 bg-slate-950/90 border border-indigo-500/30 rounded-2xl space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection('tasks')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-xs font-extrabold text-indigo-300 truncate">
                      تعیین نقش کاربر در ماژول دستورات اداری و کارهای محوله
                    </span>
                    <span className="text-[10px] font-bold bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-800/60 shrink-0">
                      {canIssueTasks && canExecuteTasks ? 'صادرکننده و مجری' : canIssueTasks ? 'فقط صادرکننده' : canExecuteTasks ? 'فقط مجری' : 'بدون دسترسی'}
                    </span>
                  </div>
                  {openSections.tasks ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.tasks && (
                  <div className="pt-2 border-t border-slate-800 space-y-2.5 animate-fade-in">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      مدیر سیستم می‌تواند مشخص کند این کاربر مجاز به «ثبت/صدور دستور به دیگران» است، یا «مجری و انجام‌دهنده کارهای محوله»، و یا هر دو:
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2.5 cursor-pointer transition ${
                        canIssueTasks 
                          ? 'bg-indigo-950/50 border-indigo-500 text-white shadow-md' 
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="checkbox"
                          checked={canIssueTasks}
                          onChange={(e) => setCanIssueTasks(e.target.checked)}
                          className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-700 bg-slate-800 focus:ring-indigo-500"
                        />
                        <div>
                          <span className="block text-indigo-300 font-extrabold mb-0.5">۱. صادرکننده و ثبت‌کننده دستور</span>
                          <span className="text-[10px] text-slate-400 font-normal leading-relaxed block">
                            اجازه ثبت کار محوله جدید، ارجاع نامه اداری به سایر پرسنل و ویرایش دستورات صادره.
                          </span>
                        </div>
                      </label>

                      <label className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2.5 cursor-pointer transition ${
                        canExecuteTasks 
                          ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-md' 
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="checkbox"
                          checked={canExecuteTasks}
                          onChange={(e) => setCanExecuteTasks(e.target.checked)}
                          className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-slate-700 bg-slate-800 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="block text-emerald-300 font-extrabold mb-0.5">۲. مجری و انجام‌دهنده کار</span>
                          <span className="text-[10px] text-slate-400 font-normal leading-relaxed block">
                            امکان دریافت دستورات اداری، ثبت گزارش اقدام، شروع کار و ثبت تایید نهایی انجام کار.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Extra Permissions granted on top of the base role */}
              <div className="p-3.5 bg-slate-950/90 border border-teal-500/30 rounded-2xl space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection('customPerms')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                    <span className="text-xs font-extrabold text-teal-300 truncate">
                      دسترسی‌های تکمیلی (فراتر از نقش پایه)
                    </span>
                    <span className="text-[10px] font-bold bg-teal-950 text-teal-300 px-2 py-0.5 rounded-full border border-teal-800/60 shrink-0">
                      {customPermissions.length} دسترسی فعال
                    </span>
                  </div>
                  {openSections.customPerms ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.customPerms && (
                  <div className="pt-2 border-t border-slate-800 space-y-2.5 animate-fade-in">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      اگر می‌خواهید این کاربر، صرف‌نظر از نقش اصلی‌اش، به یک ماژول خاص هم دسترسی داشته باشد، از اینجا اضافه کنید:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([
                        { key: 'manage_support_cases' as SystemPermission, title: 'ثبت پرونده خدمات پس از فروش', desc: 'دسترسی به بخش پشتیبانی برای ثبت پرونده و تراکنش' },
                        { key: 'financial_approve_support' as SystemPermission, title: 'تایید مالی خدمات پس از فروش', desc: 'دسترسی به کارتابل تایید مالی و تصمیم روی هر ردیف' },
                        { key: 'view_support_reports' as SystemPermission, title: 'گزارش پیشرفته خدمات پس از فروش', desc: 'دسترسی به تب گزارش و جست‌وجوی پیشرفته و خروجی CSV' },
                        { key: 'manage_vendors' as SystemPermission, title: 'مدیریت دسته‌بندی‌های دفترچه', desc: 'افزودن/ویرایش/حذف دسته‌بندی‌های دفترچه ذینفعان' },
                        { key: 'manage_letters' as SystemPermission, title: 'دسترسی به سامانه نامه‌نگاری', desc: 'ثبت، ارجاع و پاسخ به نامه‌های داخلی با واحدهای دیگر' },
                      ]).map((p) => {
                        const checked = customPermissions.includes(p.key);
                        return (
                          <label key={p.key} className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2.5 cursor-pointer transition ${
                            checked ? 'bg-teal-950/50 border-teal-500 text-white shadow-md' : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setCustomPermissions((prev) => e.target.checked ? [...prev, p.key] : prev.filter((k) => k !== p.key));
                              }}
                              className="w-4 h-4 mt-0.5 text-teal-600 rounded border-slate-700 bg-slate-800 focus:ring-teal-500"
                            />
                            <div>
                              <span className="block text-teal-300 font-extrabold mb-0.5">{p.title}</span>
                              <span className="text-[10px] text-slate-400 font-normal leading-relaxed block">{p.desc}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Workflow & Permission Architecture Section Header */}
              <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl space-y-1">
                <div className="flex items-center gap-2 text-indigo-300 text-xs font-extrabold">
                  <Sparkles className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>راهنمای پیکربندی گردش کار و ارجاعات کاربر</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  تنظیمات این بخش مستقل و مکمل یکدیگرند: 
                  <strong className="text-slate-300"> نقش دوگانه</strong> برای ثبت درخواست شخصی مدیران، 
                  <strong className="text-slate-300"> مراحل تایید</strong> برای مسیر درخواست‌های این کاربر، و 
                  <strong className="text-slate-300"> مقصدهای ارجاع</strong> برای کارتابل بررسی این فرد است.
                </p>
              </div>

              {/* Dual Role: Requestor + Approver at the same time (Admin decision only) */}
              <div className="p-3.5 bg-slate-950/90 border border-fuchsia-500/30 rounded-2xl space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection('dualRole')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <ShieldCheck className="w-4 h-4 text-fuchsia-400 shrink-0" />
                    <span className="text-xs font-extrabold text-fuchsia-300 truncate">
                      ۱. نقش دوگانه و تعیین سرپرست ارشد خزانه‌داری
                    </span>
                    {isDualRole && (
                      <span className="text-[10px] font-bold bg-fuchsia-950 text-fuchsia-300 px-2 py-0.5 rounded-full border border-fuchsia-800/60 shrink-0">
                        کاربر دوگانه
                      </span>
                    )}
                    {isSeniorTreasurySupervisor && (
                      <span className="text-[10px] font-bold bg-amber-950 text-amber-300 px-2 py-0.5 rounded-full border border-amber-800/60 shrink-0">
                        سرپرست ارشد
                      </span>
                    )}
                  </div>
                  {openSections.dualRole ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.dualRole && (
                  <div className="pt-2 border-t border-slate-800 space-y-2.5 animate-fade-in">
                    <label className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2.5 cursor-pointer transition ${
                      isDualRole
                        ? 'bg-fuchsia-950/50 border-fuchsia-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isDualRole}
                        onChange={(e) => setIsDualRole(e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-fuchsia-600 rounded border-slate-700 bg-slate-800 focus:ring-fuchsia-500"
                      />
                      <div>
                        <span className="block text-fuchsia-300 font-extrabold mb-0.5">این کاربر هم‌زمان درخواست‌کننده و تاییدکننده است (نقش دوگانه)</span>
                        <span className="text-[10px] text-slate-400 font-normal leading-relaxed block">
                          علاوه بر تایید درخواست‌های دیگران، این کاربر می‌تواند برای خودش هم درخواست ثبت کند. در این حالت،
                          درخواست‌های شخصی خودش مستقیماً به «سرپرست ارشد خزانه‌داری» ارسال می‌شود و مسیر تایید عادی را دور می‌زند.
                        </span>
                      </div>
                    </label>

                    <label className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2.5 cursor-pointer transition ${
                      isSeniorTreasurySupervisor
                        ? 'bg-amber-950/50 border-amber-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isSeniorTreasurySupervisor}
                        onChange={(e) => setIsSeniorTreasurySupervisor(e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-amber-600 rounded border-slate-700 bg-slate-800 focus:ring-amber-500"
                      />
                      <div>
                        <span className="block text-amber-300 font-extrabold mb-0.5">این کاربر «سرپرست ارشد خزانه‌داری» است</span>
                        <span className="text-[10px] text-slate-400 font-normal leading-relaxed block">
                          مقصد نهایی درخواست‌های شخصی کاربران دوگانه. فقط یک نفر در سازمان می‌تواند این عنوان را داشته باشد؛
                          با فعال‌سازی این گزینه برای این کاربر، از سایرین سلب می‌شود.
                        </span>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Flexible Approval Chain Route Configuration (1, 2, or 3 Steps) */}
              <div className="p-3.5 bg-slate-950/90 border border-amber-500/30 rounded-2xl space-y-3">
                <button
                  type="button"
                  onClick={() => toggleSection('chain')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-extrabold text-amber-300 truncate">
                      ۲. تعیین مراحل تایید درخواست‌های ارسالی این کاربر
                    </span>
                    <span className="text-[10px] font-bold bg-amber-950 text-amber-300 px-2 py-0.5 rounded-full border border-amber-800/60 shrink-0">
                      {chainStepsCount} مرحله‌ای
                    </span>
                  </div>
                  {openSections.chain ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.chain && (
                  <div className="pt-2 border-t border-slate-800 space-y-3 animate-fade-in">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      مشخص می‌کند وقتی این کاربر درخواستی ثبت می‌کند (اگر کاربر دوگانه نباشد)، به ترتیب از چه تاییدکنندگانی عبور کند:
                    </p>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">تعداد مراحل تایید متوالی:</span>
                      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setChainStepsCount(1)}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                            chainStepsCount === 1 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          ۱ تاییدکننده
                        </button>
                        <button
                          type="button"
                          onClick={() => setChainStepsCount(2)}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                            chainStepsCount === 2 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          ۲ تاییدکننده
                        </button>
                        <button
                          type="button"
                          onClick={() => setChainStepsCount(3)}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                            chainStepsCount === 3 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          ۳ تاییدکننده
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                        <div className="text-[10px] font-bold text-indigo-300">مرحله ۱: تاییدکننده اول</div>
                        <select
                          value={step1ApproverId}
                          onChange={(e) => setStep1ApproverId(e.target.value)}
                          className="w-full bg-slate-800 text-white text-[11px] rounded-lg p-1.5 border border-slate-700 focus:outline-none"
                        >
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                          ))}
                        </select>
                      </div>

                      {chainStepsCount >= 2 && (
                        <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                          <div className="text-[10px] font-bold text-amber-300">مرحله ۲: تاییدکننده دوم</div>
                          <select
                            value={step2ApproverId}
                            onChange={(e) => setStep2ApproverId(e.target.value)}
                            className="w-full bg-slate-800 text-white text-[11px] rounded-lg p-1.5 border border-slate-700 focus:outline-none"
                          >
                            {users.map(u => (
                              <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {chainStepsCount >= 3 && (
                        <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                          <div className="text-[10px] font-bold text-emerald-300">مرحله ۳: تاییدکننده سوم</div>
                          <select
                            value={step3ApproverId}
                            onChange={(e) => setStep3ApproverId(e.target.value)}
                            className="w-full bg-slate-800 text-white text-[11px] rounded-lg p-1.5 border border-slate-700 focus:outline-none"
                          >
                            {users.map(u => (
                              <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="pt-1 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="allow-direct-treasury"
                        checked={allowDirectToTreasury}
                        onChange={(e) => setAllowDirectToTreasury(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-700 bg-slate-800 focus:ring-indigo-500"
                      />
                      <label htmlFor="allow-direct-treasury" className="text-xs font-bold text-indigo-200 cursor-pointer">
                        اجازه ارسال مستقیم ۵۰٪ درخواست‌ها به رضا بیات (مدیر خزانه‌داری)
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Approve & Forward destinations - restricts who this approver can send requests to */}
              <div className="p-3.5 bg-slate-950/90 border border-teal-500/30 rounded-2xl space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection('forward')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Send className="w-4 h-4 text-teal-400 shrink-0" />
                    <span className="text-xs font-extrabold text-teal-300 truncate">
                      ۳. مقصدهای مجاز ارجاع (ویژه کارتابل تایید و ارجاع)
                    </span>
                    <span className="text-[10px] font-bold bg-teal-950 text-teal-300 px-2 py-0.5 rounded-full border border-teal-800/60 shrink-0">
                      {allowedApproverIds.length} مقصد مجاز
                    </span>
                  </div>
                  {openSections.forward ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.forward && (
                  <div className="pt-2 border-t border-slate-800 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-end gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setAllowedApproverIds(users.filter(u => u.id !== editingUser?.id).map(u => u.id))}
                        className="text-teal-400 hover:underline font-bold cursor-pointer"
                      >
                        انتخاب همه
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setAllowedApproverIds([])}
                        className="text-rose-400 hover:underline font-bold cursor-pointer"
                      >
                        پاک کردن
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      مختص کاربران تاییدکننده: مشخص می‌کند این کاربر هنگام بررسی پرونده دیگران در کارتابل، درخواست را فقط به چه کسانی می‌تواند «تایید و ارجاع» دهد:
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-1">
                      {users.filter(u => u.id !== editingUser?.id).map((u) => {
                        const isSelected = allowedApproverIds.includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                              isSelected
                                ? 'bg-teal-600/30 border-teal-500 text-white shadow'
                                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAllowedApproverIds([...allowedApproverIds, u.id]);
                                } else {
                                  setAllowedApproverIds(allowedApproverIds.filter(id => id !== u.id));
                                }
                              }}
                              className="w-4 h-4 text-teal-600 rounded border-slate-700 bg-slate-800 focus:ring-teal-500"
                            />
                            <span className="truncate">{u.fullName}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddUserModal(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  {editingUser ? 'ذخیره تغییرات کاربر' : 'ایجاد کاربر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Password Change Modal */}
      {passwordChangeUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-right space-y-4 max-h-[90vh] overflow-y-auto my-8">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              <span>تغییر رمز عبور برای: {passwordChangeUser.fullName}</span>
            </h3>

            <form onSubmit={handleQuickPasswordChange} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">رمز عبور جدید</label>
                <input
                  type="text"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  required
                  placeholder="رمز جدید را وارد کنید..."
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordChangeUser(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition"
                >
                  تغییر رمز عبور
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
