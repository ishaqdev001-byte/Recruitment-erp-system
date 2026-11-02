import { useEffect, useState } from "react";
import { Paperclip, RefreshCw, Send, UserRoundCheck } from "lucide-react";
import CandidateDetail from "./CandidateDetail";
import AttachmentDrawer from "./AttachmentDrawer";
import { matchesSearch } from "@/lib/search";

export interface Candidate {
  id: string;
  fileNumber: string;
  firstName: string;
  lastName: string;
  otherNames: string;
  phone: string;
  secondaryPhone: string;
  otherPhone: string;
  dob: string;
  age: number;
  gender: string;
  maritalStatus: string;
  religion: string;
  abroadStatus: string;
  abroadExperience: string;
  source: string;
  agent: string;
  agentUserId?: string;
  mediaChannel: string[];
  // Passport
  nin: string;
  passportNumber: string;
  passportIssue: string;
  passportExpiry: string;
  passportStatus: string;
  passportBranch: string;
  passportStorageLocation: string;
  // Preferred Locations
  preferredCities: string;
  // Residence
  placeOfBirth: string;
  physicalAddress: string;
  district: string;
  county: string;
  subCounty: string;
  parish: string;
  // Parents
  fatherName: string;
  fatherPhone: string;
  fatherStatus: string;
  motherName: string;
  motherPhone: string;
  motherStatus: string;
  // Next of Kin
  kinFirstName: string;
  kinLastName: string;
  kinPhone: string;
  kinRelationship: string;
  // Emergency
  emergencyFirstName: string;
  emergencyLastName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  // Job
  jobOfInterest: string[];
  preferredCountries: string[];
  assignedContracts: string;
  // Status
  stage: string;
  travelStatus: string;
  visaStatus: string;
  acceptance: string;
  contracts: string;
  contractManager: string;
  branch: string;
  branchId?: string;
  residenceCountry?: string;
  residenceState?: string;
  verification: string;
  photo: string;
  nationality?: string;
  educationQualification?: string;
  educationInstitution?: string;
  educationYearCompleted?: string;
  educationField?: string;
  lastEmployer?: string;
  previousJobTitle?: string;
  employmentFrom?: string;
  employmentTo?: string;
  employmentDuties?: string;
  keySkills?: string;
  languagesSpoken?: string;
  certifications?: string;
  recruiterNotes?: string;
}

const stageColor: Record<string, string> = {
  Registration: "#f59e0b",
  "Visa Processing": "#6366f1",
  "Final Round": "#3b82f6",
  Withdrawn: "#ef4444",
  Travelled: "#10b981",
};

function candidateFromRecord(value: Record<string, unknown>): Candidate {
  const details = value.details && typeof value.details === "object" && !Array.isArray(value.details)
    ? value.details as Record<string, unknown>
    : {};
  const text = (key: string) => typeof details[key] === "string" ? details[key] as string : "";
  const list = (key: string) => Array.isArray(details[key])
    ? details[key].filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
    fileNumber: typeof value.file_number === "string" ? value.file_number : "",
    firstName: typeof value.first_name === "string" ? value.first_name : "",
    lastName: typeof value.last_name === "string" ? value.last_name : "",
    otherNames: text("otherNames"),
    phone: typeof value.phone === "string" ? value.phone : "",
    secondaryPhone: text("secondaryPhone"),
    otherPhone: text("otherPhone"),
    dob: typeof value.date_of_birth === "string" ? value.date_of_birth : "",
    age: typeof details.age === "number" ? details.age : 0,
    gender: text("gender"),
    maritalStatus: text("maritalStatus"),
    religion: typeof value.religion === "string" ? value.religion : text("religion"),
    abroadStatus: text("abroadStatus"),
    abroadExperience: text("abroadExperience"),
    source: text("source"),
    agent: typeof value.agent_name === "string" ? value.agent_name : "",
    agentUserId: typeof value.agent_user_id === "string" ? value.agent_user_id : undefined,
    mediaChannel: list("mediaChannel"),
    nin: text("nin"),
    passportNumber: text("passportNumber"),
    passportIssue: text("passportIssue"),
    passportExpiry: text("passportExpiry"),
    passportStatus: text("passportStatus") || "Available",
    passportBranch: text("passportBranch"),
    passportStorageLocation: text("passportStorageLocation"),
    preferredCities: text("preferredCities"),
    placeOfBirth: typeof value.place_of_birth === "string" ? value.place_of_birth : "",
    physicalAddress: text("physicalAddress"),
    district: text("district"),
    county: text("county"),
    subCounty: text("subCounty"),
    parish: text("parish"),
    residenceCountry: text("residenceCountry"),
    residenceState: text("residenceState"),
    fatherName: typeof value.father_name === "string" ? value.father_name : "",
    fatherPhone: text("fatherPhone"),
    fatherStatus: text("fatherStatus"),
    motherName: typeof value.mother_name === "string" ? value.mother_name : "",
    motherPhone: text("motherPhone"),
    motherStatus: text("motherStatus"),
    kinFirstName: text("kinFirstName"),
    kinLastName: text("kinLastName"),
    kinPhone: text("kinPhone"),
    kinRelationship: text("kinRelationship"),
    emergencyFirstName: text("emergencyFirstName"),
    emergencyLastName: text("emergencyLastName"),
    emergencyPhone: text("emergencyPhone"),
    emergencyRelationship: text("emergencyRelationship"),
    jobOfInterest: list("jobOfInterest"),
    preferredCountries: list("preferredCountries"),
    assignedContracts: text("assignedContracts"),
    stage: text("stage") || "Registration",
    travelStatus: text("travelStatus"),
    visaStatus: text("visaStatus"),
    acceptance: text("acceptance"),
    contracts: text("contracts"),
    contractManager: text("contractManager"),
    branch: text("branch"),
    branchId: typeof value.branch_id === "string" ? value.branch_id : undefined,
    verification: text("verification"),
    photo: text("photo"),
    nationality: typeof value.nationality === "string" ? value.nationality : text("nationality"),
    educationQualification: text("educationQualification"),
    educationInstitution: text("educationInstitution"),
    educationYearCompleted: text("educationYearCompleted"),
    educationField: text("educationField"),
    lastEmployer: text("lastEmployer"),
    previousJobTitle: text("previousJobTitle"),
    employmentFrom: text("employmentFrom"),
    employmentTo: text("employmentTo"),
    employmentDuties: text("employmentDuties"),
    keySkills: text("keySkills"),
    languagesSpoken: text("languagesSpoken"),
    certifications: text("certifications"),
    recruiterNotes: text("recruiterNotes"),
  };
}

function candidatePayload(candidate: Candidate) {
  return {
    fileNumber: candidate.fileNumber,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    phone: candidate.phone,
    dob: candidate.dob || null,
    placeOfBirth: candidate.placeOfBirth,
    nationality: candidate.nationality ?? "",
    agent: candidate.agent,
    agentUserId: candidate.agentUserId ?? "",
    branchId: candidate.branchId ?? "",
    religion: candidate.religion,
    fatherName: candidate.fatherName,
    motherName: candidate.motherName,
    position: candidate.jobOfInterest.join(", "),
    details: {
      otherNames: candidate.otherNames,
      secondaryPhone: candidate.secondaryPhone,
      otherPhone: candidate.otherPhone,
      age: candidate.age,
      gender: candidate.gender,
      maritalStatus: candidate.maritalStatus,
      religion: candidate.religion,
      abroadStatus: candidate.abroadStatus,
      abroadExperience: candidate.abroadExperience,
      source: candidate.source,
      nationality: candidate.nationality ?? "",
      mediaChannel: candidate.mediaChannel,
      nin: candidate.nin,
      passportNumber: candidate.passportNumber,
      passportIssue: candidate.passportIssue,
      passportExpiry: candidate.passportExpiry,
      passportStatus: candidate.passportStatus,
      passportBranch: candidate.passportBranch,
      passportStorageLocation: candidate.passportStorageLocation,
      preferredCities: candidate.preferredCities,
      physicalAddress: candidate.physicalAddress,
      residenceCountry: candidate.residenceCountry ?? "",
      residenceState: candidate.residenceState ?? "",
      district: candidate.district,
      county: candidate.county,
      subCounty: candidate.subCounty,
      parish: candidate.parish,
      fatherPhone: candidate.fatherPhone,
      fatherStatus: candidate.fatherStatus,
      motherPhone: candidate.motherPhone,
      motherStatus: candidate.motherStatus,
      kinFirstName: candidate.kinFirstName,
      kinLastName: candidate.kinLastName,
      kinPhone: candidate.kinPhone,
      kinRelationship: candidate.kinRelationship,
      emergencyFirstName: candidate.emergencyFirstName,
      emergencyLastName: candidate.emergencyLastName,
      emergencyPhone: candidate.emergencyPhone,
      emergencyRelationship: candidate.emergencyRelationship,
      jobOfInterest: candidate.jobOfInterest,
      preferredCountries: candidate.preferredCountries,
      branch: candidate.branch,
      stage: candidate.stage,
      travelStatus: candidate.travelStatus,
      visaStatus: candidate.visaStatus,
      acceptance: candidate.acceptance,
      contracts: candidate.contracts,
      contractManager: candidate.contractManager,
      verification: candidate.verification,
      photo: candidate.photo,
      educationQualification: candidate.educationQualification ?? "",
      educationInstitution: candidate.educationInstitution ?? "",
      educationYearCompleted: candidate.educationYearCompleted ?? "",
      educationField: candidate.educationField ?? "",
      lastEmployer: candidate.lastEmployer ?? "",
      previousJobTitle: candidate.previousJobTitle ?? "",
      employmentFrom: candidate.employmentFrom ?? "",
      employmentTo: candidate.employmentTo ?? "",
      employmentDuties: candidate.employmentDuties ?? "",
      keySkills: candidate.keySkills ?? "",
      languagesSpoken: candidate.languagesSpoken ?? "",
      certifications: candidate.certifications ?? "",
      recruiterNotes: candidate.recruiterNotes ?? "",
    },
  };
}

export default function Candidates() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [canViewFinance, setCanViewFinance] = useState(false);
  const [canViewActivityLogs, setCanViewActivityLogs] = useState(false);
  const [canManageCandidateSources, setCanManageCandidateSources] = useState(false);
  const [canManagePassportStatus, setCanManagePassportStatus] = useState(false);
  const [isAgent, setIsAgent] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawerCandidate, setDrawerCandidate] = useState<Candidate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState(25);
  const [filters, setFilters] = useState({
    dateFrom: "", dateTo: "", stage: "", travelStatus: "",
    visaStatus: "", passportStatus: "", verification: "",
    branch: "", contracts: "", contractManager: "",
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/candidates", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load candidates.");
        const records = payload.candidates as Record<string, unknown>[];
        if (cancelled) return;
        setCandidates(records.map(candidateFromRecord));
        setCanViewFinance(Boolean(payload.permissions?.canViewFinance));
        setCanViewActivityLogs(Boolean(payload.permissions?.canViewActivityLogs));
        setCanManageCandidateSources(Boolean(payload.permissions?.canManageCandidateSources));
        setCanManagePassportStatus(Boolean(payload.permissions?.canManagePassportStatus));
        setIsAgent(Boolean(payload.permissions?.isAgent));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Unable to load candidates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = candidates.filter((c) => {
    const ms = matchesSearch(search, c.firstName, c.lastName, c.fileNumber);
    const mStage = !filters.stage || c.stage === filters.stage;
    const mTravel = !filters.travelStatus || c.travelStatus === filters.travelStatus;
    const mVisa = !filters.visaStatus || c.visaStatus === filters.visaStatus;
    return ms && mStage && mTravel && mVisa;
  });

  const blankCandidate = (): Candidate => ({
    id: crypto.randomUUID(), fileNumber: "",
    firstName: "", lastName: "", otherNames: "", phone: "", secondaryPhone: "", otherPhone: "",
    dob: "", age: 0, gender: "", maritalStatus: "", religion: "", abroadStatus: "", abroadExperience: "",
    source: "", agent: "", mediaChannel: [],
    nin: "", passportNumber: "", passportIssue: "", passportExpiry: "", passportStatus: "Available", passportBranch: "", passportStorageLocation: "",
    preferredCities: "",
    placeOfBirth: "", physicalAddress: "", district: "", county: "", subCounty: "", parish: "",
    residenceCountry: "", residenceState: "", nationality: "", branchId: "",
    fatherName: "", fatherPhone: "", fatherStatus: "", motherName: "", motherPhone: "", motherStatus: "",
    kinFirstName: "", kinLastName: "", kinPhone: "", kinRelationship: "",
    emergencyFirstName: "", emergencyLastName: "", emergencyPhone: "", emergencyRelationship: "",
    jobOfInterest: [], preferredCountries: [], assignedContracts: "",
    stage: "Registration", travelStatus: "Pending Travel", visaStatus: "Pending",
    acceptance: "Yes", contracts: "—", contractManager: "—", branch: "", verification: "Pending", photo: "",
  });

  const handleSave = async (updated: Candidate) => {
    const values = candidatePayload(updated);
    const requestBody = isNew
      ? values
      : {
          file_number: values.fileNumber,
          first_name: values.firstName,
          last_name: values.lastName,
          phone: values.phone,
          date_of_birth: values.dob,
          place_of_birth: values.placeOfBirth,
          agent_name: values.agent,
          agentUserId: values.agentUserId,
          branchId: values.branchId,
          religion: values.religion,
          nationality: values.nationality,
          father_name: values.fatherName,
          mother_name: values.motherName,
          position: values.position,
          details: values.details,
        };
    const response = await fetch(
      isNew ? "/api/candidates" : `/api/candidates/${encodeURIComponent(updated.id)}`,
      {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    );
    const payload = await response.json() as { candidate?: Record<string, unknown>; error?: string };
    if (!response.ok || !payload.candidate) {
      throw new Error(payload.error ?? "Unable to save candidate.");
    }
    const savedCandidate = candidateFromRecord(payload.candidate);
    if (isNew) {
      setCandidates((prev) => [savedCandidate, ...prev]);
    } else {
      setCandidates((prev) => prev.map((c) => (c.id === savedCandidate.id ? savedCandidate : c)));
    }
    setEditingId(null);
    setIsNew(false);
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () =>
    setSelected(selected.length === filtered.length ? [] : filtered.map((c) => c.id));

  if (editingId !== null || isNew) {
    const editing = isNew ? blankCandidate() : candidates.find((c) => c.id === editingId)!;
    return (
      <CandidateDetail
        candidate={editing}
        isNew={isNew}
        isAgent={isAgent}
        onSave={handleSave}
        onBack={() => { setEditingId(null); setIsNew(false); }}
        canViewFinance={canViewFinance}
        canViewActivityLogs={canViewActivityLogs}
        canManageSources={canManageCandidateSources}
        canManagePassportStatus={canManagePassportStatus}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Candidates</h1>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 text-sm font-600 rounded border"
            style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--secondary)" }}
          >
            + Documents
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="grid grid-cols-6 gap-3 mb-3">
          <div>
            <label className="text-xs font-700 uppercase tracking-wider block mb-1" style={{ color: "var(--muted-foreground)" }}>Date From</label>
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="w-full px-2 py-1.5 text-xs rounded border outline-none"
              style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
          </div>
          <div>
            <label className="text-xs font-700 uppercase tracking-wider block mb-1" style={{ color: "var(--muted-foreground)" }}>Date To</label>
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="w-full px-2 py-1.5 text-xs rounded border outline-none"
              style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
          </div>
          {[
            { key: "stage", label: "Stages", opts: ["", "Registration", "Visa Processing", "Final Round", "Travelled", "Withdrawn"] },
            { key: "travelStatus", label: "Travel Status", opts: ["", "Pending Travel", "Travelled", "Withdrawn"] },
            { key: "visaStatus", label: "Visa Status", opts: ["", "Pending", "Received", "Cancelled"] },
            { key: "passportStatus", label: "Passport Status", opts: ["", "Valid", "Expired", "Pending"] },
          ].map(({ key, label, opts }) => (
            <div key={key}>
              <label className="text-xs font-700 uppercase tracking-wider block mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</label>
              <select
                value={(filters as Record<string, string>)[key]}
                onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full px-2 py-1.5 text-xs rounded border outline-none"
                style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                {opts.map((o) => <option key={o} value={o}>{o || "Select option"}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          {[
            { key: "verification", label: "Verification", opts: ["", "Verified", "Pending", "Failed"] },
            { key: "branch", label: "Branches", opts: ["", "Kampala", "Masaka", "Gulu", "Mbarara"] },
            { key: "contracts", label: "Contracts", opts: ["", "KW-2026-003", "SA-2026-011", "UAE-2026-007"] },
            { key: "contractManager", label: "Contract Manager", opts: ["", "Aisha Tendo", "Director Vicent", "Asiimwe david"] },
          ].map(({ key, label, opts }) => (
            <div key={key}>
              <label className="text-xs font-700 uppercase tracking-wider block mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</label>
              <select
                value={(filters as Record<string, string>)[key]}
                onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full px-2 py-1.5 text-xs rounded border outline-none"
                style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                {opts.map((o) => <option key={o} value={o}>{o || "Select option"}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="px-6 py-1.5 text-sm font-600 rounded" style={{ background: "#6366f1", color: "#fff" }}>Filter</button>
          <button
            onClick={() => setFilters({ dateFrom: "", dateTo: "", stage: "", travelStatus: "", visaStatus: "", passportStatus: "", verification: "", branch: "", contracts: "", contractManager: "" })}
            className="px-6 py-1.5 text-sm font-600 rounded"
            style={{ background: "var(--foreground)", color: "var(--background)" }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      <div className="px-6 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-600 rounded" style={{ background: "#f59e0b", color: "#000" }}>
            <RefreshCw size={14} aria-hidden="true" /> Update Stage ({selected.length})
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-600 rounded" style={{ background: "#3b82f6", color: "#fff" }}>
            <UserRoundCheck size={14} aria-hidden="true" /> Submit Candidate ({selected.length})
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-600 rounded" style={{ background: "#10b981", color: "#fff" }}>
            <Send size={14} aria-hidden="true" /> Send SMS ({selected.length})
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Show
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="px-2 py-1 rounded border outline-none mono"
              style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              {[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}
            </select>
            candidates
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Search candidates:
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-2 py-1 rounded border outline-none w-36"
              style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0" style={{ background: "var(--card)" }}>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              <th className="px-3 py-3 w-8">
                <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll}
                  className="rounded" style={{ accentColor: "var(--primary)" }} />
              </th>
              {["", "SL", "Photo", "File No", "Name", "Phone", "District", "Pay Status", "Doc Status", "Passport", "Contracts", "Contract Manager", "Agent", "Stage", "Change"].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-xs font-700 uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && !loadError && filtered.length === 0 && (
              <tr><td colSpan={15} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No candidate records found for this company.</td></tr>
            )}
            {loading && <tr><td colSpan={15} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading candidates…</td></tr>}
            {loadError && <tr><td colSpan={15} role="alert" className="px-4 py-10 text-center text-sm" style={{ color: "#ef4444" }}>{loadError}</td></tr>}
            {filtered.slice(0, perPage).map((c, i) => (
              <tr
                key={c.id}
                className="border-b transition-colors"
                style={{ borderColor: "var(--border)", background: selected.includes(c.id) ? "var(--secondary)" : "transparent" }}
              >
                {/* Attachment icon — opens drawer */}
                <td className="px-2 py-1.5 w-8">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDrawerCandidate(c); }}
                    title="View attachments"
                    className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:opacity-80"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <Paperclip size={14} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </td>
                <td className="px-3 py-1.5 w-8">
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)}
                    style={{ accentColor: "var(--primary)" }} />
                </td>
                <td className="px-3 py-1.5 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{i + 1}</td>
                <td className="px-3 py-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700"
                    style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                    {c.photo ? <img src={c.photo} className="w-7 h-7 rounded-full object-cover" alt="" /> : c.firstName[0]}
                  </div>
                </td>
                <td className="px-3 py-1.5 mono text-xs font-600" style={{ color: "var(--muted-foreground)" }}>{c.fileNumber}</td>
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => setEditingId(c.id)}
                    className="font-600 text-xs hover:underline text-left"
                    style={{ color: "#6366f1" }}
                  >
                    {c.firstName} {c.lastName}
                  </button>
                </td>
                <td className="px-3 py-1.5 mono text-xs" style={{ color: "var(--foreground)" }}>{c.phone}</td>
                <td className="px-3 py-1.5 text-xs" style={{ color: "var(--foreground)" }}>{c.district || "—"}</td>
                {/* Payment Status */}
                <td className="px-3 py-1.5">
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>
                </td>
                {/* Doc Status */}
                <td className="px-3 py-1.5">
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>
                </td>
                {/* Passport Custody */}
                <td className="px-3 py-1.5">
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>
                </td>
                <td className="px-3 py-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{c.contracts}</td>
                <td className="px-3 py-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{c.contractManager}</td>
                <td className="px-3 py-1.5 text-xs" style={{ color: "var(--foreground)" }}>{c.agent}</td>
                <td className="px-3 py-1.5">
                  <span className="rounded px-2 py-0.5 text-xs font-700"
                    style={{ background: (stageColor[c.stage] || "#6b7280") + "22", color: stageColor[c.stage] || "#6b7280" }}>
                    {c.stage || "—"}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => setEditingId(c.id)}
                    className="px-2 py-0.5 text-xs rounded border"
                    style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Attachment drawer */}
      {drawerCandidate && (
        <AttachmentDrawer candidate={drawerCandidate} onClose={() => setDrawerCandidate(null)} />
      )}
    </div>
  );
}
