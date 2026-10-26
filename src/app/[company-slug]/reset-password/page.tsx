"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
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

export default function CompanyResetPasswordPage({
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
  const [success, setSuccess] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [resetError, setResetError] = useState("");

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
      } catch (err) {
        console.error("Error loading company info:", err);
        setError("An error occurred while loading company information.");
      } finally {
        setLoading(false);
      }
    };

    loadCompanyInfo();
  }, [companySlug]);

  const handleResetPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setResetError("");

      if (!newPassword.trim() || !confirmPassword.trim()) {
        setResetError("Please enter and confirm your new password.");
        return;
      }

      if (newPassword.length < 8) {
        setResetError("Password must be at least 8 characters long.");
        return;
      }

      if (newPassword !== confirmPassword) {
        setResetError("Passwords do not match. Please try again.");
        return;
      }

      if (!companyInfo) {
        setResetError("Company information is not loaded. Please refresh and try again.");
        return;
      }

      try {
        setSavingPassword(true);
        const supabase = createSupabaseBrowserClient();

        // Update password
        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          setResetError(updateError.message || "Failed to reset password. Please try again.");
          return;
        }

        setSuccess(true);

        // Redirect to company dashboard after 2 seconds
        setTimeout(() => {
          router.push(`/${companySlug}`);
        }, 2000);
      } catch (err) {
        console.error("Password reset error:", err);
        setResetError(
          err instanceof Error ? err.message : "An unexpected error occurred."
        );
      } finally {
        setSavingPassword(false);
      }
    },
    [companyInfo, newPassword, confirmPassword, companySlug, router]
  );

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
              <AlertCircle size={24} className="text-red-400" />
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

            {/* Company Name and Title */}
            <h1 className="text-2xl font-700 text-center text-slate-100 mb-2">
              Reset Your Password
            </h1>
            <p className="text-center text-slate-400 text-sm">
              {companyInfo.name}
            </p>
          </div>

          {/* Form Section */}
          {!success ? (
            <form onSubmit={handleResetPassword} className="px-8 py-8 space-y-5">
              {/* New Password Field */}
              <div className="space-y-2">
                <label className="block text-xs font-700 uppercase tracking-wider text-slate-300">
                  New Password
                </label>
                <div className="relative">
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={savingPassword}
                    minLength={8}
                    className="w-full px-4 py-3 pr-12 rounded-xl text-sm font-normal tracking-normal outline-none transition-all duration-200 bg-slate-700/30 border border-slate-600/50 text-slate-100 placeholder-slate-500 focus:bg-slate-700/50 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={savingPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <label className="block text-xs font-700 uppercase tracking-wider text-slate-300">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    required
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={savingPassword}
                    minLength={8}
                    className="w-full px-4 py-3 pr-12 rounded-xl text-sm font-normal tracking-normal outline-none transition-all duration-200 bg-slate-700/30 border border-slate-600/50 text-slate-100 placeholder-slate-500 focus:bg-slate-700/50 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Re-enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={savingPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Password Requirements */}
              <div className="p-4 rounded-xl bg-slate-700/20 border border-slate-600/30 space-y-2">
                <p className="text-xs font-600 text-slate-300">Password requirements:</p>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li className={newPassword.length >= 8 ? "text-green-400" : ""}>
                    {newPassword.length >= 8 ? "✓" : "•"} At least 8 characters
                  </li>
                  <li className={newPassword === confirmPassword && confirmPassword ? "text-green-400" : ""}>
                    {newPassword === confirmPassword && confirmPassword ? "✓" : "•"} Passwords match
                  </li>
                </ul>
              </div>

              {/* Error Message */}
              {resetError && (
                <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex gap-3">
                  <div className="flex-shrink-0 text-red-400 mt-0.5">⚠</div>
                  <p className="text-sm text-red-400">{resetError}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={savingPassword}
                className="w-full mt-6 px-4 py-3 rounded-xl text-sm font-700 uppercase tracking-wider transition-all duration-200 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {savingPassword ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Updating password…
                  </>
                ) : (
                  "Update Password"
                )}
              </button>
            </form>
          ) : (
            /* Success State */
            <div className="px-8 py-16 text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center animate-bounce">
                  <CheckCircle2 size={32} className="text-green-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-700 text-slate-100">Password Reset Successful!</h2>
                <p className="text-slate-400 text-sm">
                  Your password has been updated. Redirecting to dashboard…
                </p>
              </div>
              <div className="pt-4 text-xs text-slate-500">
                If not redirected automatically,{" "}
                <button
                  onClick={() => router.push(`/${companySlug}`)}
                  className="text-blue-400 hover:text-blue-300 font-600"
                >
                  click here
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Security Badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <CheckCircle2 size={14} className="text-green-500/60" />
          <span>Secure password reset powered by industry-leading encryption</span>
        </div>
      </div>
    </div>
  );
}
