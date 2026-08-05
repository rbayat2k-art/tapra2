import React, { useState, useEffect } from 'react';
import { User, SystemNotification } from '../types';
import { 
  Building2, Search, Bell, LogOut, ShieldCheck, 
  User as UserIcon, Check, CheckCircle2, ChevronDown, 
  Sun, Moon, Calendar, Clock, Menu
} from 'lucide-react';

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
    <header className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 shadow-sm dir-rtl transition-colors duration-200">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Hamburger Menu & Logo & Title */}
          <div className="flex items-center gap-3">
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer flex items-center justify-center border border-slate-200 dark:border-slate-700"
                title="باز و بستن منوی سایت (همبرگر)"
              >
                <Menu className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </button>
            )}

            <div className="flex items-center gap-3 cursor-pointer" onClick={() => onOpenTab('dashboard')}>
              <div className="w-10 h-10 rounded-xl bg-emerald-600 dark:bg-gradient-to-tr dark:from-indigo-600 dark:via-blue-600 dark:to-emerald-500 flex items-center justify-center shadow-md shadow-emerald-600/20 text-white font-bold text-xl shrink-0">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white font-farsi">
                    سیستم خزانه‌داری یکپارچه tapra
                  </h1>
                  <span className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/30">
                    نسخه ۲.۵
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                  مدیریت درخواست‌های پرداخت، بایگانی فاکتورها و فیش‌های واریزی tapra
                </p>
              </div>
            </div>
          </div>

          {/* Live Persian Date & Time Display Badge */}
          <div className="hidden xl:flex items-center gap-2.5 px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl text-xs">
            <div className="flex items-center gap-1.5 text-emerald-800 dark:text-indigo-300 font-bold">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-indigo-400" />
              <span>{persianDateStr}</span>
            </div>
            <span className="text-slate-300 dark:text-slate-600 font-bold">|</span>
            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-extrabold font-mono dir-ltr">
              <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
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
                className="w-full bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-200 placeholder-slate-400 text-sm rounded-xl pr-10 pl-4 py-2 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
              <button type="submit" className="absolute right-3 top-2.5 text-slate-400 hover:text-emerald-600 dark:hover:text-indigo-400">
                <Search className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Actions & User Section */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Day / Night Theme Toggle */}
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-amber-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 transition flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              title={theme === 'dark' ? 'تغییر به حالت روز (روشن)' : 'تغییر به حالت شب (تاریک)'}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-5 h-5 text-amber-400 animate-spin-slow" />
                  <span className="hidden lg:inline text-[11px] text-amber-300">حالت روز</span>
                </>
              ) : (
                <>
                  <Moon className="w-5 h-5 text-emerald-700" />
                  <span className="hidden lg:inline text-[11px] text-emerald-800 font-bold">حالت شب</span>
                </>
              )}
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition relative cursor-pointer"
                title="اعلان‌ها"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden text-right">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Bell className="w-4 h-4 text-emerald-600 dark:text-indigo-400" />
                      اعلان‌های سیستم
                    </span>
                    <span className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 px-2 py-0.5 rounded-full">
                      {notifications.length} پیام
                    </span>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700/50">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-sm">
                        اعلانی برای نمایش وجود ندارد.
                      </div>
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
                          className={`p-3 hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition flex items-start gap-3 ${
                            !n.isRead ? 'bg-emerald-50/60 dark:bg-indigo-950/30' : ''
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${!n.isRead ? 'bg-emerald-500 dark:bg-indigo-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{n.title}</h4>
                              {n.trackingCode && (
                                <span className="text-[10px] bg-emerald-100 dark:bg-indigo-900/60 text-emerald-800 dark:text-indigo-300 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-indigo-700/50 font-mono">
                                  {n.trackingCode}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{n.message}</p>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">{n.createdAt}</span>
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
                  className="flex items-center gap-2 p-1.5 pr-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-xl transition cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-inner shrink-0">
                    {currentUser.fullName.slice(0, 1)}
                  </div>
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                      {currentUser.fullName}
                      {currentUser.role === 'admin' && (
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{currentUser.roleTitle}</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                {/* User Dropdown */}
                {showUserMenu && (
                  <div className="absolute left-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 p-2 text-right">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-700 mb-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-200">{currentUser.fullName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{currentUser.phone} | {currentUser.username}</p>
                    </div>
                    
                    {currentUser.role === 'admin' && (
                      <button
                        onClick={() => {
                          onOpenTab('admin');
                          setShowUserMenu(false);
                        }}
                        className="w-full text-right px-3 py-2 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-slate-700/60 rounded-lg flex items-center gap-2 cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-amber-500" />
                        پنل مدیریت و دسترسی‌ها
                      </button>
                    )}

                    <button
                      onClick={() => {
                        onLogout();
                        setShowUserMenu(false);
                      }}
                      className="w-full text-right px-3 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg flex items-center gap-2 mt-1 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-rose-500" />
                      خروج از حساب کاربری
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenLogin}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
              >
                <UserIcon className="w-4 h-4 text-white" />
                <span>ورود / ثبت نام</span>
              </button>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};
