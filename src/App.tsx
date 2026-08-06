import React, { useState, useEffect } from 'react';
import { Clock, ShieldAlert } from 'lucide-react';
import { 
  User, Company, CompanyBankAccount, CostCenter, PaymentRequest, 
  WorkflowStepRule, SystemNotification, ChatMessage, DirectMessage, SupportCase, Letter 
} from './types';
import { storage } from './utils/storage';
import { getJalaliNow } from './utils/persianDate';
import { numberToPersianWords, formatRial } from './utils/numberToWords';
import { useEffectivePermissions, hasPermission, canAccessNavItem } from './utils/permissions';
import { logAudit } from './utils/auditLog';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { NewRequestModal } from './components/NewRequestModal';
import { RequestTableView } from './components/RequestTableView';
import { RequestDetailModal } from './components/RequestDetailModal';
import { ArchiveView } from './components/ArchiveView';
import { WorkflowChartView } from './components/WorkflowChartView';
import { ChatView } from './components/ChatView';
import { AdminPanel } from './components/AdminPanel';
import { CompaniesView } from './components/CompaniesView';
import { CostCentersView } from './components/CostCentersView';
import { RolesAndPermissionsView } from './components/RolesAndPermissionsView';
import { LoginRegisterModal } from './components/LoginRegisterModal';
import { PrintRequestModal } from './components/PrintRequestModal';
import { VendorsView } from './components/VendorsView';
import { VendorCategoriesView } from './components/VendorCategoriesView';
import { CustomersView } from './components/CustomersView';
import { ColleaguesView } from './components/ColleaguesView';
import { SupportView } from './components/SupportView';
import { LettersView } from './components/LettersView';
import { BulkPaymentExportModal } from './components/BulkPaymentExportModal';
import { MyRequestsView } from './components/MyRequestsView';
import { ApprovalInboxView } from './components/ApprovalInboxView';
import { AssignedTasksView } from './components/AssignedTasksView';
import { AllCommunicationsAuditView } from './components/AllCommunicationsAuditView';
import { StyleSettingsView, AVAILABLE_FONTS } from './components/StyleSettingsView';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => storage.getCurrentUser());
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Theme State (Dark / Light)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('shavaz_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('shavaz_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Font & Style Customization State
  const [currentFont, setCurrentFont] = useState<string>(() => {
    return localStorage.getItem('shavaz_font') || 'vazir';
  });

  const [fontSize, setFontSize] = useState<'normal' | 'medium' | 'large'>(() => {
    return (localStorage.getItem('shavaz_font_size') as any) || 'normal';
  });

  const [accentColor, setAccentColor] = useState<'emerald' | 'indigo' | 'rose' | 'amber'>(() => {
    return (localStorage.getItem('shavaz_accent_color') as any) || 'emerald';
  });

  // Sidebar Collapse & Mobile Hamburger State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('shavaz_font', currentFont);
    const fontObj = AVAILABLE_FONTS.find(f => f.id === currentFont) || AVAILABLE_FONTS[0];
    document.documentElement.style.setProperty('--app-font-family', fontObj.cssFamily);
    document.body.style.fontFamily = fontObj.cssFamily;
  }, [currentFont]);

  useEffect(() => {
    localStorage.setItem('shavaz_font_size', fontSize);
    if (fontSize === 'medium') {
      document.documentElement.style.fontSize = '17px';
    } else if (fontSize === 'large') {
      document.documentElement.style.fontSize = '18px';
    } else {
      document.documentElement.style.fontSize = '16px';
    }
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('shavaz_accent_color', accentColor);
  }, [accentColor]);

  // App Datasets
  const [users, setUsers] = useState<User[]>(() => storage.getUsers());
  const [roles, setRoles] = useState(() => storage.getRoles());
  const [companies, setCompanies] = useState<Company[]>(() => storage.getCompanies());
  const [companyBankAccounts, setCompanyBankAccounts] = useState<CompanyBankAccount[]>(() => storage.getCompanyBankAccounts());
  const [costCenters, setCostCenters] = useState<CostCenter[]>(() => storage.getCostCenters());
  const [vendors, setVendors] = useState(() => storage.getVendors());
  const [vendorCategories, setVendorCategories] = useState(() => storage.getVendorCategories());
  const [customers, setCustomers] = useState(() => storage.getCustomers());
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>(() => storage.getDirectMessages());
  const [colleagueChatTarget, setColleagueChatTarget] = useState<string | null>(null);
  const [supportCases, setSupportCases] = useState<SupportCase[]>(() => storage.getSupportCases());
  const [letters, setLetters] = useState<Letter[]>(() => storage.getLetters());
  const [requests, setRequests] = useState<PaymentRequest[]>(() => storage.getRequests());
  const [tasks, setTasks] = useState(() => storage.getTasks());
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepRule[]>(() => storage.getWorkflow());
  const [notifications, setNotifications] = useState<SystemNotification[]>(() => storage.getNotifications(currentUser?.id));
  const [messages, setMessages] = useState<ChatMessage[]>(() => storage.getMessages());

  // Impersonation (Admin Login as User) State
  const [impersonatorAdmin, setImpersonatorAdmin] = useState<User | null>(() => {
    const saved = localStorage.getItem('shavaz_impersonator_admin');
    return saved ? JSON.parse(saved) : null;
  });

  // Effective permissions of the REAL logged-in identity (not affected by whichever user is
  // currently being viewed while impersonating) — used to gate impersonation itself and any
  // tab/action guard that must never be fooled by a stale/forged currentUser.
  const realActor = impersonatorAdmin || currentUser;
  const realActorPermissions = useEffectivePermissions(realActor, roles);
  // Effective permissions of whoever is CURRENTLY being viewed (the impersonated user during
  // impersonation, or the logged-in user otherwise) — used for menu/tab/data/operation guards
  // so a second active role reliably unlocks all four together.
  const effectivePermissions = useEffectivePermissions(currentUser, roles);

  const handleImpersonateUser = (targetUser: User) => {
    // Hardened: this check runs on the REAL actor's permissions every single call, regardless
    // of whether an impersonation session is already open — so even a direct call to this
    // handler (e.g. from devtools) with a non-admin currentUser is rejected, and nesting
    // impersonation inside impersonation can't silently re-derive authorization from the
    // (already-swapped) currentUser.
    if (!realActor || !hasPermission(realActorPermissions, ['impersonate_users'])) return;

    if (!impersonatorAdmin) {
      setImpersonatorAdmin(realActor);
      localStorage.setItem('shavaz_impersonator_admin', JSON.stringify(realActor));
    }
    setCurrentUser(targetUser);
    storage.setCurrentUser(targetUser);

    const log = storage.getImpersonationLog();
    storage.saveImpersonationLog([...log, {
      id: `imp_${Date.now()}`,
      adminId: realActor.id,
      adminName: realActor.fullName,
      targetUserId: targetUser.id,
      targetUserName: targetUser.fullName,
      startedAt: getJalaliNow()
    }]);
    logAudit({ action: 'impersonation_start', effectiveUser: realActor, roles, permissionUsed: 'impersonate_users', targetId: targetUser.id, details: `شروع مشاهده به‌جای ${targetUser.fullName}` });

    if (targetUser.role === 'requestor') {
      setActiveTab('my_requests');
    } else {
      setActiveTab('approval_inbox');
    }
  };

  const endOpenImpersonationLogEntry = (adminId: string, targetUserId: string) => {
    const log = storage.getImpersonationLog();
    const idx = [...log].reverse().findIndex((e) => e.adminId === adminId && e.targetUserId === targetUserId && !e.endedAt);
    if (idx === -1) return;
    const realIdx = log.length - 1 - idx;
    const updated = [...log];
    updated[realIdx] = { ...updated[realIdx], endedAt: getJalaliNow() };
    storage.saveImpersonationLog(updated);
  };

  const handleExitImpersonation = () => {
    if (impersonatorAdmin) {
      if (currentUser) {
        endOpenImpersonationLogEntry(impersonatorAdmin.id, currentUser.id);
        logAudit({ action: 'impersonation_end', effectiveUser: impersonatorAdmin, roles, targetId: currentUser.id, details: `پایان مشاهده به‌جای ${currentUser.fullName}` });
      }
      setCurrentUser(impersonatorAdmin);
      storage.setCurrentUser(impersonatorAdmin);
      setImpersonatorAdmin(null);
      localStorage.removeItem('shavaz_impersonator_admin');
      setActiveTab('admin');
    }
  };

  // Tab render guard — defense in depth beyond Sidebar hiding the menu item. Mirrors
  // Sidebar.tsx's exact per-tab visibility decision (same canAccessNavItem calls + the same
  // customPermissions-based ad-hoc checks for admin/roles_permissions/all_communications) so
  // a tab can never render its data/operations just because activeTab was set some other way
  // (stale state, a future deep link, etc.) while the Sidebar item stays hidden.
  const isAdminUser = currentUser?.role === 'admin';
  const canSeeAdminUsersTab = isAdminUser || !!currentUser?.customPermissions?.includes('manage_users');
  const canSeeRolesTab = isAdminUser || !!currentUser?.customPermissions?.includes('manage_roles');
  const canSeeAllCommunicationsTab = isAdminUser || !!currentUser?.customPermissions?.includes('manage_users');
  const TAB_GUARDS: Record<string, boolean> = {
    my_requests: canAccessNavItem(currentUser, effectivePermissions, ['create_request']),
    assigned_tasks: canAccessNavItem(currentUser, effectivePermissions, ['manage_assigned_tasks']),
    approval_inbox: canAccessNavItem(currentUser, effectivePermissions, ['approve_branch_request', 'approve_treasury', 'execute_payment']),
    cost_centers: canAccessNavItem(currentUser, effectivePermissions, ['manage_cost_centers']),
    companies: canAccessNavItem(currentUser, effectivePermissions, ['manage_companies']),
    vendors: canAccessNavItem(currentUser, effectivePermissions, ['manage_vendors']),
    vendor_categories: canAccessNavItem(currentUser, effectivePermissions, ['manage_vendors']),
    customers: canAccessNavItem(currentUser, effectivePermissions, ['sales_access']),
    workflow: canAccessNavItem(currentUser, effectivePermissions, ['view_analytics']),
    letters: canAccessNavItem(currentUser, effectivePermissions, ['manage_letters']),
    support: canAccessNavItem(currentUser, effectivePermissions, ['manage_support_cases', 'financial_approve_support', 'view_support_reports']),
    admin: canSeeAdminUsersTab,
    roles_permissions: canSeeRolesTab,
    all_communications: canSeeAllCommunicationsTab
  };

  useEffect(() => {
    if (!currentUser) return;
    const guard = TAB_GUARDS[activeTab];
    if (guard === false) {
      setActiveTab('dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser, effectivePermissions]);

  // Modals
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [selectedDetailRequest, setSelectedDetailRequest] = useState<PaymentRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPrintRequest, setSelectedPrintRequest] = useState<PaymentRequest | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isBulkExportModalOpen, setIsBulkExportModalOpen] = useState(false);
  const [bulkExportRequests, setBulkExportRequests] = useState<PaymentRequest[]>([]);

  // Sync Data Storage
  useEffect(() => {
    storage.saveVendors(vendors);
  }, [vendors]);

  useEffect(() => {
    storage.saveVendorCategories(vendorCategories);
  }, [vendorCategories]);

  useEffect(() => {
    storage.saveCustomers(customers);
  }, [customers]);

  useEffect(() => {
    storage.saveDirectMessages(directMessages);
  }, [directMessages]);

  useEffect(() => {
    storage.saveSupportCases(supportCases);
  }, [supportCases]);

  useEffect(() => {
    storage.saveLetters(letters);
  }, [letters]);

  // Keep support-case transaction rows in sync with the linked payment's status
  // (paid in the normal treasury flow -> mark the originating row as paid too)
  useEffect(() => {
    setSupportCases((prevCases) => {
      let changed = false;
      const next = prevCases.map((c) => {
        let caseChanged = false;
        const updatedTransactions = c.transactions.map((row) => {
          if (!row.paymentRequestId || row.status === 'paid') return row;
          const linked = requests.find((r) => r.id === row.paymentRequestId);
          if (linked && (linked.status === 'paid' || linked.status === 'completed')) {
            caseChanged = true;
            return { ...row, status: 'paid' as const, paidAt: linked.updatedAt };
          }
          return row;
        });
        if (caseChanged) {
          changed = true;
          return { ...c, transactions: updatedTransactions };
        }
        return c;
      });
      return changed ? next : prevCases;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  // Sync Data Storage
  useEffect(() => {
    storage.saveRequests(requests);
  }, [requests]);

  useEffect(() => {
    storage.saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    storage.saveUsers(users);
  }, [users]);

  useEffect(() => {
    storage.saveRoles(roles);
  }, [roles]);

  useEffect(() => {
    storage.saveCompanies(companies);
  }, [companies]);

  useEffect(() => {
    storage.saveCostCenters(costCenters);
  }, [costCenters]);

  useEffect(() => {
    storage.saveNotifications(notifications);
  }, [notifications]);

  useEffect(() => {
    storage.saveMessages(messages);
  }, [messages]);

  // Request Handlers
  const handleRequestCreated = (newReq: PaymentRequest) => {
    const updated = [newReq, ...requests];
    setRequests(updated);
    setIsNewRequestModalOpen(false);

    // Create Notification
    const newNotif: SystemNotification = {
      id: `notif_${Date.now()}`,
      userId: newReq.currentApproverId,
      title: 'درخواست جدید نیازمند تایید',
      message: `درخواست با کد پیگیری ${newReq.trackingCode} جهت بررسی ارسال گردید.`,
      requestId: newReq.id,
      trackingCode: newReq.trackingCode,
      isRead: false,
      createdAt: newReq.createdAt
    };
    setNotifications(prev => [newNotif, ...prev]);

    alert(`درخواست جدید با کد رهگیری ${newReq.trackingCode} با موفقیت ثبت شد.`);
  };

  const handleUpdateRequest = (updatedReq: PaymentRequest) => {
    const updatedList = requests.map(r => r.id === updatedReq.id ? updatedReq : r);
    setRequests(updatedList);
    setSelectedDetailRequest(updatedReq);
  };

  const handleDeleteRequest = (requestId: string) => {
    setRequests(prev => prev.filter(r => r.id !== requestId));
    setIsDetailModalOpen(false);
    setSelectedDetailRequest(null);
    alert('درخواست با موفقیت لغو و از سیستم حذف گردید.');
  };

  // Search & Navigation
  const handleSearchTrackingCode = (code: string) => {
    const found = requests.find(r => r.trackingCode.toLowerCase() === code.toLowerCase());
    if (found) {
      setSelectedDetailRequest(found);
      setIsDetailModalOpen(true);
    } else {
      alert(`درخواستی با کد پیگیری "${code}" یافت نشد.`);
    }
  };

  const handleSelectNotificationRequest = (reqId: string) => {
    const found = requests.find(r => r.id === reqId);
    if (found) {
      setSelectedDetailRequest(found);
      setIsDetailModalOpen(true);
    }
  };

  const handleMarkNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const handleSelectNotificationColleague = (colleagueId: string) => {
    setColleagueChatTarget(colleagueId);
    setActiveTab('colleagues');
  };

  // Direct Messages (همکاران - چت شخصی)
  const handleSendDirectMessage = (msg: DirectMessage) => {
    setDirectMessages(prev => [...prev, msg]);

    const newNotif: SystemNotification = {
      id: `notif_dm_${Date.now()}`,
      userId: msg.recipientId,
      title: `پیام جدید از ${msg.senderName}`,
      message: msg.attachment
        ? (msg.attachment.isVoice ? 'یک پیام صوتی برای شما ارسال کرد.' : `یک فایل (${msg.attachment.name}) برای شما ارسال کرد.`)
        : msg.content,
      colleagueId: msg.senderId,
      isRead: false,
      createdAt: msg.timestamp
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const handleMarkConversationRead = (partnerId: string) => {
    if (!currentUser) return;
    setDirectMessages(prev => prev.map(m =>
      (m.senderId === partnerId && m.recipientId === currentUser.id && !m.readAt)
        ? { ...m, readAt: new Date().toISOString() }
        : m
    ));
  };

  // خدمات پس از فروش، پشتیبانی و شکایات
  const handleCreateSupportCase = (newCase: SupportCase) => {
    setSupportCases(prev => [newCase, ...prev]);

    // Notify all financial approvers + admin that a new case is waiting for review
    const targets = users.filter(u => u.role === 'financial_approver' || u.role === 'admin');
    const newNotifs: SystemNotification[] = targets.map(u => ({
      id: `notif_support_${Date.now()}_${u.id}`,
      userId: u.id,
      title: 'پرونده جدید خدمات پس از فروش',
      message: `پرونده ${newCase.trackingCode} (${newCase.customerFullName}) با ${newCase.transactions.length} ردیف تراکنش نیازمند تایید مالی است.`,
      isRead: false,
      createdAt: newCase.createdAt
    }));
    setNotifications(prev => [...newNotifs, ...prev]);
    alert(`پرونده با کد پیگیری ${newCase.trackingCode} با موفقیت ثبت و برای تایید مالی ارسال شد.`);
  };

  const handleUpdateSupportCase = (updated: SupportCase) => {
    setSupportCases(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const handleSendApprovedRowsToTreasury = (caseId: string, rowIds: string[], closeCaseAfter: boolean) => {
    if (!currentUser || rowIds.length === 0) return;
    const targetCase = supportCases.find(c => c.id === caseId);
    if (!targetCase) return;

    const seniorSupervisor = users.find(u => u.isSeniorTreasurySupervisor) || users.find(u => u.role === 'admin');
    if (!seniorSupervisor) {
      alert('سرپرست ارشد خزانه‌داری در سیستم تعریف نشده است. لطفاً ابتدا از بخش مدیریت کاربران این عنوان را برای یک نفر تنظیم کنید.');
      return;
    }

    const branch = costCenters.find(cc => cc.id === targetCase.branchId);
    const company = companies.find(co => co.id === branch?.companyId);
    const now = getJalaliNow();

    // Keep counting from however many rows of THIS case have already been sent,
    // so codes stay sequential (S50001-1, S50001-2, ...) even across multiple batches over time.
    let sequence = targetCase.transactions.filter(t => !!t.paymentRequestTrackingCode).length;

    const newPaymentRequests: PaymentRequest[] = [];
    const rowUpdates: Record<string, { trackingCode: string; paymentRequestId: string }> = {};

    for (const rowId of rowIds) {
      const row = targetCase.transactions.find(t => t.id === rowId);
      if (!row || row.status !== 'approved_pending_send') continue;

      sequence += 1;
      const trackingCode = `${targetCase.trackingCode}-${sequence}`;
      const paymentRequestId = `req_support_${Date.now()}_${sequence}`;

      newPaymentRequests.push({
        id: paymentRequestId,
        trackingCode,
        title: `عودت وجه مشتری - فاکتور ${row.invoiceCode} (${targetCase.customerFullName})`,
        requestType: 'customer_refund',
        companyId: company?.id || '',
        companyName: company?.name || '—',
        costCenterId: branch?.id || '',
        costCenterName: branch?.name || targetCase.branchName || '—',
        amount: row.finalRefundAmount,
        amountInWords: numberToPersianWords(row.finalRefundAmount),
        destinationCardNumber: row.customerRefundCardNumber || '',
        destinationAccountName: targetCase.customerFullName,
        destinationSheba: row.customerRefundShebaNumber,
        description: `عودت وجه فاکتور ${row.invoiceCode} مربوط به پرونده پشتیبانی ${targetCase.trackingCode}.${row.financialApproverNote ? ' توضیح تایید مالی: ' + row.financialApproverNote : ''}`,
        requestorId: targetCase.operatorId,
        requestorName: targetCase.operatorName,
        requestorPhone: currentUser.phone,
        currentApproverId: seniorSupervisor.id,
        currentApproverName: seniorSupervisor.fullName,
        currentApproverPhone: seniorSupervisor.phone,
        status: 'pending_approval',
        createdAt: now,
        updatedAt: now,
        initialAttachments: [],
        timeline: [{
          id: `tl_support_${Date.now()}_${sequence}`,
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.roleTitle,
          action: 'submitted',
          actionTitle: 'ارسال خودکار از تایید مالی خدمات پس از فروش',
          comment: `این درخواست پرداخت پس از تایید مالی پرونده پشتیبانی ${targetCase.trackingCode} ایجاد و برای ${seniorSupervisor.fullName} ارسال شد.`,
          timestamp: now
        }],
        sourceSupportCaseId: targetCase.id,
        sourceSupportCaseTrackingCode: targetCase.trackingCode,
        sourceSupportTransactionId: row.id,
        sourceCustomerName: targetCase.customerFullName
      });

      rowUpdates[rowId] = { trackingCode, paymentRequestId };
    }

    if (newPaymentRequests.length === 0) return;

    setRequests(prev => [...newPaymentRequests, ...prev]);

    const totalAmount = newPaymentRequests.reduce((sum, r) => sum + r.amount, 0);
    const sentCodes = newPaymentRequests.map(r => r.trackingCode).join('، ');

    let updatedCase: SupportCase = {
      ...targetCase,
      transactions: targetCase.transactions.map(t => rowUpdates[t.id] ? {
        ...t,
        status: 'financial_approved' as const,
        paymentRequestId: rowUpdates[t.id].paymentRequestId,
        paymentRequestTrackingCode: rowUpdates[t.id].trackingCode
      } : t),
      timeline: [...targetCase.timeline, {
        id: `stl_${Date.now()}`,
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.roleTitle,
        action: 'sent_to_treasury' as const,
        actionTitle: `ارسال ${newPaymentRequests.length} ردیف تایید‌شده به خزانه‌داری`,
        comment: `کدهای پیگیری: ${sentCodes} — مجموع مبلغ: ${formatRial(totalAmount)} — برای ${seniorSupervisor.fullName} ارسال شد.`,
        timestamp: now
      }]
    };

    if (closeCaseAfter) {
      updatedCase = {
        ...updatedCase,
        status: 'closed',
        complaintStatus: 'closed',
        completedAt: now,
        timeline: [...updatedCase.timeline, {
          id: `stl_${Date.now()}_close`,
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.roleTitle,
          action: 'case_closed' as const,
          actionTitle: 'بستن پرونده توسط تایید مالی',
          comment: 'پرونده پس از ارسال ردیف‌های تایید‌شده به خزانه، بسته شد.',
          timestamp: now
        }]
      };
    }

    setSupportCases(prev => prev.map(c => c.id === caseId ? updatedCase : c));

    setNotifications(prev => [{
      id: `notif_${Date.now()}`,
      userId: seniorSupervisor.id,
      title: newPaymentRequests.length > 1 ? `${newPaymentRequests.length} درخواست عودت وجه جدید نیازمند تایید` : 'درخواست عودت وجه جدید نیازمند تایید',
      message: `عودت وجه پرونده ${targetCase.trackingCode} (${targetCase.customerFullName}) به مبلغ مجموع ${formatRial(totalAmount)} در انتظار بررسی شماست.`,
      requestId: newPaymentRequests[0].id,
      trackingCode: newPaymentRequests[0].trackingCode,
      isRead: false,
      createdAt: now
    }, ...prev]);

    alert(`${newPaymentRequests.length} ردیف با کدهای پیگیری ${sentCodes} برای ${seniorSupervisor.fullName} ارسال گردید.`);
  };

  // Financial approver marks a single row as approved-and-ready (no treasury action yet -
  // actual sending happens as an explicit batch action so nothing reaches the treasury by accident)
  const handleMarkSupportRowApproved = (caseId: string, rowId: string, note: string) => {
    if (!currentUser) return;
    const targetCase = supportCases.find(c => c.id === caseId);
    const row = targetCase?.transactions.find(t => t.id === rowId);
    if (!targetCase || !row) return;
    const now = getJalaliNow();

    const updatedCase: SupportCase = {
      ...targetCase,
      transactions: targetCase.transactions.map(t => t.id === rowId ? {
        ...t,
        status: 'approved_pending_send' as const,
        financialApproverId: currentUser.id,
        financialApproverName: currentUser.fullName,
        financialApproverNote: note,
        financialActionAt: now
      } : t),
      timeline: [...targetCase.timeline, {
        id: `stl_${Date.now()}`,
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.roleTitle,
        action: 'financial_approved' as const,
        actionTitle: `تایید مالی فاکتور ${row.invoiceCode} (در انتظار ارسال به خزانه)`,
        comment: note || 'تایید شد؛ هر زمان آماده بود می‌تواند همراه بقیه به خزانه ارسال شود.',
        timestamp: now
      }]
    };
    setSupportCases(prev => prev.map(c => c.id === caseId ? updatedCase : c));
  };

  // نامه‌نگاری داخلی (دبیرخانه)
  const handleCreateLetter = (letter: Letter) => {
    setLetters(prev => [letter, ...prev]);
  };

  const handleUpdateLetter = (updated: Letter) => {
    setLetters(prev => prev.map(l => l.id === updated.id ? updated : l));

    // Notify the recipient whenever a letter reaches a state they should see
    if (['sent', 'approved'].includes(updated.status) && updated.toUserId) {
      setNotifications(prev => [{
        id: `notif_letter_${Date.now()}`,
        userId: updated.toUserId!,
        title: `نامه ${updated.letterNumber}`,
        message: `${updated.subject} — از ${updated.fromUserName}`,
        isRead: false,
        createdAt: getJalaliNow()
      }, ...prev]);
    }
  };

  const handleSaveNewLetterVersion = (letter: Letter, subject: string, body: string, note: string) => {
    if (!currentUser) return;
    const now = getJalaliNow();
    const newVersionNumber = letter.currentVersion + 1;
    const updated: Letter = {
      ...letter,
      subject,
      body,
      status: 'in_review',
      currentVersion: newVersionNumber,
      versions: [...letter.versions, {
        version: newVersionNumber,
        subject,
        body,
        editedAt: now,
        editedById: currentUser.id,
        editedByName: currentUser.fullName,
        note
      }],
      updatedAt: now,
      timeline: [...letter.timeline, {
        id: `ltl_${Date.now()}`,
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.roleTitle,
        action: 'versioned',
        actionTitle: `ثبت نسخه جدید V${newVersionNumber} و ارسال مجدد برای بررسی`,
        comment: note,
        timestamp: now
      }]
    };
    setLetters(prev => prev.map(l => l.id === letter.id ? updated : l));
  };

  const handleForwardLetter = (letter: Letter, targetInput: string, note: string, targetUserId?: string, targetUserName?: string) => {
    if (!currentUser) return;
    const target = targetUserId ? users.find(u => u.id === targetUserId) : users.find(u => u.fullName === targetInput || u.id === targetInput);
    const destinationName = targetUserName || target?.fullName || targetInput;
    const now = getJalaliNow();
    
    const updated: Letter = {
      ...letter,
      toUnit: destinationName,
      toUserId: target?.id || targetUserId,
      toUserName: destinationName,
      updatedAt: now,
      forwardHistory: [...letter.forwardHistory, {
        id: `lfw_${Date.now()}`,
        toUserId: target?.id || targetUserId || 'role_fwd',
        toUserName: destinationName,
        byUserId: currentUser.id,
        byUserName: currentUser.fullName,
        at: now,
        note: note || undefined
      }],
      timeline: [...letter.timeline, {
        id: `ltl_${Date.now()}`,
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.roleTitle,
        action: 'forwarded',
        actionTitle: `ارجاع نامه به ${destinationName}`,
        comment: note,
        timestamp: now
      }]
    };
    setLetters(prev => prev.map(l => l.id === letter.id ? updated : l));

    if (target?.id) {
      setNotifications(prev => [{
        id: `notif_letter_fwd_${Date.now()}`,
        userId: target.id,
        title: `نامه‌ای برای شما ارجاع شد`,
        message: `${letter.letterNumber} — ${letter.subject} — ارجاع‌دهنده: ${currentUser.fullName}`,
        isRead: false,
        createdAt: now
      }, ...prev]);
    }
  };

  // Filter requests for views based on Role and Branch authorization
  const myRequests = requests.filter(r => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (r.requestorId === currentUser.id || r.requestorName === currentUser.fullName) return true;
    if (currentUser.costCenterId && r.costCenterId === currentUser.costCenterId) return true;
    if (currentUser.allowedCostCenterIds?.includes(r.costCenterId)) return true;
    return false;
  });

  const pendingApprovalRequests = requests.filter(r => {
    if (!currentUser) return false;
    // Admins see all pending requests
    if (currentUser.role === 'admin') {
      return r.status === 'pending_approval' || r.status === 'approved_pending_payment' || r.status === 'emergency_pending_payment';
    }
    // Requestors do not process pending approval inbox
    if (currentUser.role === 'requestor') {
      return false;
    }
    // Approvers see requests assigned to them or matching authorized branches
    if (currentUser.role === 'approver') {
      if (r.status !== 'pending_approval') return false;
      const isAssignedToMe = r.currentApproverId === currentUser.id;
      const isMyBranch = currentUser.allowedCostCenterIds?.includes(r.costCenterId) || r.costCenterId === currentUser.costCenterId;
      return isAssignedToMe || isMyBranch;
    }
    // Treasury Executors see requests approved and waiting for payment execution
    if (currentUser.role === 'treasury_executor') {
      return r.status === 'approved_pending_payment' || r.status === 'pending_approval' || r.status === 'emergency_pending_payment';
    }
    return false;
  });

  // Render dedicated Login/Register screen when logged out
  if (!currentUser) {
    return (
      <div className={`min-h-screen font-sans dir-rtl selection:bg-indigo-500 selection:text-white flex items-center justify-center p-4 relative overflow-hidden ${
        theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-900 text-slate-100'
      }`}>
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/40 via-slate-950 to-slate-950 pointer-events-none" />
        <LoginRegisterModal
          isOpen={true}
          isStandalone={true}
          onLoginSuccess={(u) => {
            setCurrentUser(u);
          }}
          companies={companies}
          costCenters={costCenters}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans dir-rtl selection:bg-indigo-500 selection:text-white transition-colors duration-300 ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      
      {/* Top Header Navbar */}
      <Navbar
        currentUser={currentUser}
        notifications={notifications}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onLogout={() => {
          // Full logout clears BOTH the current (possibly impersonated) session and any
          // open impersonation session — a stray impersonatorAdmin must never survive a
          // real logout, or the next login could see/restore a stale admin identity.
          if (impersonatorAdmin && currentUser) {
            endOpenImpersonationLogEntry(impersonatorAdmin.id, currentUser.id);
            logAudit({ action: 'impersonation_end', effectiveUser: impersonatorAdmin, roles, targetId: currentUser.id, details: `پایان اجباری مشاهده (Logout کامل) به‌جای ${currentUser.fullName}` });
          }
          setImpersonatorAdmin(null);
          localStorage.removeItem('shavaz_impersonator_admin');
          storage.setCurrentUser(null);
          setCurrentUser(null);
        }}
        onSearchTrackingCode={handleSearchTrackingCode}
        onSelectNotificationRequest={handleSelectNotificationRequest}
        onSelectNotificationColleague={handleSelectNotificationColleague}
        onMarkNotificationRead={handleMarkNotificationRead}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onToggleSidebar={() => {
          setIsMobileSidebarOpen(prev => !prev);
          setIsSidebarCollapsed(prev => !prev);
        }}
      />

      {/* Impersonation Banner (When Admin is testing as another user) */}
      {impersonatorAdmin && currentUser && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-bold px-4 py-2.5 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs dir-rtl sticky top-16 z-30 border-b border-amber-600">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-slate-950 text-amber-400 rounded-lg shrink-0 shadow-sm">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <span>
              در حال مشاهده سیستم به‌جای کاربر <strong className="underline decoration-slate-900">{currentUser.fullName} ({currentUser.roleTitle})</strong> — هویت واقعی شما: {impersonatorAdmin.fullName}.
            </span>
          </div>
          <button
            onClick={handleExitImpersonation}
            className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-amber-300 font-black rounded-xl transition shadow flex items-center gap-1.5 cursor-pointer border border-amber-500/40 hover:scale-105 active:scale-95"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>خروج و بازگشت به حساب ادمین ارشد ({impersonatorAdmin.fullName})</span>
          </button>
        </div>
      )}

      {/* Main Layout Body - Full Screen Container */}
      <div className="flex-1 w-full flex flex-col md:flex-row min-h-[calc(100vh-4rem)] relative">
        
        {/* Desktop Sidebar (Collapsible) */}
        <div className="hidden md:flex shrink-0">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={(tab) => {
              if (tab === 'new_request') {
                setIsNewRequestModalOpen(true);
              } else {
                setActiveTab(tab);
              }
            }}
            currentUser={currentUser}
            pendingApprovalCount={pendingApprovalRequests.length}
            myRequestsCount={myRequests.length}
            users={users}
            directMessages={directMessages}
            roles={roles}
            letters={letters}
            onSelectColleague={(userId) => setColleagueChatTarget(userId || null)}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
          />
        </div>

        {/* Mobile Slide-over Drawer Sidebar */}
        {isMobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-start dir-rtl animate-fade-in">
            <div className="w-4/5 max-w-xs h-full bg-slate-900 overflow-y-auto shadow-2xl">
              <Sidebar
                activeTab={activeTab}
                setActiveTab={(tab) => {
                  if (tab === 'new_request') {
                    setIsNewRequestModalOpen(true);
                  } else {
                    setActiveTab(tab);
                  }
                  setIsMobileSidebarOpen(false);
                }}
                currentUser={currentUser}
                pendingApprovalCount={pendingApprovalRequests.length}
                myRequestsCount={myRequests.length}
                users={users}
                directMessages={directMessages}
                roles={roles}
                letters={letters}
                onSelectColleague={(userId) => setColleagueChatTarget(userId || null)}
                isCollapsed={false}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
              />
            </div>
            {/* Click outside to close backdrop */}
            <div 
              className="flex-1 h-full cursor-pointer" 
              onClick={() => setIsMobileSidebarOpen(false)} 
            />
          </div>
        )}

        {/* Main Content View - Full Screen */}
        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden min-w-0">
          
          {currentUser && currentUser.isActive === false ? (
            <div className="max-w-2xl mx-auto my-8 p-8 bg-slate-900 border border-amber-500/40 rounded-3xl shadow-2xl text-center space-y-6 dir-rtl">
              <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-3xl border border-amber-500/30 flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8" />
              </div>
              <div className="space-y-3">
                <span className="px-3 py-1 bg-amber-500/20 text-amber-300 font-extrabold text-xs rounded-full border border-amber-500/30">
                  در انتظار تایید مدیریت سیستم
                </span>
                <h2 className="text-2xl font-black text-white">حساب کاربری شما هنوز فعال نشده است</h2>
                <p className="text-sm text-slate-300 leading-relaxed max-w-lg mx-auto">
                  جناب <strong className="text-amber-300">{currentUser.fullName}</strong>، حساب کاربری شما با موفقیت در سامانه ثبت گردیده است اما جهت دسترسی به منوها، مشاهده گزارشات مالی و ثبت درخواست، نیازمند تایید ارشد توسط ادمین سیستم (رضا بیات) است.
                </p>
                <p className="text-xs text-slate-400">
                  پس از بررسی و فعال‌سازی توسط مدیر سیستم، تمامی بخش‌های سامانه خزانه‌داری به صورت خودکار برای شما فعال خواهند شد.
                </p>
              </div>
              <div className="pt-6 border-t border-slate-800 flex items-center justify-center gap-4">
                <button
                  onClick={() => {
                    storage.setCurrentUser(null);
                    setCurrentUser(null);
                  }}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-lg shadow-rose-600/20"
                >
                  خروج از حساب کاربری
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
            <DashboardView
              requests={requests}
              currentUser={currentUser}
              companies={companies}
              costCenters={costCenters}
              onOpenNewRequest={() => setIsNewRequestModalOpen(true)}
              onNavigateTab={setActiveTab}
              onSelectRequest={(req) => {
                setSelectedDetailRequest(req);
                setIsDetailModalOpen(true);
              }}
            />
          )}

          {activeTab === 'my_requests' && (
            <MyRequestsView
              requests={requests}
              currentUser={currentUser}
              costCenters={costCenters}
              companies={companies}
              onOpenNewRequest={() => setIsNewRequestModalOpen(true)}
              onSelectRequest={(req) => {
                setSelectedDetailRequest(req);
                setIsDetailModalOpen(true);
              }}
              onOpenPrintModal={(req) => {
                setSelectedPrintRequest(req);
                setIsPrintModalOpen(true);
              }}
            />
          )}

          {activeTab === 'assigned_tasks' && (
            <AssignedTasksView
              currentUser={currentUser}
              users={users}
              tasks={tasks}
              onUpdateTask={(updatedTask) => {
                setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
              }}
              onCreateTask={(newTask) => {
                setTasks(prev => [newTask, ...prev]);
              }}
            />
          )}

          {activeTab === 'approval_inbox' && (
            <ApprovalInboxView
              requests={requests}
              currentUser={currentUser}
              companies={companies}
              costCenters={costCenters}
              onSelectRequest={(req) => {
                setSelectedDetailRequest(req);
                setIsDetailModalOpen(true);
              }}
              onOpenPrintModal={(req) => {
                setSelectedPrintRequest(req);
                setIsPrintModalOpen(true);
              }}
            />
          )}

          {activeTab === 'cost_centers' && (
            <CostCentersView
              costCenters={costCenters}
              companies={companies}
              requests={requests}
              currentUser={currentUser}
              onUpdateCostCenters={setCostCenters}
            />
          )}

          {activeTab === 'vendors' && (
            <VendorsView
              vendors={vendors}
              requests={requests}
              currentUser={currentUser}
              companies={companies}
              onUpdateVendors={setVendors}
              vendorCategories={vendorCategories}
              onUpdateVendorCategories={setVendorCategories}
              onOpenNewRequestWithVendor={() => {
                setIsNewRequestModalOpen(true);
              }}
            />
          )}

          {activeTab === 'vendor_categories' && (
            <VendorCategoriesView
              categories={vendorCategories}
              vendors={vendors}
              currentUser={currentUser}
              onUpdateCategories={setVendorCategories}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersView
              customers={customers}
              users={users}
              roles={roles}
              currentUser={currentUser}
              onUpdateCustomers={setCustomers}
            />
          )}

          {activeTab === 'colleagues' && (
            <ColleaguesView
              users={users}
              currentUser={currentUser}
              messages={directMessages}
              initialTargetUserId={colleagueChatTarget}
              onSendMessage={handleSendDirectMessage}
              onMarkConversationRead={handleMarkConversationRead}
            />
          )}

          {activeTab === 'support' && (
            <SupportView
              cases={supportCases}
              currentUser={currentUser}
              users={users}
              companies={companies}
              costCenters={costCenters}
              onCreateCase={handleCreateSupportCase}
              onUpdateCase={handleUpdateSupportCase}
              onMarkRowApproved={handleMarkSupportRowApproved}
              onSendApprovedRowsToTreasury={handleSendApprovedRowsToTreasury}
            />
          )}

          {activeTab === 'letters' && (
            <LettersView
              letters={letters}
              currentUser={currentUser}
              users={users}
              onCreateLetter={handleCreateLetter}
              onUpdateLetter={handleUpdateLetter}
              onSaveNewVersion={handleSaveNewLetterVersion}
              onForward={handleForwardLetter}
            />
          )}

          {activeTab === 'companies' && (
            <CompaniesView
              companies={companies}
              companyBankAccounts={companyBankAccounts}
              currentUser={currentUser}
              onUpdateCompanies={setCompanies}
              onUpdateCompanyBankAccounts={setCompanyBankAccounts}
            />
          )}

          {activeTab === 'archive' && (
            <ArchiveView
              requests={requests}
              companies={companies}
              costCenters={costCenters}
              currentUser={currentUser}
              supportCases={supportCases}
              letters={letters}
              vendors={vendors}
              users={users}
              onSelectRequest={(req) => {
                setSelectedDetailRequest(req);
                setIsDetailModalOpen(true);
              }}
              onOpenPrintModal={(req) => {
                setSelectedPrintRequest(req);
                setIsPrintModalOpen(true);
              }}
            />
          )}

          {activeTab === 'workflow' && (
            <WorkflowChartView
              workflowSteps={workflowSteps}
              users={users}
              currentUser={currentUser}
              onUpdateUsers={setUsers}
            />
          )}

          {activeTab === 'messenger' && (
            <ChatView
              messages={messages}
              currentUser={currentUser}
              onSendMessage={(newMsg) => setMessages(prev => [...prev, newMsg])}
            />
          )}

          {activeTab === 'roles_permissions' && (
            <RolesAndPermissionsView
              roles={roles}
              users={users}
              currentUser={currentUser}
              onUpdateRoles={setRoles}
            />
          )}

          {activeTab === 'all_communications' && (
            <AllCommunicationsAuditView
              currentUser={currentUser}
              users={users}
              directMessages={directMessages}
              publicMessages={messages}
              letters={letters}
              requests={requests}
              tasks={tasks}
              supportCases={supportCases}
            />
          )}

          {activeTab === 'style_settings' && (
            <StyleSettingsView
              currentFont={currentFont}
              onSelectFont={setCurrentFont}
              theme={theme}
              onToggleTheme={toggleTheme}
              fontSize={fontSize}
              onChangeFontSize={setFontSize}
              accentColor={accentColor}
              onChangeAccentColor={setAccentColor}
            />
          )}

          {activeTab === 'admin' && (
            <AdminPanel
              users={users}
              companies={companies}
              costCenters={costCenters}
              requests={requests}
              roles={roles}
              currentUser={currentUser}
              onUpdateUsers={setUsers}
              onUpdateCompanies={setCompanies}
              onUpdateCostCenters={setCostCenters}
              onImpersonateUser={handleImpersonateUser}
            />
          )}
            </>
          )}

        </main>

      </div>

      {/* Modals */}
      <NewRequestModal
        isOpen={isNewRequestModalOpen}
        onClose={() => setIsNewRequestModalOpen(false)}
        currentUser={currentUser}
        companies={companies}
        costCenters={costCenters}
        users={users}
        onRequestCreated={handleRequestCreated}
      />

      <RequestDetailModal
        request={selectedDetailRequest}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        currentUser={currentUser}
        users={users}
        roles={roles}
        impersonatorAdmin={impersonatorAdmin}
        onUpdateRequest={handleUpdateRequest}
        onDeleteRequest={handleDeleteRequest}
        onOpenPrintModal={(req) => {
          setSelectedPrintRequest(req);
          setIsPrintModalOpen(true);
        }}
      />

      <LoginRegisterModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={(u) => {
          setCurrentUser(u);
          setIsLoginModalOpen(false);
        }}
        companies={companies}
        costCenters={costCenters}
      />

      <PrintRequestModal
        request={selectedPrintRequest}
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
      />

      {isBulkExportModalOpen && (
        <BulkPaymentExportModal
          selectedRequests={bulkExportRequests.length > 0 ? bulkExportRequests : requests.filter(r => r.status === 'approved_pending_payment' || r.status === 'paid').slice(0, 5)}
          onClose={() => setIsBulkExportModalOpen(false)}
          onMarkBatchAsPaid={(ids, note) => {
            const updated = requests.map(r => ids.includes(r.id) ? {
              ...r,
              status: 'paid' as const,
              paymentProofUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80',
              timeline: [
                ...r.timeline,
                {
                  id: `tl_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                  actorName: currentUser?.fullName || 'خزانه‌داری',
                  actorRole: 'پرداخت‌کننده',
                  action: 'paid' as const,
                  actionTitle: 'تسویه گروهی واریز بانکی',
                  timestamp: new Date().toLocaleDateString('fa-IR'),
                  comment: note
                }
              ]
            } : r);
            setRequests(updated);
          }}
        />
      )}

    </div>
  );
}
