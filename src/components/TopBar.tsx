import { useEffect, useMemo, useState } from "react";
import { Bell, CircleAlert, CircleCheck, Info, Menu, Search, TriangleAlert, UserRound, X, type LucideIcon } from "lucide-react";
import type { View, WorkspaceRole } from "../App";

type CommandItem = {
  label: string;
  sub: string;
  view: View;
  group: string;
};

const searchIndex: CommandItem[] = [
  { label: "Godfrey Kamuhangire", sub: "Candidate · CRSL-957214073", view: "candidates", group: "Candidates" },
  { label: "Alice Namukasa", sub: "Candidate · CRSL-283710044", view: "candidates", group: "Candidates" },
  { label: "Staff Backend Engineer", sub: "Job · Engineering", view: "jobs", group: "Jobs" },
  { label: "Gulf Manpower Ltd", sub: "Employer · Saudi Arabia", view: "employers", group: "Employers" },
  { label: "Director Vicent", sub: "Agent · Kampala", view: "agents", group: "Agents" },
  { label: "Passport A00846507", sub: "Passport Custody · In Company Custody", view: "passport", group: "Passport" },
  { label: "Invoice INV-2026-003", sub: "Invoice · Gulf Manpower Ltd · UGX 3.2M", view: "invoices", group: "Invoices" },
  { label: "Payment DEP-001", sub: "Payment · Godfrey Kamuhangire · UGX 1.5M", view: "payments", group: "Payments" },
  { label: "Medical Task — Alice Namukasa", sub: "Task · Due Aug 28, 2026", view: "tasks", group: "Tasks" },
];

const categoryActionItems: CommandItem[] = [
  { label: "Create task", sub: "Tasks", view: "tasks", group: "Tasks" },
  { label: "Add payment", sub: "Payments", view: "payments", group: "Payments" },
  { label: "Upload document", sub: "Documents", view: "documents", group: "Documents" },
  { label: "Open reports", sub: "Reports", view: "reports", group: "Reports" },
  { label: "Create invoice", sub: "Invoices", view: "invoices", group: "Invoices" },
  { label: "Review candidates", sub: "Candidates", view: "candidates", group: "Candidates" },
];

type NotificationPriority = "Critical" | "Important" | "Informational";

type NotificationItem = {
  id: number;
  priority: NotificationPriority;
  type: "warning" | "error" | "info" | "success";
  title: string;
  body: string;
  time: string;
  read: boolean;
};

const notifications: NotificationItem[] = [
  { id: 1, priority: "Critical", type: "error", title: "Passport expiring soon", body: "James Okello passport expires Sep 22, 2026", time: "2h ago", read: false },
  { id: 2, priority: "Critical", type: "warning", title: "Missing documents", body: "Suzan Mirembe — Medical certificate missing", time: "4h ago", read: false },
  { id: 3, priority: "Important", type: "info", title: "Payment received", body: "UGX 1,500,000 deposit from Godfrey Kamuhangire", time: "5h ago", read: false },
  { id: 4, priority: "Informational", type: "success", title: "Placement confirmed", body: "Alice Namukasa placed — Kuwait contract", time: "1d ago", read: true },
  { id: 5, priority: "Important", type: "warning", title: "Invoice overdue", body: "INV-2026-001 — Gulf Manpower Ltd overdue by 3 days", time: "1d ago", read: true },
  { id: 6, priority: "Informational", type: "info", title: "Task due today", body: "Follow up with James Okello — passport renewal", time: "2d ago", read: true },
];

const typeIcon: Record<NotificationItem["type"], LucideIcon> = { warning: TriangleAlert, error: CircleAlert, info: Info, success: CircleCheck };
const typeColor: Record<string, string> = { warning: "#f59e0b", error: "#ef4444", info: "#6366f1", success: "#10b981" };
const formatCompanyInitials = (value: string) => value.split(" ").filter(Boolean).slice(0, 2).map((piece) => piece[0]?.toUpperCase() ?? "").join("") || "R";

export default function TopBar({
  onMenuClick,
  onNavigate,
  role,
  theme,
  onThemeChange,
  density,
  onDensityChange,
  companyName,
  companyLogo,
  userName,
  userEmail,
  userAvatarUrl,
}: {
  onMenuClick: () => void;
  onNavigate: (v: View) => void;
  role: WorkspaceRole;
  theme: "dark" | "light";
  onThemeChange: () => void;
  density: "comfortable" | "compact";
  onDensityChange: () => void;
  companyName?: string;
  companyLogo?: string;
  userName?: string;
  userEmail?: string;
  userAvatarUrl?: string;
}) {
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [notifs, setNotifs] = useState(notifications);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommandPalette((value) => !value);
      }
      if (event.key === "Escape") {
        setShowCommandPalette(false);
        setShowResults(false);
        setShowNotifs(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const results = useMemo(() => {
    const normalized = query.toLowerCase();
    if (!normalized) return [];

    const matches = [
      ...searchIndex.filter((item) => item.label.toLowerCase().includes(normalized) || item.sub.toLowerCase().includes(normalized) || item.group.toLowerCase().includes(normalized)),
      ...categoryActionItems.filter((item) => item.label.toLowerCase().includes(normalized) || item.sub.toLowerCase().includes(normalized) || item.group.toLowerCase().includes(normalized)),
    ];

    return matches.slice(0, 8);
  }, [query]);

  const unread = notifs.filter((n) => !n.read).length;
  const groupedNotifications = [
    { priority: "Critical" as const, items: notifs.filter((item) => item.priority === "Critical") },
    { priority: "Important" as const, items: notifs.filter((item) => item.priority === "Important") },
    { priority: "Informational" as const, items: notifs.filter((item) => item.priority === "Informational") },
  ];

  const markAllRead = () => setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));

  const snoozeNotification = (id: number) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  return (
    <>
      <div
        className="topbar flex flex-wrap items-center gap-2 px-3 py-2 border-b shrink-0 lg:flex-nowrap lg:gap-4 lg:px-6 lg:py-2.5"
        style={{ background: "var(--card)", borderColor: "var(--border)", minHeight: "52px" }}
      >
        <div className="order-1 flex min-w-0 w-auto shrink-0 items-center gap-2 rounded border px-2 py-1.5 lg:gap-3" style={{ background: "var(--secondary)", borderColor: "var(--border)", maxWidth: "min(55vw, 18rem)" }}>
          <button type="button" onClick={onMenuClick} aria-label="Open navigation menu" className="flex h-8 w-8 shrink-0 items-center justify-center rounded lg:hidden" style={{ color: "var(--foreground)" }}>
            <Menu size={19} aria-hidden="true" />
          </button>
          {companyLogo ? (
            <img src={companyLogo} alt={companyName ?? "Company"} className="h-7 w-7 rounded object-cover" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded text-[10px] font-700" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              {formatCompanyInitials(companyName ?? "RecruitOS")}
            </div>
          )}
          <div className="min-w-0 leading-none">
            <div className="hidden text-[9px] font-700 uppercase tracking-[0.18em] lg:block" style={{ color: "var(--muted-foreground)" }}>Active company</div>
            <div className="mt-0.5 truncate text-xs font-600" style={{ color: "var(--foreground)" }}>{companyName ?? "RecruitOS"}</div>
          </div>
        </div>

        <div className="relative order-2 w-full min-w-0 max-w-lg lg:order-0 lg:flex-1">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded border"
            style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
            <Search size={15} strokeWidth={1.8} aria-hidden="true" style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search or press ⌘/Ctrl + K"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: "var(--foreground)" }}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search" className="flex items-center justify-center" style={{ color: "var(--muted-foreground)" }}><X size={14} aria-hidden="true" /></button>
            )}
            <button
              type="button"
              onClick={() => setShowCommandPalette(true)}
              className="mono text-xs px-1 rounded"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              ⌘K
            </button>
          </div>

          {showResults && results.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1 rounded border shadow-xl z-50 overflow-hidden"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              {results.map((r, i) => (
                <button
                  key={`${r.label}-${i}`}
                  onMouseDown={() => {
                    onNavigate(r.view);
                    setQuery("");
                    setShowResults(false);
                    setShowCommandPalette(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:opacity-80 transition-opacity border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-700 shrink-0"
                    style={{ background: "var(--secondary)", color: "var(--primary)" }}>
                    {r.label[0]}
                  </div>
                  <div>
                    <div className="text-sm font-600" style={{ color: "var(--foreground)" }}>{r.label}</div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{r.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="topbar-controls order-1 ml-auto flex w-auto min-w-0 shrink-0 flex-nowrap items-center gap-1 lg:order-0 lg:gap-3">
          <button
            type="button"
            onClick={onThemeChange}
            className="hidden text-xs px-2 py-1 rounded border lg:inline-flex"
            style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}
          >
            {theme === "dark" ? "Light" : "Dark"} mode
          </button>

          <button
            type="button"
            onClick={onDensityChange}
            className="hidden text-xs px-2 py-1 rounded border lg:inline-flex"
            style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}
          >
            {density === "comfortable" ? "Compact" : "Comfortable"}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className="relative w-8 h-8 flex items-center justify-center rounded transition-colors"
              style={{ background: showNotifs ? "var(--secondary)" : "transparent", color: "var(--muted-foreground)" }}
            >
              <Bell size={17} strokeWidth={1.8} aria-hidden="true" />
              {unread > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-xs font-700 mono"
                  style={{ background: "#ef4444", color: "#fff", fontSize: "9px" }}
                >
                  {unread}
                </span>
              )}
            </button>

            {showNotifs && (
              <div
                className="topbar-notifications absolute right-0 top-full mt-1 w-96 rounded border shadow-xl z-50"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="text-sm font-700" style={{ color: "var(--foreground)" }}>Notification center</span>
                  <button onClick={markAllRead} className="text-xs" style={{ color: "var(--primary)" }}>Mark all read</button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {groupedNotifications.map((group) => (
                    <div key={group.priority} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                      <div className="px-4 py-2 text-[10px] font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                        {group.priority}
                      </div>
                      {group.items.length === 0 ? (
                        <div className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>No {group.priority.toLowerCase()} alerts.</div>
                      ) : (
                        group.items.map((n) => (
                          <div
                            key={n.id}
                            className="flex gap-3 px-4 py-3"
                            style={{ background: n.read ? "transparent" : "var(--secondary)" }}
                          >
                            {(() => {
                              const Icon = typeIcon[n.type];
                              return <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0 mt-0.5" style={{ color: typeColor[n.type] }} />;
                            })()}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-700 mb-0.5" style={{ color: typeColor[n.type] }}>{n.title}</div>
                              <div className="text-xs" style={{ color: "var(--foreground)" }}>{n.body}</div>
                              <div className="mono text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>{n.time}</div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {!n.read && <div className="w-2 h-2 rounded-full" style={{ background: "var(--primary)" }} />}
                              <button onClick={() => snoozeNotification(n.id)} className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                                Snooze
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button type="button" aria-label="Open user profile" aria-expanded={showProfile} onClick={() => setShowProfile((open) => !open)} className="flex h-9 w-9 items-center justify-center rounded-full border text-xs font-700" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--primary)" }}>
              {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="h-full w-full rounded-full object-cover" /> : userName ? formatCompanyInitials(userName) : <UserRound size={17} aria-hidden="true" />}
            </button>
            {showProfile && (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded border p-4 shadow-xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-700" style={{ background: "var(--secondary)", color: "var(--primary)" }}>{userName ? formatCompanyInitials(userName) : "U"}</div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-700" style={{ color: "var(--foreground)" }}>{userName ?? "User"}</div>
                    <div className="truncate text-xs" style={{ color: "var(--muted-foreground)" }}>{userEmail ?? ""}</div>
                  </div>
                </div>
                <div className="border-t pt-3 text-xs" style={{ borderColor: "var(--border)" }}>
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>User role</div>
                  <div className="mt-1 font-600" style={{ color: "var(--foreground)" }}>{role}</div>
                </div>
              </div>
            )}
          </div>

          <span className="topbar-date mono text-xs" style={{ color: "var(--muted-foreground)" }}>
            Aug 26, 2026
          </span>
        </div>
      </div>

      {showCommandPalette && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/25 backdrop-blur-[1px]" onClick={() => setShowCommandPalette(false)}>
          <div className="w-full max-w-2xl rounded-xl border shadow-2xl overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <Search size={18} strokeWidth={1.8} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="flex-1 bg-transparent text-base outline-none"
                style={{ color: "var(--foreground)" }}
                placeholder="Search or jump to…"
              />
            </div>

            <div className="max-h-105 overflow-y-auto p-2">
              {results.length === 0 ? (
                <div className="p-4 text-sm" style={{ color: "var(--muted-foreground)" }}>No matched actions. Try “candidate”, “invoice”, or “passport”.</div>
              ) : (
                <div className="space-y-2">
                  {[
                    { title: "Candidates", items: results.filter((item) => ["candidates", "agents", "employers"].includes(item.view)) },
                    { title: "Jobs & People", items: results.filter((item) => ["jobs", "agents", "employers"].includes(item.view)) },
                    { title: "Operations", items: results.filter((item) => ["invoices", "payments", "documents", "tasks", "reports"].includes(item.view)) },
                  ].filter((group) => group.items.length > 0).map((group) => (
                    <div key={group.title} className="space-y-1">
                      <div className="px-2 py-1 text-[10px] font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{group.title}</div>
                      {group.items.map((entry, index) => (
                        <button
                          key={`${group.title}-${index}`}
                          onClick={() => {
                            onNavigate(entry.view);
                            setQuery("");
                            setShowCommandPalette(false);
                          }}
                          className="w-full flex items-center justify-between rounded px-3 py-2 text-left hover:opacity-80"
                          style={{ background: "var(--secondary)" }}
                        >
                          <div>
                            <div className="text-sm font-600" style={{ color: "var(--foreground)" }}>{entry.label}</div>
                            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{entry.sub}</div>
                          </div>
                          <span className="mono text-[10px]" style={{ color: "var(--primary)" }}>Go</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
