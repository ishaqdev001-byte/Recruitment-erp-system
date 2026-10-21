import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Paperclip, Pencil, RefreshCw, UserPlus, X } from "lucide-react";
import AttachmentDrawer from "./AttachmentDrawer";
import CandidateDetail from "./CandidateDetail";
import type { Candidate } from "./Candidates";

interface CandidateRecord {
  id: string;
  source_row_number: number | null;
  file_number: string;
  first_name: string;
  last_name: string;
  phone: string;
  date_of_birth: string | null;
  place_of_birth: string;
  agent_name: string;
  religion: string;
  position: string;
  nationality: string;
  father_name: string;
  mother_name: string;
  details: Record<string, unknown> | null;
  visa_locked?: boolean;
}
type InquirySource = "radio" | "television" | "friend_referral" | "walk_in" | "sign_post" | "agent";
type InquiryPerson = { user_id: string; display_name: string; role_name: string };
interface InquiryRecord {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  discovery_source: InquirySource;
  agent_user_id: string | null;
  agent_name: string;
  desired_countries: string[];
  job_of_interest: string[];
  has_experience: boolean;
  experience_description: string;
  communication_method: "call" | "text" | "both";
  handled_by_user_id: string;
  handled_by_name: string;
  remarks: string;
  created_at: string;
}
interface InquiryDraft {
  firstName: string;
  lastName: string;
  phone: string;
  discoverySource: InquirySource | "";
  agentUserId: string;
  desiredCountries: string[];
  jobOfInterest: string[];
  hasExperience: "yes" | "no";
  experienceDescription: string;
  communicationMethod: "call" | "text" | "both";
  handledByUserId: string;
  remarks: string;
}

interface ProjectOption {
  id: string;
  project_name: string;
  country: string;
  age_bracket: string;
  status: string;
}

function candidateFromRecord(record: CandidateRecord): Candidate {
  const details = record.details ?? {};
  const detail = (key: string) => details[key];
  const text = (key: string) => typeof detail(key) === "string" ? detail(key) as string : "";
  const list = (key: string) => Array.isArray(detail(key)) ? detail(key) as string[] : [];
  const passportNumber = text("passportNumber");
  const storedPassportStatus = text("passportStatus");
  return {
    id: record.id,
    fileNumber: record.file_number,
    firstName: record.first_name,
    lastName: record.last_name,
    otherNames: text("otherNames"),
    phone: record.phone,
    secondaryPhone: text("secondaryPhone"),
    otherPhone: text("otherPhone"),
    dob: record.date_of_birth ?? "",
    age: typeof detail("age") === "number" ? detail("age") as number : 0,
    gender: text("gender"),
    maritalStatus: text("maritalStatus"),
    religion: record.religion,
    nationality: record.nationality,
    abroadStatus: text("abroadStatus"),
    abroadExperience: text("abroadExperience"),
    source: text("source"),
    agent: record.agent_name,
    mediaChannel: list("mediaChannel"),
    nin: text("nin"),
    passportNumber,
    passportIssue: text("passportIssue"),
    passportExpiry: text("passportExpiry"),
    passportStatus: storedPassportStatus === "Available" || storedPassportStatus === "With Agent"
      ? storedPassportStatus
      : record.agent_name ? "With Agent" : "Available",
    passportBranch: text("passportBranch"),
    passportStorageLocation: text("passportStorageLocation"),
    height: text("height"),
    weight: text("weight"),
    shirtSize: text("shirtSize"),
    shoeSize: text("shoeSize"),
    waistSize: text("waistSize"),
    preferredCities: text("preferredCities"),
    placeOfBirth: record.place_of_birth,
    physicalAddress: text("physicalAddress"),
    district: text("district"),
    county: text("county"),
    subCounty: text("subCounty"),
    parish: text("parish"),
    fatherName: record.father_name,
    fatherPhone: text("fatherPhone"),
    fatherStatus: text("fatherStatus"),
    motherName: record.mother_name,
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
    jobOfInterest: list("jobOfInterest").length ? list("jobOfInterest") : record.position.split(", ").filter(Boolean),
    preferredCountries: list("preferredCountries"),
    assignedContracts: text("assignedContracts"),
    stage: text("stage") || "Registration",
    travelStatus: text("travelStatus") || "Pending Travel",
    visaStatus: text("visaStatus") || "Pending",
    acceptance: text("acceptance"),
    contracts: text("contracts"),
    contractManager: text("contractManager"),
    branch: text("branch"),
    verification: text("verification") || "Pending",
    photo: text("photo"),
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

function newCandidate(): Candidate {
  return candidateFromRecord({
    id: crypto.randomUUID(), source_row_number: null, file_number: "", first_name: "", last_name: "", phone: "",
    date_of_birth: null, place_of_birth: "", agent_name: "", religion: "", position: "", nationality: "",
    father_name: "", mother_name: "", details: {},
  });
}

const inquirySources: { value: InquirySource; label: string }[] = [
  { value: "radio", label: "Radio" },
  { value: "television", label: "Television advert" },
  { value: "friend_referral", label: "Referred by a friend" },
  { value: "walk_in", label: "Walk-in" },
  { value: "sign_post", label: "Sign post" },
  { value: "agent", label: "Agent" },
];

const emptyInquiryDraft = (): InquiryDraft => ({
  firstName: "",
  lastName: "",
  phone: "",
  discoverySource: "",
  agentUserId: "",
  desiredCountries: [],
  jobOfInterest: [],
  hasExperience: "no",
  experienceDescription: "",
  communicationMethod: "call",
  handledByUserId: "",
  remarks: "",
});

function inquirySourceLabel(source: InquirySource) {
  return inquirySources.find((item) => item.value === source)?.label ?? source;
}

function candidateFromInquiry(inquiry: InquiryRecord): Candidate {
  const source = inquiry.discovery_source === "friend_referral" ? "Referred By Friend"
    : inquiry.discovery_source === "walk_in" ? "Walk-in"
      : inquiry.discovery_source === "sign_post" ? "Sign Post"
        : inquiry.discovery_source === "television" ? "Television Advert"
          : inquiry.discovery_source === "radio" ? "Radio" : "Agent Referral";
  return candidateFromRecord({
    id: crypto.randomUUID(),
    source_row_number: null,
    file_number: "",
    first_name: inquiry.first_name,
    last_name: inquiry.last_name,
    phone: inquiry.phone,
    date_of_birth: null,
    place_of_birth: "",
    agent_name: inquiry.agent_name,
    religion: "",
    position: inquiry.job_of_interest.join(", "),
    nationality: "",
    father_name: "",
    mother_name: "",
    details: {
      jobOfInterest: inquiry.job_of_interest,
      preferredCountries: inquiry.desired_countries,
      stage: "Registration",
      source,
      agent: inquiry.agent_name,
      abroadExperience: inquiry.has_experience ? "" : "None",
      employmentDuties: inquiry.experience_description,
      recruiterNotes: [
        `Inquiry handled by ${inquiry.handled_by_name}`,
        `Preferred communication: ${inquiry.communication_method}`,
        inquiry.remarks,
      ].filter(Boolean).join("\n"),
    },
  });
}

export default function CandidateRoster({ page, onNavigate }: { page: "inquiries" | "pipeline"; onNavigate: (view: "candidates") => void }) {
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const activePage = page;
  const [inquiries, setInquiries] = useState<InquiryRecord[]>([]);
  const [inquiryPeople, setInquiryPeople] = useState<InquiryPerson[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [inquiryError, setInquiryError] = useState("");
  const [inquiryNotice, setInquiryNotice] = useState("");
  const [inquiryReloadKey, setInquiryReloadKey] = useState(0);
  const [showInquiryForm, setShowInquiryForm] = useState(false);
  const [inquiryDraft, setInquiryDraft] = useState<InquiryDraft>(emptyInquiryDraft);
  const [countryDraft, setCountryDraft] = useState("");
  const [jobDraft, setJobDraft] = useState("");
  const [savingInquiry, setSavingInquiry] = useState(false);
  const [registrationInquiryId, setRegistrationInquiryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerCandidate, setDrawerCandidate] = useState<CandidateRecord | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [isNewCandidate, setIsNewCandidate] = useState(false);
  const [transitionIds, setTransitionIds] = useState<string[]>([]);
  const [transitionStep, setTransitionStep] = useState<"project" | "details" | "visa" | "ticket" | "complete">("project");
  const [transitionProjectId, setTransitionProjectId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [stageAnswers, setStageAnswers] = useState({ offerLetter: "", wakalaReceived: "", molReceived: "", enjaz: "" });
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectLoadError, setProjectLoadError] = useState("");
  const [transitionSaving, setTransitionSaving] = useState(false);
  const [transitionNotice, setTransitionNotice] = useState("");
  const [transitionError, setTransitionError] = useState("");
  const [stageDocQueue, setStageDocQueue] = useState<CandidateRecord[]>([]);
  const [stageDocUploaded, setStageDocUploaded] = useState(false);
  // Visa step
  type VisaInvoice = { candidateId: string; candidateName: string; invoiceNumber: string; amount: number; depositPaid: number; balanceDue: number; status: string };
  const [visaInvoices, setVisaInvoices] = useState<VisaInvoice[]>([]);
  // Ticket step
  const [ticketForm, setTicketForm] = useState({ ticketNumber: "", bookingReference: "", travelDate: "", travelTime: "" });
  type ConnFlight = { from: string; to: string; flightNo: string; depTime: string };
  const [connectingFlights, setConnectingFlights] = useState<ConnFlight[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/candidates", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load candidates.");
        if (!cancelled) setCandidates(payload.candidates as CandidateRecord[]);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Unable to load candidates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadInquiries = async () => {
      setInquiriesLoading(true);
      setInquiryError("");
      try {
        const response = await fetch("/api/candidate-inquiries", { cache: "no-store" });
        const payload = await response.json() as { inquiries?: InquiryRecord[]; agents?: InquiryPerson[]; handlers?: InquiryPerson[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load candidate inquiries.");
        if (cancelled) return;
        setInquiries(payload.inquiries ?? []);
        setInquiryPeople(payload.handlers ?? []);
      } catch (loadError) {
        if (!cancelled) setInquiryError(loadError instanceof Error ? loadError.message : "Unable to load candidate inquiries.");
      } finally {
        if (!cancelled) setInquiriesLoading(false);
      }
    };
    void loadInquiries();
    return () => { cancelled = true; };
  }, [inquiryReloadKey]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { projects?: ProjectOption[]; error?: string };
        if (!response.ok) {
          if (!cancelled) setProjectLoadError(payload.error ?? "Unable to load projects. Check your project access.");
          return;
        }
        if (!cancelled) setProjects((payload.projects ?? []).filter((project) => project.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setProjectLoadError("Unable to load active projects.");
      });
    return () => { cancelled = true; };
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = candidates.filter((candidate) =>
    `${candidate.first_name} ${candidate.last_name} ${candidate.file_number} ${candidate.phone}`.toLowerCase().includes(normalizedSearch),
  );
  const allFilteredSelected = filtered.length > 0 && filtered.every((candidate) => selectedIds.includes(candidate.id));
  const toggleCandidate = (candidateId: string) => {
    setSelectedIds((current) => current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId]);
  };
  const toggleFiltered = () => {
    setSelectedIds((current) => allFilteredSelected
      ? current.filter((id) => !filtered.some((candidate) => candidate.id === id))
      : [...new Set([...current, ...filtered.map((candidate) => candidate.id)])]);
  };

  const openStageUpdate = (candidateId: string) => {
    const ids = selectedIds.includes(candidateId) ? selectedIds : [candidateId];
    setTransitionIds(ids);
    // Route to the correct starting step based on candidate state
    const allVisaLocked = ids.every((id) => {
      const c = candidates.find((r) => r.id === id);
      return c?.visa_locked === true;
    });
    const allSubmitted = !allVisaLocked && ids.every((id) => {
      const c = candidates.find((r) => r.id === id);
      return (c?.details as Record<string, unknown> | null)?.stage === "Submitted to Project";
    });
    setTransitionStep(allVisaLocked ? "ticket" : allSubmitted ? "details" : "project");
    setTransitionProjectId("");
    setProjectSearch("");
    setStageAnswers({ offerLetter: "", wakalaReceived: "", molReceived: "", enjaz: "" });
    setVisaInvoices([]);
    setTicketForm({ ticketNumber: "", bookingReference: "", travelDate: "", travelTime: "" });
    setConnectingFlights([]);
    setTransitionNotice("");
    setTransitionError("");
  };

  const projectMatches = projects.filter((project) =>
    `${project.project_name} ${project.country}`.toLocaleLowerCase().includes(projectSearch.trim().toLocaleLowerCase()),
  ).slice(0, 3);

  const advanceCandidates = async () => {
    setTransitionSaving(true);
    setTransitionError("");
    setTransitionNotice("");
    try {
      type StagePayload = {
        updated?: CandidateRecord[];
        rejected?: { candidateId: string; name: string; reasons: string[]; kind: "qualification" | "transition" }[];
        invoices?: { candidateId: string; candidateName: string; invoiceNumber: string; amount: number; depositPaid: number; balanceDue: number; status: string }[];
        error?: string;
      };

      let body: Record<string, unknown>;
      if (transitionStep === "project") {
        body = { action: "submit-to-project", candidateIds: transitionIds, projectId: transitionProjectId };
      } else if (transitionStep === "details") {
        body = { action: "save-additional-stages", candidateIds: transitionIds, ...stageAnswers };
      } else if (transitionStep === "visa") {
        body = { action: "record-visa-received", candidateIds: transitionIds, projectId: transitionProjectId };
      } else {
        // ticket
        body = { action: "record-ticketing", candidateIds: transitionIds, ...ticketForm, connectingFlights };
      }

      const response = await fetch("/api/candidates/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as StagePayload;
      if (!response.ok && !payload.updated?.length) throw new Error(payload.error ?? "Unable to update candidate stages.");

      if (payload.updated?.length) {
        const updatedById = new Map(payload.updated.map((r) => [r.id, r]));
        setCandidates((current) => current.map((c) => updatedById.get(c.id) ?? c));
      }
      if (payload.rejected?.length) {
        const warnings = payload.rejected.map(({ name, reasons, kind }) => kind === "qualification"
          ? `${name} was not submitted due to qualifications: ${reasons.join("; ")}.`
          : `${name} could not be advanced: ${reasons.join("; ")}.`).join(" ");
        setTransitionError(warnings);
      }

      // ── routing after each step ──────────────────────────────────────────
      if (transitionStep === "project" && payload.updated?.length) {
        setTransitionIds(payload.updated.map((c) => c.id));
        setTransitionStep("details");
        setTransitionNotice(`${payload.updated.length === 1 ? `${payload.updated[0].first_name} ${payload.updated[0].last_name} submitted` : "Candidates submitted"} successfully.`);
      } else if (transitionStep === "details" && payload.updated?.length && !payload.rejected?.length) {
        const anyYes = Object.values(stageAnswers).some((v) => v === "Yes");
        if (anyYes) {
          setTransitionIds([]);
          setSelectedIds([]);
          setStageDocUploaded(false);
          setStageDocQueue(payload.updated);
        } else {
          setTransitionNotice("Stages updated. You can now record Visa Received when ready.");
          setTransitionStep("complete");
        }
      } else if (transitionStep === "visa" && payload.updated?.length) {
        // Show invoices, then open visa doc queue
        if (payload.invoices?.length) setVisaInvoices(payload.invoices);
        setTransitionNotice(`Visa recorded. SMS sent to candidate${payload.updated.length > 1 ? "s" : ""}. Invoice${payload.invoices?.length ? "s" : ""} created.`);
        // Move to ticket step after showing the invoice summary
        setTransitionIds(payload.updated.map((c) => c.id));
        setTransitionStep("visa"); // stay on visa to show invoice panel
        // trigger visa doc queue
        setStageDocUploaded(false);
        setStageDocQueue(payload.updated);
        setTransitionIds([]);
      } else if (transitionStep === "ticket" && payload.updated?.length && !payload.rejected?.length) {
        setTransitionNotice("Travel details saved. Reminder SMS messages scheduled automatically.");
        setTransitionStep("complete");
      } else if (payload.rejected?.length) {
        setTransitionIds(payload.rejected.map((item) => item.candidateId));
      }
    } catch (requestError) {
      setTransitionError(requestError instanceof Error ? requestError.message : "Unable to update candidate stages.");
    } finally {
      setTransitionSaving(false);
    }
  };

  const addInquiryCountry = () => {
    const country = countryDraft.trim();
    if (!country || inquiryDraft.desiredCountries.some((item) => item.toLocaleLowerCase() === country.toLocaleLowerCase())) return;
    setInquiryDraft((current) => ({ ...current, desiredCountries: [...current.desiredCountries, country] }));
    setCountryDraft("");
  };

  const addInquiryJob = () => {
    const job = jobDraft.trim();
    if (!job || inquiryDraft.jobOfInterest.some((item) => item.toLocaleLowerCase() === job.toLocaleLowerCase())) return;
    setInquiryDraft((current) => ({ ...current, jobOfInterest: [...current.jobOfInterest, job] }));
    setJobDraft("");
  };

  const closeInquiryForm = () => {
    setShowInquiryForm(false);
    setInquiryDraft(emptyInquiryDraft());
    setCountryDraft("");
    setJobDraft("");
    setInquiryError("");
  };

  const saveInquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inquiryDraft.desiredCountries.length === 0) {
      setInquiryError("Add at least one desired travel country.");
      return;
    }
    if (inquiryDraft.jobOfInterest.length === 0) {
      setInquiryError("Add at least one job of interest.");
      return;
    }
    setSavingInquiry(true);
    setInquiryError("");
    setInquiryNotice("");
    try {
      const response = await fetch("/api/candidate-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...inquiryDraft,
          hasExperience: inquiryDraft.hasExperience === "yes",
          ...(inquiryDraft.discoverySource === "agent" ? {} : { agentUserId: "" }),
        }),
      });
      const payload = await response.json() as { inquiry?: InquiryRecord; error?: string };
      if (!response.ok || !payload.inquiry) throw new Error(payload.error ?? "Unable to save this candidate inquiry.");
      setInquiryNotice(`Inquiry saved for ${payload.inquiry.first_name} ${payload.inquiry.last_name}.`);
      closeInquiryForm();
      setInquiryReloadKey((key) => key + 1);
    } catch (saveError) {
      setInquiryError(saveError instanceof Error ? saveError.message : "Unable to save this candidate inquiry.");
    } finally {
      setSavingInquiry(false);
    }
  };

  const registerFromInquiry = (inquiry: InquiryRecord) => {
    setRegistrationInquiryId(inquiry.id);
    setEditingCandidate(candidateFromInquiry(inquiry));
    setIsNewCandidate(true);
    onNavigate("candidates");
  };

  const saveCandidate = async (form: Candidate) => {
    const {
      id, fileNumber, firstName, lastName, phone, dob, placeOfBirth, agent, religion,
      nationality, fatherName, motherName, jobOfInterest, ...details
    } = form;
    const requestBody = {
      fileNumber,
      firstName,
      lastName,
      phone,
      dob: dob || null,
      placeOfBirth,
      agent,
      religion,
      nationality: nationality ?? "",
      fatherName,
      motherName,
      jobOfInterest,
      position: jobOfInterest.join(", "),
      details: { ...details, jobOfInterest },
      ...(registrationInquiryId ? { inquiryId: registrationInquiryId } : {}),
      ...(isNewCandidate ? {} : {
        file_number: fileNumber,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dob || null,
        place_of_birth: placeOfBirth,
        agent_name: agent,
        father_name: fatherName,
        mother_name: motherName,
      }),
    };
    const response = await fetch(isNewCandidate ? "/api/candidates" : `/api/candidates/${encodeURIComponent(id)}`, {
      method: isNewCandidate ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const payload = await response.json() as { candidate?: CandidateRecord; error?: string };
    if (!response.ok || !payload.candidate) throw new Error(payload.error ?? "Unable to save candidate.");
    if (isNewCandidate) setCandidates((current) => [payload.candidate!, ...current]);
    else setCandidates((current) => current.map((candidate) => candidate.id === payload.candidate?.id ? payload.candidate! : candidate));
    setEditingCandidate(null);
    setIsNewCandidate(false);
    if (registrationInquiryId) setInquiryReloadKey((key) => key + 1);
    setRegistrationInquiryId(null);
  };

  if (editingCandidate) {
    return <CandidateDetail
      candidate={editingCandidate}
      isNew={isNewCandidate}
      onSave={saveCandidate}
      agentOptions={inquiryPeople.filter((person) => person.role_name.toLocaleLowerCase().includes("agent")).map((person) => person.display_name)}
      onBack={() => { setEditingCandidate(null); setIsNewCandidate(false); setRegistrationInquiryId(null); }}
    />;
  }

  const filteredInquiries = inquiries.filter((inquiry) =>
    `${inquiry.first_name} ${inquiry.last_name} ${inquiry.phone} ${inquiry.agent_name} ${inquiry.job_of_interest.join(" ")} ${inquiry.desired_countries.join(" ")}`
      .toLocaleLowerCase().includes(normalizedSearch),
  );

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="candidate-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex min-w-0 items-center gap-5">
          <div>
            <h1 id="candidate-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>{activePage === "pipeline" ? "Pipeline" : "Inquiries"}</h1>
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{activePage === "pipeline" ? loading ? "Loading records" : `${candidates.length} registered candidates` : inquiriesLoading ? "Loading inquiries" : `${inquiries.length} open inquiries`}</p>
            {activePage === "pipeline" && selectedIds.length > 0 && <p className="mt-1 text-xs font-600" style={{ color: "var(--primary)" }}>{selectedIds.length} selected</p>}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <input
            aria-label={activePage === "pipeline" ? "Search candidates" : "Search inquiries"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={activePage === "pipeline" ? "Search name, file number, or mobile" : "Search inquiry name or mobile"}
            className="w-full max-w-sm border px-3 py-2 text-sm outline-none"
            style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
          />
          {activePage === "pipeline" ? <button type="button" onClick={() => { setRegistrationInquiryId(null); setEditingCandidate(newCandidate()); setIsNewCandidate(true); }} className="inline-flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><UserPlus size={16} aria-hidden="true" /> Register Candidate</button>
            : <button type="button" onClick={() => { setInquiryError(""); setInquiryNotice(""); setInquiryDraft(emptyInquiryDraft()); setShowInquiryForm(true); }} className="inline-flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><UserPlus size={16} aria-hidden="true" /> Add Inquiry</button>}
        </div>
      </header>

      {activePage === "pipeline" ? <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-260 text-sm">
          <thead className="sticky top-0" style={{ background: "var(--card)" }}>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
              <th className="px-3 py-3"><input type="checkbox" aria-label="Select all visible candidates" checked={allFilteredSelected} onChange={toggleFiltered} className="h-4 w-4 accent-amber-700" /></th>
              {["S/N", "File No.", "Candidate Name", "Agent", "Mobile", "Passport", "Project", "Stage"].map((heading) => (
                <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase" style={{ color: "var(--muted-foreground)" }}>{heading}</th>
              ))}
              <th className="px-3 py-3 text-right text-xs font-700 uppercase" style={{ color: "var(--muted-foreground)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="px-4 py-10 text-center" style={{ color: "var(--muted-foreground)" }}>Loading company records…</td></tr>}
            {error && <tr><td colSpan={10} role="alert" className="px-4 py-10 text-center" style={{ color: "#ef4444" }}>{error}</td></tr>}
            {!loading && !error && filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center" style={{ color: "var(--muted-foreground)" }}>{candidates.length ? "No matching candidates." : "No candidate records found for this company."}</td></tr>
            )}
            {filtered.map((candidate) => (
              <tr key={candidate.id} className="border-b" style={{ borderColor: "var(--border)", background: selectedIds.includes(candidate.id) ? "color-mix(in srgb, var(--primary) 8%, var(--card))" : "transparent", color: "var(--foreground)" }}>
                <td className="px-3 py-2"><div className="flex items-center gap-1"><input type="checkbox" aria-label={`Select ${candidate.first_name} ${candidate.last_name}`} checked={selectedIds.includes(candidate.id)} onChange={() => toggleCandidate(candidate.id)} className="h-4 w-4 accent-amber-700" /><button type="button" onClick={() => setDrawerCandidate(candidate)} aria-label={`View attachments for ${candidate.first_name} ${candidate.last_name}`} title="View attachments" className="flex h-7 w-7 items-center justify-center rounded hover:bg-secondary" style={{ color: "var(--primary)" }}><Paperclip size={15} aria-hidden="true" /></button><button type="button" onClick={() => openStageUpdate(candidate.id)} aria-label={`Advance stage for ${candidate.first_name} ${candidate.last_name}`} title="Advance candidate stage" className="flex h-7 w-7 items-center justify-center rounded hover:bg-secondary" style={{ color: "var(--foreground)" }}><RefreshCw size={14} aria-hidden="true" /></button></div></td>
                <td className="px-3 py-2 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{candidate.source_row_number ?? "—"}</td>
                <td className="px-3 py-2 mono text-xs" title={candidate.file_number}>{candidate.file_number ? `${candidate.file_number[0]}...${candidate.file_number.slice(-3)}` : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 font-600">{candidate.first_name} {candidate.last_name}</td>
                <td className="px-3 py-2">{candidate.agent_name || "—"}</td>
                <td className="px-3 py-2 mono">{candidate.phone || "—"}</td>
                <td className="px-3 py-2">{typeof candidate.details?.passportStatus === "string" && candidate.details.passportStatus ? candidate.details.passportStatus : candidate.details?.passportNumber ? "On file" : "—"}</td>
                <td className="px-3 py-2">{typeof candidate.details?.contracts === "string" && candidate.details.contracts ? candidate.details.contracts : typeof candidate.details?.assignedContracts === "string" && candidate.details.assignedContracts ? candidate.details.assignedContracts : "—"}</td>
                <td className="px-3 py-2">{typeof candidate.details?.stage === "string" && candidate.details.stage ? candidate.details.stage : "Registration"}</td>
                <td className="px-3 py-2 text-right"><button type="button" onClick={() => { setEditingCandidate(candidateFromRecord(candidate)); setIsNewCandidate(false); }} className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }}><Pencil size={14} aria-hidden="true" /> Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div> : <div className="min-h-0 flex-1 overflow-auto p-6">
        {inquiryNotice && <p role="status" className="mb-4 border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-700">{inquiryNotice}</p>}
        {inquiryError && <p role="alert" className="mb-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{inquiryError}</p>}
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-280 text-sm">
            <thead className="sticky top-0" style={{ background: "var(--card)" }}><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
              {["Candidate", "Phone", "Source", "Agent", "Countries", "Job of interest", "Experience", "Contact", "Handled by", "Inquiry date"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}
              <th className="px-3 py-3 text-right text-xs font-700 uppercase" style={{ color: "var(--muted-foreground)" }}>Action</th>
            </tr></thead>
            <tbody>
              {inquiriesLoading && <tr><td colSpan={11} className="px-4 py-10 text-center" style={{ color: "var(--muted-foreground)" }}>Loading inquiries…</td></tr>}
              {!inquiriesLoading && !inquiryError && filteredInquiries.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center" style={{ color: "var(--muted-foreground)" }}>{inquiries.length ? "No inquiries match this search." : "No open inquiries yet."}</td></tr>}
              {!inquiriesLoading && filteredInquiries.map((inquiry) => <tr key={inquiry.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3 font-600" style={{ color: "var(--foreground)" }}>{inquiry.first_name} {inquiry.last_name}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{inquiry.phone}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{inquirySourceLabel(inquiry.discovery_source)}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{inquiry.agent_name || "—"}</td>
                <td className="px-3 py-3" style={{ color: "var(--foreground)" }}>{inquiry.desired_countries.join(", ")}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{inquiry.job_of_interest.join(", ")}</td>
                <td className="px-3 py-3" style={{ color: "var(--foreground)" }}>{inquiry.has_experience ? "Yes" : "No"}</td>
                <td className="px-3 py-3 capitalize" style={{ color: "var(--foreground)" }}>{inquiry.communication_method}</td>
                <td className="whitespace-nowrap px-3 py-3" style={{ color: "var(--foreground)" }}>{inquiry.handled_by_name}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{new Date(inquiry.created_at).toLocaleDateString()}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right"><button type="button" onClick={() => registerFromInquiry(inquiry)} className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ArrowRight size={14} aria-hidden="true" />Register</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
      {showInquiryForm && activePage === "inquiries" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeInquiryForm(); }}>
        <form onSubmit={(event) => void saveInquiry(event)} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <header className="mb-5 flex items-center justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--border)" }}>
            <div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Record candidate inquiry</h2><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Save contact details now; complete registration when the candidate returns.</p></div>
            <button type="button" onClick={closeInquiryForm} aria-label="Close inquiry form" className="flex h-8 w-8 items-center justify-center" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button>
          </header>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-xs font-700" style={{ color: "var(--muted-foreground)" }}>First name<input required maxLength={200} value={inquiryDraft.firstName} onChange={(event) => setInquiryDraft((current) => ({ ...current, firstName: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
            <label className="text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Last name<input required maxLength={200} value={inquiryDraft.lastName} onChange={(event) => setInquiryDraft((current) => ({ ...current, lastName: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
            <label className="text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Phone number<input required type="tel" maxLength={100} value={inquiryDraft.phone} onChange={(event) => setInquiryDraft((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Jobs of interest</legend>
              <div className="flex gap-2"><input value={jobDraft} onChange={(event) => setJobDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addInquiryJob(); } }} placeholder="Type a job, e.g. Housekeeper" className="min-w-0 flex-1 border px-3 py-2 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /><button type="button" onClick={addInquiryJob} className="border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Add job</button></div>
              {inquiryDraft.jobOfInterest.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{inquiryDraft.jobOfInterest.map((job) => <span key={job} className="inline-flex items-center gap-1 border px-2 py-1 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>{job}<button type="button" aria-label={`Remove ${job}`} onClick={() => setInquiryDraft((current) => ({ ...current, jobOfInterest: current.jobOfInterest.filter((item) => item !== job) }))} className="ml-1" style={{ color: "var(--muted-foreground)" }}><X size={12} aria-hidden="true" /></button></span>)}</div>}
            </fieldset>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-xs font-700" style={{ color: "var(--muted-foreground)" }}>How did they hear about the company?</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {inquirySources.map((source) => <label key={source.value} className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--foreground)" }}><input required name="inquiry-source" type="radio" value={source.value} checked={inquiryDraft.discoverySource === source.value} onChange={() => setInquiryDraft((current) => ({ ...current, discoverySource: source.value, agentUserId: source.value === "agent" ? current.agentUserId : "" }))} />{source.label}</label>)}
              </div>
            </fieldset>
            {inquiryDraft.discoverySource === "agent" && <label className="text-xs font-700 sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>Registered agent<select required value={inquiryDraft.agentUserId} onChange={(event) => setInquiryDraft((current) => ({ ...current, agentUserId: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}><option value="">Select a registered agent</option>{inquiryPeople.filter((person) => person.role_name.toLocaleLowerCase().includes("agent")).map((person) => <option key={person.user_id} value={person.user_id}>{person.display_name}</option>)}</select></label>}
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Countries they want to travel to</legend>
              <div className="flex gap-2"><input value={countryDraft} onChange={(event) => setCountryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addInquiryCountry(); } }} placeholder="Type a country" className="min-w-0 flex-1 border px-3 py-2 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /><button type="button" onClick={addInquiryCountry} className="border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Add country</button></div>
              {inquiryDraft.desiredCountries.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{inquiryDraft.desiredCountries.map((country) => <span key={country} className="inline-flex items-center gap-1 border px-2 py-1 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>{country}<button type="button" aria-label={`Remove ${country}`} onClick={() => setInquiryDraft((current) => ({ ...current, desiredCountries: current.desiredCountries.filter((item) => item !== country) }))} className="ml-1" style={{ color: "var(--muted-foreground)" }}><X size={12} aria-hidden="true" /></button></span>)}</div>}
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Does the candidate have experience?</legend>
              <div className="flex gap-4">{(["yes", "no"] as const).map((answer) => <label key={answer} className="inline-flex items-center gap-2 text-sm capitalize" style={{ color: "var(--foreground)" }}><input type="radio" name="inquiry-experience" checked={inquiryDraft.hasExperience === answer} onChange={() => setInquiryDraft((current) => ({ ...current, hasExperience: answer }))} />{answer}</label>)}</div>
            </fieldset>
            {inquiryDraft.hasExperience === "yes" && <label className="text-xs font-700 sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>Experience description<textarea required maxLength={2000} rows={3} value={inquiryDraft.experienceDescription} onChange={(event) => setInquiryDraft((current) => ({ ...current, experienceDescription: event.target.value }))} className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>}
            <fieldset>
              <legend className="mb-2 text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Preferred communication</legend>
              <div className="flex gap-4">{([ ["call", "Call"], ["text", "Text"], ["both", "Both"] ] as const).map(([value, label]) => <label key={value} className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--foreground)" }}><input type="radio" name="inquiry-contact-method" checked={inquiryDraft.communicationMethod === value} onChange={() => setInquiryDraft((current) => ({ ...current, communicationMethod: value }))} />{label}</label>)}</div>
            </fieldset>
            <label className="text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Handled by<select required value={inquiryDraft.handledByUserId} onChange={(event) => setInquiryDraft((current) => ({ ...current, handledByUserId: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}><option value="">Select team member</option>{inquiryPeople.map((person) => <option key={person.user_id} value={person.user_id}>{person.display_name} · {person.role_name}</option>)}</select></label>
            <label className="text-xs font-700 sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>Remarks<textarea maxLength={4000} rows={3} value={inquiryDraft.remarks} onChange={(event) => setInquiryDraft((current) => ({ ...current, remarks: event.target.value }))} className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
          </div>
          {inquiryError && <p role="alert" className="mt-4 text-sm text-red-500">{inquiryError}</p>}
          <footer className="mt-5 flex justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}><button type="button" onClick={closeInquiryForm} className="border px-4 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Cancel</button><button type="submit" disabled={savingInquiry || inquiryPeople.length === 0} className="px-4 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{savingInquiry ? "Saving…" : "Save inquiry"}</button></footer>
        </form>
      </div>}
      {drawerCandidate && <AttachmentDrawer candidate={{ id: drawerCandidate.id, firstName: drawerCandidate.first_name, lastName: drawerCandidate.last_name, fileNumber: drawerCandidate.file_number }} onClose={() => setDrawerCandidate(null)} />}

      {stageDocQueue.length > 0 && (() => {
        const current = stageDocQueue[0];
        const remaining = stageDocQueue.length;
        const advanceQueue = () => {
          setStageDocUploaded(false);
          setStageDocQueue((q) => q.slice(1));
        };
        return (
          <>
            {/* Mandatory-upload overlay — sits above the drawer backdrop */}
            <div className="fixed inset-0 z-[55] flex flex-col items-end justify-start pointer-events-none">
              <div className="pointer-events-auto mr-[calc(min(100vw,480px)+1px)] mt-4 ml-4 max-w-sm rounded border px-4 py-3 shadow-lg text-sm"
                style={{ background: "var(--card)", borderColor: "var(--primary)", color: "var(--foreground)" }}>
                <p className="font-700" style={{ color: "var(--primary)" }}>
                  Upload required — {remaining} candidate{remaining !== 1 ? "s" : ""} remaining
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Upload the document for <span className="font-600" style={{ color: "var(--foreground)" }}>{current.first_name} {current.last_name}</span> using the drawer, then click Done.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={!stageDocUploaded}
                    onClick={advanceQueue}
                    className="rounded px-3 py-1.5 text-xs font-600 disabled:opacity-40"
                    style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                    {remaining > 1 ? "Done — next candidate" : "Done — close"}
                  </button>
                  <button
                    type="button"
                    onClick={advanceQueue}
                    className="rounded border px-3 py-1.5 text-xs"
                    style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                    Skip
                  </button>
                </div>
                {!stageDocUploaded && (
                  <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Use "Add attachment" in the drawer to upload, then Done will enable.
                  </p>
                )}
              </div>
            </div>
            <AttachmentDrawer
              candidate={{ id: current.id, firstName: current.first_name, lastName: current.last_name, fileNumber: current.file_number }}
              onClose={advanceQueue}
              onUpload={() => setStageDocUploaded(true)}
            />
          </>
        );
      })()}
      {transitionIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="candidate-stage-title" className="w-full max-w-lg border p-5 shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 id="candidate-stage-title" className="text-base font-700" style={{ color: "var(--foreground)" }}>
                  {transitionStep === "project" ? "Project Submission"
                    : transitionStep === "details" ? "Additional Stage Details"
                    : transitionStep === "visa" ? "Visa Received"
                    : transitionStep === "ticket" ? "Travel & Ticketing"
                    : "Stage update complete"}
                </h2>
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{transitionIds.length} selected</p>
              </div>
              <button type="button" aria-label="Close stage update" onClick={() => setTransitionIds([])} className="flex h-8 w-8 items-center justify-center rounded" style={{ color: "var(--muted-foreground)" }}><X size={17} aria-hidden="true" /></button>
            </header>
            <div className="mt-4 max-h-40 space-y-2 overflow-auto">
              {transitionIds.map((id) => {
                const candidate = candidates.find((record) => record.id === id);
                if (!candidate) return null;
                return <div key={id} className="border-b pb-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>{candidate.first_name} {candidate.last_name}</div>;
              })}
            </div>
            {transitionStep === "project" && <div className="mt-4">
              <label htmlFor="candidate-project-search" className="block text-xs font-600" style={{ color: "var(--foreground)" }}>Search active projects</label>
              <input id="candidate-project-search" type="search" value={projectSearch} onChange={(event) => { setProjectSearch(event.target.value); setTransitionProjectId(""); }} placeholder="Type a project name or country" className="mt-1 w-full border px-3 py-2 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              {transitionProjectId ? <p className="mt-2 text-xs font-600 text-emerald-600">Selected: {projects.find((project) => project.id === transitionProjectId)?.project_name}</p> : (
                <div className="mt-1 divide-y border" style={{ borderColor: "var(--border)" }}>
                  {projectMatches.map((project) => <button key={project.id} type="button" onClick={() => { setTransitionProjectId(project.id); setProjectSearch(`${project.project_name} · ${project.country}`); }} className="block min-h-10 w-full px-3 py-2 text-left text-xs hover:bg-secondary" style={{ color: "var(--foreground)", borderColor: "var(--border)" }}>{project.project_name} <span style={{ color: "var(--muted-foreground)" }}>· {project.country}</span></button>)}
                  {projects.length === 0 && <p className="px-3 py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>{projectLoadError || "No active projects are available."}</p>}
                  {projects.length > 0 && projectMatches.length === 0 && <p className="px-3 py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>No matching active projects.</p>}
                </div>
              )}
            </div>}
            {transitionStep === "details" && <div className="mt-4 space-y-3">
              {([["offerLetter", "Offer Letter"], ["wakalaReceived", "Wakala Received"], ["molReceived", "MOL Received"], ["enjaz", "Enjaz"]] as const).map(([key, label]) => (
                <fieldset key={key} className="flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--border)" }}>
                  <legend className="text-sm font-600" style={{ color: "var(--foreground)" }}>{label}</legend>
                  <div className="flex gap-2">
                    {(["Yes", "No"] as const).map((answer) => <button key={answer} type="button" aria-pressed={stageAnswers[key] === answer} onClick={() => setStageAnswers((current) => ({ ...current, [key]: answer }))} className="min-w-14 border px-3 py-1.5 text-xs font-600" style={{ borderColor: stageAnswers[key] === answer ? "var(--primary)" : "var(--border)", background: stageAnswers[key] === answer ? "var(--primary)" : "var(--card)", color: stageAnswers[key] === answer ? "var(--primary-foreground)" : "var(--foreground)" }}>{answer}</button>)}
                  </div>
                </fieldset>
              ))}
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Mark Yes for any stage document the candidate has received. You will be prompted to upload the document after saving.</p>
            </div>}

            {/* ── Visa Received step ─────────────────────────────────────── */}
            {transitionStep === "visa" && (
              <div className="mt-4 space-y-4">
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Select the project the visa was issued under. The candidate will be marked visa-received, an SMS will be sent, and a service charge invoice will be created automatically.
                </p>
                <div>
                  <label htmlFor="visa-project-search" className="block text-xs font-600" style={{ color: "var(--foreground)" }}>Project</label>
                  <input id="visa-project-search" type="search" value={projectSearch}
                    onChange={(e) => { setProjectSearch(e.target.value); setTransitionProjectId(""); }}
                    placeholder="Type project name or country"
                    className="mt-1 w-full border px-3 py-2 text-sm"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                  {transitionProjectId ? (
                    <p className="mt-2 text-xs font-600 text-emerald-600">Selected: {projects.find((p) => p.id === transitionProjectId)?.project_name}</p>
                  ) : (
                    <div className="mt-1 divide-y border" style={{ borderColor: "var(--border)" }}>
                      {projectMatches.map((p) => (
                        <button key={p.id} type="button"
                          onClick={() => { setTransitionProjectId(p.id); setProjectSearch(`${p.project_name} · ${p.country}`); }}
                          className="block min-h-10 w-full px-3 py-2 text-left text-xs hover:bg-secondary"
                          style={{ color: "var(--foreground)" }}>
                          {p.project_name} <span style={{ color: "var(--muted-foreground)" }}>· {p.country}</span>
                        </button>
                      ))}
                      {projects.length === 0 && <p className="px-3 py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>{projectLoadError || "No active projects."}</p>}
                      {projects.length > 0 && projectMatches.length === 0 && <p className="px-3 py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>No matching projects.</p>}
                    </div>
                  )}
                </div>
                {visaInvoices.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Invoices raised</p>
                    {visaInvoices.map((inv) => (
                      <div key={inv.candidateId} className="rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                        <div className="flex items-center justify-between">
                          <span className="font-600" style={{ color: "var(--foreground)" }}>{inv.candidateName}</span>
                          <span className="font-700" style={{ color: "var(--primary)" }}>{inv.invoiceNumber}</span>
                        </div>
                        <div className="mt-1 flex gap-4" style={{ color: "var(--muted-foreground)" }}>
                          <span>Total: UGX {inv.amount.toLocaleString("en-UG")}</span>
                          {inv.depositPaid > 0 && <span className="text-emerald-500">Deposit: −UGX {inv.depositPaid.toLocaleString("en-UG")}</span>}
                          <span className={inv.balanceDue > 0 ? "text-orange-500 font-600" : "text-emerald-500"}>
                            Balance: UGX {inv.balanceDue.toLocaleString("en-UG")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  After saving you will be prompted to upload the visa copy for each candidate.
                </p>
              </div>
            )}

            {/* ── Ticketing step ──────────────────────────────────────────── */}
            {transitionStep === "ticket" && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 block text-xs font-600" style={{ color: "var(--foreground)" }}>
                    Ticket number <span className="text-red-400">*</span>
                    <input required maxLength={100} value={ticketForm.ticketNumber}
                      onChange={(e) => setTicketForm((f) => ({ ...f, ticketNumber: e.target.value }))}
                      className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                      style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                      placeholder="e.g. EK7834521" />
                  </label>
                  <label className="col-span-2 block text-xs font-600" style={{ color: "var(--foreground)" }}>
                    Booking reference <span className="text-red-400">*</span>
                    <input required maxLength={100} value={ticketForm.bookingReference}
                      onChange={(e) => setTicketForm((f) => ({ ...f, bookingReference: e.target.value }))}
                      className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                      style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                      placeholder="e.g. XYZ123" />
                  </label>
                  <label className="block text-xs font-600" style={{ color: "var(--foreground)" }}>
                    Date of travel <span className="text-red-400">*</span>
                    <input required type="date" value={ticketForm.travelDate}
                      onChange={(e) => setTicketForm((f) => ({ ...f, travelDate: e.target.value }))}
                      className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                      style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                  </label>
                  <label className="block text-xs font-600" style={{ color: "var(--foreground)" }}>
                    Departure time (24h) <span className="text-red-400">*</span>
                    <input required type="time" value={ticketForm.travelTime}
                      onChange={(e) => setTicketForm((f) => ({ ...f, travelTime: e.target.value }))}
                      className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                      style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                  </label>
                </div>

                {/* Connecting flights */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-600" style={{ color: "var(--foreground)" }}>Connecting flights</span>
                    <button type="button"
                      onClick={() => setConnectingFlights((f) => [...f, { from: "", to: "", flightNo: "", depTime: "" }])}
                      className="text-xs" style={{ color: "var(--primary)" }}>+ Add leg</button>
                  </div>
                  {connectingFlights.length === 0 && (
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Direct flight — no connecting legs.</p>
                  )}
                  {connectingFlights.map((leg, i) => (
                    <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end">
                      <label className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
                        From
                        <input value={leg.from} onChange={(e) => setConnectingFlights((f) => f.map((l, j) => j === i ? { ...l, from: e.target.value } : l))}
                          className="mt-1 w-full border px-2 py-1.5 text-xs" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} placeholder="KLA" />
                      </label>
                      <label className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
                        To
                        <input value={leg.to} onChange={(e) => setConnectingFlights((f) => f.map((l, j) => j === i ? { ...l, to: e.target.value } : l))}
                          className="mt-1 w-full border px-2 py-1.5 text-xs" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} placeholder="DXB" />
                      </label>
                      <label className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
                        Flight no.
                        <input value={leg.flightNo} onChange={(e) => setConnectingFlights((f) => f.map((l, j) => j === i ? { ...l, flightNo: e.target.value } : l))}
                          className="mt-1 w-full border px-2 py-1.5 text-xs" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} placeholder="EK701" />
                      </label>
                      <label className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
                        Dep. time
                        <input type="time" value={leg.depTime} onChange={(e) => setConnectingFlights((f) => f.map((l, j) => j === i ? { ...l, depTime: e.target.value } : l))}
                          className="mt-1 w-full border px-2 py-1.5 text-xs" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                      </label>
                      <button type="button" onClick={() => setConnectingFlights((f) => f.filter((_, j) => j !== i))}
                        className="mb-0.5 self-end text-xs" style={{ color: "#ef4444" }}>✕</button>
                    </div>
                  ))}
                </div>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Reminder SMS messages will be scheduled automatically: confirmation now, check-in reminder 24h before, departure reminder 3h before, and a thank-you 5 minutes after departure.
                </p>
              </div>
            )}
            {transitionNotice && <p role="status" className="mt-4 text-sm font-600 text-emerald-600">{transitionNotice}</p>}
            {transitionError && <p role="alert" className="mt-3 whitespace-pre-wrap text-sm text-red-500">{transitionError}</p>}
            <footer className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => { setTransitionIds([]); setSelectedIds([]); }}
                className="border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                {transitionStep === "complete" ? "Close" : "Cancel"}
              </button>
              {transitionStep === "complete" && (
                <button type="button"
                  onClick={() => {
                    const ids = transitionIds.length ? transitionIds : candidates.filter((c) => c.visa_locked).map((c) => c.id);
                    if (!ids.length) return;
                    setTransitionIds(ids);
                    setTransitionStep("ticket");
                    setTransitionNotice("");
                    setTransitionError("");
                    setTicketForm({ ticketNumber: "", bookingReference: "", travelDate: "", travelTime: "" });
                    setConnectingFlights([]);
                  }}
                  className="border px-3 py-2 text-sm font-600"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                  Add ticket details
                </button>
              )}
              {(transitionStep === "project" || transitionStep === "details" || transitionStep === "visa" || transitionStep === "ticket") && (
                <button type="button"
                  disabled={transitionSaving || (
                    transitionStep === "project" ? !transitionProjectId
                    : transitionStep === "details" ? !Object.values(stageAnswers).some(Boolean)
                    : transitionStep === "visa" ? !transitionProjectId
                    : /* ticket */ !ticketForm.ticketNumber || !ticketForm.bookingReference || !ticketForm.travelDate || !ticketForm.travelTime
                  )}
                  onClick={() => void advanceCandidates()}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:opacity-50"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                  <ArrowRight size={15} aria-hidden="true" />
                  {transitionSaving ? "Saving…"
                    : transitionStep === "visa" ? "Record visa received"
                    : transitionStep === "ticket" ? "Save travel details"
                    : "Advance stage"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}