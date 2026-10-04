import { useEffect, useState } from "react";
import { FileText, LockKeyhole, UsersRound } from "lucide-react";
import type { View, WorkspaceRole } from "../App";

interface WorkspaceSummary {
  candidateCount: number;
  documentCount: number | null;
  passportCount: number | null;
}

export default function LiveDashboard({ role, onNavigate: _onNavigate }: { role: WorkspaceRole; onNavigate: (view: View) => void }) {
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/summary", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load workspace data.");
        if (!cancelled) setSummary(payload as WorkspaceSummary);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Unable to load workspace data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const metrics = [
    { label: "Candidates", value: summary?.candidateCount, icon: UsersRound, color: "#2563eb" },
    { label: "Documents", value: summary?.documentCount, icon: FileText, color: "#0f766e" },
    { label: "Passport records", value: summary?.passportCount, icon: LockKeyhole, color: "#b45309" },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <div className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{role} workspace</div>
        <h1 className="mt-2 text-2xl font-700" style={{ color: "var(--foreground)" }}>Workspace overview</h1>
      </div>

      {error ? (
        <div role="alert" className="border px-4 py-3 text-sm" style={{ borderColor: "#ef444455", color: "#ef4444", background: "var(--card)" }}>
          {error}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {metrics.map(({ label, value, icon: Icon, color }) => (
            <section key={label} className="flex min-h-28 items-center gap-4 border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <span className="flex h-10 w-10 items-center justify-center" style={{ color, background: `${color}18` }}>
                <Icon size={19} aria-hidden="true" />
              </span>
              <div>
                <div className="mono text-2xl font-700" style={{ color: "var(--foreground)" }}>
                  {loading ? "…" : value === null || value === undefined ? "Restricted" : value.toLocaleString()}
                </div>
                <div className="text-xs font-700 uppercase" style={{ color: "var(--muted-foreground)" }}>{label}</div>
              </div>
            </section>
          ))}
        </div>
      )}

      {!loading && !error && summary?.candidateCount === 0 && (
        <p className="mt-6 border-l-2 pl-4 text-sm" style={{ borderColor: "var(--primary)", color: "var(--muted-foreground)" }}>
          No candidate records are available in this company workspace yet.
        </p>
      )}
    </div>
  );
}