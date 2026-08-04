import React, { useState, useMemo } from 'react';
import { User, DirectMessage, SystemRole, SystemPermission, Letter } from '../types';
import { DEFAULT_ROLE_ID_MAP } from '../utils/storage';
import { 
  LayoutDashboard, PlusCircle, Inbox, Archive, FileText, Search,
  GitFork, MessageSquare, ShieldCheck, CreditCard, Building, MapPin, KeyRound, Users, CheckSquare,
  ChevronDown, MoreHorizontal, UsersRound, BookUser, Tags, LifeBuoy, Mail, ShieldAlert, Palette,
  Menu, X, PanelRightClose, PanelRightOpen
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User | null;
  pendingApprovalCount: number;
  myRequestsCount: number;
  users: User[];
  directMessages: DirectMessage[];
  roles: SystemRole[];
  letters: Letter[];
  onSelectColleague: (userId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const conversationId = (a: string, b: string) => [a, b].sort().join('__');

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  pendingApprovalCount,
  myRequestsCount,
  users,
  directMessages,
  roles,
  letters,
  onSelectColleague,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const effectivePermissions = useMemo(() => {
    if (!currentUser) return [] as SystemPermission[];
    if (isAdmin) return null; // null = unrestricted (admin bypasses all checks)
    const roleId = currentUser.roleId || DEFAULT_ROLE_ID_MAP[currentUser.role];
    const role = roles.find((r) => r.id === roleId);
    const fromRole = role?.permissions || [];
    const extra = currentUser.customPermissions || [];
    return Array.from(new Set([...fromRole, ...extra]));
  }, [currentUser, roles, isAdmin]);

  const hasAccess = (required?: SystemPermission[]) => {
    if (!required || required.length === 0) return true;
    if (isAdmin) return true;

    // Direct explicit toggle check for create_request permission
    if (required.includes('create_request')) {
      if (currentUser?.canCreateRequests !== undefined) {
        if (currentUser.canCreateRequests) return true;
        if (!currentUser.canCreateRequests) return false;
      }
    }

    // Dual-role users (isDualRole) may approve/pay their own escalated requests even
    // though their base role's permission set doesn't grant approval_inbox access.
    if (required.includes('approve_branch_request') || required.includes('approve_treasury') || required.includes('execute_payment')) {
      if (currentUser?.isDualRole === true) return true;
    }

    // Direct explicit check for task directives permission
    if (required.includes('manage_assigned_tasks')) {
      if (isAdmin) return true;
      const canIssue = currentUser?.canIssueTasks === true;
      const canExecute = currentUser?.canExecuteTasks === true;
      const hasCustom = !!currentUser?.customPermissions?.includes('manage_assigned_tasks');
      const hasTaskAccess = canIssue || canExecute || hasCustom;
      if (!hasTaskAccess) return false;
      return true;
    }

    if (effectivePermissions === null) return true;
    return required.some((p) => effectivePermissions!.includes(p));
  };

  const navItems: {
    id: string; label: string; icon: any; badge: string | number | null; badgeColor?: string;
    requires?: SystemPermission[];
  }[] = [
    { id: 'dashboard', label: 'داشبورد و خلاصه آمار', icon: LayoutDashboard, badge: null },
    { id: 'new_request', label: 'ثبت درخواست جدید', icon: PlusCircle, badge: null, requires: ['create_request'] },
    { id: 'my_requests', label: 'درخواست‌های من', icon: FileText, badge: myRequestsCount > 0 ? myRequestsCount : null, requires: ['create_request'] },
    { id: 'assigned_tasks', label: 'کارهای محوله و دستورات', icon: CheckSquare, badge: 'جدید', badgeColor: 'bg-indigo-600', requires: ['manage_assigned_tasks'] },
    { id: 'approval_inbox', label: 'کارتابل تایید و پرداخت', icon: Inbox, badge: pendingApprovalCount > 0 ? pendingApprovalCount : null, badgeColor: 'bg-amber-500', requires: ['approve_branch_request', 'approve_treasury', 'execute_payment'] },
    { id: 'style_settings', label: 'تنظیمات استایل و فونت', icon: Palette, badge: 'جدید', badgeColor: 'bg-emerald-600' },
    { id: 'cost_centers', label: 'شعب فروش و مراکز هزینه', icon: MapPin, badge: null, requires: ['manage_cost_centers'] },
    { id: 'companies', label: 'شرکت‌های tapra', icon: Building, badge: null, requires: ['manage_companies'] },
    { id: 'archive', label: 'جستجوی پیشرفته و خروجی', icon: Search, badge: 'جامع', badgeColor: 'bg-indigo-600' },
    { id: 'workflow', label: 'چارت گردش کار (فلو)', icon: GitFork, badge: null, requires: ['view_analytics'] },
    { id: 'messenger', label: 'گفتگوی عمومی خزانه‌داری', icon: MessageSquare, badge: null },
  ];

  const visibleNavItems = navItems.filter((item) => hasAccess(item.requires));
  const primaryItems = visibleNavItems.filter((i) => ['dashboard', 'new_request', 'my_requests', 'assigned_tasks', 'approval_inbox'].includes(i.id));
  const secondaryItems = visibleNavItems.filter((i) => !['dashboard', 'new_request', 'my_requests', 'assigned_tasks', 'approval_inbox'].includes(i.id));

  const canSeeVendors = hasAccess(['manage_vendors']);
  const canSeeVendorCategories = isAdmin || !!currentUser?.customPermissions?.includes('manage_vendors');
  const canSeeSupport = hasAccess(['manage_support_cases', 'financial_approve_support', 'view_support_reports']);
  const canSeeLetters = hasAccess(['manage_letters']);
  const unreadLettersCount = useMemo(() => {
    if (!currentUser) return 0;
    return letters.filter((l) => l.toUserId === currentUser.id && !l.seenBy.some((s) => s.userId === currentUser.id)).length;
  }, [letters, currentUser]);
  const canSeeAdminUsers = isAdmin || !!currentUser?.customPermissions?.includes('manage_users');
  const canSeeRoles = isAdmin || !!currentUser?.customPermissions?.includes('manage_roles');
  const canSeeAllCommunications = isAdmin || !!currentUser?.customPermissions?.includes('manage_users');

  // Top 3 most-recently-active colleague conversations, for the quick-access shortcut list
  const recentColleagues = useMemo(() => {
    if (!currentUser) return [];
    return users
      .filter((u) => u.id !== currentUser.id)
      .map((u) => {
        const convId = conversationId(currentUser.id, u.id);
        const convMsgs = directMessages.filter((m) => m.conversationId === convId);
        const lastMsg = convMsgs.slice().sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || '')).pop();
        const unread = convMsgs.filter((m) => m.recipientId === currentUser.id && !m.readAt).length;
        return { user: u, lastMsg, unread };
      })
      .filter((c) => !!c.lastMsg)
      .sort((a, b) => (b.lastMsg?.timestamp || '').localeCompare(a.lastMsg?.timestamp || ''))
      .slice(0, 3);
  }, [users, directMessages, currentUser]);

  const totalUnreadDMs = useMemo(() => {
    if (!currentUser) return 0;
    return directMessages.filter((m) => m.recipientId === currentUser.id && !m.readAt).length;
  }, [directMessages, currentUser]);

  const usersGroupActive = activeTab === 'admin' || activeTab === 'colleagues';
  const directoryGroupActive = activeTab === 'vendors' || activeTab === 'vendor_categories';

  const toggleGroup = (id: string) => {
    setExpandedGroup((prev) => (prev === id ? null : id));
  };

  const renderFlatItem = (item: typeof navItems[number]) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => {
          setActiveTab(item.id);
          if (onCloseMobile) onCloseMobile();
        }}
        title={isCollapsed ? item.label : undefined}
        className={`w-full flex items-center ${isCollapsed ? 'justify-center py-3' : 'justify-between px-3.5 py-2.5'} rounded-xl font-medium text-xs transition cursor-pointer ${
          isActive
            ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 font-bold'
            : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100 text-slate-600 dark:text-slate-400'
        }`}
      >
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
          {!isCollapsed && <span>{item.label}</span>}
        </div>
        {!isCollapsed && item.badge !== null && (
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full text-white ${item.badgeColor || 'bg-emerald-600'}`}>
            {item.badge}
          </span>
        )}
        {isCollapsed && item.badge !== null && (
          <span className="w-2 h-2 rounded-full bg-emerald-500 absolute top-1 right-1" />
        )}
      </button>
    );
  };

  const showDirectoryGroup = canSeeVendors || canSeeVendorCategories;
  const showUsersGroup = canSeeAdminUsers || true;

  return (
    <aside className={`${isCollapsed ? 'w-full md:w-20' : 'w-full md:w-64'} bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800 p-3 sm:p-4 flex flex-col justify-between dir-rtl shrink-0 transition-all duration-300`}>
      <div className="space-y-4">
        
        {/* Top Sidebar Header with Hamburger Collapse Toggle */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                منوی خزانه‌داری
              </span>
            </div>
          )}

          <div className={`flex items-center gap-1 ${isCollapsed ? 'w-full justify-center' : ''}`}>
            {/* Collapse/Expand Desktop Button */}
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                title={isCollapsed ? 'باز کردن منو' : 'بستن (جمع کردن) منو'}
              >
                {isCollapsed ? <PanelRightOpen className="w-4 h-4 text-emerald-400" /> : <PanelRightClose className="w-4 h-4" />}
              </button>
            )}

            {/* Close Mobile Overlay Button */}
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="md:hidden p-1.5 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Primary CTA Button */}
        {hasAccess(['create_request']) && (
          <button
            onClick={() => {
              setActiveTab('new_request');
              if (onCloseMobile) onCloseMobile();
            }}
            title="ایجاد درخواست پرداخت جدید"
            className={`w-full py-3 ${isCollapsed ? 'px-2' : 'px-4'} bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer`}
          >
            <PlusCircle className="w-5 h-5 text-emerald-100 shrink-0" />
            {!isCollapsed && <span>ایجاد درخواست پرداخت</span>}
          </button>
        )}

        {/* Navigation Section */}
        <nav className="space-y-1">
          {primaryItems.map(renderFlatItem)}

          {/* directory group */}
          {showDirectoryGroup && !isCollapsed && (
            <div>
              <button
                onClick={() => toggleGroup('directory')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition cursor-pointer ${
                  directoryGroupActive
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 font-bold'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <BookUser className={`w-4 h-4 ${directoryGroupActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                  <span>دفترچه</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedGroup === 'directory' || directoryGroupActive ? 'rotate-180' : ''}`} />
              </button>

              {(expandedGroup === 'directory' || directoryGroupActive) && (
                <div className="pr-4 mt-1 space-y-1 border-r border-slate-200 dark:border-slate-800 mr-4">
                  {canSeeVendors && (
                    <button
                      onClick={() => { setActiveTab('vendors'); if (onCloseMobile) onCloseMobile(); }}
                      className={`w-full text-right px-3 py-2 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        activeTab === 'vendors' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      ذینفعان و فروشندگان
                    </button>
                  )}
                  {canSeeVendorCategories && (
                    <button
                      onClick={() => { setActiveTab('vendor_categories'); if (onCloseMobile) onCloseMobile(); }}
                      className={`w-full flex items-center gap-1.5 text-right px-3 py-2 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        activeTab === 'vendor_categories' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      <Tags className="w-3 h-3" />
                      دسته‌بندی‌ها
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {secondaryItems.map(renderFlatItem)}

          {canSeeSupport && (
            <button
              onClick={() => { setActiveTab('support'); if (onCloseMobile) onCloseMobile(); }}
              title="خدمات پس از فروش و شکایات"
              className={`w-full flex items-center ${isCollapsed ? 'justify-center py-3' : 'justify-between px-3.5 py-2.5'} rounded-xl font-medium text-xs transition cursor-pointer ${
                activeTab === 'support'
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                <LifeBuoy className={`w-4 h-4 shrink-0 ${activeTab === 'support' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                {!isCollapsed && <span>خدمات پس از فروش و شکایات</span>}
              </div>
              {!isCollapsed && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full text-white bg-indigo-600">جدید</span>}
            </button>
          )}

          {canSeeLetters && (
            <button
              onClick={() => { setActiveTab('letters'); if (onCloseMobile) onCloseMobile(); }}
              title="نامه‌ها"
              className={`w-full flex items-center ${isCollapsed ? 'justify-center py-3' : 'justify-between px-3.5 py-2.5'} rounded-xl font-medium text-xs transition cursor-pointer ${
                activeTab === 'letters'
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                <Mail className={`w-4 h-4 shrink-0 ${activeTab === 'letters' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                {!isCollapsed && <span>نامه</span>}
              </div>
              {!isCollapsed && (
                unreadLettersCount > 0 ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full text-white bg-rose-500">{unreadLettersCount}</span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full text-white bg-indigo-600">جدید</span>
                )
              )}
            </button>
          )}

          {canSeeAllCommunications && (
            <button
              onClick={() => { setActiveTab('all_communications'); if (onCloseMobile) onCloseMobile(); }}
              title="کلیه مکاتبات و چت‌های همکاران"
              className={`w-full flex items-center ${isCollapsed ? 'justify-center py-3' : 'justify-between px-3.5 py-2.5'} rounded-xl font-medium text-xs transition cursor-pointer ${
                activeTab === 'all_communications'
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                <ShieldAlert className={`w-4 h-4 shrink-0 ${activeTab === 'all_communications' ? 'text-indigo-400' : 'text-slate-400'}`} />
                {!isCollapsed && <span>کلیه مکاتبات و چت‌های همکاران</span>}
              </div>
              {!isCollapsed && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full text-white bg-indigo-600">امنیتی</span>}
            </button>
          )}

          {/* users group */}
          {showUsersGroup && !isCollapsed && (
            <div>
              <button
                onClick={() => toggleGroup('users')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition cursor-pointer ${
                  usersGroupActive
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 font-bold'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Users className={`w-4 h-4 ${usersGroupActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                  <span>کاربران</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {totalUnreadDMs > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full text-white bg-rose-500">{totalUnreadDMs}</span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedGroup === 'users' || usersGroupActive ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {(expandedGroup === 'users' || usersGroupActive) && (
                <div className="pr-4 mt-1 space-y-1 border-r border-slate-200 dark:border-slate-800 mr-4">
                  {canSeeAdminUsers && (
                    <button
                      onClick={() => { setActiveTab('admin'); if (onCloseMobile) onCloseMobile(); }}
                      className={`w-full flex items-center gap-1.5 text-right px-3 py-2 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        activeTab === 'admin' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      <ShieldCheck className="w-3 h-3" />
                      مدیریت کاربران سیستمی
                    </button>
                  )}

                  <div className="px-3 pt-1 pb-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <UsersRound className="w-3 h-3" />
                    همکاران
                  </div>

                  {recentColleagues.map(({ user, unread }) => (
                    <button
                      key={user.id}
                      onClick={() => { onSelectColleague(user.id); setActiveTab('colleagues'); if (onCloseMobile) onCloseMobile(); }}
                      className={`w-full flex items-center justify-between text-right px-3 py-2 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        activeTab === 'colleagues' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      <span className="truncate">{user.fullName}</span>
                      {unread > 0 && (
                        <span className="w-4 h-4 shrink-0 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                          {unread}
                        </span>
                      )}
                    </button>
                  ))}

                  <button
                    onClick={() => { onSelectColleague(''); setActiveTab('colleagues'); if (onCloseMobile) onCloseMobile(); }}
                    className="w-full flex items-center gap-1.5 text-right px-3 py-2 rounded-lg text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition cursor-pointer"
                    title="نمایش همه‌ی همکاران و شروع گفتگوی جدید"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    همه همکاران / شروع گفتگو
                  </button>
                </div>
              )}
            </div>
          )}

          {canSeeRoles && (
            <button
              onClick={() => { setActiveTab('roles_permissions'); if (onCloseMobile) onCloseMobile(); }}
              title="نقش‌ها و دسترسی‌ها (RBAC)"
              className={`w-full flex items-center ${isCollapsed ? 'justify-center py-3' : 'justify-between px-3.5 py-2.5'} rounded-xl font-medium text-xs transition cursor-pointer ${
                activeTab === 'roles_permissions'
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                <KeyRound className={`w-4 h-4 shrink-0 ${activeTab === 'roles_permissions' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                {!isCollapsed && <span>نقش‌ها و دسترسی‌ها (RBAC)</span>}
              </div>
              {!isCollapsed && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full text-white bg-emerald-600">جدید</span>}
            </button>
          )}
        </nav>
      </div>

      {/* User Status Card at Bottom */}
      {currentUser && (
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/80 text-right">
          <div className={`p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm border border-emerald-200 dark:border-emerald-700/40 shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{currentUser.fullName}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{currentUser.roleTitle}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
