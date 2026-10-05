import { useEffect, useState } from "react";
import {
  Building2,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
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
  | { type: "group"; id: "finance" | "employers"; label: string; icon: LucideIcon; children: { id: View; label: string; icon: LucideIcon }[] };

const nav: NavItem[] = [
  { type: "item",  id: "dashboard",      label: "Dashboard",         icon: LayoutDashboard },
  { type: "item",  id: "candidates",     label: "Candidates",        icon: UsersRound },
  { type: "item",  id: "agents",         label: "Agents",            icon: UserRoundCog },
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
      { id: "finance",   label: "Overview",          icon: WalletCards },
      { id: "invoices",  label: "Invoices",          icon: ReceiptText },
      { id: "payments",  label: "Payments & Deposits", icon: CircleDollarSign },
      { id: "paychecks", label: "Paychecks",         icon: FileText },
    ],
  },
  { type: "item",  id: "passport",       label: "Passport Custody",  icon: IdCard },
  { type: "item",  id: "documents",      label: "Documents",         icon: FileText },
  { type: "item",  id: "tasks",          label: "Tasks",             icon: ClipboardCheck },
  { type: "item",  id: "communications", label: "Communications",    icon: MessageSquareText },
  { type: "item",  id: "ai",             label: "AI Assistant",      icon: Sparkles },
  { type: "item",  id: "reports",        label: "Reports & Analytics", icon: ChartNoAxesCombined },
  { type: "item",  id: "users",          label: "Users & Roles",     icon: ShieldCheck },
  { type: "item",  id: "auditlog",       label: "Audit Log",         icon: History },
  { type: "item",  id: "settings",       label: "Settings",          icon: Settings },
];

const financeViews = new Set<View>(["finance", "invoices", "payments", "paychecks"]);
const employerViews = new Set<View>(["contractors", "projects"]);

export default function Sidebar({ active, onNavigate, role, userName, companyName, companyLogo, mobileOpen, onLogout }: { active: View; onNavigate: (v: View) => void; role: WorkspaceRole; userName?: string; companyName?: string; companyLogo?: string; mobileOpen: boolean; onClose: () => void; onLogout: () => void }) {
  const [openGroups, setOpenGroups] = useState({ finance: financeViews.has(active), employers: employerViews.has(active) });

  useEffect(() => {
    if (financeViews.has(active)) setOpenGroups((current) => current.finance ? current : { ...current, finance: true });
    if (employerViews.has(active)) setOpenGroups((current) => current.employers ? current : { ...current, employers: true });
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
              {(companyName ?? "RecruitOS").split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "R"}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-700 leading-tight" style={{ color: "var(--foreground)" }}>{companyName ?? "RecruitOS"}</div>
            <div className="text-xs mt-0.5 mono" style={{ color: "var(--muted-foreground)" }}>Recruitment workspace</div>
          </div>
        </div>
      </div>

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
          const groupViews = item.id === "finance" ? financeViews : employerViews;
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
