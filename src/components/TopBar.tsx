import { useEffect, useMemo, useRef, useState } from "react";
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
  { label: "Gulf Manpower Ltd", sub: "Contractor · Saudi Arabia", view: "contractors", group: "Contractors" },
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
  id: string | number;
  priority: NotificationPriority;
  type: "warning" | "error" | "info" | "success";
  title: string;
  body: string;
  time: string;
  read: boolean;
  view?: View;
  taskNotificationId?: string;
  candidateInquiryNotificationId?: string;
  leaveNotificationId?: string;
  requisitionNotificationId?: string;
};

type PushSettings = {
  configured: boolean;
  dispatchConfigured: boolean;
  publicKey: string | null;
  subscribed: boolean;
};

const typeIcon: Record<NotificationItem["type"], LucideIcon> = { warning: TriangleAlert, error: CircleAlert, info: Info, success: CircleCheck };
const typeColor: Record<string, string> = { warning: "#f59e0b", error: "#ef4444", info: "#6366f1", success: "#10b981" };
const formatCompanyInitials = (value: string) => value.split(" ").filter(Boolean).slice(0, 2).map((piece) => piece[0]?.toUpperCase() ?? "").join("") || "R";

function decodeVapidPublicKey(value: string) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

export default function TopBar({
  onMenuClick,
  onNavigate,
  role,
  permissions,
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
  permissions: string[];
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
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [notificationPanelTop, setNotificationPanelTop] = useState(60);
  const [pushSettings, setPushSettings] = useState<PushSettings | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const topbarRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const canViewTaskReminders = permissions.includes("tasks.view");
  const canViewLeaveNotifications = permissions.some((permission) =>
    permission.startsWith("leave."),
  );
  const canViewCandidateInquiries = permissions.includes("candidates.view");
  const canViewRequisitionNotifications = permissions.some((permission) =>
    permission.startsWith("requisitions."),
  );

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

  useEffect(() => {
    let cancelled = false;
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error: unknown) => console.error("Service worker registration failed", error));
    }

    const loadPushSettings = async () => {
      try {
        const response = await fetch("/api/notifications/push", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load browser notification settings.");
        const settings = await response.json() as PushSettings;
        if (!cancelled) setPushSettings(settings);
      } catch (error) {
        console.error("Browser notification settings request failed", error);
        if (!cancelled) setPushMessage("Browser notification settings are unavailable.");
      }
    };
    void loadPushSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showNotifs) return;
    const updatePanelPosition = () => {
      const top = topbarRef.current?.getBoundingClientRect().bottom ?? 52;
      setNotificationPanelTop(Math.max(8, Math.min(top + 8, window.innerHeight - 120)));
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        notificationPanelRef.current?.contains(target)
        || notificationButtonRef.current?.contains(target)
      ) return;
      setShowNotifs(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", updatePanelPosition);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", updatePanelPosition);
    };
  }, [showNotifs]);

  useEffect(() => {
    let cancelled = false;
    const loadReminders = async () => {
      try {
        const [taskResponse, inquiryResponse, leaveResponse, requisitionResponse] = await Promise.all([
          canViewTaskReminders
            ? fetch("/api/tasks/reminders", { cache: "no-store" })
            : Promise.resolve(null),
          canViewCandidateInquiries
            ? fetch("/api/candidate-inquiries/reminders", { cache: "no-store" })
            : Promise.resolve(null),
          canViewLeaveNotifications
            ? fetch("/api/leave/notifications", { cache: "no-store" })
            : Promise.resolve(null),
          canViewRequisitionNotifications
            ? fetch("/api/requisitions/notifications", { cache: "no-store" })
            : Promise.resolve(null),
        ]);
        const payload = taskResponse?.ok
          ? await taskResponse.json() as { reminders?: { id: string; title: string; body: string; sent_at: string; read_at: string | null }[] }
          : { reminders: [] };
        const inquiryPayload = inquiryResponse?.ok
          ? await inquiryResponse.json() as { reminders?: { id: string; title: string; body: string; sent_at: string; read_at: string | null }[] }
          : { reminders: [] };
        const leavePayload = leaveResponse?.ok
          ? await leaveResponse.json() as { notifications?: { id: string; stage: string; title: string; body: string; sent_at: string; read_at: string | null }[] }
          : { notifications: [] };
        const requisitionPayload = requisitionResponse?.ok
          ? await requisitionResponse.json() as { notifications?: { id: string; title: string; body: string; created_at: string; is_read: boolean }[] }
          : { notifications: [] };
        if (cancelled) return;
        const reminders = payload.reminders ?? [];
        const inquiryReminders = inquiryPayload.reminders ?? [];
        const leaveNotifications = leavePayload.notifications ?? [];
        const requisitionNotifications = requisitionPayload.notifications ?? [];

        // Determine leave notification priority by stage
        const leaveNotifPriority = (stage: string): NotificationPriority => {
          if (stage === "final_approved") return "Important";
          if (stage === "supervisor_approved" || stage === "manager_approved") return "Informational";
          if (stage.endsWith("_rejected")) return "Important";
          return "Informational";
        };
        const leaveNotifType = (stage: string): NotificationItem["type"] => {
          if (stage === "final_approved") return "success";
          if (stage.endsWith("_rejected")) return "error";
          if (stage === "submitted") return "info";
          return "info";
        };

        setNotifs([
          ...requisitionNotifications.map((notification) => ({
            id: `requisition-${notification.id}`,
            requisitionNotificationId: notification.id,
            view: "requisitions" as const,
            priority: "Important" as const,
            type: "info" as const,
            title: notification.title,
            body: notification.body,
            time: new Date(notification.created_at).toLocaleString(),
            read: notification.is_read,
          })),
          ...leaveNotifications.map((n) => ({
            id: `leave-${n.id}`,
            leaveNotificationId: n.id,
            view: "leave" as const,
            priority: leaveNotifPriority(n.stage),
            type: leaveNotifType(n.stage),
            title: n.title,
            body: n.body,
            time: new Date(n.sent_at).toLocaleString(),
            read: Boolean(n.read_at),
          })),
          ...inquiryReminders.map((reminder) => ({
            id: `candidate-inquiry-${reminder.id}`,
            candidateInquiryNotificationId: reminder.id,
            view: "candidate-inquiries" as const,
            priority: "Important" as const,
            type: "info" as const,
            title: reminder.title,
            body: reminder.body,
            time: new Date(reminder.sent_at).toLocaleString(),
            read: Boolean(reminder.read_at),
          })),
          ...reminders.map((reminder) => ({
            id: `task-${reminder.id}`,
            taskNotificationId: reminder.id,
            view: "tasks" as const,
            priority: "Important" as const,
            type: "warning" as const,
            title: reminder.title,
            body: reminder.body,
            time: new Date(reminder.sent_at).toLocaleString(),
            read: Boolean(reminder.read_at),
          })),
        ]);
        if (pushSettings?.configured && pushSettings.subscribed) {
          const dispatchResponse = await fetch("/api/notifications/push/dispatch", { method: "POST" });
          if (!dispatchResponse.ok) {
            console.error("Active browser push dispatch failed", await dispatchResponse.text());
          }
        }
      } catch (error) {
        console.error("Loading notification history failed", error);
      }
    };
    const refreshReminders = () => { void loadReminders(); };
    void loadReminders();
    const interval = window.setInterval(() => { void loadReminders(); }, 60000);
    window.addEventListener("task-reminders-changed", refreshReminders);
    window.addEventListener("leave-notifications-changed", refreshReminders);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("task-reminders-changed", refreshReminders);
      window.removeEventListener("leave-notifications-changed", refreshReminders);
    };
  }, [
    canViewCandidateInquiries,
    canViewLeaveNotifications,
    canViewRequisitionNotifications,
    canViewTaskReminders,
    pushSettings,
  ]);

  const results = useMemo(() => {
    const normalized = query.toLowerCase();
    if (!normalized) return [];

    const matches = [
      ...searchIndex.filter((item) =>
        (canViewTaskReminders || item.view !== "tasks") &&
        (item.label.toLowerCase().includes(normalized) || item.sub.toLowerCase().includes(normalized) || item.group.toLowerCase().includes(normalized)),
      ),
      ...categoryActionItems.filter((item) =>
        (canViewTaskReminders || item.view !== "tasks") &&
        (item.label.toLowerCase().includes(normalized) || item.sub.toLowerCase().includes(normalized) || item.group.toLowerCase().includes(normalized)),
      ),
    ];

    return matches.slice(0, 8);
  }, [canViewTaskReminders, query]);

  const visibleNotifs = notifs;
  const unread = visibleNotifs.filter((n) => !n.read).length;
  const groupedNotifications = [
    { priority: "Critical" as const, items: visibleNotifs.filter((item) => item.priority === "Critical") },
    { priority: "Important" as const, items: visibleNotifs.filter((item) => item.priority === "Important") },
    { priority: "Informational" as const, items: visibleNotifs.filter((item) => item.priority === "Informational") },
  ];

  const markAllRead = async () => {
    const requests: Promise<Response>[] = [];
    if (canViewCandidateInquiries)
      requests.push(fetch("/api/candidate-inquiries/reminders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }));
    if (canViewTaskReminders)
      requests.push(fetch("/api/tasks/reminders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }));
    if (canViewLeaveNotifications)
      requests.push(fetch("/api/leave/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }));
    if (canViewRequisitionNotifications)
      requests.push(fetch("/api/requisitions/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }));
    try {
      const responses = await Promise.all(requests);
      if (responses.some((response) => !response.ok)) {
        console.error("One or more notification read updates failed", responses.filter((response) => !response.ok).map((response) => response.status));
        return;
      }
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error("Mark all notifications read failed", error);
    }
  };

  const markNotificationRead = async (id: string | number) => {
    const notification = notifs.find((item) => item.id === id);
    if (!notification || notification.read) return;
    let response: Response | null = null;
    try {
      if (notification.taskNotificationId) {
        response = await fetch("/api/tasks/reminders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: notification.taskNotificationId }) });
      } else if (notification.candidateInquiryNotificationId) {
        response = await fetch("/api/candidate-inquiries/reminders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: notification.candidateInquiryNotificationId }) });
      } else if (notification.leaveNotificationId) {
        response = await fetch("/api/leave/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: notification.leaveNotificationId }) });
      } else if (notification.requisitionNotificationId) {
        response = await fetch("/api/requisitions/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: notification.requisitionNotificationId }) });
      }
      if (response && !response.ok) {
        console.error("Notification read update failed", response.status);
        return;
      }
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (error) {
      console.error("Notification read update failed", error);
    }
  };

  const enableBrowserAlerts = async () => {
    setPushBusy(true);
    setPushMessage("");
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("This browser does not support push notifications.");
      }
      if (!pushSettings?.configured || !pushSettings.publicKey) {
        throw new Error("The server has not configured Web Push yet.");
      }
      const permission = window.Notification.permission === "granted"
        ? "granted"
        : await window.Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Allow notifications in your browser settings to receive alerts.");
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidPublicKey(pushSettings.publicKey),
        });
      const response = await fetch("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Unable to enable browser alerts.");
      }
      setPushSettings((current) => current ? { ...current, subscribed: true } : current);
      setPushMessage("Browser alerts are enabled.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to enable browser alerts.";
      setPushMessage(message);
      console.error("Enabling browser push notifications failed", error);
    } finally {
      setPushBusy(false);
    }
  };

  const disableBrowserAlerts = async () => {
    setPushBusy(true);
    setPushMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/notifications/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Unable to remove the server push subscription.");
        await subscription.unsubscribe();
      }
      setPushSettings((current) => current ? { ...current, subscribed: false } : current);
      setPushMessage("Browser alerts are disabled.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to disable browser alerts.";
      setPushMessage(message);
      console.error("Disabling browser push notifications failed", error);
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <>
      <div
        ref={topbarRef}
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
              {formatCompanyInitials(companyName ?? "Kilax Smart Recruit")}
            </div>
          )}
          <div className="min-w-0 leading-none">
            <div className="hidden text-[9px] font-700 uppercase tracking-[0.18em] lg:block" style={{ color: "var(--muted-foreground)" }}>Active company</div>
            <div className="mt-0.5 truncate text-xs font-600" style={{ color: "var(--foreground)" }}>{companyName ?? "Kilax Smart Recruit"}</div>
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
              ref={notificationButtonRef}
              type="button"
              aria-label="Open notification center"
              aria-expanded={showNotifs}
              onClick={() => {
                if (!showNotifs) {
                  const top = topbarRef.current?.getBoundingClientRect().bottom ?? 52;
                  setNotificationPanelTop(Math.max(8, Math.min(top + 8, window.innerHeight - 120)));
                }
                setShowNotifs((open) => !open);
              }}
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
                ref={notificationPanelRef}
                role="dialog"
                aria-label="Notification center"
                className="topbar-notifications fixed right-2 z-[70] flex flex-col overflow-hidden rounded border shadow-xl sm:right-4"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  top: `${notificationPanelTop}px`,
                  width: "min(24rem, calc(100vw - 1rem))",
                  maxHeight: `calc(100dvh - ${notificationPanelTop}px - 0.5rem)`,
                }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="text-sm font-700" style={{ color: "var(--foreground)" }}>Notification center</span>
                  <button type="button" onClick={markAllRead} disabled={unread === 0} className="text-xs disabled:opacity-50" style={{ color: "var(--primary)" }}>Mark all read</button>
                </div>
                <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-600" style={{ color: "var(--foreground)" }}>
                        {pushSettings?.subscribed ? "Browser alerts are enabled" : "Browser and system alerts"}
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                        {pushSettings?.dispatchConfigured
                          ? "A 1-minute server schedule is still required for closed-browser alerts."
                          : "Closed-browser delivery needs a scheduled server dispatcher."}
                      </div>
                    </div>
                    {pushSettings?.configured ? (
                      <button
                        type="button"
                        disabled={pushBusy}
                        onClick={pushSettings.subscribed ? disableBrowserAlerts : enableBrowserAlerts}
                        className="shrink-0 rounded border px-2.5 py-1.5 text-[11px] font-600 disabled:opacity-50"
                        style={{ borderColor: "var(--border)", color: "var(--primary)" }}
                      >
                        {pushBusy ? "Saving…" : pushSettings.subscribed ? "Disable" : "Enable"}
                      </button>
                    ) : (
                      <span className="shrink-0 text-[10px]" style={{ color: "var(--muted-foreground)" }}>Setup needed</span>
                    )}
                  </div>
                  {pushMessage && <div className="mt-2 text-[11px]" role="status" style={{ color: "var(--muted-foreground)" }}>{pushMessage}</div>}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {visibleNotifs.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>You are all caught up.</div>
                  ) : groupedNotifications.map((group) => group.items.length > 0 && (
                    <div key={group.priority} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                      <div className="px-4 py-2 text-[10px] font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                        {group.priority}
                      </div>
                      {group.items.map((n) => (
                        <div
                          key={n.id}
                          className="flex gap-3 px-4 py-3"
                          style={{ background: n.read ? "transparent" : "var(--secondary)" }}
                        >
                          {(() => {
                            const Icon = typeIcon[n.type];
                            return <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: typeColor[n.type] }} />;
                          })()}
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 text-xs font-700" style={{ color: typeColor[n.type] }}>{n.title}</div>
                            <div className="text-xs" style={{ color: "var(--foreground)" }}>{n.body}</div>
                            <div className="mono mt-1 text-[11px]" style={{ color: "var(--muted-foreground)" }}>{n.time}</div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {n.view && (
                              <button
                                type="button"
                                onClick={() => {
                                  const destination = n.view;
                                  if (destination) onNavigate(destination);
                                  setShowNotifs(false);
                                }}
                                className="text-[10px] font-600"
                                style={{ color: "var(--primary)" }}
                              >
                                Open
                              </button>
                            )}
                            {!n.read && <div className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} />}
                            {!n.read && (
                              <button type="button" onClick={() => void markNotificationRead(n.id)} className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
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
                    { title: "Candidates", items: results.filter((item) => ["candidates", "agents", "contractors"].includes(item.view)) },
                    { title: "Jobs & People", items: results.filter((item) => ["jobs", "agents", "contractors", "projects"].includes(item.view)) },
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
