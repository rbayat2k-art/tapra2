import React, { useState, useMemo } from "react";
import {
  LayoutDashboard, FilePlus2, Inbox, Users, CheckSquare, ShieldCheck,
  Send, RefreshCw, X, CheckCircle2, AlertCircle, ChevronDown, Plus,
  UserCog, Banknote, Sparkles
} from "lucide-react";

// ---------------------------------------------------------------------------
// This is a lightweight, IN-MEMORY mirror of the real tapra treasury app,
// built only to demo the 5 new behaviours we just added to the real
// multi-file codebase. It does not use localStorage (not supported here),
// so refreshing resets it. Switch "current user" from the top bar to see how
// permissions differ per person - that's the fastest way to see the changes.
// ---------------------------------------------------------------------------

const USERS_SEED = [
  { id: "u_reza", name: "رضا بیات", title: "سرپرست ارشد خزانه‌داری (ادمین)", role: "admin", isSeniorTreasurySupervisor: true, isDualRole: false, allowedApproverIds: [] },
  { id: "u_amir", name: "امیر صفی‌آریان", title: "مدیر شعبه سعادت‌آباد", role: "approver", isSeniorTreasurySupervisor: false, isDualRole: true, allowedApproverIds: ["u_reza", "u_exec"] },
  { id: "u_ali", name: "علی محمدی", title: "مسئول خرید شعبه پونک", role: "requestor", isSeniorTreasurySupervisor: false, isDualRole: false, approvalChain: ["u_amir", "u_reza"] },
  { id: "u_exec", name: "امیرحسین رضایی", title: "کارمند اجرای پرداخت", role: "treasury_executor", isSeniorTreasurySupervisor: false, isDualRole: false, allowedApproverIds: [] },
];

const REQUESTS_SEED = [
  {
    id: "r1", trackingCode: "K50001", title: "فاکتور خرید ملزومات شعبه پونک", amount: 48000000,
    requestorId: "u_ali", requestorName: "علی محمدی",
    currentApproverId: "u_amir", currentApproverName: "امیر صفی‌آریان",
    status: "pending_approval",
    timeline: [
      { id: "t1", actorId: "u_ali", actorName: "علی محمدی", role: "مسئول خرید", action: "submitted", title: "ثبت درخواست", note: "فاکتور خرید ثبت و برای بررسی ارسال شد.", reverted: false },
    ],
  },
];

const TASKS_SEED = [
  { id: "task1", number: "T1001", title: "ارسال فاکتورهای مردادماه", assignerId: "u_reza", assignerName: "رضا بیات", assigneeId: "u_amir", assigneeName: "امیر صفی‌آریان" },
  { id: "task2", number: "T1002", title: "بارگذاری فیش واریز K50000", assignerId: "u_exec", assignerName: "امیرحسین رضایی", assigneeId: "u_ali", assigneeName: "علی محمدی" },
];

const CATEGORIES_SEED = ["شوینده و تنظیفات", "تجهیزات انبار", "ملزومات اداری"];

const VENDORS_SEED = [
  { id: "v1", name: "فروشگاه شوینده ملل", category: "شوینده و تنظیفات", sheba: "IR12...0001" },
];

const fmt = (n) => n.toLocaleString("fa-IR") + " ریال";
const nowStamp = () => "۱۴۰۳/۰۵/۱۲ - " + new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-800 text-slate-300 border-slate-700",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    fuchsia: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30",
    teal: "bg-teal-500/10 text-teal-300 border-teal-500/30",
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${tones[tone]}`}>{children}</span>;
}
export default function TapraPreview() {
  const [users, setUsers] = useState(USERS_SEED);
  const [requests, setRequests] = useState(REQUESTS_SEED);
  const [tasks] = useState(TASKS_SEED);
  const [categories, setCategories] = useState(CATEGORIES_SEED);
  const [vendors, setVendors] = useState(VENDORS_SEED);

  const [currentUserId, setCurrentUserId] = useState("u_amir");
  const [tab, setTab] = useState("dashboard");
  const [openRequestId, setOpenRequestId] = useState("r1");
  const [editingUserId, setEditingUserId] = useState(null);
  const [toast, setToast] = useState(null);

  const currentUser = users.find((u) => u.id === currentUserId);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  return (
    <div dir="rtl" className="min-h-screen w-full bg-slate-950 text-white font-sans flex" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-slate-900 border-l border-slate-800 p-4 flex flex-col gap-1">
        <div className="mb-4 px-1">
          <div className="text-sm font-black text-white">تاپرا</div>
          <div className="text-[10px] text-slate-500">پیش‌نمایش قابلیت‌های جدید</div>
        </div>
        {[
          { id: "dashboard", label: "داشبورد", icon: LayoutDashboard },
          { id: "newreq", label: "درخواست جدید", icon: FilePlus2 },
          { id: "inbox", label: "کارتابل تایید", icon: Inbox },
          { id: "vendors", label: "دفترچه ذینفعان", icon: Banknote },
          { id: "tasks", label: "کارهای محوله", icon: CheckSquare },
          { id: "admin", label: "مدیریت کاربران", icon: UserCog },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
              tab === item.id ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar: user switcher */}
        <div className="h-16 shrink-0 border-b border-slate-800 bg-slate-900/60 px-6 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            برای دیدن تفاوت دسترسی‌ها، کاربر فعلی رو عوض کن 👇
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">کاربر فعلی:</span>
            <div className="relative">
              <select
                value={currentUserId}
                onChange={(e) => { setCurrentUserId(e.target.value); }}
                className="appearance-none bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {u.title}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === "dashboard" && <Dashboard users={users} requests={requests} currentUser={currentUser} />}
          {tab === "newreq" && (
            <NewRequestPanel
              users={users}
              currentUser={currentUser}
              onCreate={(req) => { setRequests((prev) => [req, ...prev]); showToast(`درخواست ${req.trackingCode} ثبت شد.`); setTab("inbox"); setOpenRequestId(req.id); }}
            />
          )}
          {tab === "inbox" && (
            <InboxPanel
              users={users}
              requests={requests}
              currentUser={currentUser}
              openRequestId={openRequestId}
              setOpenRequestId={setOpenRequestId}
              onUpdateRequest={(updated) => setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))}
              showToast={showToast}
            />
          )}
          {tab === "vendors" && (
            <VendorsPanel
              vendors={vendors}
              categories={categories}
              onAddCategory={(name) => { setCategories((prev) => [...prev, name]); showToast(`دسته‌بندی «${name}» اضافه شد.`); }}
              onAddVendor={(v) => { setVendors((prev) => [...prev, v]); showToast("ذینفع جدید ثبت شد."); }}
            />
          )}
          {tab === "tasks" && <TasksPanel tasks={tasks} currentUser={currentUser} />}
          {tab === "admin" && (
            <AdminPanel
              users={users}
              editingUserId={editingUserId}
              setEditingUserId={setEditingUserId}
              onSave={(updated) => {
                setUsers((prev) => {
                  let next = prev.map((u) => (u.id === updated.id ? updated : u));
                  if (updated.isSeniorTreasurySupervisor) {
                    next = next.map((u) => (u.id === updated.id ? u : { ...u, isSeniorTreasurySupervisor: false }));
                  }
                  return next;
                });
                setEditingUserId(null);
                showToast("تغییرات کاربر ذخیره شد.");
              }}
            />
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Dashboard({ users, requests, currentUser }) {
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-black text-white">سلام، {currentUser.name}</h2>
        <p className="text-xs text-slate-400 mt-1">{currentUser.title}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[11px] text-slate-400">درخواست‌های در جریان</div>
          <div className="text-2xl font-black text-white mt-1">{requests.filter((r) => r.status === "pending_approval").length}</div>
        </div>
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[11px] text-slate-400">تعداد کاربران</div>
          <div className="text-2xl font-black text-white mt-1">{users.length}</div>
        </div>
      </div>

      <div className="p-4 bg-fuchsia-950/20 border border-fuchsia-500/30 rounded-2xl space-y-1.5">
        <div className="text-xs font-black text-fuchsia-300 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> ۵ قابلیت جدیدی که اضافه شد</div>
        <ul className="text-[11px] text-slate-300 leading-6 list-disc pr-4">
          <li>نقش دوگانه (درخواست‌کننده + تاییدکننده) → «درخواست جدید» را با کاربر امیر صفی‌آریان امتحان کن</li>
          <li>محدودیت مقصد ارجاع → «کارتابل تایید» با کاربر امیر</li>
          <li>جلوگیری از تایید تکراری + بازگشت از تایید → همان‌جا بعد از تایید</li>
          <li>دسته‌بندی پویا در دفترچه ذینفعان → «دفترچه ذینفعان»</li>
          <li>حریم خصوصی کارهای محوله → «کارهای محوله» را با کاربرهای مختلف مقایسه کن</li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function NewRequestPanel({ users, currentUser, onCreate }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");

  const seniorSupervisor = users.find((u) => u.isSeniorTreasurySupervisor);
  const chainFirst = currentUser.approvalChain ? users.find((u) => u.id === currentUser.approvalChain[0]) : null;

  const target = currentUser.isDualRole ? seniorSupervisor : (chainFirst || seniorSupervisor);
  const isDualRouting = !!currentUser.isDualRole;

  const submit = () => {
    if (!title.trim() || !amount) return;
    const req = {
      id: `r_${Date.now()}`,
      trackingCode: `K5${Math.floor(1000 + Math.random() * 8999)}`,
      title: title.trim(),
      amount: Number(amount),
      requestorId: currentUser.id,
      requestorName: currentUser.name,
      currentApproverId: target.id,
      currentApproverName: target.name,
      status: "pending_approval",
      timeline: [
        { id: `t_${Date.now()}`, actorId: currentUser.id, actorName: currentUser.name, role: currentUser.title, action: "submitted", title: "ثبت درخواست", note: `درخواست ثبت و مستقیماً برای ${target.name} ارسال شد.`, reverted: false },
      ],
    };
    onCreate(req);
    setTitle(""); setAmount("");
  };

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-sm font-black text-white flex items-center gap-2"><FilePlus2 className="w-4 h-4 text-indigo-400" /> ثبت درخواست پرداخت جدید</h2>

      {isDualRouting ? (
        <div className="p-3 bg-fuchsia-950/30 border border-fuchsia-500/40 rounded-xl text-[11px] text-fuchsia-200 flex items-start gap-2">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <b>{currentUser.name}</b> نقش دوگانه دارد (هم تاییدکننده، هم درخواست‌کننده). طبق تنظیمات ادمین، درخواست شخصی این کاربر
            مسیر تایید معمول را طی نمی‌کند و مستقیماً برای <b>{seniorSupervisor?.name}</b> (سرپرست ارشد خزانه‌داری) ارسال می‌شود.
          </span>
        </div>
      ) : (
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-400">
          این درخواست طبق مسیر تایید تعریف‌شده، ابتدا برای <b className="text-white">{target?.name}</b> ارسال می‌شود.
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-300">عنوان درخواست</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: فاکتور خرید ملزومات شعبه" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-300">مبلغ (ریال)</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="مثال: 25000000" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
      </div>

      <button onClick={submit} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow transition">
        ثبت و ارسال درخواست
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
function InboxPanel({ users, requests, currentUser, openRequestId, setOpenRequestId, onUpdateRequest, showToast }) {
  const req = requests.find((r) => r.id === openRequestId) || requests[0];
  if (!req) return <div className="text-xs text-slate-400">درخواستی برای نمایش وجود ندارد.</div>;

  const isResponsible = req.currentApproverId === currentUser.id;
  const isApproverLike = ["approver", "admin", "treasury_executor"].includes(currentUser.role);

  const lastStep = req.timeline[req.timeline.length - 1];
  const canUndo = lastStep && lastStep.actorId === currentUser.id && !lastStep.reverted &&
    (lastStep.action === "forwarded" || lastStep.action === "approved") && !isResponsible;

  const allowedTargets = currentUser.allowedApproverIds && currentUser.allowedApproverIds.length > 0
    ? users.filter((u) => currentUser.allowedApproverIds.includes(u.id))
    : users.filter((u) => u.id !== currentUser.id);

  const [forwardTo, setForwardTo] = useState(allowedTargets[0]?.id || "");

  const approveAndForward = () => {
    const target = users.find((u) => u.id === forwardTo) || allowedTargets[0];
    if (!target) return;
    onUpdateRequest({
      ...req,
      currentApproverId: target.id,
      currentApproverName: target.name,
      timeline: [
        ...req.timeline,
        { id: `t_${Date.now()}`, actorId: currentUser.id, actorName: currentUser.name, role: currentUser.title, action: "forwarded", title: "تایید و ارجاع", note: `درخواست تایید و به ${target.name} ارجاع شد.`, reverted: false },
      ],
    });
    showToast(`تایید شد و به ${target.name} ارجاع گردید.`);
  };

  const undoApproval = () => {
    const updatedTimeline = req.timeline.map((t, idx) => (idx === req.timeline.length - 1 ? { ...t, reverted: true } : t));
    updatedTimeline.push({ id: `t_${Date.now()}`, actorId: currentUser.id, actorName: currentUser.name, role: currentUser.title, action: "undone", title: "بازگشت از تایید", note: "تایید قبلی لغو و درخواست نزد تاییدکننده بازگردانده شد.", reverted: false });
    onUpdateRequest({ ...req, currentApproverId: currentUser.id, currentApproverName: currentUser.name, timeline: updatedTimeline });
    showToast("تایید قبلی با موفقیت لغو شد.");
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-white flex items-center gap-2"><Inbox className="w-4 h-4 text-indigo-400" /> کارتابل تایید</h2>
        <Badge tone="amber">در انتظار تایید {req.currentApproverName}</Badge>
      </div>

      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-white">{req.title}</span>
          <span className="text-[10px] font-mono text-indigo-300">{req.trackingCode}</span>
        </div>
        <div className="text-xs text-slate-400">مبلغ: {fmt(req.amount)}</div>
        <div className="text-xs text-slate-400">درخواست‌کننده: {req.requestorName}</div>
      </div>

      {/* Timeline */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
        <div className="text-xs font-bold text-slate-300 mb-1">تاریخچه</div>
        {req.timeline.map((t) => (
          <div key={t.id} className={`p-2.5 rounded-xl border text-xs ${t.reverted ? "border-slate-800 opacity-50" : "border-slate-800 bg-slate-900"}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">{t.actorName}</span>
              <span className="text-[10px] text-slate-500">{nowStamp()}</span>
            </div>
            <div className={`mt-0.5 ${t.reverted ? "text-slate-500 line-through" : "text-indigo-300"}`}>
              {t.title} {t.reverted && <span className="text-amber-400 no-underline">(لغو شد)</span>}
            </div>
            <div className="text-slate-400 mt-1">{t.note}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="p-4 bg-slate-800/70 border border-slate-700 rounded-2xl space-y-3">
        {!isApproverLike ? (
          <p className="text-[11px] text-slate-400">شما به عنوان درخواست‌کننده، فقط می‌توانید وضعیت را مشاهده کنید.</p>
        ) : canUndo ? (
          <div className="text-center space-y-2">
            <p className="text-xs text-amber-300 font-bold">شما همین الان این درخواست را تایید و ارجاع دادید.</p>
            <p className="text-[11px] text-slate-400">تا وقتی «{req.currentApproverName}» اقدامی نکرده، می‌توانید تاییدتان را لغو کنید.</p>
            <button onClick={undoApproval} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> بازگشت از تایید
            </button>
          </div>
        ) : !isResponsible ? (
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-400 text-center">
            این درخواست الان نزد <b className="text-white">{req.currentApproverName}</b> است، نه شما — پس دکمه تایید نمایش داده نمی‌شود
            (این همان رفعِ باگ «تایید چندباره» است).
          </div>
        ) : (
          <>
            <label className="text-[10px] font-bold text-teal-300 block">ارجاع به (فقط مقصدهای مجاز شما):</label>
            <select value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
              {allowedTargets.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.title})</option>
              ))}
            </select>
            <button onClick={approveAndForward} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> تایید و ارجاع
            </button>
          </>
        )}
      </div>

      <p className="text-[10px] text-slate-500">
        نکته: کاربر «امیر صفی‌آریان» فقط اجازه ارجاع به «رضا بیات» و «امیرحسین رضایی» را دارد — لیست بالا را با کاربرهای دیگر مقایسه کن.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function VendorsPanel({ vendors, categories, onAddCategory, onAddVendor }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [form, setForm] = useState({ name: "", category: categories[0] || "" });

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    if (!categories.includes(name)) onAddCategory(name);
    setForm((f) => ({ ...f, category: name }));
    setNewCatName(""); setIsAdding(false);
  };

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-sm font-black text-white flex items-center gap-2"><Banknote className="w-4 h-4 text-indigo-400" /> دفترچه ذینفعان</h2>

      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-300">نام ذینفع</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" placeholder="مثال: فروشگاه آریا" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-300">دسته‌بندی و زمینه فعالیت</label>
          {!isAdding ? (
            <div className="flex gap-1.5">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => setIsAdding(true)} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-xl whitespace-nowrap">+ دسته‌بندی جدید</button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <input autoFocus value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder="نام دسته‌بندی جدید..." className="flex-1 bg-slate-800 border border-indigo-400 rounded-xl px-3 py-2 text-xs text-white" />
              <button onClick={addCategory} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl">ثبت</button>
              <button onClick={() => setIsAdding(false)} className="px-3 py-2 bg-slate-700 text-white text-[11px] font-bold rounded-xl">انصراف</button>
            </div>
          )}
        </div>

        <button
          onClick={() => { if (!form.name.trim()) return; onAddVendor({ id: `v_${Date.now()}`, name: form.name.trim(), category: form.category, sheba: "IR..." }); setForm({ name: "", category: categories[0] }); }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl"
        >
          ذخیره ذینفع
        </button>
      </div>

      <div className="space-y-2">
        {vendors.map((v) => (
          <div key={v.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
            <span className="text-xs font-bold text-white">{v.name}</span>
            <Badge tone="teal">{v.category}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function TasksPanel({ tasks, currentUser }) {
  const myTasks = useMemo(
    () => tasks.filter((t) => t.assigneeId === currentUser.id || t.assignerId === currentUser.id),
    [tasks, currentUser]
  );
  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-sm font-black text-white flex items-center gap-2"><CheckSquare className="w-4 h-4 text-indigo-400" /> کارهای محوله من</h2>
      <p className="text-[11px] text-slate-400">
        فقط {myTasks.length} از {tasks.length} کار سیستم اینجا نمایش داده می‌شود — همان‌هایی که شما صادر کرده یا دریافت کرده‌اید.
        کاربر فعلی را عوض کن تا لیست تغییر کند.
      </p>
      <div className="space-y-2">
        {myTasks.length === 0 && <div className="text-xs text-slate-500 p-4 text-center border border-dashed border-slate-800 rounded-xl">هیچ کاری مرتبط با این کاربر نیست.</div>}
        {myTasks.map((t) => (
          <div key={t.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">{t.title}</span>
              <span className="text-[10px] font-mono text-slate-500">{t.number}</span>
            </div>
            <div className="text-[11px] text-slate-400">
              از {t.assignerName} ← به {t.assigneeName}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AdminPanel({ users, editingUserId, setEditingUserId, onSave }) {
  const editing = users.find((u) => u.id === editingUserId);
  const [draft, setDraft] = useState(null);

  const startEdit = (u) => { setEditingUserId(u.id); setDraft({ ...u, allowedApproverIds: u.allowedApproverIds || [] }); };

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-sm font-black text-white flex items-center gap-2"><UserCog className="w-4 h-4 text-indigo-400" /> مدیریت کاربران</h2>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                {u.name}
                {u.isDualRole && <Badge tone="fuchsia">دوگانه</Badge>}
                {u.isSeniorTreasurySupervisor && <Badge tone="amber">سرپرست ارشد</Badge>}
              </div>
              <div className="text-[10px] text-slate-500">{u.title}</div>
            </div>
            <button onClick={() => startEdit(u)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg">ویرایش</button>
          </div>
        ))}
      </div>

      {editing && draft && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingUserId(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-white">ویرایش دسترسی: {editing.name}</h3>
              <button onClick={() => setEditingUserId(null)}><X className="w-4 h-4 text-slate-500" /></button>
            </div>

            <label className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2 cursor-pointer ${draft.isDualRole ? "bg-fuchsia-950/40 border-fuchsia-500" : "bg-slate-800 border-slate-700"}`}>
              <input type="checkbox" checked={draft.isDualRole} onChange={(e) => setDraft({ ...draft, isDualRole: e.target.checked })} className="mt-0.5" />
              <span>
                <span className="block text-fuchsia-300">درخواست‌کننده و تاییدکننده هم‌زمان</span>
                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">درخواست‌های شخصی این کاربر مستقیم به سرپرست ارشد می‌رود.</span>
              </span>
            </label>

            <label className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2 cursor-pointer ${draft.isSeniorTreasurySupervisor ? "bg-amber-950/40 border-amber-500" : "bg-slate-800 border-slate-700"}`}>
              <input type="checkbox" checked={draft.isSeniorTreasurySupervisor} onChange={(e) => setDraft({ ...draft, isSeniorTreasurySupervisor: e.target.checked })} className="mt-0.5" />
              <span>
                <span className="block text-amber-300">سرپرست ارشد خزانه‌داری</span>
                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">فقط یک نفر می‌تواند این عنوان را داشته باشد.</span>
              </span>
            </label>

            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-teal-300">مقصدهای مجاز ارجاع:</div>
              <div className="grid grid-cols-2 gap-1.5">
                {users.filter((u) => u.id !== draft.id).map((u) => {
                  const checked = draft.allowedApproverIds.includes(u.id);
                  return (
                    <label key={u.id} className={`p-2 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${checked ? "bg-teal-600/20 border-teal-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400"}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked ? [...draft.allowedApproverIds, u.id] : draft.allowedApproverIds.filter((id) => id !== u.id);
                          setDraft({ ...draft, allowedApproverIds: next });
                        }}
                      />
                      {u.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <button onClick={() => onSave(draft)} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> ذخیره تغییرات
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
