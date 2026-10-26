"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function CompanyForgotPasswordPage({
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

  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleRequestReset = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setSuccessMessage("");

      if (!email.trim()) {
        setError("Please enter your email address.");
        return;
      }

      if (!companySlug) {
        setError("Company information not loaded. Please refresh the page.");
        return;
      }

      try {
        setLoading(true);

        const supabase = createSupabaseBrowserClient();

        // Request password reset with company-specific redirect URL
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: `${window.location.origin}/${companySlug}/reset-password`,
          }
        );

        if (resetError) {
          setError(resetError.message);
          return;
        }

        setSuccessMessage(
          `Password reset email sent to ${email}. Check your inbox and follow the link to set a new password.`
        );
        setStep("verify");
      } catch (err) {
        console.error("Password reset error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to send password reset email."
        );
      } finally {
        setLoading(false);
      }
    },
    [email, companySlug]
  );

  const formInputStyle = {
    background: "var(--secondary)",
    borderColor: "var(--border)",
    color: "var(--foreground)",
  } as const;

  if (!companySlug) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        <div
          className="text-sm"
          style={{ color: "var(--muted-foreground)" }}
          aria-busy="true"
        >
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-10"
      style={{ background: "var(--background)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-8 shadow-2xl"
        style={{
          background: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div className="mb-6">
          <div
            className="text-xs uppercase tracking-[0.22em]"
            style={{ color: "var(--muted-foreground)" }}
          >
            Account Recovery
          </div>
          <h1
            className="mt-2 text-2xl font-700"
            style={{ color: "var(--foreground)" }}
          >
            Reset Your Password
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            {step === "request"
              ? "Enter your email address and we'll send you a link to reset your password."
              : "Check your email for a password reset link. If you don't see it, check your spam folder."}
          </p>
        </div>

        {/* Request Form */}
        {step === "request" && (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <label
              className="block text-xs font-700 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Email Address
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="mt-1 w-full rounded border px-3 py-2.5 text-sm font-normal tracking-normal outline-none disabled:opacity-50"
                style={formInputStyle}
                placeholder="you@company.com"
              />
            </label>

            {error && (
              <div
                role="alert"
                className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded px-4 py-3 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
          </form>
        )}

        {/* Success Message */}
        {step === "verify" && successMessage && (
          <div
            role="status"
            className="rounded border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-400 mb-4"
          >
            {successMessage}
          </div>
        )}

        {/* Back to Login Button */}
        <button
          type="button"
          onClick={() => router.push(`/${companySlug}/login`)}
          className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-600 rounded"
          style={{
            background: "var(--secondary)",
            color: "var(--foreground)",
            borderColor: "var(--border)",
            border: "1px solid",
          }}
        >
          <ArrowLeft size={16} />
          Back to Login
        </button>

        {/* Additional Help Text */}
        <p
          className="mt-4 text-center text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          Still need help?{" "}
          <button
            type="button"
            onClick={() => router.push(`/${companySlug}/login`)}
            className="font-600 underline hover:no-underline"
            style={{ color: "var(--primary)" }}
          >
            Contact your administrator
          </button>
        </p>
      </div>
    </div>
  );
}
