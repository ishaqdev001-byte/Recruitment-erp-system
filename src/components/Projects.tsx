import { useEffect, useState, type FormEvent } from "react";
import { BriefcaseBusiness, Pencil, Plus, Search, Trash2, X } from "lucide-react";

type ProjectStatus = "active" | "inactive" | "cancelled";
type ProjectRecord = {
  id: string;
  project_name: string;
  contractor_id: string | null;
  contractor_name: string;
  country: string;
  salary_range: string;
  age_bracket: string;
  total_demand: number;
  service_charge: number;
  interview_mode: "Face to face" | "Online" | "Direct submission";
  status: ProjectStatus;
  submitted_count: number;
  visa_count: number;
  ticket_count: number;
};
type ContractorRecord = { id: string; company_name: string };
type ProjectForm = {
  projectName: string;
  contractorName: string;
  country: string;
  salaryRange: string;
  ageBracket: string;
  totalDemand: string;
  serviceCharge: string;
  interviewMode: ProjectRecord["interview_mode"];
  status: ProjectStatus;
  submittedCount: string;
  visaCount: string;
  ticketCount: string;
};
type ProjectPermissions = { canCreate: boolean; canEdit: boolean; canDelete: boolean; canChangeStatus: boolean };

const initialForm = (): ProjectForm => ({
  projectName: "", contractorName: "", country: "", salaryRange: "", ageBracket: "",
  totalDemand: "", serviceCharge: "", interviewMode: "Face to face", status: "active",
  submittedCount: "0", visaCount: "0", ticketCount: "0",
});
const defaultPermissions: ProjectPermissions = { canCreate: false, canEdit: false, canDelete: false, canChangeStatus: false };
const statusLabels: Record<ProjectStatus, string> = { active: "Active", inactive: "Inactive", cancelled: "Cancelled" };
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

function formFromProject(project: ProjectRecord): ProjectForm {
  return {
    projectName: project.project_name,
    contractorName: project.contractor_name,
    country: project.country,
    salaryRange: project.salary_range,
    ageBracket: project.age_bracket,
    totalDemand: String(project.total_demand),
    serviceCharge: String(project.service_charge),
    interviewMode: project.interview_mode,
    status: project.status,
    submittedCount: String(project.submitted_count),
    visaCount: String(project.visa_count),
    ticketCount: String(project.ticket_count),
  };
}

export default function Projects() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [contractors, setContractors] = useState<ContractorRecord[]>([]);
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRecord | null>(null);
  const [form, setForm] = useState<ProjectForm>(initialForm);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [projectResponse, contractorResponse] = await Promise.all([
          fetch("/api/projects", { cache: "no-store" }),
          fetch("/api/employers", { cache: "no-store" }),
        ]);
        const [projectPayload, contractorPayload] = await Promise.all([
          projectResponse.json() as Promise<{ projects?: ProjectRecord[]; permissions?: ProjectPermissions; error?: string }>,
          contractorResponse.json() as Promise<{ employers?: ContractorRecord[]; error?: string }>,
        ]);
        if (!projectResponse.ok) throw new Error(projectPayload.error ?? "Unable to load projects.");
        if (!contractorResponse.ok) throw new Error(contractorPayload.error ?? "Unable to load contractors.");
        if (cancelled) return;
        setProjects(projectPayload.projects ?? []);
        setPermissions(projectPayload.permissions ?? defaultPermissions);
        setContractors(contractorPayload.employers ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load projects.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredProjects = projects.filter((project) =>
    `${project.project_name} ${project.contractor_name} ${project.country}`.toLocaleLowerCase().includes(normalizedSearch),
  );

  const closeForm = () => {
    setShowForm(false);
    setEditingProject(null);
    setForm(initialForm());
  };

  const openNewProject = () => {
    setEditingProject(null);
    setForm(initialForm());
    setError("");
    setShowForm(true);
  };

  const openEditProject = (project: ProjectRecord) => {
    setEditingProject(project);
    setForm(formFromProject(project));
    setError("");
    setShowForm(true);
  };

  const saveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const matchingContractor = contractors.find((contractor) => contractor.company_name.toLocaleLowerCase() === form.contractorName.trim().toLocaleLowerCase());
    setSaving(true);
    setError("");
    try {
      const response = await fetch(editingProject ? `/api/projects/${encodeURIComponent(editingProject.id)}` : "/api/projects", {
        method: editingProject ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: form.projectName,
          contractorId: matchingContractor?.id ?? (form.contractorName.trim() === editingProject?.contractor_name ? editingProject.contractor_id : null),
          contractorName: form.contractorName,
          country: form.country,
          salaryRange: form.salaryRange,
          ageBracket: form.ageBracket,
          totalDemand: form.totalDemand,
          serviceCharge: form.serviceCharge || "0",
          interviewMode: form.interviewMode,
          ...(permissions.canChangeStatus ? { status: form.status } : {}),
          ...(editingProject ? {
            submittedCount: form.submittedCount,
            visaCount: form.visaCount,
            ticketCount: form.ticketCount,
          } : {}),
        }),
      });
      const payload = await response.json() as { project?: ProjectRecord; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error ?? "Unable to save project.");
      closeForm();
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save project.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (project: ProjectRecord, status: ProjectStatus) => {
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update project status.");
      setReloadKey((key) => key + 1);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update project status.");
    }
  };

  const deleteProject = async (project: ProjectRecord) => {
    if (!window.confirm(`Delete project “${project.project_name}”?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete project.");
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete project.");
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="projects-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 id="projects-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Projects</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{loading ? "Loading projects" : error ? "Project records unavailable" : `${projects.length} total projects`}</p>
        </div>
        <button type="button" onClick={openNewProject} disabled={!permissions.canCreate} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Plus size={16} aria-hidden="true" />Add project</button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <label className="flex w-full max-w-md items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search projects" placeholder="Search project, contractor, or country" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
        <span className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}><BriefcaseBusiness size={15} aria-hidden="true" />{loading ? "—" : projects.length} projects</span>
      </div>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-275 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Project", "Contractor", "Country", "Salary range", "Age bracket", "Vacancies", "Submitted", "Shortfall", "Visas", "Tickets", "Status", "Actions"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={12} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading projects…</td></tr>}
              {!loading && !error && filteredProjects.length === 0 && <tr><td colSpan={12} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{projects.length ? "No projects match this search." : "No projects registered yet."}</td></tr>}
              {!loading && filteredProjects.map((project) => <tr key={project.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3 font-600" style={{ color: "var(--foreground)" }}>{project.project_name}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{project.contractor_name}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{project.country}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{project.salary_range}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{project.age_bracket}</td>
                <td className="px-3 py-3 mono font-700" style={{ color: "var(--foreground)" }}>{project.total_demand}</td>
                <td className="px-3 py-3 mono" style={{ color: "var(--foreground)" }}>{project.submitted_count}</td>
                <td className="px-3 py-3 mono font-700" style={{ color: "#f59e0b" }}>{Math.max(0, project.total_demand - project.submitted_count)}</td>
                <td className="px-3 py-3 mono" style={{ color: "var(--foreground)" }}>{project.visa_count}</td>
                <td className="px-3 py-3 mono" style={{ color: "var(--foreground)" }}>{project.ticket_count}</td>
                <td className="px-3 py-3"><select aria-label={`Status for ${project.project_name}`} value={project.status} disabled={!permissions.canChangeStatus} onChange={(event) => void updateStatus(project, event.target.value as ProjectStatus)} className="border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-70" style={fieldStyle}><option value="active">Active</option><option value="inactive">Inactive</option><option value="cancelled">Cancelled</option></select></td>
                <td className="whitespace-nowrap px-3 py-3"><div className="flex items-center gap-1"><button type="button" aria-label={`Edit ${project.project_name}`} title="Edit project" disabled={!permissions.canEdit} onClick={() => openEditProject(project)} className="p-2 disabled:cursor-not-allowed disabled:opacity-40" style={{ color: "var(--muted-foreground)" }}><Pencil size={15} aria-hidden="true" /></button><button type="button" aria-label={`Delete ${project.project_name}`} title="Delete project" disabled={!permissions.canDelete} onClick={() => void deleteProject(project)} className="p-2 disabled:cursor-not-allowed disabled:opacity-40" style={{ color: "#ef4444" }}><Trash2 size={15} aria-hidden="true" /></button></div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
        <form onSubmit={saveProject} className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>{editingProject ? "Edit project" : "Add project"}</h2><button type="button" onClick={closeForm} aria-label="Close project form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Project name<input required maxLength={200} value={form.projectName} onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Contractor name<input required list="contractor-suggestions" maxLength={200} value={form.contractorName} onChange={(event) => setForm((current) => ({ ...current, contractorName: event.target.value }))} placeholder="Choose a contractor or type a name" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /><datalist id="contractor-suggestions">{contractors.map((contractor) => <option key={contractor.id} value={contractor.company_name} />)}</datalist></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Country of deployment<input required maxLength={200} value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Salary range<input required maxLength={200} value={form.salaryRange} onChange={(event) => setForm((current) => ({ ...current, salaryRange: event.target.value }))} placeholder="e.g. UGX 1,000,000 - 1,500,000" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Age bracket<input required maxLength={100} value={form.ageBracket} onChange={(event) => setForm((current) => ({ ...current, ageBracket: event.target.value }))} placeholder="e.g. 21-35 years" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Total demand (vacancies)<input required min={1} step={1} type="number" value={form.totalDemand} onChange={(event) => setForm((current) => ({ ...current, totalDemand: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Service charge<input min={0} step="0.01" type="number" value={form.serviceCharge} onChange={(event) => setForm((current) => ({ ...current, serviceCharge: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Interview mode<select value={form.interviewMode} onChange={(event) => setForm((current) => ({ ...current, interviewMode: event.target.value as ProjectForm["interviewMode"] }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}><option>Face to face</option><option>Online</option><option>Direct submission</option></select></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Status<select disabled={!permissions.canChangeStatus} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ProjectStatus }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none disabled:opacity-60" style={fieldStyle}><option value="active">Active</option><option value="inactive">Inactive</option><option value="cancelled">Cancelled</option></select></label>
            {editingProject && <>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Candidates submitted<input min={0} step={1} required type="number" value={form.submittedCount} onChange={(event) => setForm((current) => ({ ...current, submittedCount: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Visas<input min={0} step={1} required type="number" value={form.visaCount} onChange={(event) => setForm((current) => ({ ...current, visaCount: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Tickets<input min={0} step={1} required type="number" value={form.ticketCount} onChange={(event) => setForm((current) => ({ ...current, ticketCount: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            </>}
          </div>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save project"}</button><button type="button" onClick={closeForm} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}
    </section>
  );
}