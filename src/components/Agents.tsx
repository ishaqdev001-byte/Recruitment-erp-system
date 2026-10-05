import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, Plus, Search, UserRound, Users, UserCheck, UserX } from "lucide-react";

type AgentRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  branch: string;
  roleId: string;
  role: string;
  status: string;
};

type RoleRecord = { id: string; name: string };
type CandidateRecord = { id: string; first_name: string; last_name: string; agent_name: string; details: Record<string, unknown> | null };
type AgentPayload = { users: AgentRecord[]; roles: RoleRecord[]; error?: string };

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const normalized = (value: string) => value.trim().toLocaleLowerCase();

function candidateMetrics(agent: AgentRecord, candidates: CandidateRecord[]) {
  const assigned = candidates.filter((candidate) => normalized(candidate.agent_name) === normalized(agent.name));
  const lifecycle = assigned.map((candidate) => candidate.details ?? {});
  const deployed = lifecycle.filter((details) => details.travelStatus === "Travelled" || details.stage === "Travelled").length;
  const withdrawn = lifecycle.filter((details) => details.travelStatus === "Withdrawn" || details.stage === "Withdrawn").length;
  const cancelled = lifecycle.filter((details) => details.visaStatus === "Cancelled" || details.stage === "Cancelled" || details.stage === "Canceled").length;
  const stages = ["Registration", "Visa Processing", "Final Round", "Travelled", "Withdrawn"].map((stage) => ({
    name: stage,
    count: lifecycle.filter((details) => details.stage === stage || (stage === "Travelled" && details.travelStatus === stage) || (stage === "Withdrawn" && details.travelStatus === stage)).length,
  }));
  return { assigned, deployed, withdrawn, cancelled, stages };
}

export default function Agents() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [usersResponse, candidatesResponse] = await Promise.all([
          fetch("/api/workspace/users", { cache: "no-store" }),
          fetch("/api/candidates", { cache: "no-store" }),
        ]);
        const [usersPayload, candidatesPayload] = await Promise.all([
          usersResponse.json() as Promise<AgentPayload>,
          candidatesResponse.json() as Promise<{ candidates?: CandidateRecord[]; error?: string }>,
        ]);
        if (!usersResponse.ok) throw new Error(usersPayload.error ?? "Unable to load company agents.");
        if (!candidatesResponse.ok) throw new Error(candidatesPayload.error ?? "Unable to load candidate assignments.");
        if (cancelled) return;
        setAgents(usersPayload.users.filter((user) => user.role.toLocaleLowerCase().includes("agent")));
        setRoles(usersPayload.roles);
        setCandidates(candidatesPayload.candidates ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load company agents.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const activeCount = agents.filter((agent) => agent.status === "active").length;
  const inactiveCount = agents.filter((agent) => agent.status === "disabled").length;
  const filtered = agents.filter((agent) =>
    `${agent.name} ${agent.phone} ${agent.email} ${agent.branch}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
  const selectedMetrics = selectedAgent ? candidateMetrics(selectedAgent, candidates) : null;
  const recruitmentAgentRole = roles.find((role) => role.name === "Recruitment Agent");

  const addAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recruitmentAgentRole) {
      setError("Recruitment Agent role is missing. Apply the latest Supabase migration, then reload this page.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite-user",
          name: String(formData.get("name") ?? "").trim(),
          phone: String(formData.get("phone") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim(),
          branch: String(formData.get("branch") ?? "").trim(),
          roleId: recruitmentAgentRole.id,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to invite this agent.");
      setShowNew(false);
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to invite this agent.");
    } finally {
      setSaving(false);
    }
  };

  if (selectedAgent && selectedMetrics) {
    const maxStageCount = Math.max(1, ...selectedMetrics.stages.map((stage) => stage.count));
    return (
      <section className="flex h-full min-h-0 flex-col overflow-auto" aria-labelledby="agent-detail-title">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSelectedAgentId(null)} aria-label="Back to agents" title="Back to agents" className="flex h-9 w-9 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ArrowLeft size={17} aria-hidden="true" /></button>
            <div>
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Agent profile</p>
              <h1 id="agent-detail-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>{selectedAgent.name}</h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-600" style={{ color: selectedAgent.status === "active" ? "#10b981" : selectedAgent.status === "disabled" ? "#ef4444" : "#f59e0b" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: selectedAgent.status === "active" ? "#10b981" : selectedAgent.status === "disabled" ? "#ef4444" : "#f59e0b" }} />
            {selectedAgent.status === "active" ? "Active" : selectedAgent.status === "disabled" ? "Inactive" : "Invitation pending"}
          </span>
        </header>

        <div className="space-y-6 p-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
            <section className="border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <h2 className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Personal information</h2>
              <dl className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>
                {[
                  ["Full name", selectedAgent.name],
                  ["Phone number", selectedAgent.phone || "Not provided"],
                  ["Email address", selectedAgent.email || "Not provided"],
                  ["Registered branch", selectedAgent.branch || "Not provided"],
                ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0"><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</dt><dd className="break-all text-right text-sm font-600" style={{ color: "var(--foreground)" }}>{value}</dd></div>)}
              </dl>
            </section>
            <section aria-labelledby="productivity-title">
              <h2 id="productivity-title" className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Agent productivity</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: "Total candidates", value: selectedMetrics.assigned.length, color: "var(--primary)" },
                  { label: "Deployed", value: selectedMetrics.deployed, color: "#10b981" },
                  { label: "Withdrawn", value: selectedMetrics.withdrawn, color: "#ef4444" },
                  { label: "Cancelled", value: selectedMetrics.cancelled, color: "#f59e0b" },
                  { label: "Collected income", value: "Not tracked", color: "var(--muted-foreground)" },
                  { label: "Unpaid / lost invoices", value: "Not tracked", color: "var(--muted-foreground)" },
                ].map((metric) => <div key={metric.label} className="min-h-24 border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}><div className="text-xl font-700" style={{ color: metric.color }}>{metric.value}</div><div className="mt-2 text-xs font-600" style={{ color: "var(--muted-foreground)" }}>{metric.label}</div></div>)}
              </div>
              <p className="mt-3 text-xs leading-5" style={{ color: "var(--muted-foreground)" }}>Income and invoice totals will appear when candidate service-charge payments and invoices are stored in the finance records.</p>
            </section>
          </div>

          <section className="border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-700" style={{ color: "var(--foreground)" }}>Candidate pipeline</h2>
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Assigned candidate counts by current stage</p>
            </div>
            <div className="grid gap-x-10 gap-y-5 p-5 sm:grid-cols-2">
              {selectedMetrics.stages.map((stage) => <div key={stage.name}>
                <div className="mb-2 flex justify-between text-xs"><span style={{ color: "var(--foreground)" }}>{stage.name}</span><span className="mono font-700" style={{ color: "var(--muted-foreground)" }}>{stage.count}</span></div>
                <div className="h-2" style={{ background: "var(--secondary)" }}><div className="h-2" style={{ width: `${stage.count / maxStageCount * 100}%`, background: stage.name === "Travelled" ? "#10b981" : stage.name === "Withdrawn" ? "#ef4444" : "var(--primary)" }} /></div>
              </div>)}
            </div>
            <div className="border-t px-5 py-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>{selectedMetrics.assigned.length} candidates assigned by matching their saved agent name to this profile.</div>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="agents-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 id="agents-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Agents</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{loading ? "Loading company agents" : `${agents.length} agents in this company`}</p>
        </div>
        <button type="button" onClick={() => {
          if (!recruitmentAgentRole) {
            setError("Recruitment Agent role is missing. Apply the latest Supabase migration, then reload this page.");
            return;
          }
          setError("");
          setShowNew(true);
        }} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Plus size={16} aria-hidden="true" />Add agent</button>
      </header>

      <div className="grid grid-cols-1 border-b sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
        {[
          { label: "Total agents", value: agents.length, icon: Users, color: "var(--primary)" },
          { label: "Active", value: activeCount, icon: UserCheck, color: "#10b981" },
          { label: "Inactive", value: inactiveCount, icon: UserX, color: "#ef4444" },
        ].map(({ label, value, icon: Icon, color }) => <div key={label} className="flex items-center gap-3 border-b px-6 py-4 last:border-0 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)" }}><Icon size={17} aria-hidden="true" style={{ color }} /><div><div className="mono text-xl font-700" style={{ color: "var(--foreground)" }}>{value}</div><div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div></div></div>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <label className="flex w-full max-w-md items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search agents" placeholder="Search name, phone, email, or branch" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{filtered.length} shown</span>
      </div>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-225 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Agent", "Phone", "Email address", "Registered branch", "Candidates", "Status", ""].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading agent records…</td></tr>}
              {!loading && !error && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{agents.length ? "No agents match this search." : "No Recruitment Agent accounts found for this company."}</td></tr>}
              {!loading && filtered.map((agent) => {
                const metrics = candidateMetrics(agent, candidates);
                const isActive = agent.status === "active";
                return <tr key={agent.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="whitespace-nowrap px-4 py-3"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-700" style={{ background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary)" }}>{agent.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || <UserRound size={15} aria-hidden="true" />}</span><span className="font-600" style={{ color: "var(--foreground)" }}>{agent.name}</span></div></td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{agent.phone || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{agent.email || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{agent.branch || "—"}</td>
                  <td className="px-4 py-3 mono font-700" style={{ color: "var(--primary)" }}>{metrics.assigned.length}</td>
                  <td className="px-4 py-3"><span className="whitespace-nowrap px-2 py-1 text-xs font-600" style={{ color: isActive ? "#10b981" : agent.status === "disabled" ? "#ef4444" : "#f59e0b", background: isActive ? "#10b98120" : agent.status === "disabled" ? "#ef444420" : "#f59e0b20" }}>{isActive ? "Active" : agent.status === "disabled" ? "Inactive" : "Invited"}</span></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedAgentId(agent.id)} className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Eye size={14} aria-hidden="true" />View</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <form onSubmit={addAgent} className="max-h-[90dvh] w-full max-w-md overflow-y-auto border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="mb-5 text-lg font-700" style={{ color: "var(--foreground)" }}>Add agent</h2>
          <div className="space-y-4">
            {[
              { name: "name", label: "Full name", type: "text", required: true },
              { name: "phone", label: "Phone number", type: "tel", required: true },
              { name: "email", label: "Email address", type: "email", required: true },
              { name: "branch", label: "Registered branch", type: "text", required: true },
            ].map((field) => <label key={field.name} className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{field.label}<input required={field.required} maxLength={field.name === "phone" ? 100 : 200} name={field.name} type={field.type} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>)}
          </div>
          <p className="mt-4 text-xs" style={{ color: "var(--muted-foreground)" }}>An invitation will be sent to the agent’s email address.</p>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Sending invite…" : "Send invitation"}</button><button type="button" onClick={() => setShowNew(false)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}
    </section>
  );
}
