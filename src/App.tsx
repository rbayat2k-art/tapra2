import React, { useState, useEffect } from 'react';
import { Clock, ShieldAlert } from 'lucide-react';
import { 
  User, Company, CompanyBankAccount, CostCenter, PaymentRequest, 
  WorkflowStepRule, SystemNotification, ChatMessage, DirectMessage, SupportCase, Letter 
} from './types';
import { storage, DEFAULT_CUSTOMER_ENTRY_CONFLICTS } from './utils/storage';
import { getJalaliNow, getJalaliNowWithSeconds } from './utils/persianDate';
import { executeDueSalespersonTransfers } from './utils/salesPersonnelLifecycle';
import { numberToPersianWords, formatRial } from './utils/numberToWords';
import { getEffectiveUserPermissions, hasPermission, isSystemAdmin, useEffectivePermissions } from './utils/permissions';
import { canApproveSupportRefundRow, validateSupportRefundSubmission } from './utils/supportRefundWorkflow';
import { canStartImpersonation } from './utils/auth';
import { logAudit } from './utils/auditLog';
import { Navbar } from './components/Navbar';
import { StatusBadge, DangerButton } from './components/ui/primitives';
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
import { PrintRequestModal } from './components/PrintRequestModal';
import { VendorsView } from './components/VendorsView';
import { VendorCategoriesView } from './components/VendorCategoriesView';
import { CustomersView } from './components/CustomersView';
import { CustomerMergeCandidatesView } from './components/CustomerMergeCandidatesView';
import { CustomerMergeReviewQueueView } from './components/CustomerMergeReviewQueueView';
import { PurchaseClaimReviewView } from './components/PurchaseClaimReviewView';
import { RawContactRepositoryView } from './components/RawContactRepositoryView';
import { CampaignsView } from './components/CampaignsView';
import { LeadAssignmentView } from './components/LeadAssignmentView';
import { SalesQueueView } from './components/SalesQueueView';
import { ProductsView } from './components/ProductsView';
import { ServicesView } from './components/ServicesView';
import { PromotionsView } from './components/PromotionsView';
import { SalesInvoiceView } from './components/SalesInvoiceView';
import { BatchInvoiceImportView } from './components/BatchInvoiceImportView';
import { SalesPersonnelLifecycleView } from './components/SalesPersonnelLifecycleView';
import { SalesOrganizationView } from './components/SalesOrganizationView';
import { SalesFinancialConfirmationView } from './components/SalesFinancialConfirmationView';
import { CoordinationInboxView } from './components/CoordinationInboxView';
import { FulfillmentCasesView } from './components/FulfillmentCasesView';
import { ColleaguesView } from './components/ColleaguesView';
import { SupportView } from './components/SupportView';
import { LettersView } from './components/LettersView';
import { BulkPaymentExportModal } from './components/BulkPaymentExportModal';
import { MyRequestsView } from './components/MyRequestsView';
import { ApprovalInboxView } from './components/ApprovalInboxView';
import { AssignedTasksView } from './components/AssignedTasksView';
import { AllCommunicationsAuditView } from './components/AllCommunicationsAuditView';
import { StyleSettingsView, AVAILABLE_FONTS } from './components/StyleSettingsView';
import { TabBar, TAB_DEFINITIONS, OpenTab } from './components/TabBar';
import { NAV_ITEMS, isNavItemVisible } from './config/navigationRegistry';
import { useFoundationSession } from './foundation/auth/FoundationSessionContext';
import { FoundationLogin } from './foundation/auth/FoundationLogin';
import { ContextSelector } from './foundation/organization/ContextSelector';
import { FoundationContextBar } from './foundation/organization/FoundationContextBar';
import { SaasCustomerWorkspace } from './foundation/customers/SaasCustomerWorkspace';
import { resolveLegacyShellUser } from './integration/legacyShellIdentity';

export default function App() {
  const foundation = useFoundationSession();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Browser-like multi-tab navigation: every view the user opens stays mounted (App.tsx
  // toggles visibility with CSS, see the main content section below) instead of being
  // unmounted/discarded on every navigation, so scroll position, filters, and half-filled
  // forms in a tab survive switching away and back. "dashboard" is always the first tab
  // and can never be closed.
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([{ id: 'dashboard', label: TAB_DEFINITIONS.dashboard.label }]);
  const [activeTabId, setActiveTabId] = useState<string>('dashboard');

  const openTab = (tabId: string, label?: string) => {
    setOpenTabs(prev => {
      if (prev.some(t => t.id === tabId)) return prev;
      const finalLabel = label || TAB_DEFINITIONS[tabId]?.label || tabId;
      return [...prev, { id: tabId, label: finalLabel }];
    });
    setActiveTabId(tabId);
    // Usage telemetry for the "پرکاربردترین منوهای شما" dashboard widget — counts every
    // open/switch-to, per logged-in user, independent of the openTabs/activeTabId state above.
    if (currentUser) {
      storage.recordTabUsage(currentUser.id, tabId);
    }
  };

  const closeTab = (tabId: string) => {
    if (tabId === 'dashboard') return; // dashboard is never closable
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx === -1) return prev;
      const next = prev.filter(t => t.id !== tabId);

      if (activeTabId === tabId) {
        // Activate the tab to its left (previous in the list); if it was the first tab,
        // activate the one that takes its place instead. If nothing is left, fall back
        // to (and re-open, since dashboard must always stay open) the dashboard tab.
        const fallback = { id: 'dashboard', label: TAB_DEFINITIONS.dashboard.label };
        const newActive = next[idx > 0 ? idx - 1 : 0] || fallback;
        setActiveTabId(newActive.id);
        return next.length > 0 ? next : [fallback];
      }

      return next;
    });
  };

  // Whenever the logged-in identity changes (impersonation switch, exiting impersonation,
  // or a plain logout/login), the open tab set must be wiped back to just the dashboard.
  // Otherwise a tab opened under one identity (e.g. an admin's "مدیریت کاربران سیستمی" tab)
  // would stay mounted and clickable after switching to a less-privileged user, since
  // selecting an already-open tab does not re-check hasAccess.
  const resetTabsToDashboard = () => {
    setOpenTabs([{ id: 'dashboard', label: TAB_DEFINITIONS.dashboard.label }]);
    setActiveTabId('dashboard');
  };

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
    // بند ۸ مأموریت بازطراحی UI: انتخاب Accent باید واقعاً --primary/--primary-hover/
    // --primary-soft/--focus-ring را عوض کند، نه فقط ذخیره شود — data-accent روی <html>
    // توسط index.css's :root[data-accent="..."] مصرف می‌شود.
    if (accentColor === 'emerald') {
      document.documentElement.removeAttribute('data-accent');
    } else {
      document.documentElement.setAttribute('data-accent', accentColor);
    }
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
  const [customerMergeRequests, setCustomerMergeRequests] = useState(() => storage.getCustomerMergeRequests());
  const [customerMergeEvents, setCustomerMergeEvents] = useState(() => storage.getCustomerMergeEvents());
  const [customerSplitEvents, setCustomerSplitEvents] = useState(() => storage.getCustomerSplitEvents());
  // بذر Demo تعارض ورود اطلاعات (بند ۲۱ مأموریت فروش) فقط وقتی هیچ تعارضی هنوز ذخیره نشده اعمال
  // می‌شود — عمداً در سطح getCustomerEntryConflicts خودِ storage.ts قرار نگرفت تا رفتار Rollback
  // «بازگشت به کاملاً غایب» در تست‌های اتمیک saveCustomerIdentityTransaction دست‌نخورده بماند.
  const [customerEntryConflicts, setCustomerEntryConflicts] = useState(() => {
    const existing = storage.getCustomerEntryConflicts();
    return existing.length === 0 ? DEFAULT_CUSTOMER_ENTRY_CONFLICTS : existing;
  });
  const [claimedPurchases, setClaimedPurchases] = useState(() => storage.getClaimedPurchases());
  const [rawContacts, setRawContacts] = useState(() => storage.getRawContacts());
  const [importJobs, setImportJobs] = useState(() => storage.getImportJobs());
  const [campaigns, setCampaigns] = useState(() => storage.getCampaigns());
  const [leads, setLeads] = useState(() => storage.getLeads());
  const [callLogs, setCallLogs] = useState(() => storage.getCallLogs());
  const [products, setProducts] = useState(() => storage.getProducts());
  const [services, setServices] = useState(() => storage.getServices());
  const [promotions, setPromotions] = useState(() => storage.getPromotions());
  const [salesInvoices, setSalesInvoices] = useState(() => storage.getSalesInvoices());
  const [productFulfillmentCases, setProductFulfillmentCases] = useState(() => storage.getProductFulfillmentCases());
  const [serviceFulfillmentCases, setServiceFulfillmentCases] = useState(() => storage.getServiceFulfillmentCases());
  const [coordinationCases, setCoordinationCases] = useState(() => storage.getCoordinationCases());
  const [salesFinancialReviewCases, setSalesFinancialReviewCases] = useState(() => storage.getSalesFinancialReviewCases());
  const [salesFinancialReviewEvents, setSalesFinancialReviewEvents] = useState(() => storage.getSalesFinancialReviewEvents());
  const [salesFinancialSettings, setSalesFinancialSettings] = useState(() => storage.getSalesFinancialSettings());
  const [salesOverpaymentCases, setSalesOverpaymentCases] = useState(() => storage.getSalesOverpaymentCases());
  const [mergeCandidatesTargetCustomerId, setMergeCandidatesTargetCustomerId] = useState<string | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>(() => storage.getDirectMessages());
  const [colleagueChatTarget, setColleagueChatTarget] = useState<string | null>(null);
  const [supportCases, setSupportCases] = useState<SupportCase[]>(() => storage.getSupportCases());
  const [letters, setLetters] = useState<Letter[]>(() => storage.getLetters());
  const [requests, setRequests] = useState<PaymentRequest[]>(() => storage.getRequests());
  const [tasks, setTasks] = useState(() => storage.getTasks());
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepRule[]>(() => storage.getWorkflow());
  const [notifications, setNotifications] = useState<SystemNotification[]>(() => storage.getNotifications(currentUser?.id));
  const [messages, setMessages] = useState<ChatMessage[]>(() => storage.getMessages());

  // بند ۲۱ AGENTS.md: چون Worker واقعی زمان‌بندی‌شده در این Prototype وجود ندارد (محدودیت صریح
  // مستندشده)، انتقال‌های تأییدشده/زمان‌بندی‌شدهٔ سررسیده فقط در لحظهٔ Initialization برنامه اجرا
  // می‌شوند — نه با هر Refresh (که هزینهٔ محاسباتی غیرضروری روی هر re-render می‌ساخت). این خود
  // useEffect با هر Mount (شامل هر Refresh/Reload واقعی مرورگر) دوباره اجرا می‌شود، پس بازیابی
  // انتقال سررسیده بعد از Refresh تضمین است. بدهی #A مأموریت تکمیل چرخهٔ عمر: پیش‌تر اینجا
  // به‌اشتباه یک رشتهٔ نمایشی شمسی (`getJalaliNow()`) به‌جای Timestamp ISO واقعی پاس داده
  // می‌شد؛ چون `new Date(نمایش‌شمسی)` همیشه Invalid Date/NaN می‌دهد، مقایسهٔ سررسید همیشه false
  // بود و هیچ انتقال زمان‌بندی‌شده‌ای در برنامهٔ واقعی هرگز خودکار اجرا نمی‌شد — با ISO واقعی رفع شد.
  useEffect(() => {
    const dueRequests = storage.getSalespersonTransferRequests();
    const nowIso = new Date().toISOString();
    const hasDue = dueRequests.some((r) =>
      (r.status === 'approved' || r.status === 'scheduled') && !!r.effectiveAtIso &&
      new Date(r.effectiveAtIso).getTime() <= new Date(nowIso).getTime()
    );
    if (!hasDue) return;
    const result = executeDueSalespersonTransfers(
      dueRequests, storage.getUsers(), storage.getSalesOrgAssignments(), storage.getLeads(),
      storage.getSalesBranches(), storage.getSalesChains(), storage.getRoles(),
      { id: 'system_scheduler', fullName: 'اجرای خودکار انتقال‌های زمان‌بندی‌شده' }, nowIso
    );
    if (result.executedCount === 0) return;
    const tx = storage.saveCustomerIdentityTransaction({
      users: result.updatedUsers, salesOrgAssignments: result.updatedAssignments, leads: result.updatedLeads,
      salespersonTransferRequests: result.updatedRequests,
      salesOrgAssignmentEvents: [...storage.getSalesOrgAssignmentEvents(), ...result.events]
    });
    if (tx.ok === true) {
      setUsers(result.updatedUsers);
      setLeads(result.updatedLeads);
      logAudit({ action: 'salesperson_due_transfers_executed', effectiveUser: { id: 'system_scheduler', fullName: 'اجرای خودکار انتقال‌های زمان‌بندی‌شده' } as User, roles, details: `${result.executedCount} انتقال زمان‌بندی‌شده اجرا شد` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Impersonation (Admin Login as User) State
  const [impersonatorAdmin, setImpersonatorAdmin] = useState<User | null>(null);

  useEffect(() => {
    const session = foundation.session;
    if (!session?.activeContext) {
      setCurrentUser(null);
      return;
    }

    // The mature shell receives presentation identity from the trusted Foundation session.
    // It is deliberately not persisted as a local login and cannot authorize an API request.
    setCurrentUser(resolveLegacyShellUser(session, users));
    setImpersonatorAdmin(null);
    localStorage.removeItem('shavaz_impersonator_admin');
    resetTabsToDashboard();
  }, [foundation.session?.user.id, foundation.session?.activeContext?.membershipId, users]);

  // Effective permissions of the REAL logged-in identity (never affected by whichever user is
  // currently being viewed while impersonating) — the ONLY thing consulted to authorize
  // starting/continuing Impersonation. Effective permissions of whoever is CURRENTLY being
  // viewed (impersonated user, or the logged-in user otherwise) drive menu/tab/data/operations.
  const realActor = impersonatorAdmin || currentUser;
  const realActorPermissions = useEffectivePermissions(realActor, roles);
  const effectivePermissions = useEffectivePermissions(currentUser, roles);

  const endOpenImpersonationLogEntry = (adminId: string, targetUserId: string) => {
    const log = storage.getImpersonationLog();
    const idx = [...log].reverse().findIndex((e) => e.adminId === adminId && e.targetUserId === targetUserId && !e.endedAt);
    if (idx === -1) return;
    const realIdx = log.length - 1 - idx;
    const updated = [...log];
    updated[realIdx] = { ...updated[realIdx], endedAt: getJalaliNow() };
    storage.saveImpersonationLog(updated);
  };

  const handleImpersonateUser = (targetUser: User) => {
    // Hardened gate: realActor must be a genuine admin (role === 'admin', not merely a
    // permission grant) AND hold impersonate_users, target must exist/be active, and no
    // Impersonation session may already be open (fully blocks nested Impersonation). This
    // check runs on every call regardless of current state, so even a direct call to this
    // handler (e.g. from devtools) with a non-admin/unauthorized identity is rejected.
    const gate = canStartImpersonation(realActor, impersonatorAdmin, targetUser, realActorPermissions);
    if (gate.ok === false) {
      alert(gate.reason);
      return;
    }

    setImpersonatorAdmin(realActor);
    localStorage.setItem('shavaz_impersonator_admin', JSON.stringify(realActor));
    setCurrentUser(targetUser);
    storage.setCurrentUser(targetUser);

    const log = storage.getImpersonationLog();
    storage.saveImpersonationLog([...log, {
      id: `imp_${Date.now()}`,
      adminId: realActor!.id,
      adminName: realActor!.fullName,
      targetUserId: targetUser.id,
      targetUserName: targetUser.fullName,
      startedAt: getJalaliNow()
    }]);
    logAudit({ action: 'impersonation_start', effectiveUser: realActor!, roles, permissionUsed: 'impersonate_users', targetId: targetUser.id, details: `شروع مشاهده به‌جای ${targetUser.fullName}` });

    resetTabsToDashboard();
    if (targetUser.role === 'requestor') {
      openTab('my_requests');
    } else {
      openTab('approval_inbox');
    }
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
      resetTabsToDashboard();
      openTab('admin');
    }
  };

  // Aggressive Tab Guard: whenever the open tab set or the current user's effective
  // permissions change, ACTIVELY close (not just block opening) any already-open tab the
  // user is no longer authorized for — defense in depth beyond Sidebar hiding the menu item
  // and beyond resetTabsToDashboard() on identity change (which only fires at the five
  // identity-change points, not on every permission/role edit while already logged in).
  // Reads the exact same Navigation Registry (single source of label/icon/Permission — مأموریت
  // بازطراحی UI Foundation) that Sidebar.tsx renders from, so a tab can never stay open after
  // Sidebar would already hide its menu item.
  useEffect(() => {
    if (!currentUser) return;
    const isAdminUser = currentUser.role === 'admin';
    for (const tab of openTabs) {
      if (tab.id === 'dashboard') continue;
      const navItem = NAV_ITEMS.find((i) => i.id === tab.id);
      // یک id باز که دیگر در Registry نیست (نباید پیش بیاید) به‌صورت ایمن دست‌نخورده می‌ماند —
      // فقط idهای شناخته‌شده‌ای که واقعاً دیگر مجاز نیستند بسته می‌شوند.
      if (!navItem) continue;
      const allowed = isNavItemVisible(navItem, { currentUser, effectivePermissions, isAdmin: isAdminUser });
      if (!allowed) {
        closeTab(tab.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTabs, effectivePermissions, currentUser]);

  // Modals
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
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
    storage.saveCustomerMergeRequests(customerMergeRequests);
  }, [customerMergeRequests]);

  useEffect(() => {
    storage.saveCustomerMergeEvents(customerMergeEvents);
  }, [customerMergeEvents]);

  useEffect(() => {
    storage.saveCustomerSplitEvents(customerSplitEvents);
  }, [customerSplitEvents]);

  useEffect(() => {
    storage.saveCustomerEntryConflicts(customerEntryConflicts);
  }, [customerEntryConflicts]);

  useEffect(() => {
    storage.saveClaimedPurchases(claimedPurchases);
  }, [claimedPurchases]);

  useEffect(() => {
    storage.saveRawContacts(rawContacts);
  }, [rawContacts]);

  useEffect(() => {
    storage.saveImportJobs(importJobs);
  }, [importJobs]);

  useEffect(() => {
    storage.saveCampaigns(campaigns);
  }, [campaigns]);

  useEffect(() => {
    storage.saveLeads(leads);
  }, [leads]);

  useEffect(() => {
    storage.saveCallLogs(callLogs);
  }, [callLogs]);

  useEffect(() => {
    storage.saveProducts(products);
  }, [products]);

  useEffect(() => {
    storage.saveServices(services);
  }, [services]);

  useEffect(() => {
    storage.savePromotions(promotions);
  }, [promotions]);

  useEffect(() => {
    storage.saveSalesInvoices(salesInvoices);
  }, [salesInvoices]);

  useEffect(() => {
    storage.saveProductFulfillmentCases(productFulfillmentCases);
  }, [productFulfillmentCases]);

  useEffect(() => {
    storage.saveServiceFulfillmentCases(serviceFulfillmentCases);
  }, [serviceFulfillmentCases]);

  useEffect(() => {
    storage.saveCoordinationCases(coordinationCases);
  }, [coordinationCases]);

  useEffect(() => { storage.saveSalesFinancialReviewCases(salesFinancialReviewCases); }, [salesFinancialReviewCases]);
  useEffect(() => { storage.saveSalesFinancialReviewEvents(salesFinancialReviewEvents); }, [salesFinancialReviewEvents]);
  useEffect(() => { storage.saveSalesFinancialSettings(salesFinancialSettings); }, [salesFinancialSettings]);
  useEffect(() => { storage.saveSalesOverpaymentCases(salesOverpaymentCases); }, [salesOverpaymentCases]);

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
            return { ...row, status: 'paid' as const, paidAt: linked.updatedAt || getJalaliNowWithSeconds() };
          }
          return row;
        });
        if (caseChanged) {
          changed = true;
          const paidRows = updatedTransactions.filter((row) => row.status === 'paid' && c.transactions.find((old) => old.id === row.id)?.status !== 'paid');
          return {
            ...c,
            transactions: updatedTransactions,
            timeline: paidRows.reduce((timeline, row) => [...timeline, {
              id: `stl_paid_${row.id}_${Date.now()}`,
              actorId: 'system_payment_sync',
              actorName: 'همگام‌سازی پرداخت خزانه',
              actorRole: 'سیستم',
              action: 'paid' as const,
              actionTitle: `ثبت پرداخت عودت فاکتور ${row.invoiceCode}`,
              comment: `درخواست پرداخت ${row.paymentRequestTrackingCode || row.paymentRequestId} در خزانه پرداخت‌شده ثبت شد.`,
              timestamp: getJalaliNowWithSeconds()
            }], c.timeline)
          };
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

  // Never physically deletes a PaymentRequest — status becomes 'cancelled' and the record
  // stays in `requests` (and therefore in the archive's "لغوشده‌ها" filter) forever. Physical
  // removal is out of scope until the cleanup-request/approve flow is fully designed; even a
  // cleanup approval (see RequestDetailModal.tsx) only sets a flag, never calls this array out.
  const handleCancelRequest = (requestId: string) => {
    if (!currentUser) return;
    setRequests(prev => prev.map(r => {
      if (r.id !== requestId) return r;
      const updatedTimeline = [
        ...r.timeline,
        {
          id: `tl_${Date.now()}`,
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.roleTitle,
          action: 'cancelled' as const,
          actionTitle: 'لغو درخواست توسط درخواست‌کننده',
          timestamp: getJalaliNow(),
          comment: 'درخواست پیش از هرگونه اقدام تاییدکننده توسط خودِ درخواست‌کننده لغو شد.'
        }
      ];
      return {
        ...r,
        status: 'cancelled' as const,
        cancelledByUserId: currentUser.id,
        cancelledByName: currentUser.fullName,
        cancelledAt: getJalaliNow(),
        updatedAt: getJalaliNow(),
        timeline: updatedTimeline
      };
    }));
    setIsDetailModalOpen(false);
    setSelectedDetailRequest(null);
    alert('درخواست با موفقیت لغو شد و در آرشیو (بخش لغوشده‌ها) باقی می‌ماند.');
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
    openTab('colleagues');
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
    if (!currentUser || !hasPermission(effectivePermissions, ['manage_support_cases'])) {
      alert('شما مجوز ثبت پرونده خدمات پس از فروش را ندارید.');
      return;
    }
    setSupportCases(prev => [newCase, ...prev]);

    // Notify all financial approvers + admin that a new case is waiting for review
    const targets = users.filter((user) => user.isActive && (
      isSystemAdmin(user, roles) || getEffectiveUserPermissions(user, roles).includes('financial_approve_support')
    ));
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
    if (!currentUser || !hasPermission(effectivePermissions, ['manage_support_cases', 'financial_approve_support'])) {
      alert('شما مجوز تغییر این پرونده را ندارید.');
      return;
    }
    setSupportCases(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const handleSendApprovedRowsToTreasury = (caseId: string, rowIds: string[], closeCaseAfter: boolean) => {
    if (!currentUser || rowIds.length === 0) return;
    if (!hasPermission(effectivePermissions, ['financial_approve_support'])) {
      alert('شما مجوز ارسال عودت تاییدشده به خزانه را ندارید.');
      return;
    }
    const targetCase = supportCases.find(c => c.id === caseId);
    if (!targetCase) return;

    const validation = validateSupportRefundSubmission(targetCase, rowIds, requests);
    if (!validation.ok) {
      alert(validation.errors.length > 0 ? validation.errors.join('\n') : 'هیچ ردیف مجاز و آماده‌ای برای ارسال وجود ندارد.');
      return;
    }

    const seniorSupervisor = users.find(u => u.isSeniorTreasurySupervisor) || users.find(u => u.role === 'admin');
    if (!seniorSupervisor) {
      alert('سرپرست ارشد خزانه‌داری در سیستم تعریف نشده است. لطفاً ابتدا از بخش مدیریت کاربران این عنوان را برای یک نفر تنظیم کنید.');
      return;
    }

    const branch = costCenters.find(cc => cc.id === targetCase.branchId);
    const company = companies.find(co => co.id === branch?.companyId);
    const now = getJalaliNowWithSeconds();

    // Keep counting from however many rows of THIS case have already been sent,
    // so codes stay sequential (S50001-1, S50001-2, ...) even across multiple batches over time.
    let sequence = targetCase.transactions.filter(t => !!t.paymentRequestTrackingCode).length;

    const newPaymentRequests: PaymentRequest[] = [];
    const rowUpdates: Record<string, { trackingCode: string; paymentRequestId: string }> = {};

    for (const rowId of validation.eligibleRowIds) {
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

    // Sending a refund to treasury is not completion. The case remains open until the linked
    // request is actually paid (or every row is finally rejected) and support closes it.
    void closeCaseAfter;

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
    if (!hasPermission(effectivePermissions, ['financial_approve_support'])) {
      alert('شما مجوز تایید مالی عودت را ندارید.');
      return;
    }
    const targetCase = supportCases.find(c => c.id === caseId);
    const row = targetCase?.transactions.find(t => t.id === rowId);
    if (!targetCase || !row) return;
    if (!canApproveSupportRefundRow(row) || requests.some((request) => request.sourceSupportTransactionId === row.id)) {
      alert('این ردیف قبلاً تصمیم‌گیری یا به درخواست پرداخت خزانه متصل شده است.');
      return;
    }
    const now = getJalaliNowWithSeconds();

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
      return r.status === 'pending_approval' || r.status === 'approved_pending_payment';
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
      return r.status === 'approved_pending_payment' || r.status === 'pending_approval';
    }
    return false;
  });

  if (foundation.loading) {
    return <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center dir-rtl">در حال برقراری نشست امن…</div>;
  }

  if (!foundation.session) return <FoundationLogin />;
  if (!foundation.session.activeContext) return <ContextSelector />;

  // Identity is derived after the trusted Foundation session/context is ready.
  if (!currentUser) {
    return <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center dir-rtl">در حال آماده‌سازی محیط کاری…</div>;
  }

  return (
    <div className="min-h-screen font-sans dir-rtl selection:bg-[var(--primary)] selection:text-white transition-colors duration-300 bg-[var(--canvas)] text-[var(--text-primary)]">

      {/* Top Header Navbar */}
      <Navbar
        currentUser={currentUser}
        notifications={notifications}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenLogin={() => undefined}
        onLogout={() => {
          setImpersonatorAdmin(null);
          localStorage.removeItem('shavaz_impersonator_admin');
          setCurrentUser(null);
          resetTabsToDashboard();
          void foundation.logout();
        }}
        onSearchTrackingCode={handleSearchTrackingCode}
        onSelectNotificationRequest={handleSelectNotificationRequest}
        onSelectNotificationColleague={handleSelectNotificationColleague}
        onMarkNotificationRead={handleMarkNotificationRead}
        activeTab={activeTabId}
        onOpenTab={openTab}
        onToggleSidebar={() => {
          // اصلاح باگ preexisting: قبلاً این دکمه هم‌زمان Collapse دسکتاپ و Drawer موبایل را
          // toggle می‌کرد (باعث نمایش هم‌زمان دو نمونهٔ Sidebar/دو نشانگر «کاربران» می‌شد). حالا
          // فقط حالت متناظر با عرض واقعی صفحه toggle می‌شود.
          if (window.matchMedia('(min-width: 768px)').matches) {
            setIsSidebarCollapsed(prev => !prev);
          } else {
            setIsMobileSidebarOpen(prev => !prev);
          }
        }}
      />

      <FoundationContextBar />

      {/* Impersonation Banner (When Admin is testing as another user) */}
      {impersonatorAdmin && currentUser && (
        <div className="bg-[var(--warning)] text-white font-bold px-4 py-2.5 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs dir-rtl sticky top-16 z-30">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-black/20 text-white rounded-lg shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <span>
              در حال مشاهده سیستم به‌جای کاربر <strong className="underline">{currentUser.fullName} ({currentUser.roleTitle})</strong> — هویت واقعی شما: {impersonatorAdmin.fullName}.
            </span>
          </div>
          <button
            onClick={handleExitImpersonation}
            className="px-3 py-1.5 bg-black/20 hover:bg-black/30 text-white font-black rounded-xl transition shadow flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>خروج و بازگشت به حساب ادمین ارشد ({impersonatorAdmin.fullName})</span>
          </button>
        </div>
      )}

      {/* Main Layout Body - Full Screen Container */}
      <div className="flex-1 w-full flex flex-col md:flex-row min-h-[calc(100vh-4rem)] relative">

        {/* Single Sidebar instance — خودش با CSS واکنش‌گرا بین حالت دسکتاپ (Expanded/Collapsed)
            و Drawer موبایل (isMobileOpen) سوییچ می‌کند؛ اصلاح باگ preexisting دو نمونهٔ همزمان
            Sidebar (یکی برای دسکتاپ، یکی برای موبایل) که هر دو هم‌زمان در DOM بودند. */}
        <Sidebar
          activeTab={activeTabId}
          onOpenTab={(tabId, label) => {
            if (tabId === 'new_request') {
              setIsNewRequestModalOpen(true);
            } else {
              openTab(tabId, label);
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
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Main Content View - Full Screen */}
        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden min-w-0">
          
          {currentUser && currentUser.isActive === false ? (
            <div className="max-w-2xl mx-auto my-8 p-8 bg-[var(--surface)] border border-[var(--border)] rounded-[14px] shadow-sm text-center space-y-6 dir-rtl">
              <div className="w-16 h-16 bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] rounded-2xl flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8" />
              </div>
              <div className="space-y-3">
                <StatusBadge label="در انتظار تایید مدیریت سیستم" tone="warning" />
                <h2 className="text-2xl font-black text-[var(--text-primary)]">حساب کاربری شما هنوز فعال نشده است</h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-lg mx-auto">
                  جناب <strong className="text-[var(--warning)]">{currentUser.fullName}</strong>، حساب کاربری شما با موفقیت در سامانه ثبت گردیده است اما جهت دسترسی به منوها، مشاهده گزارشات مالی و ثبت درخواست، نیازمند تایید ارشد توسط ادمین سیستم (رضا بیات) است.
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  پس از بررسی و فعال‌سازی توسط مدیر سیستم، تمامی بخش‌های سامانه خزانه‌داری به صورت خودکار برای شما فعال خواهند شد.
                </p>
              </div>
              <div className="pt-6 border-t border-[var(--border)] flex items-center justify-center gap-4">
                <DangerButton
                  onClick={() => {
                    storage.setCurrentUser(null);
                    setCurrentUser(null);
                  }}
                >
                  خروج از حساب کاربری
                </DangerButton>
              </div>
            </div>
          ) : (
            <>
              <TabBar
                openTabs={openTabs}
                activeTabId={activeTabId}
                onSelectTab={setActiveTabId}
                onCloseTab={closeTab}
              />

              {/* Every open tab stays mounted (hidden via CSS, not unmounted) so scroll
                  position, filters, and half-filled forms in a tab survive switching away
                  and back. Only views the user has actually opened are mounted at all. */}
              {openTabs.map((tab) => (
                <div key={tab.id} style={{ display: activeTabId === tab.id ? 'block' : 'none' }}>
                  {tab.id === 'dashboard' && (
                    <DashboardView
                      requests={requests}
                      currentUser={currentUser}
                      companies={companies}
                      costCenters={costCenters}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      leads={leads}
                      salesInvoices={salesInvoices}
                      coordinationCases={coordinationCases}
                      financialCases={salesFinancialReviewCases}
                      overpaymentCases={salesOverpaymentCases}
                      onOpenNewRequest={() => setIsNewRequestModalOpen(true)}
                      onNavigateTab={openTab}
                      onSelectRequest={(req) => {
                        setSelectedDetailRequest(req);
                        setIsDetailModalOpen(true);
                      }}
                    />
                  )}

                  {tab.id === 'my_requests' && (
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

                  {tab.id === 'assigned_tasks' && (
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

                  {tab.id === 'approval_inbox' && (
                    <ApprovalInboxView
                      requests={requests}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
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

                  {tab.id === 'cost_centers' && (
                    <CostCentersView
                      costCenters={costCenters}
                      companies={companies}
                      requests={requests}
                      currentUser={currentUser}
                      onUpdateCostCenters={setCostCenters}
                    />
                  )}

                  {tab.id === 'vendors' && (
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

                  {tab.id === 'vendor_categories' && (
                    <VendorCategoriesView
                      categories={vendorCategories}
                      vendors={vendors}
                      currentUser={currentUser}
                      onUpdateCategories={setVendorCategories}
                    />
                  )}

                  {tab.id === 'customers' && (
                    <SaasCustomerWorkspace />
                  )}

                  {tab.id === 'customer_merge_candidates' && (
                    <CustomerMergeCandidatesView
                      customers={customers}
                      users={users}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      mergeRequests={customerMergeRequests}
                      onUpdateMergeRequests={setCustomerMergeRequests}
                      impersonatorAdmin={impersonatorAdmin}
                      initialTargetCustomerId={mergeCandidatesTargetCustomerId}
                    />
                  )}

                  {tab.id === 'customer_merge_queue' && (
                    <CustomerMergeReviewQueueView
                      customers={customers}
                      users={users}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      mergeRequests={customerMergeRequests}
                      onUpdateMergeRequests={setCustomerMergeRequests}
                      mergeEvents={customerMergeEvents}
                      onUpdateMergeEvents={setCustomerMergeEvents}
                      splitEvents={customerSplitEvents}
                      onUpdateSplitEvents={setCustomerSplitEvents}
                      entryConflicts={customerEntryConflicts}
                      onUpdateEntryConflicts={setCustomerEntryConflicts}
                      onUpdateCustomers={setCustomers}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'purchase_claim_review' && (
                    <PurchaseClaimReviewView
                      claims={claimedPurchases}
                      onUpdateClaims={setClaimedPurchases}
                      customers={customers}
                      users={users}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'raw_contact_repository' && (
                    <RawContactRepositoryView
                      rawContacts={rawContacts}
                      onUpdateRawContacts={setRawContacts}
                      importJobs={importJobs}
                      onUpdateImportJobs={setImportJobs}
                      customers={customers}
                      onUpdateCustomers={setCustomers}
                      entryConflicts={customerEntryConflicts}
                      onUpdateEntryConflicts={setCustomerEntryConflicts}
                      campaigns={campaigns}
                      leads={leads}
                      onUpdateLeads={setLeads}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'campaigns' && (
                    <CampaignsView
                      campaigns={campaigns}
                      onUpdateCampaigns={setCampaigns}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'lead_assignment' && (
                    <LeadAssignmentView
                      leads={leads}
                      onUpdateLeads={setLeads}
                      users={users}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'my_sales_queue' && (
                    <SalesQueueView
                      leads={leads}
                      onUpdateLeads={setLeads}
                      callLogs={callLogs}
                      onUpdateCallLogs={setCallLogs}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'products' && (
                    <ProductsView
                      products={products}
                      onUpdateProducts={setProducts}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'services' && (
                    <ServicesView
                      services={services}
                      onUpdateServices={setServices}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'promotions' && (
                    <PromotionsView
                      promotions={promotions}
                      onUpdatePromotions={setPromotions}
                      products={products}
                      services={services}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'sales_invoices' && (
                    <SalesInvoiceView
                      salesInvoices={salesInvoices}
                      onUpdateSalesInvoices={setSalesInvoices}
                      coordinationCases={coordinationCases}
                      onUpdateCoordinationCases={setCoordinationCases}
                      customers={customers}
                      leads={leads}
                      products={products}
                      services={services}
                      promotions={promotions}
                      users={users}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'batch_invoice_import' && (
                    <BatchInvoiceImportView
                      salesInvoices={salesInvoices}
                      onUpdateSalesInvoices={setSalesInvoices}
                      customers={customers}
                      onUpdateCustomers={setCustomers}
                      products={products}
                      services={services}
                      promotions={promotions}
                      users={users}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'sales_personnel_lifecycle' && (
                    <SalesPersonnelLifecycleView
                      users={users}
                      onUpdateUsers={setUsers}
                      leads={leads}
                      onUpdateLeads={setLeads}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'sales_organization' && (
                    <SalesOrganizationView
                      users={users}
                      currentUser={currentUser}
                      effectivePermissions={effectivePermissions}
                    />
                  )}

                  {tab.id === 'coordination_inbox' && (
                    <CoordinationInboxView
                      coordinationCases={coordinationCases}
                      onUpdateCoordinationCases={setCoordinationCases}
                      salesInvoices={salesInvoices}
                      onUpdateSalesInvoices={setSalesInvoices}
                      customers={customers}
                      users={users}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'sales_financial_confirmation' && (
                    <SalesFinancialConfirmationView
                      salesInvoices={salesInvoices}
                      onUpdateSalesInvoices={setSalesInvoices}
                      productFulfillmentCases={productFulfillmentCases}
                      onUpdateProductFulfillmentCases={setProductFulfillmentCases}
                      serviceFulfillmentCases={serviceFulfillmentCases}
                      onUpdateServiceFulfillmentCases={setServiceFulfillmentCases}
                      customers={customers}
                      users={users}
                      financialCases={salesFinancialReviewCases}
                      onUpdateFinancialCases={setSalesFinancialReviewCases}
                      financialEvents={salesFinancialReviewEvents}
                      onUpdateFinancialEvents={setSalesFinancialReviewEvents}
                      financialSettings={salesFinancialSettings}
                      onUpdateFinancialSettings={setSalesFinancialSettings}
                      overpaymentCases={salesOverpaymentCases}
                      onUpdateOverpaymentCases={setSalesOverpaymentCases}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'fulfillment_cases' && (
                    <FulfillmentCasesView
                      salesInvoices={salesInvoices}
                      onUpdateSalesInvoices={setSalesInvoices}
                      productFulfillmentCases={productFulfillmentCases}
                      onUpdateProductFulfillmentCases={setProductFulfillmentCases}
                      serviceFulfillmentCases={serviceFulfillmentCases}
                      onUpdateServiceFulfillmentCases={setServiceFulfillmentCases}
                      users={users}
                      currentUser={currentUser}
                      roles={roles}
                      effectivePermissions={effectivePermissions}
                      impersonatorAdmin={impersonatorAdmin}
                    />
                  )}

                  {tab.id === 'colleagues' && (
                    <ColleaguesView
                      users={users}
                      currentUser={currentUser}
                      messages={directMessages}
                      initialTargetUserId={colleagueChatTarget}
                      onSendMessage={handleSendDirectMessage}
                      onMarkConversationRead={handleMarkConversationRead}
                    />
                  )}

                  {tab.id === 'support' && (
                    <SupportView
                      cases={supportCases}
                      currentUser={currentUser}
                      users={users}
                      companies={companies}
                      costCenters={costCenters}
                      effectivePermissions={effectivePermissions}
                      onCreateCase={handleCreateSupportCase}
                      onUpdateCase={handleUpdateSupportCase}
                      onMarkRowApproved={handleMarkSupportRowApproved}
                      onSendApprovedRowsToTreasury={handleSendApprovedRowsToTreasury}
                    />
                  )}

                  {tab.id === 'letters' && (
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

                  {tab.id === 'companies' && (
                    <CompaniesView
                      companies={companies}
                      companyBankAccounts={companyBankAccounts}
                      currentUser={currentUser}
                      onUpdateCompanies={setCompanies}
                      onUpdateCompanyBankAccounts={setCompanyBankAccounts}
                    />
                  )}

                  {tab.id === 'archive' && (
                    <ArchiveView
                      requests={requests}
                      companies={companies}
                      costCenters={costCenters}
                      currentUser={currentUser}
                      roles={roles}
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

                  {tab.id === 'workflow' && (
                    <WorkflowChartView
                      workflowSteps={workflowSteps}
                      users={users}
                      currentUser={currentUser}
                      onUpdateUsers={setUsers}
                    />
                  )}

                  {tab.id === 'messenger' && (
                    <ChatView
                      messages={messages}
                      currentUser={currentUser}
                      onSendMessage={(newMsg) => setMessages(prev => [...prev, newMsg])}
                    />
                  )}

                  {tab.id === 'roles_permissions' && (
                    <RolesAndPermissionsView
                      roles={roles}
                      users={users}
                      currentUser={currentUser}
                      onUpdateRoles={setRoles}
                    />
                  )}

                  {tab.id === 'all_communications' && (
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

                  {tab.id === 'style_settings' && (
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

                  {tab.id === 'admin' && (
                    <AdminPanel
                      users={users}
                      companies={companies}
                      costCenters={costCenters}
                      requests={requests}
                      roles={roles}
                      currentUser={currentUser}
                      realActor={realActor}
                      impersonatorAdmin={impersonatorAdmin}
                      realActorPermissions={realActorPermissions}
                      onUpdateUsers={setUsers}
                      onUpdateCompanies={setCompanies}
                      onUpdateCostCenters={setCostCenters}
                    />
                  )}
                </div>
              ))}
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
        effectivePermissions={effectivePermissions}
        impersonatorAdmin={impersonatorAdmin}
        onUpdateRequest={handleUpdateRequest}
        onDeleteRequest={handleCancelRequest}
        onOpenPrintModal={(req) => {
          setSelectedPrintRequest(req);
          setIsPrintModalOpen(true);
        }}
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
