import { useEffect, useState, type FormEvent } from "react";
import { BriefcaseBusiness, Eye, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { SearchableSelect } from "./SearchableSelect";
import { matchesSearch } from "@/lib/search";

type ProjectStatus = "active" | "inactive" | "cancelled";
type ProjectSourceType = "contractor" | "partner";
type ProjectRecord = {
  id: string;
  project_name: string;
  project_source_type: ProjectSourceType;
  contractor_id: string | null;
  partner_id: string | null;
  project_manager_user_id: string | null;
  project_manager_name: string;
  assigned_staff_id: string | null;
  assigned_staff_name: string;
  can_assign_staff: boolean;
  contractor_name: string;
  country: string;
  salary_range: string;
  age_bracket: string;
  total_demand: number;
  contractor_service_charge: number;
  partner_service_charge: number;
  candidate_service_charge: number;
  account_id: string;
  interview_mode: "Face to face" | "Online" | "Direct submission";
  status: ProjectStatus;
  submitted_count: number;
  visa_count: number;
  ticket_count: number;
};
type ContractorRecord = { id: string; company_name: string };
type PartnerRecord = { id: string; supplier_name: string };
type VisaCandidateRecord = {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  phone: string;
  passportNumber: string;
  visaReceivedDate: string;
  visaReceivedDateFormatted: string;
  serviceCharge: number;
};
type ProjectForm = {
  projectName: string;
  accountId: string;
  projectHandlerId: string;
  projectSourceType: ProjectSourceType | "";
  partnerId: string;
  contractorName: string;
  country: string;
  salaryRange: string;
  ageBracket: string;
  totalDemand: string;
  contractorServiceCharge: string;
  partnerServiceCharge: string;
  candidateServiceCharge: string;
  interviewMode: ProjectRecord["interview_mode"];
  status: ProjectStatus;
  visaCount: string;
  ticketCount: string;
};
type ProjectPermissions = {
  canViewFull: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canChangeStatus: boolean;
  canManageManagers: boolean;
  canAssignStaff: boolean;
};
type ProjectAccountOption = { id: string; name: string };
type ProjectPartnerOption = { id: string; supplier_name: string };
type ProjectHandlerOption = { id: string; name: string; position: string };
type ProjectStaffOption = { id: string; name: string; position: string; status: string };

const initialForm = (): ProjectForm => ({
  projectName: "", accountId: "", projectHandlerId: "", projectSourceType: "", partnerId: "", contractorName: "", country: "", salaryRange: "", ageBracket: "",
  totalDemand: "", contractorServiceCharge: "", partnerServiceCharge: "", candidateServiceCharge: "", interviewMode: "Face to face", status: "active",
  visaCount: "0", ticketCount: "0",
});
const defaultPermissions: ProjectPermissions = { canViewFull: false, canCreate: false, canEdit: false, canDelete: false, canChangeStatus: false, canManageManagers: false, canAssignStaff: false };
const statusLabels: Record<ProjectStatus, string> = { active: "Active", inactive: "Inactive", cancelled: "Cancelled" };
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

function formFromProject(project: ProjectRecord): ProjectForm {
  return {
    projectName: project.project_name,
    accountId: project.account_id,
    projectHandlerId: project.project_manager_user_id ?? "",
    projectSourceType: project.project_source_type ?? "contractor",
    partnerId: project.partner_id ?? "",
    contractorName: project.contractor_name,
    country: project.country,
    salaryRange: project.salary_range,
    ageBracket: project.age_bracket,
    totalDemand: String(project.total_demand),
    contractorServiceCharge: String(project.contractor_service_charge),
    partnerServiceCharge: String(project.partner_service_charge ?? 0),
    candidateServiceCharge: String(project.candidate_service_charge),
    interviewMode: project.interview_mode,
    status: project.status,
    visaCount: String(project.visa_count),
    ticketCount: String(project.ticket_count),
  };
}

export default function Projects() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [contractors, setContractors] = useState<ContractorRecord[]>([]);
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [accountOptions, setAccountOptions] = useState<ProjectAccountOption[]>([]);
  const [handlerOptions, setHandlerOptions] = useState<ProjectHandlerOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<ProjectStaffOption[]>([]);
  const [assistantStaffEnabled, setAssistantStaffEnabled] = useState(false);
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigningProjectId, setAssigningProjectId] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRecord | null>(null);
  const [form, setForm] = useState<ProjectForm>(initialForm);
  const [reloadKey, setReloadKey] = useState(0);
  const [showVisaCandidates, setShowVisaCandidates] = useState(false);
  const [selectedProjectForVisa, setSelectedProjectForVisa] = useState<ProjectRecord | null>(null);
  const [visaCandidates, setVisaCandidates] = useState<VisaCandidateRecord[]>([]);
  const [visaCandidatesLoading, setVisaCandidatesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const projectResponse = await fetch("/api/projects", {
          cache: "no-store",
        });
        const projectPayload = (await projectResponse.json()) as {
            projects?: ProjectRecord[];
            accountOptions?: ProjectAccountOption[];
            contractorOptions?: ContractorRecord[];
            partnerOptions?: ProjectPartnerOption[];
            projectHandlerOptions?: ProjectHandlerOption[];
            managerOptions?: ProjectHandlerOption[];
            staffOptions?: ProjectStaffOption[];
            assistantStaffEnabled?: boolean;
            permissions?: ProjectPermissions;
            error?: string;
          };
        if (!projectResponse.ok) throw new Error(projectPayload.error ?? "Unable to load projects.");
        if (cancelled) return;
        setProjects(projectPayload.projects ?? []);
        setAccountOptions(projectPayload.accountOptions ?? []);
        setHandlerOptions(projectPayload.projectHandlerOptions ?? projectPayload.managerOptions ?? []);
        setStaffOptions(projectPayload.staffOptions ?? []);
        setAssistantStaffEnabled(Boolean(projectPayload.assistantStaffEnabled));
        setPermissions(projectPayload.permissions ?? defaultPermissions);
        setContractors(projectPayload.contractorOptions ?? []);
        setPartners(projectPayload.partnerOptions ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load projects.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const filteredProjects = projects.filter((project) =>
    matchesSearch(
      search,
      project.project_name,
      project.contractor_name,
      project.country,
      project.project_source_type,
    ),
  );

  const closeForm = () => {
    setShowForm(false);
    setEditingProject(null);
    setForm(initialForm());
  };

  const openNewProject = () => {
    setEditingProject(null);
    setForm({
      ...initialForm(),
      accountId: accountOptions.length === 1 ? accountOptions[0].id : "",
    });
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
    const projectSourceType = form.projectSourceType;
    if (!projectSourceType) {
      setError("Choose whether this project is from a contractor or a partner.");
      return;
    }
    const matchingContractor =
      projectSourceType === "contractor"
        ? contractors.find(
            (contractor) =>
              contractor.company_name.toLocaleLowerCase() ===
              form.contractorName.trim().toLocaleLowerCase(),
          )
        : null;
    const matchingPartner =
      projectSourceType === "partner"
        ? partners.find((partner) => partner.id === form.partnerId) ??
          (editingProject?.partner_id === form.partnerId
            ? {
                id: form.partnerId,
                supplier_name: editingProject.contractor_name,
              }
            : null)
        : null;
    if (projectSourceType === "contractor" && !matchingContractor) {
      setError("Select a registered contractor so visa charges can appear in Contractor Finance.");
      return;
    }
    if (projectSourceType === "partner" && !matchingPartner) {
      setError("Select an active partner registered by this company.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(editingProject ? `/api/projects/${encodeURIComponent(editingProject.id)}` : "/api/projects", {
        method: editingProject ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: form.projectName,
          ...(!editingProject ? { accountId: form.accountId } : {}),
          projectSourceType,
          partnerId: matchingPartner?.id ?? null,
          ...(!editingProject || permissions.canViewFull
            ? {
                partnerServiceCharge:
                  projectSourceType === "partner"
                    ? form.partnerServiceCharge || "0"
                    : "0",
                contractorServiceCharge:
                  projectSourceType === "contractor"
                    ? form.contractorServiceCharge || "0"
                    : "0",
              }
            : {}),
          ...(permissions.canManageManagers &&
          (!editingProject ||
            form.projectHandlerId !==
              (editingProject.project_manager_user_id ?? ""))
            ? { projectHandlerId: form.projectHandlerId || null }
            : {}),
          contractorId: matchingContractor?.id ?? null,
          contractorName:
            matchingPartner?.supplier_name ??
            matchingContractor?.company_name ??
            "",
          country: form.country,
          salaryRange: form.salaryRange,
          ageBracket: form.ageBracket,
          totalDemand: form.totalDemand,
          candidateServiceCharge: form.candidateServiceCharge || "0",
          interviewMode: form.interviewMode,
          ...(permissions.canChangeStatus ? { status: form.status } : {}),
          ...(editingProject ? {
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

  const updateStaffAssignment = async (
    project: ProjectRecord,
    staffId: string,
  ) => {
    setAssigningProjectId(project.id);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "assign-assistant-staff",
            assistantStaffId: staffId || null,
          }),
        },
      );
      const payload = (await response.json()) as {
        project?: ProjectRecord;
        error?: string;
      };
      if (!response.ok || !payload.project) {
        throw new Error(
          payload.error ?? "Unable to assign staff to this project.",
        );
      }
      setReloadKey((key) => key + 1);
    } catch (assignmentError) {
      setError(
        assignmentError instanceof Error
          ? assignmentError.message
          : "Unable to assign staff to this project.",
      );
    } finally {
      setAssigningProjectId("");
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

  const openVisaCandidates = (project: ProjectRecord) => {
    setSelectedProjectForVisa(project);
    setShowVisaCandidates(true);
  };

  useEffect(() => {
    if (!showVisaCandidates || !selectedProjectForVisa) return;
    let cancelled = false;
    const load = async () => {
      setVisaCandidatesLoading(true);
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(selectedProjectForVisa.id)}/visa-candidates`, { cache: "no-store" });
        const payload = await response.json() as { candidates?: VisaCandidateRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load visa candidates.");
        if (!cancelled) setVisaCandidates(payload.candidates ?? []);
      } catch (loadError) {
        if (!cancelled) console.error("Visa candidates load failed:", loadError);
      } finally {
        if (!cancelled) setVisaCandidatesLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [showVisaCandidates, selectedProjectForVisa]);

  const partnerOptions = partners.map((partner) => ({
    value: partner.id,
    label: partner.supplier_name,
  }));
  if (
    editingProject?.project_source_type === "partner" &&
    editingProject.partner_id &&
    !partners.some((partner) => partner.id === editingProject.partner_id)
  ) {
    partnerOptions.push({
      value: editingProject.partner_id,
      label: `${editingProject.contractor_name} (inactive)`,
    });
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="projects-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 id="projects-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Projects</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{loading ? "Loading projects" : error ? "Project records unavailable" : `${projects.length} total projects`}</p>
        </div>
        {permissions.canCreate && <button type="button" onClick={openNewProject} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Plus size={16} aria-hidden="true" />Add project</button>}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <label className="flex w-full max-w-md items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search projects" placeholder="Search project, partner, contractor, or country" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
        <span className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}><BriefcaseBusiness size={15} aria-hidden="true" />{loading ? "—" : projects.length} projects</span>
      </div>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="app-table-scroll"><table className="w-full min-w-320 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Actions", "Project", "Partner / Contractor", "Project Handler", ...(assistantStaffEnabled ? ["Assistant Staff"] : []), "Country", "Salary range", "Age bracket", "Vacancies", "Submitted", "Shortfall", "Visas", "Candidate fee", ...(permissions.canViewFull ? ["Partner / Contractor fee", "Book"] : []), "Tickets", "Status"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={(permissions.canViewFull ? 17 : 15) - (assistantStaffEnabled ? 0 : 1)} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading projects…</td></tr>}
              {!loading && !error && filteredProjects.length === 0 && <tr><td colSpan={(permissions.canViewFull ? 17 : 15) - (assistantStaffEnabled ? 0 : 1)} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{projects.length ? "No projects match this search." : "No projects registered yet."}</td></tr>}
              {!loading && filteredProjects.map((project) => <tr key={project.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3"><div className="flex items-center gap-1"><button type="button" aria-label={`Edit ${project.project_name}`} title="Edit project" disabled={!permissions.canEdit} onClick={() => openEditProject(project)} className="p-2 disabled:cursor-not-allowed disabled:opacity-40" style={{ color: "var(--muted-foreground)" }}><Pencil size={15} aria-hidden="true" /></button><button type="button" aria-label={`View visa candidates for ${project.project_name}`} title="View visa candidates" onClick={() => openVisaCandidates(project)} className="p-2" style={{ color: "var(--foreground)" }}><Eye size={15} aria-hidden="true" /></button><button type="button" aria-label={`Delete ${project.project_name}`} title="Delete project" disabled={!permissions.canDelete} onClick={() => void deleteProject(project)} className="p-2 disabled:cursor-not-allowed disabled:opacity-40" style={{ color: "#ef4444" }}><Trash2 size={15} aria-hidden="true" /></button></div></td>
                <td className="whitespace-nowrap px-3 py-3 font-600" style={{ color: "var(--foreground)" }}>{project.project_name}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{project.project_source_type === "partner" ? "Partner: " : "Contractor: "}{project.contractor_name}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{project.project_manager_name || "Unassigned"}</td>
                {assistantStaffEnabled && <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>
                  {project.can_assign_staff ? (
                    <SearchableSelect
                      aria-label={`Assign staff to ${project.project_name}`}
                      value={project.assigned_staff_id ?? ""}
                      onChange={(staffId) => void updateStaffAssignment(project, staffId)}
                      options={staffOptions.filter((staff) => staff.status === "Active").map((staff) => ({
                        value: staff.id,
                        label: staff.name,
                        description: staff.position,
                      }))}
                      placeholder="Search at least 2 characters"
                      minQueryLength={2}
                      matchMode="prefix"
                      preserveValueOnInput
                      disabled={assigningProjectId === project.id}
                      className="min-w-52 max-w-64 text-xs"
                      style={fieldStyle}
                    />
                  ) : (
                    project.assigned_staff_name || "Unassigned"
                  )}
                </td>}
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{project.country}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{project.salary_range}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{project.age_bracket}</td>
                <td className="px-3 py-3 mono font-700" style={{ color: "var(--foreground)" }}>{project.total_demand}</td>
                <td className="px-3 py-3 mono" style={{ color: "var(--foreground)" }}>{project.submitted_count}</td>
                <td className="px-3 py-3 mono font-700" style={{ color: "#f59e0b" }}>{Math.max(0, project.total_demand - project.submitted_count)}</td>
                <td className="px-3 py-3 mono" style={{ color: "var(--foreground)" }}>{project.visa_count}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{project.candidate_service_charge.toLocaleString("en-UG")}</td>
                {permissions.canViewFull && <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{(project.project_source_type === "partner" ? project.partner_service_charge : project.contractor_service_charge).toLocaleString("en-UG")}</td>}
                {permissions.canViewFull && <td className="whitespace-nowrap px-3 py-3 text-xs font-600" style={{ color: "#17845b" }}>Project: {project.project_name} #{project.id.replace(/-/g, "").slice(-12)}</td>}
                <td className="px-3 py-3 mono" style={{ color: "var(--foreground)" }}>{project.ticket_count}</td>
                <td className="px-3 py-3"><select aria-label={`Status for ${project.project_name}`} value={project.status} disabled={!permissions.canChangeStatus} onChange={(event) => void updateStatus(project, event.target.value as ProjectStatus)} className="border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-70" style={fieldStyle}><option value="active">Active</option><option value="inactive">Inactive</option><option value="cancelled">Cancelled</option></select></td>
              </tr>)}
            </tbody>
          </table></div>
        </div>
      </div>

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
        <form onSubmit={saveProject} className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>{editingProject ? "Edit project" : "Add project"}</h2><button type="button" onClick={closeForm} aria-label="Close project form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Project name<input required maxLength={200} value={form.projectName} onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            {!editingProject && <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Project account<select required value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}><option value="">Select an active account</option>{accountOptions.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>{accountOptions.length === 0 && <span className="mt-1 block normal-case tracking-normal text-amber-500">No active account is available for your branch. Ask an administrator to configure one.</span>}</label>}
            {permissions.canManageManagers && <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Project Handler (optional)<SearchableSelect disabled={handlerOptions.length === 0} ariaLabel="Search and optionally select a Project Handler from active company members" value={form.projectHandlerId} onChange={(projectHandlerId) => setForm((current) => ({ ...current, projectHandlerId }))} options={handlerOptions.map((handler) => ({ value: handler.id, label: handler.name, description: handler.position }))} placeholder={handlerOptions.length ? "Optional — search at least 2 characters" : "No active company members"} minQueryLength={2} matchMode="prefix" preserveValueOnInput className="mt-1 normal-case tracking-normal" />{handlerOptions.length === 0 && <span className="mt-1 block normal-case tracking-normal text-amber-500">Add an active company member before assigning a Project Handler.</span>}</label>}
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Project source<select required disabled={Boolean(editingProject && !permissions.canViewFull)} value={form.projectSourceType} onChange={(event) => { const projectSourceType = event.target.value as ProjectSourceType; setForm((current) => ({ ...current, projectSourceType, partnerId: "", contractorName: "", contractorServiceCharge: projectSourceType === "contractor" ? "" : "0", partnerServiceCharge: projectSourceType === "partner" ? "" : "0" })); }} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none disabled:opacity-60" style={fieldStyle}><option value="" disabled>Select a project source</option><option value="contractor">From a contractor</option><option value="partner">From a partner</option></select>{editingProject && !permissions.canViewFull && <span className="mt-1 block normal-case tracking-normal">Only users with full project access can change the source or service charge.</span>}</label>
            {form.projectSourceType === "contractor" ? (
              <label className="relative z-20 block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Contractor name<SearchableSelect required ariaLabel="Select a registered contractor" value={form.contractorName} onChange={(contractorName) => setForm((current) => ({ ...current, contractorName }))} options={contractors.map((contractor) => ({ value: contractor.company_name, label: contractor.company_name }))} placeholder={contractors.length ? "Search registered contractors" : "No contractors registered"} className="z-50 mt-1 normal-case tracking-normal" /></label>
            ) : (
              <label className="relative z-20 block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Partner name<SearchableSelect required ariaLabel="Select an active partner" value={form.partnerId} onChange={(partnerId) => { const partner = partners.find((option) => option.id === partnerId); setForm((current) => ({ ...current, partnerId, contractorName: partner?.supplier_name ?? current.contractorName })); }} options={partnerOptions} placeholder={partnerOptions.length ? "Search registered partners" : "No active partners registered"} className="z-50 mt-1 normal-case tracking-normal" />{!partners.length && <span className="mt-1 block normal-case tracking-normal text-amber-500">Register an active partner in the Partners module first.</span>}</label>
            )}
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Country of deployment<input required maxLength={200} value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Salary range<input required maxLength={200} value={form.salaryRange} onChange={(event) => setForm((current) => ({ ...current, salaryRange: event.target.value }))} placeholder="e.g. UGX 1,000,000 - 1,500,000" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Age bracket<input required maxLength={100} value={form.ageBracket} onChange={(event) => setForm((current) => ({ ...current, ageBracket: event.target.value }))} placeholder="e.g. 21-35 years" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Total demand (vacancies)<input required min={1} step={1} type="number" value={form.totalDemand} onChange={(event) => setForm((current) => ({ ...current, totalDemand: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            {(!editingProject || permissions.canViewFull) && (form.projectSourceType === "contractor" ? (
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Contractor service charge per visa<input min={0} step="0.01" type="number" value={form.contractorServiceCharge} onChange={(event) => setForm((current) => ({ ...current, contractorServiceCharge: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            ) : (
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Partner service charge per visa<input min={0} step="0.01" type="number" value={form.partnerServiceCharge} onChange={(event) => setForm((current) => ({ ...current, partnerServiceCharge: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            ))}
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Candidate service charge per visa<input min={0} step="0.01" type="number" value={form.candidateServiceCharge} onChange={(event) => setForm((current) => ({ ...current, candidateServiceCharge: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Interview mode<select value={form.interviewMode} onChange={(event) => setForm((current) => ({ ...current, interviewMode: event.target.value as ProjectForm["interviewMode"] }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}><option>Face to face</option><option>Online</option><option>Direct submission</option></select></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Status<select disabled={!permissions.canChangeStatus} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ProjectStatus }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none disabled:opacity-60" style={fieldStyle}><option value="active">Active</option><option value="inactive">Inactive</option><option value="cancelled">Cancelled</option></select></label>
            {editingProject && <>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Visas<input min={0} step={1} required type="number" value={form.visaCount} onChange={(event) => setForm((current) => ({ ...current, visaCount: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Tickets<input min={0} step={1} required type="number" value={form.ticketCount} onChange={(event) => setForm((current) => ({ ...current, ticketCount: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            </>}
          </div>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save project"}</button><button type="button" onClick={closeForm} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}

      {showVisaCandidates && selectedProjectForVisa && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowVisaCandidates(false); }}>
        <div className="max-h-[90dvh] w-full max-w-4xl overflow-auto border p-6 rounded-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Visa Recipients - {selectedProjectForVisa.project_name}</h2><button type="button" onClick={() => setShowVisaCandidates(false)} aria-label="Close visa candidates modal" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          {visaCandidatesLoading && <div className="py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading visa candidates…</div>}
          {!visaCandidatesLoading && visaCandidates.length === 0 && <div className="py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No candidates have received visas for this project yet.</div>}
          {!visaCandidatesLoading && visaCandidates.length > 0 && (
            <div className="overflow-x-auto">
              <div className="app-table-scroll"><table className="w-full min-w-600 text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    {["Candidate Name", "Passport Number", "Date Visa Received"].map((heading) => (
                      <th key={heading} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide text-left" style={{ color: "var(--muted-foreground)" }}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visaCandidates.map((candidate) => (
                    <tr key={candidate.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>{candidate.fullName}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-700 mono" style={{ color: "var(--primary)" }}>{candidate.passportNumber || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{candidate.visaReceivedDateFormatted}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
      </div>}
    </section>
  );
}