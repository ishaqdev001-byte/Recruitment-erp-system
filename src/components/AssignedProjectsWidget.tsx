import { useEffect, useState } from "react";
import { BriefcaseBusiness, AlertCircle } from "lucide-react";

type AssignedProject = {
  id: string;
  name: string;
  role: "Project Handler" | "Assistant Staff";
};

type AssignedProjectsData = {
  count: number;
  projects: AssignedProject[];
};

export default function AssignedProjectsWidget() {
  const [data, setData] = useState<AssignedProjectsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/workspace/assigned-projects", {
          cache: "no-store",
        });
        const payload = (await response.json()) as
          | AssignedProjectsData
          | { error?: string };

        if (!response.ok) {
          throw new Error("error" in payload ? payload.error : "Unable to load assigned projects.");
        }

        if (!cancelled) {
          setData(payload as AssignedProjectsData);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load assigned projects."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div
        className="rounded border p-5"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3 text-sm text-red-500">
          <AlertCircle size={18} aria-hidden="true" />
          <span>Unable to load assigned projects</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded border p-5"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <BriefcaseBusiness size={16} style={{ color: "var(--primary)" }} aria-hidden="true" />
        <h3
          className="text-xs font-700 uppercase tracking-widest"
          style={{ color: "var(--muted-foreground)" }}
        >
          Your Assigned Projects
        </h3>
      </div>

      {loading ? (
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Loading projects…
        </div>
      ) : data && data.count === 0 ? (
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          You have no assigned projects
        </div>
      ) : data ? (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2 mb-3">
            <span
              className="text-2xl font-700 mono"
              style={{ color: "var(--primary)" }}
            >
              {data.count}
            </span>
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {data.count === 1 ? "project" : "projects"}
            </span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {data.projects.map((project) => (
              <div
                key={project.id}
                className="flex items-start justify-between gap-2 p-2 rounded"
                style={{ background: "var(--secondary)" }}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-500 truncate"
                    style={{ color: "var(--foreground)" }}
                  >
                    {project.name}
                  </p>
                  <p
                    className="text-xs mono"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {project.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
