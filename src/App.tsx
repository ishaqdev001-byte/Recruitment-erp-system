"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Dashboard from "./components/LiveDashboard";
import Candidates from "./components/CandidateRoster";
import UsersRoles from "./components/UsersRoles";
import Agents from "./components/Agents";
import Finance from "./components/Finance";
import Invoices from "./components/InvoiceWorkspace";
import Suppliers from "./components/Suppliers";
import Contractors from "./components/Employers";
import Projects from "./components/Projects";
import { createSupabaseBrowserClient } from "./lib/supabase/browser";

export type View =
  | "dashboard"
  | "candidates"
  | "agents"
  | "suppliers"
  | "jobs"
  | "interviews"
  | "offers"
  | "analytics"
  | "finance"
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
  | "auditlog";

export type WorkspaceRole =
  | "Company Owner / Primary Administrator"
  | "Recruitment Manager"
  | "Recruitment Agent"
  | "Finance Manager"
  | "Finance Officer"
  | "Document Officer"
  | "Medical Officer"
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
};

const formatInitials = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "R";

async function resolveUserWorkspace(user: User) {
  const supabase = createSupabaseBrowserClient();
  const { data: membership, error } = await supabase
    .from("company_memberships")
    .select("company_id, company:companies!inner(id, name, status, logo_url, registration_number, country, city, office_address, phone, email, website), role:company_roles!inner(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Unable to load your company membership. Check the Supabase migration and RLS policies.");
  if (!membership) throw new Error("Your Supabase account has no active company membership yet.");

  const companyValue = membership.company as unknown as { id: string; name: string; status: string; logo_url: string; registration_number: string; country: string; city: string; office_address: string; phone: string; email: string; website: string } | { id: string; name: string; status: string; logo_url: string; registration_number: string; country: string; city: string; office_address: string; phone: string; email: string; website: string }[];
  const companyRecord = Array.isArray(companyValue) ? companyValue[0] : companyValue;
  const roleValue = membership.role as unknown as { name: string } | { name: string }[];
  const roleRecord = Array.isArray(roleValue) ? roleValue[0] : roleValue;
  if (!companyRecord || !roleRecord) throw new Error("Your company membership is incomplete.");

  const knownRoles: WorkspaceRole[] = [
    "Company Owner / Primary Administrator", "Recruitment Manager", "Recruitment Agent",
    "Finance Manager", "Finance Officer", "Document Officer", "Medical Officer", "Viewer",
    "Administrator", "Manager", "Finance User",
  ];
  const role = knownRoles.find((candidateRole) => candidateRole === roleRecord.name) ?? roleRecord.name as WorkspaceRole;
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
    } satisfies Session,
  };
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [role, setRole] = useState<WorkspaceRole>("Company Owner / Primary Administrator");
  const [theme, setTheme] = useState<Theme>("dark");
  const [density, setDensity] = useState<Density>("comfortable");
  const [preferencesReady, setPreferencesReady] = useState(false);

  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authView, setAuthView] = useState<"landing" | "login" | "register" | "verify">("login");
  const [authLoading, setAuthLoading] = useState(true);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerError, setRegisterError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [wizardStep, setWizardStep] = useState(0);

  useEffect(() => {
    for (const key of ["recruitos.companies", "recruitos.users", "recruitos.session"]) {
      window.localStorage.removeItem(key);
    }
    const preferences = window.localStorage.getItem("recruitos.workspace-preferences");
    if (preferences) {
      try {
        const saved = JSON.parse(preferences) as Partial<{ theme: Theme; density: Density }>;
        if (saved.theme === "light" || saved.theme === "dark") setTheme(saved.theme);
        if (saved.density === "compact" || saved.density === "comfortable") setDensity(saved.density);
      } catch {
        window.localStorage.removeItem("recruitos.workspace-preferences");
      }
    }
    setPreferencesReady(true);

    let cancelled = false;
    const restoreSession = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (user) {
          const workspace = await resolveUserWorkspace(user);
          if (!cancelled) {
            setCompanies([workspace.company]);
            setUsers([workspace.user]);
            setSession(workspace.session);
            setRole(workspace.user.role);
          }
        }
      } catch (error) {
        if (!cancelled && error instanceof Error && error.message !== "Auth session missing!") {
          setLoginError(error.message);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    void restoreSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (preferencesReady) {
      window.localStorage.setItem("recruitos.workspace-preferences", JSON.stringify({ role, theme, density }));
    }
  }, [density, preferencesReady, role, theme]);

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
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to load your company workspace.");
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
    switch (view) {
      case "dashboard":
        return <Dashboard role={activeUser?.role ?? role} onNavigate={setView} />;
      case "candidates":
        return <Candidates />;
      case "users":
        return <UsersRoles companyId={session?.companyId ?? ""} currentUserId={session?.userId ?? ""} />;
      case "agents":
        return <Agents />;
      case "finance":
        return <Finance />;
      case "invoices":
        return <Invoices />;
      case "suppliers":
        return <Suppliers />;
      case "contractors":
        return <Contractors />;
      case "projects":
        return <Projects />;
      default:
        return <DatabaseModulePending view={view} />;
    }
  };

  if (authLoading && !session) {
    return <div className="min-h-screen" style={{ background: "var(--background)" }} aria-busy="true" />;
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
        loginError={loginError}
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
        onNavigate={(nextView) => { setView(nextView); setMobileNavOpen(false); }}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        role={activeUser?.role ?? role}
        userName={session.userName}
        companyName={session.companyName}
        companyLogo={session.companyLogo}
        onLogout={handleLogout}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setMobileNavOpen(true)}
          onNavigate={setView}
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
  loginError,
  onContinueDemo,
}: {
  authView: "landing" | "login" | "register" | "verify";
  onSwitchView: (view: "landing" | "login" | "register" | "verify") => void;
  companyForm: CompanyForm;
  onCompanyFormChange: (next: CompanyForm) => void;
  onRegister: (event: FormEvent) => void;
  registerError: string;
  loginForm: { email: string; password: string };
  onLoginFormChange: (next: { email: string; password: string }) => void;
  onLogin: (event: FormEvent) => void;
  loginError: string;
  onContinueDemo: () => void;
}) {
  const formInputStyle = {
    background: "var(--secondary)",
    borderColor: "var(--border)",
    color: "var(--foreground)",
  } as const;

  if (authView === "landing") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6" style={{ background: "radial-gradient(circle at top, rgba(245,158,11,0.14), transparent 30%), var(--background)" }}>
        <div className="w-full max-w-6xl grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border p-8 shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
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
                <div className="mt-2 text-lg font-700" style={{ color: "var(--foreground)" }}>RecruitOS Uganda Ltd</div>
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
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--muted-foreground)" }}>Welcome back</div>
              <h2 className="mt-2 text-2xl font-700" style={{ color: "var(--foreground)" }}>Log in</h2>
            </div>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full text-lg font-700" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              R
            </div>
          </div>

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
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => onLoginFormChange({ ...loginForm, password: event.target.value })}
                className="w-full rounded border px-3 py-2.5 outline-none"
                style={formInputStyle}
                placeholder="••••••••"
              />
            </div>
            {loginError ? <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm" style={{ color: "#fca5a5" }}>{loginError}</div> : null}
            <div className="flex items-center justify-between text-sm" style={{ color: "var(--muted-foreground)" }}>
              <span className="text-xs">Company access is assigned by a platform administrator.</span>
            </div>
            <button type="submit" className="w-full rounded px-4 py-3 font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              Log In
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (authView === "verify") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: "var(--background)" }}>
        <div className="w-full max-w-xl rounded-2xl border p-8 shadow-2xl text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
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
              <div className="rounded border border-dashed px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Upload logo (optional)</div>
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
              <input type="password" value={companyForm.password} onChange={(event) => onCompanyFormChange({ ...companyForm, password: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Confirm Password</label>
              <input type="password" value={companyForm.confirmPassword} onChange={(event) => onCompanyFormChange({ ...companyForm, confirmPassword: event.target.value })} className="w-full rounded border px-3 py-2.5 outline-none" style={formInputStyle} />
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
            <div><label className="mb-1 block text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Logo</label><div className="rounded border border-dashed px-3 py-5 text-sm" style={{ borderColor: "var(--border)" }}>Upload company logo</div></div>
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
                <input defaultValue="owner@recruitos.ug" className="w-full rounded border px-3 py-2.5 outline-none" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
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
  const permissionRows = [
    ["Candidates", "View / Create / Edit / Approve", "Recruitment Agent"],
    ["Finance", "View only", "Recruitment Agent"],
    ["Users", "No access", "Recruitment Agent"],
    ["Invoices", "View / Edit / Export", "Finance Manager"],
    ["Passport Custody", "View / Approve", "Document Officer"],
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.20em]" style={{ color: "var(--muted-foreground)" }}>Company settings</div>
          <h1 className="mt-2 text-2xl font-700" style={{ color: "var(--foreground)" }}>Settings</h1>
        </div>
        <div className="rounded-full border px-3 py-1 text-[10px] font-700 uppercase tracking-widest" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>
          {user?.role ?? "Company Owner / Primary Administrator"}
        </div>
      </div>

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
                <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{user?.title ?? "Company Owner / Primary Administrator"}</div>
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
  );
}
