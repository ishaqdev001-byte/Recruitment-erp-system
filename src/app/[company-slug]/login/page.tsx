"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, MessageCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type CompanyInfo = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_admin_user_id: string;
  primary_admin_email: string;
  primary_admin_phone: string | null;
  primary_admin_first_name: string;
  primary_admin_last_name: string;
};

type Session = {
  userId: string;
  email: string;
  companyId: string;
  companyName: string;
  userName: string;
  userRole: string;
  companyLogo?: string;
};

export default function CompanyLoginPage({
  params,
}: {
  params: Promise<{ "company-slug": string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [companySlug, setCompanySlug] = useState("");

  useEffect(() => {
    params.then(({ "company-slug": slug }) => {
      setCompanySlug(slug);
    });
  }, [params]);

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [signingInProgress, setSigningInProgress] = useState("");

  // Resolve async params
  useEffect(() => {
    params.then(({ "company-slug": slug }) => {
      setCompanySlug(slug);
    });
  }, [params]);

  // Load company info on mount
  useEffect(() => {
    if (!companySlug) return;

    const loadCompanyInfo = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/api/companies/${companySlug}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Company not found. Please check the URL.");
          } else {
            setError("Failed to load company information.");
          }
          return;
        }

        const data: CompanyInfo = await response.json();
        setCompanyInfo(data);

        // Pre-fill email from query params if provided
        const emailParam = searchParams.get("email");
        if (emailParam) {
          setEmail(emailParam);
        }
      } catch (err) {
        console.error("Error loading company info:", err);
        setError("An error occurred while loading company information.");
      } finally {
        setLoading(false);
      }
    };

    loadCompanyInfo();
  }, [companySlug, searchParams]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError("");
      setSigningInProgress("");

      if (!email.trim() || !password.trim()) {
        setLoginError("Please enter your email and password.");
        return;
      }

      if (!companyInfo) {
        setLoginError("Company information is not loaded. Please refresh and try again.");
        return;
      }

      try {
        setSigningIn(true);
        setSigningInProgress("Authenticating…");

        const supabase = createSupabaseBrowserClient();

        // Sign in with Supabase auth
        setSigningInProgress("Verifying credentials…");
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError || !authData.user) {
          // Provide meaningful error messages
          if (signInError?.message?.includes("Invalid login credentials")) {
            setLoginError("Invalid email or password. Please try again.");
          } else if (signInError?.message?.includes("Email not confirmed")) {
            setLoginError("Please verify your email address before signing in.");
          } else {
            setLoginError(signInError?.message || "Failed to sign in. Please check your credentials.");
          }
          console.error("Sign in error:", signInError);
          return;
        }

        // Verify user belongs to this company via company_memberships table
        setSigningInProgress("Checking company access…");
        const { data: membership, error: membershipError } = await supabase
          .from("company_memberships")
          .select("role_id")
          .eq("user_id", authData.user.id)
          .eq("company_id", companyInfo.id)
          .maybeSingle();

        if (membershipError) {
          console.error("Error checking company membership:", membershipError);
        }

        if (!membership) {
          // Sign out the user since they don't belong to this company
          await supabase.auth.signOut();
          setLoginError(
            "You don't have access to this company. Please contact your administrator."
          );
          return;
        }

        // Get user profile info
        setSigningInProgress("Loading your profile…");
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Error fetching profile:", profileError);
        }

        // Get user's role name from company_roles
        const { data: roleData, error: roleError } = await supabase
          .from("company_roles")
          .select("name")
          .eq("id", membership.role_id)
          .maybeSingle();

        if (roleError) {
          console.error("Error fetching role:", roleError);
        }

        // Create session object
        const session: Session = {
          userId: authData.user.id,
          email: authData.user.email ?? email,
          companyId: companyInfo.id,
          companyName: companyInfo.name,
          userName: profile?.display_name || authData.user.email?.split("@")[0] || "User",
          userRole: roleData?.name || "Member",
          companyLogo: companyInfo.logo_url ?? undefined,
        };

        // Store session (you may want to use context or state management)
        sessionStorage.setItem("session", JSON.stringify(session));

        // Redirect to company dashboard
        setSigningInProgress("Redirecting…");
        router.push(`/${companySlug}`);
      } catch (err) {
        console.error("Login error:", err);
        setLoginError(
          err instanceof Error ? err.message : "An unexpected error occurred."
        );
      } finally {
        setSigningIn(false);
        setSigningInProgress("");
      }
    },
    [companyInfo, email, password, companySlug, router]
  );

  const handleForgotPassword = useCallback(() => {
    router.push(`/${companySlug}/forgot-password?email=${encodeURIComponent(email)}`);
  }, [companySlug, email, router]);

  const handleContactChairman = useCallback(() => {
    if (!companyInfo?.primary_admin_phone) {
      return;
    }

    // Create WhatsApp or phone link
    const phone = companyInfo.primary_admin_phone.replace(/\D/g, "");
    const chairmanName = `${companyInfo.primary_admin_first_name} ${companyInfo.primary_admin_last_name}`;
    const message = `Hi ${chairmanName}, I'd like to register for ${companyInfo.name}.`;

    // Try WhatsApp first (most common)
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  }, [companyInfo]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-300 text-sm">Loading company information…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="w-full max-w-md">
          <div className="bg-slate-800/50 backdrop-blur border border-red-500/20 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mx-auto mb-4">
              <div className="w-6 h-6 text-red-400">✕</div>
            </div>
            <h1 className="text-xl font-700 text-center text-slate-100 mb-2">{error}</h1>
            <p className="text-center text-slate-400 text-sm mb-6">Please check the URL and try again.</p>
            <button
              onClick={() => router.push("/")}
              className="w-full px-4 py-3 rounded-lg font-600 text-sm transition-all duration-200 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!companyInfo) {
    return null;
  }

  const formInputStyle = {
    background: "var(--secondary)",
    borderColor: "var(--border)",
    color: "var(--foreground)",
  } as const;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Main Card */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden">
          {/* Header with Logo */}
          <div className="relative px-8 pt-8 pb-6 bg-gradient-to-r from-slate-800/50 to-slate-900/50 border-b border-slate-700/30">
            {/* Company Logo Section */}
            <div className="flex justify-center mb-6">
              {companyInfo.logo_url ? (
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-blue-500/20 rounded-2xl blur-xl"></div>
                  <div className="relative w-full h-full bg-slate-900/50 rounded-2xl border border-slate-700/50 flex items-center justify-center p-2">
                    <img
                      src={companyInfo.logo_url}
                      alt={companyInfo.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center border border-blue-500/30">
                  <span className="text-2xl font-700 text-white">
                    {companyInfo.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Company Name */}
            <h1 className="text-2xl font-700 text-center text-slate-100 mb-2">
              {companyInfo.name}
            </h1>
            <p className="text-center text-slate-400 text-sm">
              Welcome back, sign in to continue
            </p>
          </div>

          {/* Form Section */}
          <form onSubmit={handleLogin} className="px-8 py-8 space-y-5">
            {/* Email Field */}
            <div className="space-y-2">
              <label className="block text-xs font-700 uppercase tracking-wider text-slate-300">
                Email Address
              </label>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={signingIn}
                className="w-full px-4 py-3 rounded-xl text-sm font-normal tracking-normal outline-none transition-all duration-200 bg-slate-700/30 border border-slate-600/50 text-slate-100 placeholder-slate-500 focus:bg-slate-700/50 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="your.email@company.com"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label className="block text-xs font-700 uppercase tracking-wider text-slate-300">
                Password
              </label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={signingIn}
                  className="w-full px-4 py-3 pr-12 rounded-xl text-sm font-normal tracking-normal outline-none transition-all duration-200 bg-slate-700/30 border border-slate-600/50 text-slate-100 placeholder-slate-500 focus:bg-slate-700/50 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={signingIn}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={signingIn}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700/30 text-blue-600 focus:ring-blue-500/50 disabled:opacity-50"
                />
                <span className="text-sm text-slate-400 hover:text-slate-300 transition-colors">
                  Remember me
                </span>
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={signingIn}
                className="text-sm font-600 text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>

            {/* Error Message */}
            {loginError && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex gap-3">
                <div className="flex-shrink-0 text-red-400 mt-0.5">⚠</div>
                <p className="text-sm text-red-400">{loginError}</p>
              </div>
            )}

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={signingIn}
              className="w-full mt-6 px-4 py-3 rounded-xl text-sm font-700 uppercase tracking-wider transition-all duration-200 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {signingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>{signingInProgress || "Signing in…"}</span>
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="px-8 py-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-gradient-to-r from-slate-700/0 to-slate-600/50"></div>
            <span className="text-xs text-slate-500 font-600">OR</span>
            <div className="flex-1 h-px bg-gradient-to-l from-slate-700/0 to-slate-600/50"></div>
          </div>

          {/* Contact Chairman Button */}
          <div className="px-8 pb-8 space-y-3">
            <button
              type="button"
              onClick={handleContactChairman}
              disabled={signingIn || !companyInfo.primary_admin_phone}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-700 uppercase tracking-wider transition-all duration-200 border-2 border-slate-600/50 hover:border-blue-500/50 bg-slate-700/20 hover:bg-slate-700/40 text-slate-100 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MessageCircle size={16} />
              Contact {companyInfo.primary_admin_first_name} for Access
            </button>

            {/* Account Creation Info */}
            <p className="text-center text-xs text-slate-500">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/")}
                className="font-600 text-blue-400 hover:text-blue-300 transition-colors"
              >
                Contact your administrator
              </button>
            </p>
          </div>
        </div>

        {/* Security Badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <CheckCircle2 size={14} className="text-green-500/60" />
          <span>Secure login powered by industry-leading encryption</span>
        </div>
      </div>
    </div>
  );
}
