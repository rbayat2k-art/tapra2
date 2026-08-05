import React from 'react';
import {
  X, LayoutDashboard, FileText, CheckSquare, Inbox, Palette, MapPin, Building,
  Search, GitFork, MessageSquare, BookUser, Tags, UsersRound, LifeBuoy, Mail,
  ShieldAlert, KeyRound, Users, Contact
} from 'lucide-react';

export interface OpenTab {
  id: string;
  label: string;
}

interface TabDefinition {
  label: string;
  icon: any;
}

// Static icon/label registry for every app-level (multi-tab) view — mirrors the labels
// used for the same ids in Sidebar.tsx navItems. Shared with App.tsx so openTab() can
// resolve a sensible tab label/icon for callers that don't pass one explicitly.
export const TAB_DEFINITIONS: Record<string, TabDefinition> = {
  dashboard: { label: 'داشبورد و خلاصه آمار', icon: LayoutDashboard },
  my_requests: { label: 'درخواست‌های من', icon: FileText },
  assigned_tasks: { label: 'کارهای محوله و دستورات', icon: CheckSquare },
  approval_inbox: { label: 'کارتابل تایید و پرداخت', icon: Inbox },
  style_settings: { label: 'تنظیمات استایل و فونت', icon: Palette },
  cost_centers: { label: 'شعب فروش و مراکز هزینه', icon: MapPin },
  companies: { label: 'شرکت‌های tapra', icon: Building },
  archive: { label: 'جستجوی پیشرفته و خروجی', icon: Search },
  workflow: { label: 'چارت گردش کار (فلو)', icon: GitFork },
  messenger: { label: 'گفتگوی عمومی خزانه‌داری', icon: MessageSquare },
  vendors: { label: 'ذینفعان و فروشندگان', icon: BookUser },
  vendor_categories: { label: 'دسته‌بندی‌های دفترچه', icon: Tags },
  customers: { label: 'مشتریان', icon: Contact },
  colleagues: { label: 'گفتگوی همکاران', icon: UsersRound },
  support: { label: 'خدمات پس از فروش و شکایات', icon: LifeBuoy },
  letters: { label: 'نامه‌ها', icon: Mail },
  all_communications: { label: 'کلیه مکاتبات و چت‌های همکاران', icon: ShieldAlert },
  roles_permissions: { label: 'نقش‌ها و دسترسی‌ها (RBAC)', icon: KeyRound },
  admin: { label: 'مدیریت کاربران سیستمی', icon: Users },
};

interface TabBarProps {
  openTabs: OpenTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

// Browser-like tab strip above the main content: every open view stays mounted (App.tsx
// toggles visibility with CSS display), this bar just lets the user switch between /
// close the ones currently open. The "dashboard" tab never shows a close button — it's
// the one tab that always stays open.
export const TabBar: React.FC<TabBarProps> = ({ openTabs, activeTabId, onSelectTab, onCloseTab }) => {
  if (openTabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-0.5 mb-4 border-b border-slate-200 dark:border-slate-800 dir-rtl scrollbar-thin scrollbar-thumb-slate-700">
      {openTabs.map((tab) => {
        const def = TAB_DEFINITIONS[tab.id];
        const Icon = def?.icon || LayoutDashboard;
        const isActive = activeTabId === tab.id;
        const isDashboard = tab.id === 'dashboard';

        return (
          <div
            key={tab.id}
            className={`flex items-center shrink-0 rounded-t-xl border-b-2 transition ${
              isActive
                ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-500'
                : 'bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectTab(tab.id)}
              title={tab.label}
              className={`flex items-center gap-2 pr-3 ${isDashboard ? 'pl-3' : 'pl-1.5'} py-2 text-xs font-bold whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>

            {!isDashboard && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                title="بستن تب"
                className="p-1 ml-1 mr-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
