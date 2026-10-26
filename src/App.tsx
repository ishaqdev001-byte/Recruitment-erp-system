"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { Eye, EyeOff } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./lib/supabase/browser";
import { canAccessView, isMedicalOnlyUser } from "./lib/permissionToViewMap";

/** Kilax Smart Recruit logo — shown on all pre-auth screens. */
function KilaxLogo({ size = 64 }: { size?: number }) {
  return (
    <img
      src="/branding/kilax-icon.svg"
      alt="Kilax Smart Recruit"
      width={size}
      height={size}
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}



/** Full wordmark used in auth card headers. */
function KilaxWordmark() {
  return (
    <div className="flex items-center gap-3">
      <KilaxLogo size={52} />
      <div>
        <div className="text-xl font-700 leading-tight" style={{ color: "var(--foreground)" }}>Kilax Smart Recruit</div>
        <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted-foreground)" }}>Recruitment ERP</div>
      </div>
    </div>
  );
}

const PageLoading = () => (
  <div className="p-6 text-sm" style={{ color: "var(--muted-foreground)" }} aria-busy="true">
    Loading page…
  </div>
);
const Sidebar = dynamic(() => import("./components/Sidebar"), { loading: PageLoading });
const TopBar = dynamic(() => import("./components/TopBar"), { loading: PageLoading });
const Dashboard = dynamic(() => import("./components/LiveDashboard"), { loading: PageLoading });
const Candidates = dynamic(() => import("./components/CandidateRoster"), { loading: PageLoading });
const UsersRoles = dynamic(() => import("./components/UsersRoles"), { loading: PageLoading });
const Agents = dynamic(() => import("./components/Agents"), { loading: PageLoading });
const Finance = dynamic(() => import("./components/Finance"), { loading: PageLoading });
const Invoices = dynamic(() => import("./components/InvoiceWorkspace"), { loading: PageLoading });
const Payments = dynamic(() => import("./components/Payments"), { loading: PageLoading });
const Paychecks = dynamic(() => import("./components/Paychecks"), { loading: PageLoading });
const AccountsWorkspace = dynamic(() => import("./components/AccountsWorkspace"), { loading: PageLoading });
const Suppliers = dynamic(() => import("./components/Suppliers"), { loading: PageLoading });
const Contractors = dynamic(() => import("./components/Employers"), { loading: PageLoading });
const Projects = dynamic(() => import("./components/Projects"), { loading: PageLoading });
const PassportCustody = dynamic(() => import("./components/PassportCustodyWorkspace"), { loading: PageLoading });
const Attendance = dynamic(() => import("./components/Attendance"), { loading: PageLoading });
const LeaveManagement = dynamic(() => import("./components/LeaveManagement"), { loading: PageLoading });
const HumanResources = dynamic(() => import("./components/HumanResources"), { loading: PageLoading });
const MedicalAppointments = dynamic(() => import("./components/MedicalAppointments"), { loading: PageLoading });
const MedicalManagement = dynamic(() => import("./components/MedicalManagement"), { loading: PageLoading });
const HospitalManagement = dynamic(() => import("./components/HospitalManagement"), { loading: PageLoading });
const Branches = dynamic(() => import("./components/Branches"), { loading: PageLoading });
const BranchApprovals = dynamic(() => import("./components/BranchApprovals"), { loading: PageLoading });
const Requisitions = dynamic(() => import("./components/RequisitionsWorkspace"), { loading: PageLoading });
const CompanyDrive = dynamic(() => import("./components/CompanyDrive"), { loading: PageLoading });
const Tasks = dynamic(() => import("./components/TaskWorkspace"), { loading: PageLoading });
const Communications = dynamic(() => import("./components/Communications"), { loading: PageLoading });
const AIAssistant = dynamic(() => import("./components/AIAssistant"), { loading: PageLoading });
const DepartmentsSettings = dynamic(() => import("./components/settings/DepartmentsSettings"), { loading: PageLoading });
const CurrenciesSettings = dynamic(() => import("./components/settings/CurrenciesSettings"), { loading: PageLoading });
const ServiceProvidersSettings = dynamic(() => import("./components/settings/ServiceProvidersSettings"), { loading: PageLoading });

const viewPreloaders: Partial<Record<View, () => Promise<unknown>>> = {
  dashboard: () => import("./components/LiveDashboard"),
  candidates: () => import("./components/CandidateRoster"),
  "candidate-inquiries": () => import("./components/CandidateRoster"),
  agents: () => import("./components/Agents"),
  suppliers: () => import("./components/Suppliers"),
  finance: () => import("./components/Finance"),
  accounts: () => import("./components/AccountsWorkspace"),
  invoices: () => import("./components/InvoiceWorkspace"),
  payments: () => import("./components/Payments"),
  paychecks: () => import("./components/Paychecks"),
  contractors: () => import("./components/Employers"),
  projects: () => import("./components/Projects"),
  attendance: () => import("./components/Attendance"),
  leave: () => import("./components/LeaveManagement"),
  "human-resources": () => import("./components/HumanResources"),
  "medical-appointments": () => import("./components/MedicalAppointments"),
  "medical-management": () => import("./components/MedicalManagement"),
  "hospital-management": () => import("./components/HospitalManagement"),
  branches: () => import("./components/Branches"),
  approvals: () => import("./components/BranchApprovals"),
  requisitions: () => import("./components/RequisitionsWorkspace"),
  tasks: () => import("./components/TaskWorkspace"),
  communications: () => import("./components/Communications"),
  ai: () => import("./components/AIAssistant"),
  passport: () => import("./components/PassportCustodyWorkspace"),
  documents: () => import("./components/CompanyDrive"),
  users: () => import("./components/UsersRoles"),
  settings: () => Promise.all([
    import("./components/settings/DepartmentsSettings"),
    import("./components/settings/CurrenciesSettings"),
    import("./components/settings/ServiceProvidersSettings"),
  ]),
};

function preloadView(view: View) {
  void viewPreloaders[view]?.();
}

export type View =
  | "dashboard"
  | "candidates"
  | "candidate-inquiries"
  | "agents"
  | "suppliers"
  | "jobs"
  | "interviews"
  | "offers"
  | "analytics"
  | "finance"
  | "accounts"
  | "payments"
  | "paychecks"
  | "passport"
  | "documents"
  | "ai"
  | "reports"
  | "users"
  | "settings"
  | "contractors"
  | "projects"
  | "invoices"
  | "tasks"
  | "communications"
  | "auditlog"
  | "attendance"
  | "leave"
  | "human-resources"
  | "medical-appointments"
  | "medical-management"
  | "hospital-management"
  | "branches"
  | "approvals"
  | "requisitions"
  | "drive";

export type WorkspaceRole =
  | "Chairman"
  | "General Manager"
  | "CEO"
  | "Recruitment Manager"
  | "Recruitment Agent"
  | "Finance Manager"
  | "Finance Officer"
  | "Document Officer"
  | "Medical Officer"
  | "Doctor"
  | "Supervisor"
  | "Viewer"
  | "Administrator"
  | "Manager"
  | "Finance User";

type Theme = "dark" | "light";
type Density = "comfortable" | "compact";
type CompanyAccountStatus = "Active" | "Pending Verification" | "Suspended" | "Deactivated" | "Trial" | "Subscription Required";

type CompanyProfile = {
  id: string;
  name: string;
  registrationNumber: string;
  country: string;
  city: string;
  officeAddress: string;
  phone: string;
  email: string;
  website: string;
  logo: string;
  status: CompanyAccountStatus;
  currency: string;
  timezone: string;
};

type CompanyUser = {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  password: string;
  role: WorkspaceRole;
  companyId: string;
  status: "active" | "invited";
};

type Session = {
  companyId: string;
  userId: string;
  userName: string;
  userAvatarUrl: string;
  companyName: string;
  companyLogo: string;
  role: WorkspaceRole;
  onboarded: boolean;
  branchId: string | null;
  branchName: string;
  isMainBranchUser: boolean;
  permissions: string[];
};

type CompanyForm = {
  companyName: string;
  registrationNumber: string;
  country: string;
  city: string;
  officeAddress: string;
  phone: string;
  email: string;
  website: string;
  fullName: string;
  position: string;
  adminEmail: string;
  adminPhone: string;
  password: string;
  confirmPassword: string;
  logoFile?: File;
  logoPreview?: string;
};

const emptyCompanyForm: CompanyForm = {
  companyName: "",
  registrationNumber: "",
  country: "",
  city: "",
  officeAddress: "",
  phone: "",
  email: "",
  website: "",
  fullName: "",
  position: "",
  adminEmail: "",
  adminPhone: "",
  password: "",
  confirmPassword: "",
  logoFile: undefined,
  logoPreview: undefined,
};

const formatInitials = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "R";

/** Convert a company name to a URL-safe slug, e.g. "Acme Corp Ltd" → "acme-corp-ltd" */
const toCompanySlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "company";

/**
 * Determines the default landing view for a user based on their permissions.
 * Prioritizes views in order of common use: candidates → finance → users → dashboard.
 */
function getDefaultViewByPermissions(permissions: string[], roleName?: string): View {
  if (isMedicalOnlyUser(permissions)) {
    return "medical-management";
  }
  // Try candidates views first
  if (permissions.some((p) => p.startsWith("candidates."))) {
    return "candidates";
  }
  // Then finance views
  if (permissions.some((p) => p.startsWith("finance."))) {
    return "finance";
  }
  // Then user/role management
  if (permissions.includes("users.view")) {
    return "users";
  }
  // Then tasks
  if (permissions.includes("tasks.view")) {
    return "tasks";
  }
  // Default to dashboard
  return "dashboard";
}

async function resolveUserWorkspace(user: User, targetCompanyId?: string) {
  const supabase = createSupabaseBrowserClient();
  let membershipQuery = supabase
    .from("company_memberships")
    .select("company_id, company:companies!inner(id, name, status, logo_url, registration_number, country, city, office_address, phone, email, website), role:company_roles!inner(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (targetCompanyId) membershipQuery = membershipQuery.eq("company_id", targetCompanyId);
  const { data: membership, error } = await membershipQuery.limit(1).maybeSingle();

  if (error) throw new Error("Unable to load your company membership. Check the Supabase migration and RLS policies.");
  if (!membership) throw new Error("Your Supabase account has no active company membership yet.");

  const companyValue = membership.company as unknown as { id: string; name: string; status: string; logo_url: string; registration_number: string; country: string; city: string; office_address: string; phone: string; email: string; website: string } | { id: string; name: string; status: string; logo_url: string; registration_number: string; country: string; city: string; office_address: string; phone: string; email: string; website: string }[];
  const companyRecord = Array.isArray(companyValue) ? companyValue[0] : companyValue;
  const roleValue = membership.role as unknown as { id: string; name: string } | { id: string; name: string }[];
  const roleRecord = Array.isArray(roleValue) ? roleValue[0] : roleValue;
  if (!companyRecord || !roleRecord) throw new Error("Your company membership is incomplete.");

  // Load the user's role permissions from the database
  const { data: rolePerms, error: permsError } = await supabase
    .from("role_permissions")
    .select("permission_code")
    .eq("role_id", roleRecord.id)
    .eq("company_id", companyRecord.id);
  if (permsError) throw new Error("Unable to load your permissions.");
  const permissions = (rolePerms ?? []).map((rp) => rp.permission_code);

  const knownRoles: WorkspaceRole[] = [
    "Chairman", "General Manager", "CEO",
    "Recruitment Manager", "Recruitment Agent",
    "Finance Manager", "Finance Officer", "Document Officer", "Medical Officer", "Doctor", "Supervisor", "Viewer",
    "Administrator", "Manager", "Finance User",
  ];
  const role = knownRoles.find((candidateRole) => candidateRole === roleRecord.name) ?? roleRecord.name as WorkspaceRole;

  // Fetch branch info for the session
  const { data: membershipBranch } = await supabase
    .from("company_memberships")
    .select("branch_id, branch:company_branches(id, name, is_main_branch)")
    .eq("user_id", user.id)
    .eq("company_id", companyRecord.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const branchValue = membershipBranch?.branch as unknown as { id: string; name: string; is_main_branch: boolean } | { id: string; name: string; is_main_branch: boolean }[] | null;
  const branchRecord = Array.isArray(branchValue) ? branchValue[0] : branchValue;
  const branchName = branchRecord?.name ?? "Main Branch";
  const isMainBranchUser = !branchRecord || Boolean(branchRecord.is_main_branch);
  const company: CompanyProfile = {
    id: companyRecord.id,
    name: companyRecord.name,
    registrationNumber: companyRecord.registration_number ?? "",
    country: companyRecord.country ?? "",
    city: companyRecord.city ?? "",
    officeAddress: companyRecord.office_address ?? "",
    phone: companyRecord.phone ?? "",
    email: companyRecord.email ?? "",
    website: companyRecord.website ?? "",
    logo: companyRecord.logo_url ?? "",
    status: companyRecord.status === "trial" ? "Trial" : companyRecord.status === "active" ? "Active" : "Pending Verification",
    currency: "UGX",
    timezone: "Africa/Kampala",
  };
  const userName = String(user.user_metadata?.full_name ?? user.email ?? "User");
  const companyUser: CompanyUser = {
    id: user.id,
    name: userName,
    title: role,
    email: user.email ?? "",
    phone: "",
    password: "",
    role,
    companyId: company.id,
    status: "active",
  };

  return {
    company,
    user: companyUser,
    session: {
      companyId: company.id,
      userId: user.id,
      userName,
      userAvatarUrl: String(user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? ""),
      companyName: company.name,
      companyLogo: company.logo,
      role,
      onboarded: true,
      branchId: membershipBranch?.branch_id ?? null,
      branchName,
      isMainBranchUser,
      permissions,
    } satisfies Session,
  };
}

/** After a successful login, check whether the user must change their password. */
async function checkMustChangePassword(userId: string): Promise<boolean> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", userId)
      .maybeSingle();
    return Boolean((data as { must_change_password?: boolean } | null)?.must_change_password);
  } catch {
    return false;
  }
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [role, setRole] = useState<WorkspaceRole>("Chairman");
  const [theme, setTheme] = useState<Theme>("dark");
  const [density, setDensity] = useState<Density>("comfortable");
  const [preferencesReady, setPreferencesReady] = useState(false);

  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authView, setAuthView] = useState<"landing" | "login" | "register" | "verify" | "invite" | "reset-password">("login");
  const [authLoading, setAuthLoading] = useState(true);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerError, setRegisterError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [resetEmailSending, setResetEmailSending] = useState(false);
  const [resetEmailMessage, setResetEmailMessage] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetPasswordEmail, setResetPasswordEmail] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState("");
  const [resetPasswordSaving, setResetPasswordSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteId, setInviteId] = useState("");
  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [inviteCompanyName, setInviteCompanyName] = useState("");
  const [inviteRoleName, setInviteRoleName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [invitePasswordConfirm, setInvitePasswordConfirm] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  // Forced first-login password change (set by admin using default-password flow)
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [forcedNewPassword, setForcedNewPassword] = useState("");
  const [forcedNewPasswordConfirm, setForcedNewPasswordConfirm] = useState("");
  const [forcedPasswordSaving, setForcedPasswordSaving] = useState(false);
  const [forcedPasswordError, setForcedPasswordError] = useState("");
  const [forcedShowPassword, setForcedShowPassword] = useState(false);

  const handleNavigate = useCallback((nextView: View) => {
    if (session && !canAccessView(nextView, session.permissions)) return;
    preloadView(nextView);
    setView(nextView);
  }, [session]);
  const handleSidebarNavigate = useCallback((nextView: View) => {
    handleNavigate(nextView);
    setMobileNavOpen(false);
  }, [handleNavigate]);

  useEffect(() => {
    for (const key of ["recruitos.companies", "recruitos.users", "recruitos.session"]) {
      window.localStorage.removeItem(key);
    }
    const preferences = window.localStorage.getItem("kilax.workspace-preferences");
    if (preferences) {
      try {
        const saved = JSON.parse(preferences) as Partial<{ theme: Theme; density: Density }>;
        if (saved.theme === "light" || saved.theme === "dark") setTheme(saved.theme);
        if (saved.density === "compact" || saved.density === "comfortable") setDensity(saved.density);
      } catch {
        window.localStorage.removeItem("kilax.workspace-preferences");
      }
    }
    setPreferencesReady(true);

    let cancelled = false;
    const restoreSession = async () => {
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.get("view") === "communications") setView("communications");
      // Restore active view from the URL path on load / hard refresh.
      // Supports /view, /company-slug/view, and legacy ?v= / ?view= params.
      const validViews = new Set<string>(["dashboard","candidates","candidate-inquiries","agents","suppliers","jobs","interviews","offers","analytics","finance","accounts","payments","paychecks","passport","documents","ai","reports","users","settings","contractors","projects","invoices","tasks","communications","auditlog","attendance","leave","human-resources","medical-appointments","medical-management","hospital-management","branches","approvals","requisitions","drive"]);
      // Handle both /view and /company-slug/view path formats
      const pathParts = currentUrl.pathname.replace(/^\//, "").split("/").filter(Boolean);
      const pathView = pathParts.length >= 2 ? pathParts[1] : pathParts[0] ?? "";
      // Also handle auth paths: /login → stay on login, /register → go to register, etc.
      const authPaths: Record<string, "login" | "register" | "invite" | "reset-password"> = {
        login: "login", register: "register", invite: "invite", "reset-password": "reset-password", onboarding: "register",
      };
      if (pathParts.length === 1 && authPaths[pathParts[0]]) {
        setAuthView(authPaths[pathParts[0]]);
      }
      const paramView = currentUrl.searchParams.get("v") ?? currentUrl.searchParams.get("view");
      const detectedView = (validViews.has(pathView) ? pathView : null) ?? (paramView && validViews.has(paramView) ? paramView : null);
      if (detectedView) setView(detectedView as View);
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1));
      const inviteLink = hashParams.get("type") === "invite" || currentUrl.searchParams.get("invite") === "1";
      const recoveryLink = currentUrl.searchParams.get("view") === "reset-password" || hashParams.get("type") === "recovery";
      const currentInviteId = currentUrl.searchParams.get("invitation_id") ?? "";
      if (inviteLink) setAuthView("invite");
      if (recoveryLink) {
        setAuthView("reset-password");
        setResetPasswordError("This password reset link is invalid or expired. Request a new one from the login screen.");
      }
      try {
        const supabase = createSupabaseBrowserClient();
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const recoveryCode = currentUrl.searchParams.get("code") ?? hashParams.get("code") ?? currentUrl.searchParams.get("token") ?? "";
        if ((inviteLink || recoveryLink) && accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (sessionError) {
            throw new Error(recoveryLink
              ? "This password reset link is invalid or expired. Request a new one from the login screen."
              : "This invitation link is invalid or expired. Ask the company administrator to send a new invitation.");
          }
          window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}`);
        } else if (recoveryLink && recoveryCode) {
          const { data: { session }, error: sessionError } = await supabase.auth.exchangeCodeForSession(recoveryCode);
          if (sessionError || !session) {
            throw new Error("This password reset link is invalid or expired. Request a new one from the login screen.");
          }
          window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}`);
        }
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (user) {
          const needsGoogleMailLink = window.sessionStorage.getItem("kilax.googleConnectGmail") === "gmail";
          if (needsGoogleMailLink) {
            window.sessionStorage.removeItem("kilax.googleConnectGmail");
            try {
              const connectResponse = await fetch("/api/communications/mail/connect?provider=gmail", { cache: "no-store" });
              const connectPayload = await connectResponse.json() as { url?: string; error?: string };
              if (connectResponse.ok && connectPayload.url) {
                window.location.assign(connectPayload.url);
                return;
              }
              console.warn("Google Gmail link not started", connectPayload.error ?? "unknown error");
            } catch (error) {
              console.warn("Google Gmail link failed", error);
            }
          }

          const showInvitation = async (invitationId: string) => {
            setInviteEmail(user.email ?? "");
            setAuthView("invite");
            const invitationResponse = await fetch(`/api/workspace/invitations/${encodeURIComponent(invitationId)}`, { cache: "no-store" });
            const invitation = await invitationResponse.json() as { invitationId?: string; companyId?: string; companyName?: string; roleName?: string; error?: string };
            if (!invitationResponse.ok || !invitation.companyId) {
              setInviteError(invitation.error ?? "This invitation is invalid or has expired. Ask for a new invitation.");
              return;
            }
            setInviteId(invitation.invitationId ?? currentInviteId);
            setInviteCompanyId(invitation.companyId);
            setInviteCompanyName(invitation.companyName ?? "");
            setInviteRoleName(invitation.roleName ?? "");
            setInviteError("");
          };

          if (inviteLink) {
            await showInvitation(currentInviteId || "legacy");
            window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}`);
            return;
          }
          if (recoveryLink) {
            setResetPasswordError("");
            setResetPasswordEmail(user.email ?? "");
            return;
          }
          const hasInviteMetadata = Boolean(user.app_metadata?.invitation_company_id
            || (user.user_metadata?.company_name && user.user_metadata?.role_name));
          if (hasInviteMetadata) {
            const currentInvitationResponse = await fetch("/api/workspace/invitations/current", { cache: "no-store" });
            const currentInvitation = await currentInvitationResponse.json() as { invitationId?: string | null; requiresAcceptance?: boolean; legacyInvitation?: boolean; error?: string };
            if (!currentInvitationResponse.ok) throw new Error(currentInvitation.error ?? "Unable to verify your invitation.");
            if (currentInvitation.requiresAcceptance || currentInvitation.legacyInvitation) {
              await showInvitation(currentInvitation.invitationId ?? "legacy");
              return;
            }
          }
          const workspace = await resolveUserWorkspace(user);
          if (!cancelled) {
            setCompanies([workspace.company]);
            setUsers([workspace.user]);
            setSession(workspace.session);
            setRole(workspace.user.role);
            const mustChange = await checkMustChangePassword(workspace.user.id);
            if (!cancelled) setMustChangePassword(mustChange);
          }
        }
      } catch (error) {
        if (!cancelled && error instanceof Error) {
          if (inviteLink) setInviteError(error.message);
          else if (recoveryLink) setResetPasswordError(error.message === "Auth session missing!"
            ? "This password reset link is invalid or expired. Request a new one from the login screen."
            : error.message);
          else if (error.message !== "Auth session missing!") setLoginError(error.message);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    void restoreSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session) return;
    const preloadCommonViews = () => {
      for (const commonView of ["dashboard", "candidates", "tasks", "finance"] as const) {
        preloadView(commonView);
      }
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const idleId = idleWindow.requestIdleCallback(preloadCommonViews, { timeout: 2500 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }
    const timeoutId = window.setTimeout(preloadCommonViews, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [session]);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    if (!("IntersectionObserver" in window)) return;

    const observed = new WeakSet<Element>();
    const revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-scroll-reveal", "visible");
        revealObserver.unobserve(entry.target);
      }
    }, { threshold: 0.01, rootMargin: "0px 0px -24px 0px" });

    const revealContent = () => {
      main.querySelectorAll(
        "h1, h2, section, article, table, [role='tabpanel'], .grid > *, [class*='overflow-y-auto'] > *",
      ).forEach((element) => {
        if (observed.has(element)) return;
        observed.add(element);
        element.setAttribute("data-scroll-reveal", "pending");
        revealObserver.observe(element);
      });
    };

    revealContent();
    const contentObserver = new MutationObserver(revealContent);
    contentObserver.observe(main, { childList: true, subtree: true });

    return () => {
      contentObserver.disconnect();
      revealObserver.disconnect();
    };
  }, [session, view]);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    main.scrollTo({ top: 0, behavior: "smooth" });
    main.querySelectorAll<HTMLElement>("*").forEach((element) => {
      if (element.scrollHeight > element.clientHeight + 1 && getComputedStyle(element).overflowY !== "visible") {
        element.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }, [session, view]);

  useEffect(() => {
    if (preferencesReady) {
      window.localStorage.setItem("kilax.workspace-preferences", JSON.stringify({ role, theme, density }));
    }
  }, [density, preferencesReady, role, theme]);

  // Set default view based on permissions on first session load
  useEffect(() => {
    if (!session || view !== "dashboard") return; // Only set if currently on dashboard
    const defaultView = getDefaultViewByPermissions(session.permissions, session.role);
    if (defaultView !== "dashboard") {
      setView(defaultView);
    }
  }, [session?.companyId]); // Only trigger on session change (new company/login)

  useEffect(() => {
    if (session && !canAccessView(view, session.permissions)) {
      setView(getDefaultViewByPermissions(session.permissions, session.role));
    }
  }, [session, view]);

  // Periodically refresh user permissions (every 5 minutes)
  // This ensures that if an admin changes role permissions while the user is logged in,
  // the changes will be reflected in the UI without requiring a logout/login
  useEffect(() => {
    if (!session) return;

    const refreshPermissions = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return;

        const { data: membership } = await supabase
          .from("company_memberships")
          .select("role_id, role:company_roles(id, name)")
          .eq("user_id", user.id)
          .eq("company_id", session.companyId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (!membership) return;

        const roleValue = membership.role as unknown as { id: string; name: string } | { id: string; name: string }[];
        const roleRecord = Array.isArray(roleValue) ? roleValue[0] : roleValue;
        if (!roleRecord) return;

        // Fetch fresh permissions from the database
        const { data: rolePerms, error: permsError } = await supabase
          .from("role_permissions")
          .select("permission_code")
          .eq("role_id", roleRecord.id)
          .eq("company_id", session.companyId);

        if (permsError || !rolePerms) return;

        const newPermissions = rolePerms.map((rp) => rp.permission_code);

        // Only update session if permissions actually changed
        const oldPermissions = new Set(session.permissions);
        const hasChanges = newPermissions.length !== oldPermissions.size ||
          newPermissions.some((p) => !oldPermissions.has(p));

        if (hasChanges) {
          console.log("[Permission Refresh] Detected permission changes, updating session");
          setSession((current) => current ? { ...current, permissions: newPermissions } : current);
        }
      } catch (error) {
        // Silently fail - this is a background refresh, no need to notify user of errors
        console.debug("[Permission Refresh] Error refreshing permissions:", error);
      }
    };

    // Refresh immediately on mount
    void refreshPermissions();

    // Then refresh every 5 minutes
    const interval = setInterval(refreshPermissions, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session?.companyId]);

  // Keep URL path and document title in sync with the active view.
  // Uses pushState so the browser back button navigates between views.
  useEffect(() => {
    if (!session) return;
    const slug = toCompanySlug(session.companyName);
    const targetPath = view === "dashboard" ? `/${slug}` : `/${slug}/${view}`;

    // Human-readable view titles for the browser tab
    const viewTitles: Partial<Record<View, string>> = {
      dashboard:             "Dashboard",
      candidates:            "Candidates",
      "candidate-inquiries": "Inquiries",
      agents:                "Agents",
      suppliers:             "Suppliers",
      finance:               "Finance",
      accounts:              "Accounts",
      payments:              "Payments",
      paychecks:             "Paychecks",
      invoices:              "Invoices",
      passport:              "Passport Custody",
      documents:             "Documents",
      ai:                    "AI Assistant",
      reports:               "Reports",
      users:                 "Users & Roles",
      settings:              "Settings",
      contractors:           "Contractors",
      projects:              "Projects",
      tasks:                 "Tasks",
      communications:        "Communications",
      auditlog:              "Audit Log",
      attendance:            "Attendance",
      leave:                 "Leave",
      "human-resources":     "My HR Profile",
      "medical-appointments":"Medical Appointments",
      "medical-management":  "Medical Examinations",
      "hospital-management": "Hospital Management",
      requisitions:          "Requisitions",
      branches:              "Branches",
      approvals:             "Approvals",
      drive:                 "Drive",
    };

    const viewLabel = viewTitles[view] ?? view;
    document.title = `${viewLabel} — ${session.companyName} | Kilax Smart Recruit`;

    if (window.location.pathname !== targetPath) {
      const url = new URL(window.location.href);
      url.searchParams.delete("v");
      url.searchParams.delete("view");
      url.pathname = targetPath;
      window.history.pushState({ view, companySlug: slug }, "", url.toString());
    }
  }, [view, session]);

  // Sync URL when not logged in (auth views get their own paths)
  useEffect(() => {
    if (session) return;
    const authPaths: Record<string, string> = {
      login: "/login",
      register: "/register",
      landing: "/",
      invite: "/invite",
      "reset-password": "/reset-password",
      verify: "/register",
    };
    const titles: Record<string, string> = {
      login: "Sign In — Kilax Smart Recruit",
      register: "Register Your Company — Kilax Smart Recruit",
      landing: "Kilax Smart Recruit | Recruitment ERP",
      invite: "Accept Invitation — Kilax Smart Recruit",
      "reset-password": "Reset Password — Kilax Smart Recruit",
      verify: "Account Created — Kilax Smart Recruit",
    };
    document.title = titles[authView] ?? "Kilax Smart Recruit | Recruitment ERP";
    const targetPath = authPaths[authView] ?? "/login";
    // Don't overwrite special invite/recovery links that have query params
    const hasSpecialParams = window.location.search.includes("invite=1")
      || window.location.search.includes("view=reset-password")
      || window.location.hash.includes("type=");
    if (!hasSpecialParams && window.location.pathname !== targetPath) {
      window.history.pushState({ authView }, "", targetPath);
    }
  }, [authView, session]);

  // Handle browser back / forward buttons
  useEffect(() => {
    const validViews = new Set<string>(["dashboard","candidates","candidate-inquiries","agents","suppliers","jobs","interviews","offers","analytics","finance","accounts","payments","paychecks","passport","documents","ai","reports","users","settings","contractors","projects","invoices","tasks","communications","auditlog","attendance","leave","human-resources","medical-appointments","medical-management","hospital-management","branches","approvals","requisitions","drive"]);
    const authViewSet = new Set<string>(["login","register","invite","reset-password"]);
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as { view?: string; authView?: string; companySlug?: string } | null;
      // Resolve the view from either state or URL path
      const pathParts = window.location.pathname.replace(/^\//, "").split("/").filter(Boolean);
      const pathView = pathParts.length >= 2 ? pathParts[1] : pathParts[0] ?? "";
      const stateView = state?.view;
      const resolved = (stateView && validViews.has(stateView) ? stateView : null)
        ?? (validViews.has(pathView) ? pathView : null);
      if (resolved) {
        setView(resolved as View);
      } else if (pathParts.length === 1 && authViewSet.has(pathParts[0])) {
        setAuthView(pathParts[0] as "login" | "register" | "invite" | "reset-password");
      } else if (state?.authView && authViewSet.has(state.authView)) {
        setAuthView(state.authView as "login" | "register" | "invite" | "reset-password");
      } else if (!resolved) {
        setView("dashboard");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === session?.companyId) ?? companies[0],
    [companies, session],
  );

  const activeUser = useMemo(
    () => users.find((user) => user.id === session?.userId) ?? users[0],
    [session, users],
  );

  useEffect(() => {
    if (session && activeUser) {
      setRole(activeUser.role);
    }
  }, [activeUser, session]);

  const handleRegisterSubmit = (event: FormEvent) => {
    event.preventDefault();
    setRegisterError("Company provisioning must be completed by a platform administrator.");
  };

  const handleLoginSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email.trim(),
        password: loginForm.password,
      });
      if (error || !data.user) {
        setLoginError("Sign-in failed. Check your email and password.");
        return;
      }

      const workspace = await resolveUserWorkspace(data.user);
      setCompanies([workspace.company]);
      setUsers([workspace.user]);
      setRole(workspace.user.role);
      setSession(workspace.session);
      const mustChange = await checkMustChangePassword(workspace.user.id);
      setMustChangePassword(mustChange);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to load your company workspace.");
    }
  };

  const handleContinueWithGoogle = async () => {
    setLoginError("");
    try {
      const supabase = createSupabaseBrowserClient();
      window.sessionStorage.setItem("kilax.googleConnectGmail", "gmail");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) throw error;
    } catch (error) {
      window.sessionStorage.removeItem("kilax.googleConnectGmail");
      setLoginError(error instanceof Error ? error.message : "Unable to continue with Google.");
    }
  };

  const handlePasswordResetRequest = async () => {
    setLoginError("");
    setResetEmailMessage("");
    const email = loginForm.email.trim();
    if (!email) {
      setLoginError("Enter your email address first, then request a password reset.");
      return;
    }

    setResetEmailSending(true);
    try {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.search = "";
      redirectUrl.hash = "";
      redirectUrl.searchParams.set("view", "reset-password");
      const { error } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl.toString(),
      });
      if (error) throw error;
      setResetEmailMessage("If an account exists for that email, a password reset link has been sent.");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to send a password reset link.");
    } finally {
      setResetEmailSending(false);
    }
  };

  const handlePasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    setResetPasswordError("");
    if (resetPassword.length < 8) {
      setResetPasswordError("Choose a password with at least 8 characters.");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetPasswordError("The passwords do not match.");
      return;
    }

    setResetPasswordSaving(true);
    try {
      const { data, error } = await createSupabaseBrowserClient().auth.updateUser({ password: resetPassword });
      if (error || !data.user) {
        throw new Error(error?.message ?? "Unable to update your password. Request a new reset link and try again.");
      }
      const workspace = await resolveUserWorkspace(data.user);
      setCompanies([workspace.company]);
      setUsers([workspace.user]);
      setRole(workspace.user.role);
      setSession(workspace.session);
      setResetPassword("");
      setResetPasswordConfirm("");
      const completedUrl = new URL(window.location.href);
      completedUrl.searchParams.delete("view");
      completedUrl.searchParams.delete("code");
      completedUrl.hash = "";
      window.history.replaceState(null, "", `${completedUrl.pathname}${completedUrl.search}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update your password.";
      setResetPasswordError(message === "Auth session missing!"
        ? "Your password reset session has expired. Request a new password reset link."
        : message);
    } finally {
      setResetPasswordSaving(false);
    }
  };

  const handleAcceptInvitation = async (event: FormEvent) => {
    event.preventDefault();
    setInviteError("");
    if (invitePassword.length < 8) {
      setInviteError("Choose a password with at least 8 characters.");
      return;
    }
    if (invitePassword !== invitePasswordConfirm) {
      setInviteError("The passwords do not match.");
      return;
    }
    if (!inviteCompanyId) {
      setInviteError("This invitation has no valid company assignment. Ask the company administrator to resend it.");
      return;
    }

    setInviteSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your invitation session has expired. Open the latest invitation email to continue.");
      const validationResponse = await fetch(`/api/workspace/invitations/${encodeURIComponent(inviteId)}`, { cache: "no-store" });
      const validation = await validationResponse.json() as { error?: string };
      if (!validationResponse.ok) throw new Error(validation.error ?? "This invitation is invalid or has expired. Ask for a new invitation.");
      const { data, error } = await supabase.auth.updateUser({ password: invitePassword });
      if (error || !data.user) throw new Error(error?.message ?? "Unable to set your password.");

      const acceptanceResponse = await fetch(`/api/workspace/invitations/${encodeURIComponent(inviteId)}`, { method: "POST" });
      const acceptance = await acceptanceResponse.json() as { error?: string };
      if (!acceptanceResponse.ok) throw new Error(acceptance.error ?? "This invitation expired before it could be completed. Ask for a new invitation.");
      const workspace = await resolveUserWorkspace(data.user, inviteCompanyId);
      setCompanies([workspace.company]);
      setUsers([workspace.user]);
      setRole(workspace.user.role);
      setSession(workspace.session);
      setInvitePassword("");
      setInvitePasswordConfirm("");
      const completedUrl = new URL(window.location.href);
      completedUrl.searchParams.delete("invite");
      completedUrl.searchParams.delete("invitation_id");
      window.history.replaceState(null, "", `${completedUrl.pathname}${completedUrl.search}`);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Unable to finish your invitation.");
    } finally {
      setInviteSaving(false);
    }
  };

  const handleChangeForcedPassword = async (event: FormEvent) => {
    event.preventDefault();
    setForcedPasswordError("");
    if (forcedNewPassword.length < 8) {
      setForcedPasswordError("Your new password must be at least 8 characters.");
      return;
    }
    if (forcedNewPassword !== forcedNewPasswordConfirm) {
      setForcedPasswordError("The passwords do not match.");
      return;
    }

    setForcedPasswordSaving(true);
    try {
      const response = await fetch("/api/workspace/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: forcedNewPassword }),
      });
      const result = await response.json() as { error?: string; success?: boolean };
      if (!response.ok) throw new Error(result.error ?? "Unable to update your password.");
      setMustChangePassword(false);
      setForcedNewPassword("");
      setForcedNewPasswordConfirm("");
    } catch (error) {
      setForcedPasswordError(error instanceof Error ? error.message : "Unable to update your password.");
    } finally {
      setForcedPasswordSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } finally {
      setCompanies([]);
      setUsers([]);
      setSession(null);
    }
    setAuthView("login");
    setView("dashboard");
    setLoginError("");
    setRegisterError("");
  };

  const renderView = () => {
    // Guard: Check if the current view is allowed for this user's permissions
    if (session && !canAccessView(view, session.permissions)) {
      return <PageLoading />;
    }

    switch (view) {
      case "dashboard":
        return <Dashboard role={activeUser?.role ?? role} onNavigate={handleNavigate} />;
      case "candidates":
        return <Candidates page="pipeline" onNavigate={handleNavigate} />;
      case "candidate-inquiries":
        return <Candidates page="inquiries" onNavigate={handleNavigate} />;
      case "documents":
        return <CompanyDrive companyName={session?.companyName ?? ""} />;
      case "users":
        return <UsersRoles companyId={session?.companyId ?? ""} currentUserId={session?.userId ?? ""} />;
      case "agents":
        return <Agents />;
      case "finance":
        return <Finance />;
      case "accounts":
        return <AccountsWorkspace />;
      case "invoices":
        return <Invoices />;
      case "payments":
        return <Payments onOpenInvoices={() => handleNavigate("invoices")} />;
      case "paychecks":
        return <Paychecks />;
      case "suppliers":
        return <Suppliers />;
      case "contractors":
        return <Contractors />;
      case "projects":
        return <Projects />;
      case "attendance":
        return <Attendance />;
      case "leave":
        return <LeaveManagement />;
      case "human-resources":
        return <HumanResources isOwner={session?.role === "Chairman"} />;
      case "medical-appointments":
        return <MedicalAppointments />;
      case "medical-management":
        return <MedicalManagement />;
      case "hospital-management":
        return <HospitalManagement />;
      case "branches":
        return <Branches />;
      case "approvals":
        return <BranchApprovals />;
      case "requisitions":
        return <Requisitions />;
      case "tasks":
        return <Tasks />;
      case "communications":
        return <Communications userName={session?.userName ?? "Team"} companyName={session?.companyName ?? ""} userEmail={activeUser?.email ?? ""} />;
      case "ai":
        return <AIAssistant />;
      case "passport":
        return <PassportCustody companyName={session?.companyName ?? ""} onRegisterCandidate={() => handleNavigate("candidates")} />;
      case "settings":
        return <SettingsPage company={activeCompany} user={activeUser} />;
      default:
        return <DatabaseModulePending view={view} />;
    }
  };

  if (authLoading && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }} aria-busy="true">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 border-3 border-transparent border-t-blue-600 border-r-blue-600 rounded-full animate-spin"></div>
          </div>
          <p className="text-sm font-600" style={{ color: "var(--foreground)" }}>Loading your workspace…</p>
          <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Please wait while we set up your session</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthenticationExperience
        authView={authView}
        onSwitchView={setAuthView}
        companyForm={companyForm}
        onCompanyFormChange={setCompanyForm}
        onRegister={handleRegisterSubmit}
        registerError={registerError}
        loginForm={loginForm}
        onLoginFormChange={setLoginForm}
        onLogin={handleLoginSubmit}
        onGoogleContinue={handleContinueWithGoogle}
        loginError={loginError}
        onRequestPasswordReset={handlePasswordResetRequest}
        resetEmailSending={resetEmailSending}
        resetEmailMessage={resetEmailMessage}
        resetPassword={resetPassword}
        resetPasswordConfirm={resetPasswordConfirm}
        resetPasswordError={resetPasswordError}
        resetPasswordSaving={resetPasswordSaving}
        onResetPasswordChange={setResetPassword}
        onResetPasswordConfirmChange={setResetPasswordConfirm}
        onResetPassword={handlePasswordReset}
        resetPasswordEmail={resetPasswordEmail}
        inviteEmail={inviteEmail}
        inviteCompanyName={inviteCompanyName}
        inviteRoleName={inviteRoleName}
        invitePassword={invitePassword}
        invitePasswordConfirm={invitePasswordConfirm}
        inviteError={inviteError}
        inviteSaving={inviteSaving}
        onInvitePasswordChange={setInvitePassword}
        onInvitePasswordConfirmChange={setInvitePasswordConfirm}
        onAcceptInvitation={handleAcceptInvitation}
        onContinueDemo={() => setAuthView("login")}
      />
    );
  }

  if (!session.onboarded) {
    return (
      <OnboardingWizard
        company={activeCompany}
        user={activeUser}
        step={wizardStep}
        onStepChange={setWizardStep}
        onComplete={() => {
          setSession((current) => (current ? { ...current, onboarded: true } : current));
          setView("dashboard");
        }}
      />
    );
  }

  return (
    <div data-theme={theme} data-density={density} className="app-shell flex h-dvh min-h-0 w-full overflow-hidden" style={{ background: "var(--background)" }}>
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}
      <Sidebar
        active={view}
        onNavigate={handleSidebarNavigate}
        onPrefetch={preloadView}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        role={activeUser?.role ?? role}
        userName={session.userName}
        companyName={session.companyName}
        companyLogo={session.companyLogo}
        branchName={session.branchName}
        isMainBranchUser={session.isMainBranchUser}
        permissions={session.permissions}
        onLogout={handleLogout}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setMobileNavOpen(true)}
          onNavigate={handleNavigate}
          role={activeUser?.role ?? role}
          theme={theme}
          onThemeChange={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          density={density}
          onDensityChange={() => setDensity((current) => (current === "compact" ? "comfortable" : "compact"))}
          companyName={session.companyName}
          companyLogo={session.companyLogo}
          userName={session.userName}
          userEmail={activeUser?.email}
          userAvatarUrl={session.userAvatarUrl}
        />
        <OfflineBanner />

        {/* Forced password change overlay (first-login after admin creates user with default password) */}
        {mustChangePassword && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" style={{ background: "rgba(0,0,0,0.6)" }}>
            <div className="w-full max-w-md rounded-2xl border p-8 shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--muted-foreground)" }}>Security required</div>
              <h2 className="mt-2 text-2xl font-700" style={{ color: "var(--foreground)" }}>Change your password</h2>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Your administrator set a temporary password for your account. Please change it to a secure password of your choice before continuing.</p>

              <form onSubmit={handleChangeForcedPassword} className="mt-6 space-y-4">
                <label className="block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                  New password
                  <div className="relative mt-1">
                    <input
                      required
                      minLength={8}
                      type={forcedShowPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={forcedNewPassword}
                      onChange={(e) => setForcedNewPassword(e.target.value)}
                      className="w-full rounded border px-3 py-2.5 pr-10 text-sm font-normal normal-case tracking-normal outline-none"
                      style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                    />
                    <button
                      type="button"
                      aria-label={forcedShowPassword ? "Hide password" : "Show password"}
                      onClick={() => setForcedShowPassword(!forcedShowPassword)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {forcedShowPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>
                <label className="block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                  Confirm new password
                  <input
                    required
                    minLength={8}
                    type={forcedShowPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={forcedNewPasswordConfirm}
                    onChange={(e) => setForcedNewPasswordConfirm(e.target.value)}
                    className="mt-1 w-full rounded border px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                </label>
                {forcedPasswordError && (
                  <div role="alert" className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {forcedPasswordError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={forcedPasswordSaving}
                  className="w-full rounded px-4 py-3 font-600 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  {forcedPasswordSaving ? "Updating…" : "Update password and continue"}
                </button>
              </form>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-auto">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

function AuthenticationExperience({
  authView,
  onSwitchView,
  companyForm,
  onCompanyFormChange,
  onRegister,
  registerError,
  loginForm,
  onLoginFormChange,
  onLogin,
  onGoogleContinue,
  loginError,
  onRequestPasswordReset,
  resetEmailSending,
  resetEmailMessage,
  resetPassword,
  resetPasswordConfirm,
  resetPasswordEmail,
  resetPasswordError,
  resetPasswordSaving,
  onResetPasswordChange,
  onResetPasswordConfirmChange,
  onResetPassword,
  inviteEmail,
  inviteCompanyName,
  inviteRoleName,
  invitePassword,
  invitePasswordConfirm,
  inviteError,
  inviteSaving,
  onInvitePasswordChange,
  onInvitePasswordConfirmChange,
  onAcceptInvitation,
  onContinueDemo,
}: {
  authView: "landing" | "login" | "register" | "verify" | "invite" | "reset-password";
  onSwitchView: (view: "landing" | "login" | "register" | "verify" | "invite" | "reset-password") => void;
  companyForm: CompanyForm;
  onCompanyFormChange: (next: CompanyForm) => void;
  onRegister: (event: FormEvent) => void;
  registerError: string;
  loginForm: { email: string; password: string };
  onLoginFormChange: (next: { email: string; password: string }) => void;
  onLogin: (event: FormEvent) => void;
  onGoogleContinue: () => void;
  loginError: string;
  onRequestPasswordReset: () => void;
  resetEmailSending: boolean;
  resetEmailMessage: string;
  resetPassword: string;
  resetPasswordConfirm: string;
  resetPasswordEmail: string;
  resetPasswordError: string;
  resetPasswordSaving: boolean;
  onResetPasswordChange: (password: string) => void;
  onResetPasswordConfirmChange: (password: string) => void;
  onResetPassword: (event: FormEvent) => void;
  inviteEmail: string;
  inviteCompanyName: string;
  inviteRoleName: string;
  invitePassword: string;
  invitePasswordConfirm: string;
  inviteError: string;
  inviteSaving: boolean;
  onInvitePasswordChange: (password: string) => void;
  onInvitePasswordConfirmChange: (password: string) => void;
  onAcceptInvitation: (event: FormEvent) => void;
  onContinueDemo: () => void;
}) {
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
  const formInputStyle = {
    background: "var(--secondary)",
    borderColor: "var(--border)",
    color: "var(--foreground)",
  } as const;

  if (authView === "invite") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: "var(--background)" }}>
        <div className="w-full max-w-md border p-8" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-6">
            <KilaxWordmark />
          </div>
          <div className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Company invitation</div>
          <h1 className="mt-2 text-2xl font-700" style={{ color: "var(--foreground)" }}>Set up your password</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Your invitation is for this company and position.</p>
          <dl className="mt-4 divide-y border-y" style={{ borderColor: "var(--border)" }}>
            <div className="flex justify-between gap-4 py-3"><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Company</dt><dd className="text-right text-sm font-600" style={{ color: "var(--foreground)" }}>{inviteCompanyName || "Verifying invitation…"}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Assigned role</dt><dd className="text-right text-sm font-600" style={{ color: "var(--foreground)" }}>{inviteRoleName || "Verifying invitation…"}</dd></div>
          </dl>
          {inviteEmail && <p className="mt-4 border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>{inviteEmail}</p>}
          <form onSubmit={onAcceptInvitation} className="mt-5 space-y-4">
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>New password<input required minLength={8} type="password" autoComplete="new-password" value={invitePassword} onChange={(event) => onInvitePasswordChange(event.target.value)} className="mt-1 w-full border px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none" style={formInputStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Confirm password<input required minLength={8} type="password" autoComplete="new-password" value={invitePasswordConfirm} onChange={(event) => onInvitePasswordConfirmChange(event.target.value)} className="mt-1 w-full border px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none" style={formInputStyle} /></label>
            {inviteError && <div role="alert" className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{inviteError}</div>}
            <button type="submit" disabled={inviteSaving} className="w-full px-4 py-3 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{inviteSaving ? "Setting password…" : "Set password and continue"}</button>
          </form>
        </div>
      </div>
    );
  }

  if (authView === "reset-password") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: "var(--background)" }}>
        <div className="w-full max-w-md rounded-2xl border p-8 shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-6">
            <KilaxWordmark />
          </div>
          <div className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--muted-foreground)" }}>Account recovery</div>
          <h1 className="mt-2 text-2xl font-700" style={{ color: "var(--foreground)" }}>Choose a new password</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {resetPasswordEmail ? `Set a new password for ${resetPasswordEmail}.` : "Enter and confirm your new password."}
          </p>
          <form onSubmit={onResetPassword} className="mt-6 space-y-4">
            <label className="block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
              New password
              <div className="relative mt-1">
                <input required minLength={8} type={showResetPassword ? "text" : "password"} autoComplete="new-password" value={resetPassword} onChange={(event) => onResetPasswordChange(event.target.value)} className="w-full rounded border px-3 py-2.5 pr-10 text-sm font-normal normal-case tracking-normal outline-none" style={formInputStyle} />
                <button type="button" aria-label={showResetPassword ? "Hide password" : "Show password"} aria-pressed={showResetPassword} onClick={() => setShowResetPassword(!showResetPassword)} className="absolute inset-y-0 right-0 flex items-center px-3" style={{ color: "var(--muted-foreground)" }}>
                  {showResetPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </label>
            <label className="block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
              Confirm new password
              <div className="relative mt-1">
                <input required minLength={8} type={showResetPasswordConfirm ? "text" : "password"} autoComplete="new-password" value={resetPasswordConfirm} onChange={(event) => onResetPasswordConfirmChange(event.target.value)} className="w-full rounded border px-3 py-2.5 pr-10 text-sm font-normal normal-case tracking-normal outline-none" style={formInputStyle} />
                <button type="button" aria-label={showResetPasswordConfirm ? "Hide password" : "Show password"} aria-pressed={showResetPasswordConfirm} onClick={() => setShowResetPasswordConfirm(!showResetPasswordConfirm)} className="absolute inset-y-0 right-0 flex items-center px-3" style={{ color: "var(--muted-foreground)" }}>
                  {showResetPasswordConfirm ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </label>
            {resetPasswordError && <div role="alert" className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{resetPasswordError}</div>}
            <button type="submit" disabled={resetPasswordSaving} className="w-full rounded px-4 py-3 font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              {resetPasswordSaving ? "Updating password…" : "Update password and sign in"}
            </button>
            <button type="button" onClick={() => onSwitchView("login")} className="w-full py-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Back to login
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (authView === "landing") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6" style={{ background: "radial-gradient(circle at top, rgba(0,100,255,0.10), transparent 30%), var(--background)" }}>
        <div className="w-full max-w-6xl grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border p-8 shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mb-6">
              <KilaxWordmark />
            </div>
            <div className="mb-6 inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-700 uppercase tracking-[0.22em]" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--primary)" }}>
              Multi-tenant ERP platform
            </div>
            <h1 className="text-4xl font-700 leading-tight" style={{ color: "var(--foreground)" }}>
              Every company gets its own secure workspace.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7" style={{ color: "var(--muted-foreground)" }}>
              Recruit and manage talent across independent recruitment companies without data mixing. One registration creates one company workspace and one primary administrator.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Company isolation", value: "100%" },
                { label: "Role-based access", value: "Granular" },
                { label: "Finance & visa ops", value: "Unified" },
              ].map((item) => (
                <div key={item.label} className="rounded border p-4" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
                  <div className="text-2xl font-700 mono" style={{ color: "var(--primary)" }}>{item.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{item.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => onSwitchView("register")} className="px-5 py-3 rounded font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                Register Your Company
              </button>
              <button onClick={() => onSwitchView("login")} className="px-5 py-3 rounded border font-600" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
                Log In
              </button>
            </div>
          </div>

          <div className="rounded-3xl border p-8" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mb-5 flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Platform access</span>
              <span className="rounded-full border px-2 py-1 text-[10px] font-700 uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>Secure</span>
            </div>
            <div className="space-y-4">
              <div className="rounded border p-4" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Primary admin</div>
                <div className="mt-2 text-lg font-700" style={{ color: "var(--foreground)" }}>Aisha Khan</div>
                <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Owner / Primary Admin</div>
              </div>
              <div className="rounded border p-4" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Workspace</div>
                <div className="mt-2 text-lg font-700" style={{ color: "var(--foreground)" }}>Kilax Smart Recruit Demo</div>
                <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Status: Active</div>
              </div>
              <button onClick={onContinueDemo} className="w-full px-4 py-3 rounded font-600" style={{ background: "var(--secondary)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                Continue to demo owner workspace
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authView === "login") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: "var(--background)" }}>
        <div className="w-full max-w-md rounded-2xl border p-8 shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-6">
            <KilaxWordmark />
          </div>
          <div className="mb-1 text-xs uppercase tracking-[0.22em]" style={{ color: "var(--muted-foreground)" }}>Welcome back</div>
          <h2 className="mb-5 text-2xl font-700" style={{ color: "var(--foreground)" }}>Log in to your workspace</h2>

          <form onSubmit={onLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Email</label>
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) => onLoginFormChange({ ...loginForm, email: event.target.value })}
                className="w-full rounded border px-3 py-2.5 outline-none"
                style={formInputStyle}
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Password</label>
              <div className="relative">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  value={loginForm.password}
                  onChange={(event) => onLoginFormChange({ ...loginForm, password: event.target.value })}
                  className="w-full rounded border px-3 py-2.5 pr-10 outline-none"
                  style={formInputStyle}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                  aria-pressed={showLoginPassword}
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute inset-y-0 right-0 flex items-center px-3"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {showLoginPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onRequestPasswordReset} disabled={resetEmailSending} className="text-xs font-600 disabled:opacity-50" style={{ color: "var(--primary)" }}>
                {resetEmailSending ? "Sending reset link…" : "Forgot password?"}
              </button>
            </div>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t" style={{ borderColor: "var(--border)" }} /></div>
              <div className="relative flex justify-center"><span className="px-2 text-[10px] font-700 uppercase tracking-[0.2em]" style={{ background: "var(--card)", color: "var(--muted-foreground)" }}>or</span></div>
            </div>
            <button type="button" onClick={onGoogleContinue} className="flex w-full items-center justify-center gap-2 rounded border px-4 py-3 font-600" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-800" style={{ background: "#fff", color: "#1f2937" }}>G</span>
              Continue with Google
            </button>
            {resetEmailMessage && <div role="status" className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">{resetEmailMessage}</div>}
            {loginError ? <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm" style={{ color: "#fca5a5" }}>{loginError}</div> : null}
            <div className="flex items-center justify-between text-sm" style={{ color: "var(--muted-foreground)" }}>
              <span className="text-xs">Company access is assigned by a platform administrator.</span>
            </div>
            <button type="submit" className="w-full rounded px-4 py-3 font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              Log In
            </button>
            <div className="pt-1 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
              Need an account? <button type="button" onClick={() => onSwitchView("register")} className="font-600" style={{ color: "var(--primary)" }}>Create account</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (authView === "verify") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: "var(--background)" }}>
        <div className="w-full max-w-xl rounded-2xl border p-8 shadow-2xl text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-6 flex justify-center">
            <KilaxLogo size={72} />
          </div>
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-2xl" style={{ background: "rgba(16,185,129,0.14)", color: "#34d399" }}>✓</div>
          <div className="text-xs font-700 uppercase tracking-[0.22em]" style={{ color: "var(--muted-foreground)" }}>Account created</div>
          <h2 className="mt-3 text-3xl font-700" style={{ color: "var(--foreground)" }}>Your company workspace is ready.</h2>
          <p className="mt-3 text-base leading-7" style={{ color: "var(--muted-foreground)" }}>
            The person registering this company becomes the Primary Administrator and has full control over the company account.
          </p>
          <div className="mt-6 rounded border p-4 text-left" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Email verification</div>
            <div className="mt-2 text-lg font-700" style={{ color: "var(--foreground)" }}>{companyForm.adminEmail || "admin@company.com"}</div>
            <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Verification link sent. Continue to first-time setup.</div>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button onClick={() => onSwitchView("login")} className="px-5 py-3 rounded border font-600" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
              Go to login
            </button>
            <button onClick={() => onSwitchView("landing")} className="px-5 py-3 rounded font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              Continue to dashboard setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-4xl rounded-3xl border p-8 shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="mb-4">
              <KilaxWordmark />
            </div>
            <div className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--muted-foreground)" }}>Platform onboarding</div>
            <h2 className="mt-2 text-3xl font-700" style={{ color: "var(--foreground)" }}>Register Your Company</h2>
          </div>
          <button onClick={() => onSwitchView("landing")} className="rounded border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
            Back
          </button>
        </div>

        <form onSubmit={onRegister} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="mb-2 text-sm font-600" style={{ color: "var(--foreground)" }}>The person registering this company becomes the Primary Administrator and will have full administrative control over the company account.</div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Company Name</label>
              <input value={companyForm.companyName} onChange={(event) => onCompanyFormChange({ ...companyForm, companyName: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Company Registration Number</label>
              <input value={companyForm.registrationNumber} onChange={(event) => onCompanyFormChange({ ...companyForm, registrationNumber: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Country</label>
              <input value={companyForm.country} onChange={(event) => onCompanyFormChange({ ...companyForm, country: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>City</label>
              <input value={companyForm.city} onChange={(event) => onCompanyFormChange({ ...companyForm, city: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Office Address</label>
              <input value={companyForm.officeAddress} onChange={(event) => onCompanyFormChange({ ...companyForm, officeAddress: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Company Phone</label>
              <input value={companyForm.phone} onChange={(event) => onCompanyFormChange({ ...companyForm, phone: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Company Email</label>
              <input type="email" value={companyForm.email} onChange={(event) => onCompanyFormChange({ ...companyForm, email: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Website</label>
              <input value={companyForm.website} onChange={(event) => onCompanyFormChange({ ...companyForm, website: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Company Logo</label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed px-3 py-3 transition-colors hover:border-current" style={{ borderColor: companyForm.logoPreview ? "var(--primary)" : "var(--border)", color: "var(--muted-foreground)" }}>
                {companyForm.logoPreview ? (
                  <img src={companyForm.logoPreview} alt="Logo preview" className="h-14 w-14 rounded object-contain" />
                ) : (
                  <span className="text-sm">Click to upload logo (PNG, JPG, SVG)</span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const preview = URL.createObjectURL(file);
                    onCompanyFormChange({ ...companyForm, logoFile: file, logoPreview: preview });
                  }}
                />
              </label>
              {companyForm.logoPreview && (
                <button
                  type="button"
                  className="mt-1 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                  onClick={() => onCompanyFormChange({ ...companyForm, logoFile: undefined, logoPreview: undefined })}
                >
                  Remove
                </button>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Full Name</label>
              <input value={companyForm.fullName} onChange={(event) => onCompanyFormChange({ ...companyForm, fullName: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Position / Title</label>
              <input value={companyForm.position} onChange={(event) => onCompanyFormChange({ ...companyForm, position: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Email Address</label>
              <input type="email" value={companyForm.adminEmail} onChange={(event) => onCompanyFormChange({ ...companyForm, adminEmail: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Phone Number</label>
              <input value={companyForm.adminPhone} onChange={(event) => onCompanyFormChange({ ...companyForm, adminPhone: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Password</label>
              <div className="relative">
                <input type={showRegisterPassword ? "text" : "password"} value={companyForm.password} onChange={(event) => onCompanyFormChange({ ...companyForm, password: event.target.value })} className="w-full rounded border px-3 py-2.5 pr-10 outline-none" style={formInputStyle} />
                <button type="button" aria-label={showRegisterPassword ? "Hide password" : "Show password"} aria-pressed={showRegisterPassword} onClick={() => setShowRegisterPassword(!showRegisterPassword)} className="absolute inset-y-0 right-0 flex items-center px-3" style={{ color: "var(--muted-foreground)" }}>
                  {showRegisterPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Confirm Password</label>
              <div className="relative">
                <input type={showRegisterConfirmPassword ? "text" : "password"} value={companyForm.confirmPassword} onChange={(event) => onCompanyFormChange({ ...companyForm, confirmPassword: event.target.value })} className="w-full rounded border px-3 py-2.5 pr-10 outline-none" style={formInputStyle} />
                <button type="button" aria-label={showRegisterConfirmPassword ? "Hide password" : "Show password"} aria-pressed={showRegisterConfirmPassword} onClick={() => setShowRegisterConfirmPassword(!showRegisterConfirmPassword)} className="absolute inset-y-0 right-0 flex items-center px-3" style={{ color: "var(--muted-foreground)" }}>
                  {showRegisterConfirmPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>

          {registerError ? <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm" style={{ color: "#fca5a5" }}>{registerError}</div> : null}

          <div className="flex items-center gap-3 pt-2">
            <input type="checkbox" className="h-4 w-4" />
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>I agree to the terms and understand the company account will be owned by the Primary Administrator.</span>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="px-5 py-3 rounded font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              Create Company Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex shrink-0 items-center gap-2 px-4 py-2 text-sm font-600"
      style={{ background: "#78350f", color: "#fef3c7", borderBottom: "1px solid #92400e" }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      You are offline — check your internet connection. Changes you make may not be saved.
    </div>
  );
}

function DatabaseModulePending({ view }: { view: View }) {
  const label = view.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

  return (
    <section className="mx-auto max-w-3xl p-8" aria-labelledby="module-title">
      <p className="text-xs font-700 uppercase" style={{ color: "var(--muted-foreground)" }}>Live data unavailable</p>
      <h1 id="module-title" className="mt-2 text-2xl font-700" style={{ color: "var(--foreground)" }}>{label}</h1>
      <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
        This module is not connected to company database records yet.
      </p>
    </section>
  );
}

function OnboardingWizard({
  company,
  user,
  step,
  onStepChange,
  onComplete,
}: {
  company?: CompanyProfile;
  user?: CompanyUser;
  step: number;
  onStepChange: (next: number) => void;
  onComplete: () => void;
}) {
  const [logoPreview, setLogoPreview] = useState<string | undefined>(company?.logo || undefined);
  const steps = [
    { title: "Company Profile", subtitle: "Complete your company information and registration details." },
    { title: "Recruitment Setup", subtitle: "Configure candidate stages, statuses, and categories." },
    { title: "Finance Setup", subtitle: "Define currencies, payment methods, and invoice settings." },
    { title: "Users", subtitle: "Invite your team and assign their roles." },
    { title: "Complete", subtitle: "Your company workspace is ready for recruitment operations." },
  ];

  const currentStep = Math.min(step, steps.length - 1);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-4xl rounded-3xl border p-8 shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--muted-foreground)" }}>First-time setup</div>
            <h2 className="mt-2 text-3xl font-700" style={{ color: "var(--foreground)" }}>{steps[currentStep].title}</h2>
          </div>
          <div className="rounded-full border px-3 py-1 text-xs font-700 uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>
            Step {currentStep + 1} of {steps.length}
          </div>
        </div>

        <div className="mb-8 flex gap-2">
          {steps.map((item, index) => (
            <div key={item.title} className="h-2 flex-1 rounded-full" style={{ background: index <= currentStep ? "var(--primary)" : "var(--secondary)" }} />
          ))}
        </div>

        <div className="rounded border p-5 mb-6" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{steps[currentStep].subtitle}</div>
          <div className="mt-4 text-2xl font-700" style={{ color: "var(--foreground)" }}>{company?.name ?? "Company Workspace"}</div>
          <div className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{user?.name ?? "Primary Admin"} · Owner / Primary Admin</div>
        </div>

        {currentStep === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Company Logo</label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed px-3 py-4 transition-colors hover:border-current" style={{ borderColor: logoPreview ? "var(--primary)" : "var(--border)", color: "var(--muted-foreground)" }}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="h-16 w-16 rounded object-contain" />
                ) : (
                  <span className="text-sm">Click to upload company logo</span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setLogoPreview(URL.createObjectURL(file));
                  }}
                />
              </label>
              {logoPreview && (
                <button type="button" className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }} onClick={() => setLogoPreview(undefined)}>
                  Remove
                </button>
              )}
            </div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Registration number</label><input defaultValue={company?.registrationNumber ?? ""} className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Address</label><input defaultValue={company?.officeAddress ?? ""} className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Phone</label><input defaultValue={company?.phone ?? ""} className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Email</label><input defaultValue={company?.email ?? ""} className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Website</label><input defaultValue={company?.website ?? ""} className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Recruitment stages</label><input defaultValue="Application, Screening, Interview, Offer, Placement" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Candidate statuses</label><input defaultValue="Active, Shortlisted, Hired, Withdrawn" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Job categories</label><input defaultValue="Engineering, Sales, Finance, Support" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Document categories</label><input defaultValue="Passport, Medical, Education, Police" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Currency</label><input defaultValue={company?.currency ?? "USD"} className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment methods</label><input defaultValue="Bank Transfer, Mobile Money, Cash" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Income categories</label><input defaultValue="Placement Fees, Consultancy, Sponsor Fees" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Expense categories</label><input defaultValue="Travel, Medical, Payroll, Admin" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="rounded border p-4" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-700" style={{ color: "var(--foreground)" }}>Invite Team Members</div>
                <button className="rounded border px-3 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>+ Add member</button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <input defaultValue="Aisha Khan" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                <input defaultValue="owner@kilaxrecruit.com" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                <input defaultValue="Company Owner / Primary Admin" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </div>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-2xl" style={{ background: "rgba(245,158,11,0.12)", color: "var(--primary)" }}>✓</div>
            <h3 className="text-3xl font-700" style={{ color: "var(--foreground)" }}>Your company workspace is ready.</h3>
            <p className="mt-3 text-base" style={{ color: "var(--muted-foreground)" }}>Invite employees, configure roles, and start recruiting against the active company workspace.</p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button onClick={() => onStepChange(Math.max(0, currentStep - 1))} className="rounded border px-4 py-2 text-sm font-600" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
            Back
          </button>
          <div className="flex gap-3">
            <button onClick={() => onStepChange(currentStep === steps.length - 1 ? steps.length - 1 : currentStep + 1)} className="rounded border px-4 py-2 text-sm font-600" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
              Skip
            </button>
            <button onClick={currentStep === steps.length - 1 ? onComplete : () => onStepChange(currentStep + 1)} className="rounded px-5 py-2.5 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              {currentStep === steps.length - 1 ? "Launch Dashboard" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ company, user }: { company?: CompanyProfile; user?: CompanyUser }) {
  const [settingsTab, setSettingsTab] = useState<"general" | "departments" | "currencies" | "service-providers">("general");

  const permissionRows = [
    ["Candidates", "View / Create / Edit / Approve", "Recruitment Agent"],
    ["Finance", "View only", "Recruitment Agent"],
    ["Users", "No access", "Recruitment Agent"],
    ["Invoices", "View / Edit / Export", "Finance Manager"],
    ["Passport Custody", "View / Approve", "Document Officer"],
  ];

  const tabs: { id: typeof settingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "departments", label: "Departments" },
    { id: "currencies", label: "Currencies" },
    { id: "service-providers", label: "Service Providers" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Settings header */}
      <div className="shrink-0 px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="text-xs uppercase tracking-[0.20em]" style={{ color: "var(--muted-foreground)" }}>Company settings</div>
          <h1 className="mt-1 text-2xl font-700" style={{ color: "var(--foreground)" }}>Settings</h1>
        </div>
        <div className="rounded-full border px-3 py-1 text-[10px] font-700 uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>
          {user?.role ?? "Chairman"}
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setSettingsTab(t.id)}
            className="px-5 py-3 text-sm font-600 transition-colors"
            style={{
              color: settingsTab === t.id ? "var(--primary)" : "var(--muted-foreground)",
              borderBottom: settingsTab === t.id ? "2px solid var(--primary)" : "2px solid transparent",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {settingsTab === "general" && (
          <div className="p-8 max-w-5xl mx-auto">
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="mb-4 text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Company</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      ["Company Name", company?.name ?? ""],
                      ["Registration Number", company?.registrationNumber ?? ""],
                      ["Country", company?.country ?? ""],
                      ["City", company?.city ?? ""],
                      ["Phone", company?.phone ?? ""],
                      ["Email", company?.email ?? ""],
                      ["Website", company?.website ?? ""],
                      ["Currency", company?.currency ?? "USD"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{label}</label>
                        <input defaultValue={String(value)} className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="mb-4 text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Permissions matrix</div>
                  <div className="overflow-hidden rounded border" style={{ borderColor: "var(--border)" }}>
                    <table className="w-full text-left text-sm">
                      <thead style={{ background: "var(--secondary)" }}>
                        <tr>
                          <th className="px-3 py-2 font-600" style={{ color: "var(--foreground)" }}>Module</th>
                          <th className="px-3 py-2 font-600" style={{ color: "var(--foreground)" }}>Permission</th>
                          <th className="px-3 py-2 font-600" style={{ color: "var(--foreground)" }}>Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {permissionRows.map(([module, permission, roleName]) => (
                          <tr key={module} className="border-t" style={{ borderColor: "var(--border)" }}>
                            <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{module}</td>
                            <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{permission}</td>
                            <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{roleName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="mb-4 text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Primary admin</div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full font-700" style={{ background: "var(--secondary)", color: "var(--primary)" }}>
                      {formatInitials(user?.name ?? "Owner User")}
                    </div>
                    <div>
                      <div className="font-700" style={{ color: "var(--foreground)" }}>{user?.name ?? "Primary Admin"}</div>
                      <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{user?.title ?? "Chairman"}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="mb-4 text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Audit log</div>
                  {[
                    "Company profile updated",
                    "Security policy applied",
                    "Primary admin role confirmed",
                    "Recruitment stages configured",
                  ].map((entry) => (
                    <div key={entry} className="mb-3 rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                      {entry}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {settingsTab === "departments" && <DepartmentsSettings />}
        {settingsTab === "currencies" && <CurrenciesSettings />}
        {settingsTab === "service-providers" && <ServiceProvidersSettings />}
      </div>
    </div>
  );
}
