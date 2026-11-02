import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles, X } from "lucide-react";
import type { Candidate } from "./Candidates";
import { SearchableSelect } from "./SearchableSelect";
import { getCountries, getCountryByShort, getStatesByShort } from "countrycitystatejson/client";
import { isPassportNumberValid, normalizePassportNumber, passportNumberRule } from "@/lib/passport-number";

interface Props {
  candidate: Candidate;
  isNew: boolean;
  isAgent?: boolean; // Whether user is an agent registering a candidate
  onSave: (c: Candidate) => void | Promise<void>;
  onBack: () => void;
  agentOptions?: string[];
  canViewFinance?: boolean;
  canManageSources?: boolean;
  canViewActivityLogs?: boolean;
  canViewActivityByRole?: boolean; // Chairman, GM, Supervisor visibility
  canManagePassportStatus?: boolean;
}

function Field({
  label, value, onChange, type = "text", required = false, placeholder = "", readOnly = false, invalid = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string; readOnly?: boolean; invalid?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-600 block mb-1" style={{ color: "var(--muted-foreground)" }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className="w-full px-3 py-2 text-sm rounded border outline-none transition-colors"
        style={{ background: "var(--secondary)", borderColor: invalid ? "#dc2626" : "var(--border)", color: "var(--foreground)", ...(readOnly ? { cursor: "not-allowed", opacity: 0.8 } : {}) }}
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options, required = false, invalid = false, disabled = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; required?: boolean; invalid?: boolean; disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-600 block mb-1" style={{ color: "var(--muted-foreground)" }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <select
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className="w-full px-3 py-2 text-sm rounded border outline-none"
        style={{ background: "var(--secondary)", borderColor: invalid ? "#dc2626" : "var(--border)", color: "var(--foreground)" }}
      >
        <option value="">Select option</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function MultiField({
  label, value, onChange, options, required = false, invalid = false,
}: {
  label: string; value: string[]; onChange: (v: string[]) => void;
  options: string[]; required?: boolean; invalid?: boolean;
}) {
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  return (
    <div>
      <label className="text-xs font-600 block mb-1" style={{ color: "var(--muted-foreground)" }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <div
        className="w-full min-h-10 px-2 py-1.5 rounded border flex flex-wrap gap-1 items-start"
        style={{ background: "var(--secondary)", borderColor: invalid ? "#dc2626" : "var(--border)" }}
      >
        {value.map((v) => (
          <span key={v} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-600"
            style={{ background: "#6366f1", color: "#fff" }}>
            {v}
            <button type="button" onClick={() => toggle(v)} aria-label={`Remove ${v}`} className="ml-0.5 opacity-70 hover:opacity-100"><X size={12} aria-hidden="true" /></button>
          </span>
        ))}
        <select
          onChange={(e) => { if (e.target.value) toggle(e.target.value); e.target.value = ""; }}
          className="text-xs outline-none flex-1 min-w-20 bg-transparent"
          style={{ color: "var(--muted-foreground)" }}
        >
          <option value="">Select at least one</option>
          {options.filter((o) => !value.includes(o)).map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="col-span-full">
      <h2 className="text-base font-700 mb-1" style={{ color: "var(--foreground)" }}>{title}</h2>
      <div className="h-px w-full mb-2" style={{ background: "var(--border)" }} />
    </div>
  );
}

const allTabs = ["Personal", "Passport Info", "Residence", "Parents & Kin", "Job Info", "Education & Skills", "Finance", "AI Tools", "Activity"] as const;
type Tab = typeof allTabs[number];
const countryMetadata = getCountries();
const countryOptions = countryMetadata.flatMap((country) => {
  const name = country.name?.trim();
  if (!name) return [];
  return [{ value: name, label: name, searchText: country.shortName?.trim() || name }];
});

function formatAttributionDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

type CandidateSourceOption = { id: string; source: string };
type BranchOption = { id: string; name: string };
type CandidateStageEvent = {
  id: string;
  event_type: "stage" | "medical_appointment" | "medical_result";
  label: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
};
type PassportCheck = {
  passportNumber: string;
  status: "idle" | "checking" | "valid" | "duplicate" | "invalid" | "error";
  registeredBy?: string;
  error?: string;
};
type CandidateFinancePayload = {
  summary: {
    totalInvoiced: number;
    totalDeposits: number;
    totalPaid: number;
    outstandingBalance: number;
  };
  invoices: { id: string; invoice_number: string; amount: number; status: string; issued_at: string }[];
  receipts: { id: string; receipt_number: string; category: string; amount: number; payment_method: string; received_at: string }[];
  payments: { id: string; invoice_id: string; amount: number; paid_at: string }[];
};

function calculateAge(dateOfBirth: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day ||
    birthDate > new Date(today.getFullYear(), today.getMonth(), today.getDate())
  ) return null;

  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1;
  return age;
}

export default function CandidateDetail({ candidate, isNew, isAgent = false, onSave, onBack, agentOptions = [], canViewFinance = false, canManageSources = false, canViewActivityLogs = false, canViewActivityByRole = false, canManagePassportStatus = false }: Props) {
  // Agents registering candidates see the required personal, passport, kin, and job information.
  // Staff completing registration see all tabs based on permissions
  const agentRegisteringTabs = ["Personal", "Passport Info", "Residence", "Parents & Kin", "Job Info"] as const;
  const staffViewTabs = ["Personal", "Passport Info", "Residence", "Parents & Kin", "Job Info", "Education & Skills", ...(!isNew && canViewFinance ? ["Finance"] : []), ...(!isNew ? ["AI Tools"] : []), ...(!isNew && (canViewActivityLogs || canViewActivityByRole) ? ["Activity"] : [])] as const;
  const availableTabs = (isAgent && isNew ? agentRegisteringTabs : staffViewTabs) as unknown as Tab[];
  const registrationContentSections = (isAgent && isNew
    ? ["Personal", "Passport Info", "Residence", "Parents & Kin", "Job Info"]
    : ["Personal", "Passport Info", "Residence", "Parents & Kin", "Job Info", "Education & Skills"]) as Tab[];
  
  const [form, setForm] = useState<Candidate>({ ...candidate });
  const [activeTab, setActiveTab] = useState<Tab>(availableTabs[0]);
  const [viewMode, setViewMode] = useState<"details" | "content">("details");
  const [contentSectionIndex, setContentSectionIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [candidateSources, setCandidateSources] = useState<CandidateSourceOption[]>([]);
  const [sourceDraft, setSourceDraft] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [financeData, setFinanceData] = useState<CandidateFinancePayload | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState("");
  const [passportCheck, setPassportCheck] = useState<PassportCheck>({ passportNumber: "", status: "idle" });
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchError, setBranchError] = useState("");
  const [residenceStates, setResidenceStates] = useState<string[]>([]);
  const [residenceCities, setResidenceCities] = useState<string[]>([]);
  const [locationError, setLocationError] = useState("");
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [stageEvents, setStageEvents] = useState<CandidateStageEvent[]>([]);
  const [stageEventsError, setStageEventsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadSources = async () => {
      try {
        const response = await fetch("/api/candidates/sources", { cache: "no-store" });
        const payload = await response.json() as { sources?: CandidateSourceOption[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load candidate sources.");
        if (!cancelled) setCandidateSources(payload.sources ?? []);
      } catch (error) {
        if (!cancelled) setSourceError(error instanceof Error ? error.message : "Unable to load candidate sources.");
      }
    };
    void loadSources();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/branches?purpose=candidate-registration", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { branches?: BranchOption[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load company branches.");
        if (!cancelled) setBranches(payload.branches ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBranchError(error instanceof Error ? error.message : "Unable to load company branches.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const country = countryMetadata.find((option) => option.name === form.residenceCountry);
    if (!country) {
      setResidenceStates([]);
      setResidenceCities([]);
      return;
    }

    setResidenceStates(getStatesByShort(country.shortName) ?? []);
    setLocationError("");
    let cancelled = false;
    void getCountryByShort(country.shortName).then((record) => {
      if (cancelled) return;
      const countryCities = form.residenceState
        ? record?.states[form.residenceState] ?? []
        : Object.values(record?.states ?? {}).flat();
      setResidenceCities([...new Set(countryCities.map((city) => city.name))].sort((a, b) => a.localeCompare(b)));
    }).catch((error: unknown) => {
      if (!cancelled) setLocationError(error instanceof Error ? error.message : "Unable to load locations for this country.");
    });
    return () => { cancelled = true; };
  }, [form.residenceCountry, form.residenceState]);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    fetch(`/api/candidates/${encodeURIComponent(form.id)}/status-history`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { events?: CandidateStageEvent[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load processing history.");
        if (!cancelled) setStageEvents(payload.events ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled) setStageEventsError(error instanceof Error ? error.message : "Unable to load processing history.");
      });
    return () => { cancelled = true; };
  }, [form.id, isNew]);

  useEffect(() => {
    if (!canViewFinance || isNew) return;
    let cancelled = false;
    const loadFinance = async () => {
      setFinanceLoading(true);
      setFinanceError("");
      try {
        const response = await fetch(`/api/candidates/${encodeURIComponent(form.id)}/finance`, { cache: "no-store" });
        const payload = await response.json() as CandidateFinancePayload & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load candidate finance records.");
        if (!cancelled) setFinanceData(payload);
      } catch (error) {
        if (!cancelled) setFinanceError(error instanceof Error ? error.message : "Unable to load candidate finance records.");
      } finally {
        if (!cancelled) setFinanceLoading(false);
      }
    };
    void loadFinance();
    return () => {
      cancelled = true;
    };
  }, [canViewFinance, form.id, isNew]);

  const normalizedPassportNumber = normalizePassportNumber(form.passportNumber);

  useEffect(() => {
    if (!isNew || !normalizedPassportNumber) {
      setPassportCheck({ passportNumber: normalizedPassportNumber, status: "idle" });
      return;
    }
    if (!(form.nationality ?? "").trim()) {
      setPassportCheck({ passportNumber: normalizedPassportNumber, status: "invalid", error: "Select the candidate nationality first." });
      return;
    }
    if (!isPassportNumberValid(form.nationality ?? "", normalizedPassportNumber)) {
      setPassportCheck({ passportNumber: normalizedPassportNumber, status: "invalid", error: passportNumberRule(form.nationality ?? "") });
      return;
    }

    const controller = new AbortController();
    setPassportCheck({ passportNumber: normalizedPassportNumber, status: "checking" });
    const timeout = window.setTimeout(() => {
      void fetch("/api/candidates/passport-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passportNumber: normalizedPassportNumber, nationality: form.nationality }),
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        const payload = await response.json() as {
          registered?: boolean;
          registeredBy?: string | null;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Unable to validate this passport number.");
        setPassportCheck({
          passportNumber: normalizedPassportNumber,
          status: payload.registered ? "duplicate" : "valid",
          registeredBy: payload.registeredBy ?? undefined,
        });
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPassportCheck({
          passportNumber: normalizedPassportNumber,
          status: "error",
          error: error instanceof Error ? error.message : "Unable to validate this passport number.",
        });
      });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.nationality, isNew, normalizedPassportNumber]);

  const set = (key: keyof Candidate, val: string | string[] | number) =>
    setForm((f) => ({ ...f, [key]: val }));

  const setDateOfBirth = (dateOfBirth: string) => {
    const age = calculateAge(dateOfBirth);
    setForm((current) => ({ ...current, dob: dateOfBirth, age: age ?? 0 }));
  };

  const addCandidateSource = async () => {
    const source = sourceDraft.trim();
    if (!source || addingSource) return;
    setAddingSource(true);
    setSourceError("");
    try {
      const response = await fetch("/api/candidates/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const payload = await response.json() as { source?: CandidateSourceOption; error?: string };
      if (!response.ok || !payload.source) throw new Error(payload.error ?? "Unable to add this candidate source.");
      setCandidateSources((current) =>
        [...current, payload.source!].sort((a, b) => a.source.localeCompare(b.source)),
      );
      set("source", payload.source.source);
      setSourceDraft("");
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : "Unable to add this candidate source.");
    } finally {
      setAddingSource(false);
    }
  };

  const personalSectionComplete = Boolean(
      form.fileNumber.trim() &&
      form.firstName.trim() &&
      form.lastName.trim() &&
      form.phone.trim() &&
      form.nationality?.trim() &&
      form.branchId?.trim() &&
      (isAgent && isNew ||
        (form.gender.trim() &&
          form.religion.trim() &&
          form.abroadStatus.trim() &&
          form.abroadExperience.trim() &&
          candidateSources.some((option) => option.source === form.source) &&
          form.agent.trim())),
    );
  const kinSectionComplete = Boolean(
      form.kinFirstName.trim() &&
      form.kinLastName.trim() &&
      form.kinPhone.trim() &&
      form.kinRelationship.trim(),
    );
  const jobSectionComplete = form.jobOfInterest.length > 0;
    const passportSectionComplete = Boolean(form.passportNumber.trim() &&
      (["Available", "With Agent"].includes(form.passportStatus) &&
        (form.passportStatus !== "Available" ||
          (form.passportBranch.trim() && form.passportStorageLocation.trim())) &&
          (form.passportStatus !== "With Agent" || form.agent.trim() || Boolean(form.agentUserId) || isAgent)) &&
        (!isNew || (passportCheck.passportNumber === normalizedPassportNumber && passportCheck.status === "valid")));
  const registrationComplete =
    personalSectionComplete &&
    kinSectionComplete &&
    jobSectionComplete &&
    passportSectionComplete;
  const activeContentSection = registrationContentSections[contentSectionIndex];
  const isCurrentContentSectionComplete = activeContentSection === "Personal"
    ? personalSectionComplete
    : activeContentSection === "Passport Info"
      ? passportSectionComplete
      : activeContentSection === "Parents & Kin"
        ? kinSectionComplete
        : activeContentSection === "Job Info"
          ? jobSectionComplete
          : true;
  const isLastContentSection = contentSectionIndex === registrationContentSections.length - 1;
  const showSection = (section: Tab) =>
    viewMode === "content"
      ? (!isNew || activeContentSection === section)
      : activeTab === section;
  const sectionIsComplete = (section: Tab) => {
    if (section === "Personal") return personalSectionComplete;
    if (section === "Passport Info") return passportSectionComplete;
    if (section === "Parents & Kin") return kinSectionComplete;
    if (section === "Job Info") return jobSectionComplete;
    return true;
  };

  const financeRows = financeData
    ? [
        ...financeData.invoices.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        date: invoice.issued_at,
        type: "Invoice",
        method: "—",
        amount: Number(invoice.amount),
        reference: invoice.invoice_number,
        status: invoice.status,
        })),
        ...financeData.receipts.map((receipt) => ({
        id: `receipt-${receipt.id}`,
        date: receipt.received_at,
        type: receipt.category || "Deposit",
        method: receipt.payment_method,
        amount: Number(receipt.amount),
        reference: receipt.receipt_number,
        status: "Received",
        })),
        ...financeData.payments.map((payment) => ({
        id: `payment-${payment.id}`,
        date: payment.paid_at,
        type: "Invoice payment",
        method: "—",
        amount: Number(payment.amount),
        reference: payment.invoice_id,
        status: "Paid",
        })),
      ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    : [];
  const formatFinanceAmount = (value: number) => `UGX ${value.toLocaleString()}`;

  const saveCandidate = async () => {
    if (isNew && !registrationComplete) {
      setShowValidationErrors(true);
      const firstIncomplete = registrationContentSections.findIndex((section) => !sectionIsComplete(section));
      const nextIndex = Math.max(0, firstIncomplete);
      const targetSection = registrationContentSections[nextIndex] ?? registrationContentSections[0];
      setContentSectionIndex(nextIndex);
      setActiveTab(targetSection);
      setViewMode("content");
      window.requestAnimationFrame(() => {
        document.getElementById(`candidate-section-${targetSection.toLocaleLowerCase().replace(/ /g, "-")}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      await onSave(form);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save candidate.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-6" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <h1 className="text-lg font-700" style={{ color: "var(--foreground)" }}>
            {isNew ? "Register Candidate" : `Edit Candidate: ${form.firstName} ${form.lastName}`}
          </h1>
          {isNew && <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Complete the required fields to register this candidate.</p>}
          {!isNew && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <span>
                Created by <strong style={{ color: "var(--foreground)" }}>{candidate.createdByName || "—"}</strong>
                {formatAttributionDate(candidate.createdAt) && ` · ${formatAttributionDate(candidate.createdAt)}`}
              </span>
              <span>
                Last edited by <strong style={{ color: "var(--foreground)" }}>{candidate.updatedByName || candidate.createdByName || "—"}</strong>
                {(formatAttributionDate(candidate.updatedAt || candidate.createdAt)) && ` · ${formatAttributionDate(candidate.updatedAt || candidate.createdAt)}`}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-2 rounded px-4 py-2 text-sm font-600"
          style={{ background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)" }}
        >
          <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" /> Back to List
        </button>
      </div>

      <div className="shrink-0 border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div role="tablist" aria-label="Candidate form view" className="flex gap-1 px-3 pt-2">
          {(["details", "content"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className="shrink-0 rounded-t px-4 py-2 text-sm font-600"
              style={{
                color: viewMode === mode ? "var(--primary)" : "var(--muted-foreground)",
                borderBottom: viewMode === mode ? "2px solid var(--primary)" : "2px solid transparent",
              }}
            >
              {mode === "details" ? "Details" : "Content"}
            </button>
          ))}
        </div>
        {viewMode === "details" && (
          <div className="overflow-x-auto">
            <div role="tablist" aria-label="Candidate details sections" className="candidate-detail-section-tabs flex w-max min-w-full flex-nowrap">
              {availableTabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t}
                  onClick={() => setActiveTab(t)}
                  className="shrink-0 px-4 py-3 text-sm font-600 transition-colors sm:px-5"
                  style={{
                    color: activeTab === t ? "var(--primary)" : "var(--muted-foreground)",
                    borderBottom: activeTab === t ? "2px solid var(--primary)" : "2px solid transparent",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Form body */}
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        {viewMode === "content" && isNew && (
          <p className="mb-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Complete each section in order. Required fields must be complete before the next section opens.
          </p>
        )}
        {viewMode === "content" && !isNew && (
          <p className="mb-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Candidate sections are shown together below.
          </p>
        )}
        {showSection("Personal") && (
          <div id="candidate-section-personal" className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
            {isAgent && isNew && (
              <div className="col-span-full mb-4 p-4 rounded border" style={{ background: "#fef08a40", borderColor: "#fbbf2440" }}>
                <p className="text-sm" style={{ color: "var(--foreground)" }}>
                  <strong>Note:</strong> Additional fields will be completed by company staff after initial registration.
                </p>
              </div>
            )}
            <Field label="File Number" value={form.fileNumber} onChange={(v) => set("fileNumber", v)} required invalid={showValidationErrors && !form.fileNumber.trim()} />
            <Field label="First Name" value={form.firstName} onChange={(v) => set("firstName", v)} required invalid={showValidationErrors && !form.firstName.trim()} />
            <Field label="Last Name" value={form.lastName} onChange={(v) => set("lastName", v)} required invalid={showValidationErrors && !form.lastName.trim()} />
            {!(isAgent && isNew) && <Field label="Other Names" value={form.otherNames} onChange={(v) => set("otherNames", v)} />}
            {!(isAgent && isNew) && <SelectField label="Marital Status" value={form.maritalStatus} onChange={(v) => set("maritalStatus", v)}
              options={["Single", "Married", "Divorced", "Widowed"]} />}

            <Field label="Date of Birth" value={form.dob} onChange={setDateOfBirth} type="date" />
            <Field label="Age" value={form.dob ? String(calculateAge(form.dob) ?? "") : ""} onChange={() => {}} type="number" readOnly />
            <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} required invalid={showValidationErrors && !form.phone.trim()} />
            {!(isAgent && isNew) && <Field label="Secondary Phone" value={form.secondaryPhone} onChange={(v) => set("secondaryPhone", v)} />}

            {!(isAgent && isNew) && <Field label="Other Phone" value={form.otherPhone} onChange={(v) => set("otherPhone", v)} />}
            {!(isAgent && isNew) && <SelectField label="Gender" value={form.gender} onChange={(v) => set("gender", v)} required invalid={showValidationErrors && !form.gender.trim()}
              options={["Male", "Female"]} />}
            {!(isAgent && isNew) && <SelectField label="Religion" value={form.religion} onChange={(v) => set("religion", v)} required invalid={showValidationErrors && !form.religion.trim()}
              options={["Christian", "Muslim", "Hindu", "Other"]} />}
            <div>
              <label className="mb-1 block text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
                Nationality<span style={{ color: "#ef4444" }}> *</span>
              </label>
              <SearchableSelect
                required
                ariaLabel="Candidate nationality"
                value={form.nationality ?? ""}
                onChange={(value) => set("nationality", value)}
                options={countryOptions}
                placeholder="Type a nationality"
                style={{ borderColor: showValidationErrors && !form.nationality?.trim() ? "#dc2626" : "var(--border)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
                Branch<span style={{ color: "#ef4444" }}> *</span>
              </label>
              <SearchableSelect
                required
                ariaLabel="Candidate branch"
                value={form.branchId ?? ""}
                onChange={(branchId) => {
                  const selectedBranch = branches.find((branch) => branch.id === branchId);
                  setForm((current) => ({ ...current, branchId, branch: selectedBranch?.name ?? "" }));
                }}
                options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                placeholder="Select a company branch"
                style={{ borderColor: showValidationErrors && !form.branchId?.trim() ? "#dc2626" : "var(--border)" }}
              />
              {branchError && <p role="alert" className="mt-1 text-xs text-red-500">{branchError}</p>}
            </div>

            {!(isAgent && isNew) && <SelectField label="Abroad Status" value={form.abroadStatus} onChange={(v) => set("abroadStatus", v)} required invalid={showValidationErrors && !form.abroadStatus.trim()}
              options={["Yes", "No"]} />}
            {!(isAgent && isNew) && <SelectField label="Abroad Experience" value={form.abroadExperience} onChange={(v) => set("abroadExperience", v)} required invalid={showValidationErrors && !form.abroadExperience.trim()}
              options={["None", "Certificate", "1 Year", "2 Years", "3 Years", "5+ Years"]} />}
            {!(isAgent && isNew) && (
              <div>
                <label htmlFor="candidate-source" className="mb-1 block text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
                  Source<span style={{ color: "#ef4444" }}> *</span>
                </label>
                <select
                  id="candidate-source"
                  value={form.source}
                  onChange={(event) => set("source", event.target.value)}
                  required
                  className="w-full rounded border px-3 py-2 text-sm outline-none"
                  aria-invalid={showValidationErrors && !form.source.trim() || undefined}
                  style={{ background: "var(--secondary)", borderColor: showValidationErrors && !form.source.trim() ? "#dc2626" : "var(--border)", color: "var(--foreground)" }}
                >
                  <option value="">Select source</option>
                  {form.source && !candidateSources.some((option) => option.source === form.source) && (
                    <option value={form.source}>{form.source}</option>
                  )}
                  {candidateSources.map((option) => <option key={option.id} value={option.source}>{option.source}</option>)}
                </select>
                {canManageSources && (
                  <div className="mt-2 flex gap-2">
                    <input
                      aria-label="New candidate source"
                      value={sourceDraft}
                      maxLength={80}
                      onChange={(event) => setSourceDraft(event.target.value)}
                      placeholder="Add a source"
                      className="min-w-0 flex-1 rounded border px-2 py-1.5 text-xs"
                      style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                    />
                    <button
                      type="button"
                      onClick={() => void addCandidateSource()}
                      disabled={addingSource || !sourceDraft.trim()}
                      className="shrink-0 rounded px-3 py-1.5 text-xs font-600 disabled:opacity-50"
                      style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                    >
                      {addingSource ? "Adding…" : "Add"}
                    </button>
                  </div>
                )}
                {sourceError && <p role="alert" className="mt-1 text-xs text-red-500">{sourceError}</p>}
              </div>
            )}

            {!(isAgent && isNew) && <div className="col-span-2">
              <label className="text-xs font-600 block mb-1" style={{ color: "var(--muted-foreground)" }}>Agent<span style={{ color: "#ef4444" }}> *</span></label>
              <SearchableSelect required ariaLabel="Search agent" value={form.agent} onChange={(value) => set("agent", value)} options={[...new Set([...agentOptions, ...(form.agent ? [form.agent] : [])])].map((name) => ({ value: name, label: name }))} placeholder="Type an agent name" style={{ borderColor: showValidationErrors && !form.agent.trim() ? "#dc2626" : "var(--border)" }} />
            </div>}
          </div>
        )}

        {showSection("Passport Info") && (
          <div id="candidate-section-passport-info" className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
            <SectionHeader title="Passport Info" />
            <Field label="NIN" value={form.nin} onChange={(v) => set("nin", v)} />
            <div>
              <Field label="Passport Number" value={form.passportNumber} onChange={(v) => set("passportNumber", v)} required invalid={showValidationErrors && !form.passportNumber.trim()} />
              {isNew && normalizedPassportNumber && passportCheck.passportNumber === normalizedPassportNumber && (
                <p
                  role={passportCheck.status === "duplicate" || passportCheck.status === "invalid" || passportCheck.status === "error" ? "alert" : "status"}
                  aria-live="polite"
                  className="mt-1 text-xs"
                  style={{
                    color: passportCheck.status === "valid"
                      ? "#16a34a"
                      : passportCheck.status === "duplicate" || passportCheck.status === "invalid" || passportCheck.status === "error"
                        ? "#dc2626"
                        : "var(--muted-foreground)",
                  }}
                >
                  {passportCheck.status === "checking" && "Checking passport number…"}
                  {passportCheck.status === "valid" && "✓ Passport number is valid and available."}
                  {passportCheck.status === "duplicate" && `Sorry, this passport number was already captured by ${passportCheck.registeredBy ?? "a former team member"}.`}
                  {(passportCheck.status === "invalid" || passportCheck.status === "error") && (passportCheck.error ?? "Unable to validate this passport number.")}
                </p>
              )}
            </div>
            <Field label="Issue Date" value={form.passportIssue} onChange={(v) => set("passportIssue", v)} type="date" />
            <Field label="Expiry Date" value={form.passportExpiry} onChange={(v) => set("passportExpiry", v)} type="date" />
            <SelectField label="Passport Status" value={form.passportStatus} onChange={(v) => set("passportStatus", v)} options={["Available", "With Agent", ...(!["Available", "With Agent"].includes(form.passportStatus) && form.passportStatus ? [form.passportStatus] : [])]} required disabled={!isNew && !canManagePassportStatus} invalid={showValidationErrors && !form.passportStatus.trim()} />
            {form.passportStatus === "Available" && <>
              <SelectField label="Storage Branch" value={form.passportBranch} onChange={(v) => set("passportBranch", v)} options={branches.map((branch) => branch.name)} required invalid={showValidationErrors && !form.passportBranch.trim()} />
              <Field label="Storage Location" value={form.passportStorageLocation} onChange={(v) => set("passportStorageLocation", v)} placeholder="e.g. Locker A-3" required invalid={showValidationErrors && !form.passportStorageLocation.trim()} />
            </>}
          </div>
        )}

        {!(isAgent && isNew) && showSection("Residence") && (
          <div id="candidate-section-residence" className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
            <SectionHeader title="Residence Information" />
            <Field label="Place of Birth" value={form.placeOfBirth} onChange={(v) => set("placeOfBirth", v)} />
            <div className="col-span-2">
              <Field label="Physical Address" value={form.physicalAddress} onChange={(v) => set("physicalAddress", v)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600" style={{ color: "var(--muted-foreground)" }}>Country</label>
              <SearchableSelect
                ariaLabel="Residence country"
                value={form.residenceCountry ?? ""}
                onChange={(value) => setForm((current) => ({ ...current, residenceCountry: value, district: "", residenceState: "" }))}
                options={countryOptions}
                placeholder="Type a country"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600" style={{ color: "var(--muted-foreground)" }}>District / City</label>
              <SearchableSelect
                ariaLabel="Residence district or city"
                value={form.district}
                onChange={(value) => set("district", value)}
                options={residenceCities.map((city) => ({ value: city, label: city }))}
                placeholder={form.residenceCountry ? "Type a city or district" : "Select a country first"}
                disabled={!form.residenceCountry}
              />
            </div>
            <div>
              <SelectField
                label="State / Province"
                value={form.residenceState ?? ""}
                onChange={(value) => setForm((current) => ({ ...current, residenceState: value, district: "" }))}
                options={residenceStates}
                disabled={!form.residenceCountry}
              />
            </div>
            {locationError && <p role="alert" className="col-span-full text-xs text-red-500">{locationError}</p>}
          </div>
        )}

        {showSection("Parents & Kin") && (
          <div id="candidate-section-parents-&-kin" className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
            {!(isAgent && isNew) && <>
              <SectionHeader title="Parents Information" />
              <Field label="Father Name" value={form.fatherName} onChange={(v) => set("fatherName", v)} />
              <Field label="Father Phone" value={form.fatherPhone} onChange={(v) => set("fatherPhone", v)} />
              <SelectField label="Father Status" value={form.fatherStatus} onChange={(v) => set("fatherStatus", v)}
                options={["Alive", "Deceased", "Unknown"]} />
              <Field label="Mother Name" value={form.motherName} onChange={(v) => set("motherName", v)} />
              <Field label="Mother Phone" value={form.motherPhone} onChange={(v) => set("motherPhone", v)} />
              <SelectField label="Mother Status" value={form.motherStatus} onChange={(v) => set("motherStatus", v)}
                options={["Alive", "Deceased", "Unknown"]} />
              <div className="col-span-2" />
            </>}

            <SectionHeader title={isAgent && isNew ? "Next of Kin Information (Mandatory)" : "First Next of Kin (Mandatory)"} />
            <Field label="First Name" value={form.kinFirstName} onChange={(v) => set("kinFirstName", v)} required invalid={showValidationErrors && !form.kinFirstName.trim()} />
            <Field label="Last Name" value={form.kinLastName} onChange={(v) => set("kinLastName", v)} required invalid={showValidationErrors && !form.kinLastName.trim()} />
            <Field label="Phone" value={form.kinPhone} onChange={(v) => set("kinPhone", v)} required invalid={showValidationErrors && !form.kinPhone.trim()} />
            <Field label="Relationship" value={form.kinRelationship} onChange={(v) => set("kinRelationship", v)} required invalid={showValidationErrors && !form.kinRelationship.trim()}
              placeholder="e.g. Wife, Brother, Parent" />

            {!(isAgent && isNew) && <>
              <SectionHeader title="Emergency Contact (Optional)" />
              <Field label="First Name" value={form.emergencyFirstName} onChange={(v) => set("emergencyFirstName", v)} />
              <Field label="Last Name" value={form.emergencyLastName} onChange={(v) => set("emergencyLastName", v)} />
              <Field label="Phone" value={form.emergencyPhone} onChange={(v) => set("emergencyPhone", v)} />
              <Field label="Relationship" value={form.emergencyRelationship} onChange={(v) => set("emergencyRelationship", v)} />
            </>}
          </div>
        )}

        {showSection("Job Info") && (
          <div id="candidate-section-job-info" className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
            <SectionHeader title="Job & Contract Information" />
            <div className="col-span-2">
              <MultiField label="Job of Interest" value={form.jobOfInterest} onChange={(v) => set("jobOfInterest", v)} required invalid={showValidationErrors && form.jobOfInterest.length === 0}
                options={["Administrator", "Housekeeper", "Cook", "Nanny", "Cleaner", "Driver", "Security Guard", "Cashier", "Waitress", "Nurse", "Labourer"]} />
            </div>
            <div className="col-span-2">
              <MultiField label="Preferred Countries" value={form.preferredCountries} onChange={(v) => set("preferredCountries", v)}
                options={["Saudi Arabia", "UAE", "Kuwait", "Qatar", "Oman", "Bahrain", "Jordan", "Lebanon"]} />
            </div>
            <div />
            <div />

            {!isNew && (
              <>
                <SectionHeader title="Travel and Processing Status History" />
                {stageEventsError ? (
                  <p role="alert" className="col-span-full text-sm text-red-500">{stageEventsError}</p>
                ) : stageEvents.length ? (
                  <ol className="col-span-full space-y-3">
                    {stageEvents.map((event) => (
                      <li key={event.id} className="flex items-start gap-3 border-l-2 pl-4" style={{ borderColor: "var(--primary)" }}>
                        <div>
                          <p className="text-sm font-600" style={{ color: "var(--foreground)" }}>{event.label}</p>
                          <time className="text-xs" dateTime={event.occurred_at} style={{ color: "var(--muted-foreground)" }}>
                            {new Date(event.occurred_at).toLocaleString()}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="col-span-full text-sm" style={{ color: "var(--muted-foreground)" }}>No processing updates have been recorded.</p>
                )}
              </>
            )}
          </div>
        )}

        {!(isAgent && isNew) && showSection("Education & Skills") && (
          <div className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
            <SectionHeader title="Education" />
            <div className="col-span-2"><Field label="Highest Qualification" value={form.educationQualification ?? ""} onChange={(v) => set("educationQualification", v)} placeholder="e.g. Bachelor's Degree" /></div>
            <div className="col-span-2"><Field label="Institution" value={form.educationInstitution ?? ""} onChange={(v) => set("educationInstitution", v)} placeholder="e.g. Makerere University" /></div>
            <Field label="Year Completed" value={form.educationYearCompleted ?? ""} onChange={(v) => set("educationYearCompleted", v)} placeholder="e.g. 2015" />
            <div className="col-span-3"><Field label="Field of Study" value={form.educationField ?? ""} onChange={(v) => set("educationField", v)} placeholder="e.g. Business Administration" /></div>

            <SectionHeader title="Employment History" />
            <div className="col-span-2"><Field label="Last Employer" value={form.lastEmployer ?? ""} onChange={(v) => set("lastEmployer", v)} placeholder="Company name" /></div>
            <div className="col-span-2"><Field label="Job Title" value={form.previousJobTitle ?? ""} onChange={(v) => set("previousJobTitle", v)} placeholder="e.g. Administrator" /></div>
            <Field label="From" value={form.employmentFrom ?? ""} onChange={(v) => set("employmentFrom", v)} type="date" />
            <Field label="To" value={form.employmentTo ?? ""} onChange={(v) => set("employmentTo", v)} type="date" />
            <div className="col-span-4"><Field label="Duties / Description" value={form.employmentDuties ?? ""} onChange={(v) => set("employmentDuties", v)} placeholder="Brief description of responsibilities" /></div>

            <SectionHeader title="Skills & Languages" />
            <div className="col-span-2"><Field label="Key Skills" value={form.keySkills ?? ""} onChange={(v) => set("keySkills", v)} placeholder="e.g. Cooking, Cleaning, Childcare" /></div>
            <div className="col-span-2"><Field label="Languages Spoken" value={form.languagesSpoken ?? ""} onChange={(v) => set("languagesSpoken", v)} placeholder="e.g. English, Luganda, Arabic" /></div>
            <div className="col-span-4"><Field label="Certifications" value={form.certifications ?? ""} onChange={(v) => set("certifications", v)} placeholder="e.g. Food Handlers Certificate, First Aid" /></div>

            <SectionHeader title="Notes" />
            <div className="col-span-4">
              <label className="text-xs font-600 block mb-1" style={{ color: "var(--muted-foreground)" }}>Recruiter Notes</label>
              <textarea rows={4} value={form.recruiterNotes ?? ""} onChange={(event) => set("recruiterNotes", event.target.value)} placeholder="Internal notes about this candidate..." className="w-full px-3 py-2 text-sm rounded border outline-none resize-y"
                style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            </div>
          </div>
        )}

        {viewMode === "content" && isNew && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm font-600" style={{ color: "var(--muted-foreground)" }}>
              Section {contentSectionIndex + 1} of {registrationContentSections.length}: {activeContentSection}
            </p>
            <div className="flex gap-2">
              {contentSectionIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setContentSectionIndex((index) => Math.max(0, index - 1))}
                  className="rounded border px-4 py-2 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                >
                  Previous section
                </button>
              )}
              {!isLastContentSection && (
                <button
                  type="button"
                  onClick={() => setContentSectionIndex((index) => Math.min(registrationContentSections.length - 1, index + 1))}
                  disabled={!isCurrentContentSectionComplete}
                  className="rounded px-4 py-2 text-sm font-600 disabled:opacity-50"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  Continue to {registrationContentSections[contentSectionIndex + 1]}
                </button>
              )}
            </div>
          </div>
        )}

        {!isNew && (viewMode === "content" || activeTab === "Finance") && canViewFinance && (
          <section className="mb-8" aria-labelledby="candidate-finance-heading">
            <h2 id="candidate-finance-heading" className="mb-4 text-base font-700" style={{ color: "var(--foreground)" }}>Candidate Finance</h2>
            {isNew ? (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Finance records are available after this candidate is registered.</p>
            ) : financeLoading ? (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading finance records…</p>
            ) : financeError ? (
              <p role="alert" className="text-sm text-red-500">{financeError}</p>
            ) : financeData ? (
              <>
                <div className="responsive-grid-4 mb-6 grid grid-cols-4 gap-4">
                  {[
                    { label: "Total Invoiced", value: financeData.summary.totalInvoiced, color: "var(--foreground)" },
                    { label: "Total Deposited", value: financeData.summary.totalDeposits, color: "#8b5cf6" },
                    { label: "Total Paid", value: financeData.summary.totalPaid, color: "#10b981" },
                    { label: "Outstanding Balance", value: financeData.summary.outstandingBalance, color: "#ef4444" },
                  ].map((summary) => (
                    <div key={summary.label} className="rounded border p-4" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
                      <div className="mb-1 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{summary.label}</div>
                      <div className="mono text-lg font-700" style={{ color: summary.color }}>{formatFinanceAmount(Number(summary.value))}</div>
                    </div>
                  ))}
                </div>
                <h3 className="mb-3 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Invoices and payments</h3>
                <div className="overflow-x-auto rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <table className="w-full min-w-180 text-sm">
                    <thead>
                      <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                        {["Date", "Type", "Method", "Amount", "Reference", "Status"].map((heading) => (
                          <th key={heading} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {financeRows.length ? financeRows.map((row) => (
                        <tr key={row.id} className="border-b" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                          <td className="whitespace-nowrap px-4 py-2.5">{row.date ? new Date(row.date).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-2.5">{row.type}</td>
                          <td className="px-4 py-2.5">{row.method}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 mono">{formatFinanceAmount(row.amount)}</td>
                          <td className="px-4 py-2.5">{row.reference}</td>
                          <td className="px-4 py-2.5">{row.status}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: "var(--muted-foreground)" }}>No candidate finance records found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        )}

        {!isNew && (viewMode === "content" || activeTab === "AI Tools") && (
          <div className="mx-auto mb-8 max-w-xl pt-4">
            <div className="rounded border p-6 mb-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="font-700 mb-1 flex items-center gap-2" style={{ color: "var(--foreground)" }}><Sparkles size={16} aria-hidden="true" /> Generate CV with AI</h3>
              <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
                Uses this candidate's stored information to create a professional CV automatically.
              </p>
              <button className="w-full py-2.5 text-sm font-700 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                <Sparkles size={15} aria-hidden="true" /> Generate CV with AI
              </button>
            </div>
            <div className="rounded border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="font-700 mb-1 flex items-center gap-2" style={{ color: "var(--foreground)" }}><Sparkles size={16} aria-hidden="true" /> Generate Medical Document</h3>
              <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
                Populates the company's medical-document template with this candidate's data for review and approval.
              </p>
              <button className="w-full py-2.5 text-sm font-700 rounded" style={{ background: "#8b5cf6", color: "#fff" }}>
                <Sparkles size={15} aria-hidden="true" /> Generate Medical with AI
              </button>
            </div>
          </div>
        )}

        {!isNew && (viewMode === "content" || activeTab === "Activity") && (canViewActivityLogs || canViewActivityByRole) && (
          <div className="mb-8 max-w-2xl">
            <h3 className="text-xs font-700 uppercase tracking-widest mb-4" style={{ color: "var(--muted-foreground)" }}>Activity History</h3>
            <div className="space-y-0">
              {/* Activity log would be populated from candidate data */}
            </div>
          </div>
        )}

      </div>

      {/* Save bar */}
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-4 sm:px-6"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        {viewMode === "details" ? (
          <div className="flex gap-2" aria-label={`Section ${availableTabs.indexOf(activeTab) + 1} of ${availableTabs.length}`}>
            {availableTabs.map((tab) => (
              <div key={tab} className="h-2 w-2 rounded-full" style={{ background: activeTab === tab ? "var(--primary)" : "var(--border)" }} />
            ))}
          </div>
        ) : <div />}
        <div className="flex flex-wrap justify-end gap-3">
          {isNew && !registrationComplete && (
            <p className="basis-full text-right text-xs" style={{ color: "var(--muted-foreground)" }}>
              Complete the required registration fields, including passport number, status, and storage details for available passports.
            </p>
          )}
          <button type="button" onClick={onBack} className="rounded border px-5 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            Cancel
          </button>
          {(!isNew || viewMode !== "content" || isLastContentSection) && <button
            type="button"
            onClick={() => void saveCandidate()}
            disabled={saving}
            className="px-6 py-2 text-sm font-700 rounded disabled:opacity-50"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {saving ? "Saving…" : isNew ? "Register Candidate" : "Save Changes"}
          </button>}
        </div>
      </div>
      {saveError ? <p role="alert" className="border-t px-6 py-2 text-sm text-red-600" style={{ borderColor: "var(--border)" }}>{saveError}</p> : null}
    </div>
  );
}
