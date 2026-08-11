import React, { useState, useEffect } from 'react';
import { User, SystemNotification } from '../types';
import {
  Building2, Search, Bell, LogOut, ShieldCheck,
  User as UserIcon, Check, CheckCircle2, ChevronDown,
  Sun, Moon, Calendar, Clock, Menu
} from 'lucide-react';
import { StatusBadge, EmptyState, PrimaryButton } from './ui/primitives';

interface NavbarProps {
  currentUser: User | null;
  notifications: SystemNotification[];
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onSearchTrackingCode: (code: string) => void;
  onSelectNotificationRequest: (requestId: string) => void;
  onSelectNotificationColleague: (colleagueId: string) => void;
  onMarkNotificationRead: (id: string) => void;
  activeTab: string;
  onOpenTab: (tabId: string, label?: string) => void;
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  notifications,
  theme,
  onToggleTheme,
  onOpenLogin,
  onLogout,
  onSearchTrackingCode,
  onSelectNotificationRequest,
  onSelectNotificationColleague,
  onMarkNotificationRead,
  activeTab,
  onOpenTab,
  onToggleSidebar
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Live Date and Time State
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format Persian Date & Day
  const persianDateStr = new Intl.DateTimeFormat('fa-IR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(now);

  // Format Persian Time Clock
  const timeClockStr = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearchTrackingCode(searchQuery.trim());
    }
  };

  return (
    <header className="bg-[var(--surface)] text-[var(--text-primary)] border-b border-[var(--border)] sticky top-0 z-40 shadow-sm dir-rtl transition-colors duration-200">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Hamburger Menu & Logo & Title */}
          <div className="flex items-center gap-3">
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="p-2 rounded-xl bg-[var(--surface-muted)] hover:bg-[var(--border)] text-[var(--text-secondary)] transition cursor-pointer flex items-center justify-center border border-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                title="باز و بستن منوی سایت (همبرگر)"
              >
                <Menu className="w-5 h-5 text-[var(--primary)]" />
              </button>
            )}

            <div className="flex items-center gap-3 cursor-pointer" onClick={() => onOpenTab('dashboard')}>
              <div className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center shadow-sm text-white font-bold text-xl shrink-0">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[15px] font-extrabold tracking-tight text-[var(--text-primary)] font-farsi">
                    سیستم خزانه‌داری یکپارچه tapra
                  </h1>
                  <StatusBadge label="نسخه ۲.۵" tone="success" />
                </div>
                <p className="text-xs text-[var(--text-muted)] hidden sm:block">
                  مدیریت درخواست‌های پرداخت، بایگانی فاکتورها و فیش‌های واریزی tapra
                </p>
              </div>
            </div>
          </div>

          {/* Live Persian Date & Time Display Badge */}
          <div className="hidden xl:flex items-center gap-2.5 px-3.5 py-1.5 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl text-xs">
            <div className="flex items-center gap-1.5 text-[var(--text-secondary)] font-bold">
              <Calendar className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span>{persianDateStr}</span>
            </div>
            <span className="text-[var(--border-strong)] font-bold">|</span>
            <div className="flex items-center gap-1 text-[var(--primary)] font-extrabold font-mono dir-ltr">
              <Clock className="w-3.5 h-3.5 text-[var(--primary)] animate-pulse" />
              <span>{timeClockStr}</span>
            </div>
          </div>

          {/* Quick Tracking Search */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md hidden md:block">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی کد پیگیری (مثال: K50001)..."
                className="w-full bg-[var(--surface-muted)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm rounded-xl pr-10 pl-4 py-2 border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--focus-ring)] transition"
              />
              <button type="submit" className="absolute right-3 top-2.5 text-[var(--text-muted)] hover:text-[var(--primary)]">
                <Search className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Actions & User Section */}
          <div className="flex items-center gap-2 sm:gap-3">

            {/* Day / Night Theme Toggle */}
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl bg-[var(--surface-muted)] hover:bg-[var(--border)] text-[var(--text-secondary)] border border-[var(--border)] transition flex items-center gap-1.5 text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              title={theme === 'dark' ? 'تغییر به حالت روز (روشن)' : 'تغییر به حالت شب (تاریک)'}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-5 h-5 text-[var(--warning)]" />
                  <span className="hidden lg:inline text-[11px]">حالت روز</span>
                </>
              ) : (
                <>
                  <Moon className="w-5 h-5 text-[var(--primary)]" />
                  <span className="hidden lg:inline text-[11px] font-bold">حالت شب</span>
                </>
              )}
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)] transition relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                title="اعلان‌ها"
                aria-label="اعلان‌ها"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[var(--danger)] text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 overflow-hidden text-right">
                  <div className="p-3 bg-[var(--surface-muted)] border-b border-[var(--border)] flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[var(--primary)]" />
                      اعلان‌های سیستم
                    </span>
                    <span className="text-xs bg-[var(--surface)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                      {notifications.length} پیام
                    </span>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border)]">
                    {notifications.length === 0 ? (
                      <EmptyState title="اعلانی برای نمایش وجود ندارد" />
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            onMarkNotificationRead(n.id);
                            if (n.requestId) onSelectNotificationRequest(n.requestId);
                            if (n.colleagueId) onSelectNotificationColleague(n.colleagueId);
                            setShowNotifications(false);
                          }}
                          className={`p-3 hover:bg-[var(--surface-muted)] cursor-pointer transition flex items-start gap-3 ${
                            !n.isRead ? 'bg-[var(--primary-soft)]' : ''
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${!n.isRead ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]'}`} />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-[var(--text-primary)]">{n.title}</h4>
                              {n.trackingCode && (
                                <span className="text-[11px] bg-[var(--primary-soft)] text-[var(--primary)] px-1.5 py-0.5 rounded border border-[var(--border)] font-mono">
                                  {n.trackingCode}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{n.message}</p>
                            <span className="text-[11px] text-[var(--text-muted)] mt-1 block">{n.createdAt}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile / Auth */}
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-1.5 pr-3 bg-[var(--surface-muted)] hover:bg-[var(--border)] border border-[var(--border)] rounded-xl transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {currentUser.fullName.slice(0, 1)}
                  </div>
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
                      {currentUser.fullName}
                      {currentUser.role === 'admin' && (
                        <ShieldCheck className="w-3.5 h-3.5 text-[var(--warning)]" />
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">{currentUser.roleTitle}</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                </button>

                {/* User Dropdown */}
                {showUserMenu && (
                  <div className="absolute left-0 mt-2 w-56 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl shadow-2xl z-50 p-2 text-right">
                    <div className="p-2 border-b border-[var(--border)] mb-1">
                      <p className="text-xs font-bold text-[var(--text-primary)]">{currentUser.fullName}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{currentUser.phone} | {currentUser.username}</p>
                    </div>

                    {currentUser.role === 'admin' && (
                      <button
                        onClick={() => {
                          onOpenTab('admin');
                          setShowUserMenu(false);
                        }}
                        className="w-full text-right px-3 py-2 text-xs text-[var(--warning)] hover:bg-[var(--surface-muted)] rounded-lg flex items-center gap-2 cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-[var(--warning)]" />
                        پنل مدیریت و دسترسی‌ها
                      </button>
                    )}

                    <button
                      onClick={() => {
                        onLogout();
                        setShowUserMenu(false);
                      }}
                      className="w-full text-right px-3 py-2 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)] rounded-lg flex items-center gap-2 mt-1 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-[var(--danger)]" />
                      خروج از حساب کاربری
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <PrimaryButton onClick={onOpenLogin} icon={UserIcon}>
                ورود / ثبت نام
              </PrimaryButton>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};
