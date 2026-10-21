import { useEffect, useState } from "react";
import {
  Building2,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GitBranch,
  History,
  IdCard,
  LayoutDashboard,
  MessageSquareText,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sparkles,
  LogOut,
  UserRoundCog,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { View, WorkspaceRole } from "../App";

type NavItem =
  | { type: "item"; id: View; label: string; icon: LucideIcon }
  | { type: "group"; id: "agents" | "finance" | "employers" | "workforce" | "candidates"; label: string; icon: LucideIcon; children: { id: View; label: string; icon: LucideIcon }[] };

const nav: NavItem[] = [
  { type: "item",  id: "dashboard",      label: "Dashboard",         icon: LayoutDashboard },
  {
    type: "group", id: "candidates", label: "Candidates", icon: UsersRound,
    children: [
      { id: "candidate-inquiries", label: "Inquiries", icon: MessageSquareText },
      { id: "candidates", label: "Pipeline", icon: UsersRound },
      { id: "medical-appointments", label: "Medical Appointments", icon: CalendarDays },
      { id: "medical-management", label: "Medical Examinations", icon: ClipboardCheck },
    ],
  },
  {
    type: "group", id: "workforce", label: "Human Resource", icon: CalendarDays,
    children: [
      { id: "human-resources", label: "My HR Profile", icon: UsersRound },
      { id: "attendance", label: "Attendance", icon: CalendarClock },
      { id: "leave", label: "Leave Management", icon: CalendarDays },
    ],
  },
  {
    type: "group", id: "agents", label: "Agents & Suppliers", icon: UserRoundCog,
    children: [
      { id: "agents", label: "Agents", icon: UserRoundCog },
      { id: "suppliers", label: "Suppliers", icon: Building2 },
    ],
  },
  {
    type: "group", id: "employers", label: "Employers", icon: Building2,
    children: [
      { id: "contractors", label: "Contractors", icon: UsersRound },
      { id: "projects", label: "Projects", icon: BriefcaseBusiness },
    ],
  },
  {
    type: "group", id: "finance", label: "Finance", icon: WalletCards,
    children: [
      { id: "finance",       label: "Overview",              icon: WalletCards },
      { id: "accounts",      label: "Accounts & Other Income", icon: WalletCards },
      { id: "invoices",      label: "Invoices",              icon: ReceiptText },
      { id: "payments",      label: "Payments & Deposits",   icon: CircleDollarSign },
      { id: "paychecks",     label: "Paychecks",             icon: FileText },
      { id: "requisitions",  label: "Requisitions",          icon: ClipboardList },
    ],
  },
  { type: "item",  id: "passport",       label: "Passport Custody",  icon: IdCard },
  { type: "item",  id: "documents",      label: "Document Mgt",      icon: FileText },
  { type: "item",  id: "approvals",      label: "Approvals",          icon: CheckSquare },
  { type: "item",  id: "tasks",          label: "Tasks",             icon: ClipboardCheck },
  { type: "item",  id: "communications", label: "Communications",    icon: MessageSquareText },
  { type: "item",  id: "ai",             label: "AI Assistant",      icon: Sparkles },
  { type: "item",  id: "reports",        label: "Reports & Analytics", icon: ChartNoAxesCombined },
  { type: "item",  id: "users",          label: "Users & Roles",     icon: ShieldCheck },
  { type: "item",  id: "branches",       label: "Branches",           icon: GitBranch },
  { type: "item",  id: "auditlog",       label: "Audit Log",         icon: History },
  { type: "item",  id: "settings",       label: "Settings",          icon: Settings },
];

const financeViews = new Set<View>(["finance", "accounts", "invoices", "payments", "paychecks", "requisitions"]);
const employerViews = new Set<View>(["contractors", "projects"]);
const agentSupplierViews = new Set<View>(["agents", "suppliers"]);
const workforceViews = new Set<View>(["human-resources", "attendance", "leave"]);
const candidateViews = new Set<View>(["candidates", "candidate-inquiries", "medical-appointments", "medical-management"]);

export default function Sidebar({ active, onNavigate, role, userName, companyName, companyLogo, mobileOpen, onLogout, branchName, isMainBranchUser }: { active: View; onNavigate: (v: View) => void; role: WorkspaceRole; userName?: string; companyName?: string; companyLogo?: string; mobileOpen: boolean; onClose: () => void; onLogout: () => void; branchName?: string; isMainBranchUser?: boolean }) {
  const [openGroups, setOpenGroups] = useState({ agents: agentSupplierViews.has(active), finance: financeViews.has(active), employers: employerViews.has(active), workforce: workforceViews.has(active), candidates: candidateViews.has(active) });

  useEffect(() => {
    if (financeViews.has(active)) setOpenGroups((current) => current.finance ? current : { ...current, finance: true });
    if (employerViews.has(active)) setOpenGroups((current) => current.employers ? current : { ...current, employers: true });
    if (agentSupplierViews.has(active)) setOpenGroups((current) => current.agents ? current : { ...current, agents: true });
    if (workforceViews.has(active)) setOpenGroups((current) => current.workforce ? current : { ...current, workforce: true });
    if (candidateViews.has(active)) setOpenGroups((current) => current.candidates ? current : { ...current, candidates: true });
  }, [active]);

  return (
    <aside className={`app-sidebar fixed inset-y-0 left-0 z-50 flex h-dvh w-64 shrink-0 flex-col border-r transition-transform duration-200 lg:relative lg:z-auto lg:h-full lg:w-52 ${mobileOpen ? "app-sidebar-open" : ""}`} style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="px-4 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          {companyLogo ? (
            <img src={companyLogo} alt={`${companyName ?? "Company"} logo`} className="h-9 w-9 rounded object-cover" />
          ) : (
            <span className="w-9 h-9 rounded flex items-center justify-center text-xs font-bold mono"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              {(companyName ?? "Kilax Smart Recruit").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "KR"}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-700 leading-tight" style={{ color: "var(--foreground)" }}>{companyName ?? "Kilax Smart Recruit"}</div>
            <div className="text-xs mt-0.5 mono" style={{ color: "var(--muted-foreground)" }}>Recruitment workspace</div>
          </div>
        </div>
      </div>

      {/* Branch context banner — shows which branch this user belongs to */}
      {branchName && (
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--border)", background: isMainBranchUser ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "#f59e0b0f" }}>
          <GitBranch size={12} aria-hidden="true" style={{ color: isMainBranchUser ? "var(--primary)" : "#d97706", flexShrink: 0 }} />
          <span className="truncate text-xs font-600" style={{ color: isMainBranchUser ? "var(--primary)" : "#b45309" }}>
            {isMainBranchUser ? `${branchName} · All Branches` : branchName}
          </span>
        </div>
      )}

      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {nav.map((item, idx) => {
          if (item.type === "item") {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => onNavigate(item.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs font-600 transition-all duration-150 text-left"
                style={{
                  background: isActive ? "var(--secondary)" : "transparent",
                  color: isActive ? "var(--primary)" : "var(--muted-foreground)",
                  borderLeft: isActive ? "2px solid var(--primary)" : "2px solid transparent",
                }}>
                <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                {item.label}
              </button>
            );
          }

          // Group
          const Icon = item.icon;
          const groupViews = item.id === "finance" ? financeViews : item.id === "employers" ? employerViews : item.id === "workforce" ? workforceViews : item.id === "candidates" ? candidateViews : agentSupplierViews;
          const isGroupActive = groupViews.has(active);
          const groupOpen = openGroups[item.id];
          return (
            <div key={idx}>
              <button
                onClick={() => setOpenGroups((current) => ({ ...current, [item.id]: !current[item.id] }))}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs font-600 transition-all duration-150"
                style={{
                  background: isGroupActive && !groupOpen ? "var(--secondary)" : "transparent",
                  color: isGroupActive ? "var(--primary)" : "var(--muted-foreground)",
                  borderLeft: isGroupActive && !groupOpen ? "2px solid var(--primary)" : "2px solid transparent",
                }}>
                <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronDown size={13} strokeWidth={1.8} aria-hidden="true" style={{ transform: groupOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 150ms" }} />
              </button>
              {groupOpen && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l pl-2.5" style={{ borderColor: "var(--border)" }}>
                  {item.children.map((child) => {
                    const CIcon = child.icon;
                    const isActive = active === child.id;
                    return (
                      <button key={child.id} onClick={() => onNavigate(child.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-600 transition-all duration-150 text-left"
                        style={{
                          background: isActive ? "var(--secondary)" : "transparent",
                          color: isActive ? "var(--primary)" : "var(--muted-foreground)",
                        }}>
                        <CIcon size={14} strokeWidth={1.8} aria-hidden="true" />
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto border-t p-3" style={{ borderColor: "var(--border)" }}>
        <div className="mb-3 flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: "var(--secondary)", color: "var(--primary)" }}>
            {userName ? userName.split(/\\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() : "U"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-600" style={{ color: "var(--foreground)" }}>{userName ?? "User"}</div>
            <div className="truncate text-[10px]" style={{ color: "var(--muted-foreground)" }}>{role}</div>
          </div>
        </div>
        <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs font-600 transition-colors hover:bg-red-500/10" style={{ color: "#ef4444" }}>
          <LogOut size={15} aria-hidden="true" />
          Log out
        </button>
      </div>
    </aside>
  );
}
