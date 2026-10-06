import { useEffect, useState, type FormEvent } from "react";
import { Paperclip, Pencil, UserPlus } from "lucide-react";
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

export default function CandidateRoster() {
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerCandidate, setDrawerCandidate] = useState<CandidateRecord | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [isNewCandidate, setIsNewCandidate] = useState(false);

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
  };

  if (editingCandidate) {
    return <CandidateDetail
      candidate={editingCandidate}
      isNew={isNewCandidate}
      onSave={saveCandidate}
      onBack={() => { setEditingCandidate(null); setIsNewCandidate(false); }}
    />;
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="candidate-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex min-w-0 items-center gap-5">
          <div>
            <h1 id="candidate-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Candidates</h1>
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{loading ? "Loading records" : `${candidates.length} records`}</p>
            {selectedIds.length > 0 && <p className="mt-1 text-xs font-600" style={{ color: "var(--primary)" }}>{selectedIds.length} selected</p>}
          </div>
          <button type="button" onClick={() => { setEditingCandidate(newCandidate()); setIsNewCandidate(true); }} className="inline-flex shrink-0 items-center gap-2 rounded px-3 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><UserPlus size={16} aria-hidden="true" /> Register Candidate</button>
        </div>
        <input
          aria-label="Search candidates"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, file number, or mobile"
          className="w-full max-w-sm border px-3 py-2 text-sm outline-none"
          style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-260 text-sm">
          <thead className="sticky top-0" style={{ background: "var(--card)" }}>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
              <th className="px-3 py-3"><input type="checkbox" aria-label="Select all visible candidates" checked={allFilteredSelected} onChange={toggleFiltered} className="h-4 w-4 accent-amber-700" /></th>
              {["S/N", "File No.", "Candidate Name", "Agent", "Mobile", "Passport", "Contracts", "Stage"].map((heading) => (
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
                <td className="px-3 py-2"><div className="flex items-center gap-2"><input type="checkbox" aria-label={`Select ${candidate.first_name} ${candidate.last_name}`} checked={selectedIds.includes(candidate.id)} onChange={() => toggleCandidate(candidate.id)} className="h-4 w-4 accent-amber-700" /><button type="button" onClick={() => setDrawerCandidate(candidate)} aria-label={`View attachments for ${candidate.first_name} ${candidate.last_name}`} title="View attachments" className="flex h-7 w-7 items-center justify-center rounded hover:bg-secondary" style={{ color: "var(--primary)" }}><Paperclip size={15} aria-hidden="true" /></button></div></td>
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
      </div>
      {drawerCandidate && <AttachmentDrawer candidate={{ id: drawerCandidate.id, firstName: drawerCandidate.first_name, lastName: drawerCandidate.last_name, fileNumber: drawerCandidate.file_number }} onClose={() => setDrawerCandidate(null)} />}
    </section>
  );
}