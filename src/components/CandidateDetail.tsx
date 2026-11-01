import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles, X } from "lucide-react";
import type { Candidate } from "./Candidates";
import { SearchableSelect } from "./SearchableSelect";

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
}

function Field({
  label, value, onChange, type = "text", required = false, placeholder = "",
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string;
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
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded border outline-none transition-colors"
        style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options, required = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-600 block mb-1" style={{ color: "var(--muted-foreground)" }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <select
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded border outline-none"
        style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
      >
        <option value="">Select option</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function MultiField({
  label, value, onChange, options, required = false,
}: {
  label: string; value: string[]; onChange: (v: string[]) => void;
  options: string[]; required?: boolean;
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
        style={{ background: "var(--secondary)", borderColor: "var(--border)" }}
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

const allTabs = ["Personal", "Passport & Docs", "Residence", "Parents & Kin", "Job Info", "Education & Skills", "Finance", "AI Tools", "Activity"] as const;
type Tab = typeof allTabs[number];

type CandidateSourceOption = { id: string; source: string };
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

export default function CandidateDetail({ candidate, isNew, isAgent = false, onSave, onBack, agentOptions = [], canViewFinance = false, canManageSources = false, canViewActivityLogs = false, canViewActivityByRole = false }: Props) {
  // Agents registering candidates only see: Personal, Job Info, Parents & Kin (for next of kin)
  // Staff completing registration see all tabs based on permissions
  const agentRegisteringTabs = ["Personal", "Job Info", "Parents & Kin"] as const;
  const staffViewTabs = ["Personal", "Passport & Docs", "Residence", "Parents & Kin", "Job Info", "Education & Skills", ...(canViewFinance ? ["Finance"] : []), "AI Tools", ...(canViewActivityLogs || canViewActivityByRole ? ["Activity"] : [])] as const;
  const availableTabs = (isAgent && isNew ? agentRegisteringTabs : staffViewTabs) as unknown as Tab[];
  
  const [form, setForm] = useState<Candidate>({ ...candidate });
  const [activeTab, setActiveTab] = useState<Tab>(availableTabs[0]);
  const [viewMode, setViewMode] = useState<"details" | "content">("details");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [candidateSources, setCandidateSources] = useState<CandidateSourceOption[]>([]);
  const [sourceDraft, setSourceDraft] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [financeData, setFinanceData] = useState<CandidateFinancePayload | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState("");

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

  const set = (key: keyof Candidate, val: string | string[] | number) =>
    setForm((f) => ({ ...f, [key]: val }));

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

  const registrationComplete =
    Boolean(
      form.fileNumber.trim() &&
      form.firstName.trim() &&
      form.lastName.trim() &&
      form.phone.trim() &&
      form.kinFirstName.trim() &&
      form.kinLastName.trim() &&
      form.kinPhone.trim() &&
      form.kinRelationship.trim() &&
      form.jobOfInterest.length > 0 &&
      (isAgent && isNew ||
        (form.gender.trim() &&
          form.religion.trim() &&
          form.abroadStatus.trim() &&
          form.abroadExperience.trim() &&
          candidateSources.some((option) => option.source === form.source) &&
          form.agent.trim())),
    ) &&
    (!form.passportNumber.trim() ||
      (["Available", "With Agent"].includes(form.passportStatus) &&
        (form.passportStatus !== "Available" ||
          (form.passportBranch.trim() && form.passportStorageLocation.trim())) &&
        (form.passportStatus !== "With Agent" || form.agent.trim())));

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
        {viewMode === "content" && (
          <p className="mb-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Candidate sections are shown together below. Complete the marked required fields before registering.
          </p>
        )}
        {(viewMode === "content" || activeTab === "Personal") && (
          <div className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
            {isAgent && isNew && (
              <div className="col-span-full mb-4 p-4 rounded border" style={{ background: "#fef08a40", borderColor: "#fbbf2440" }}>
                <p className="text-sm" style={{ color: "var(--foreground)" }}>
                  <strong>Note:</strong> Additional fields will be completed by company staff after initial registration.
                </p>
              </div>
            )}
            <Field label="File Number" value={form.fileNumber} onChange={(v) => set("fileNumber", v)} required />
            <Field label="First Name" value={form.firstName} onChange={(v) => set("firstName", v)} required />
            <Field label="Last Name" value={form.lastName} onChange={(v) => set("lastName", v)} required />
            {!(isAgent && isNew) && <Field label="Other Names" value={form.otherNames} onChange={(v) => set("otherNames", v)} />}
            {!(isAgent && isNew) && <SelectField label="Marital Status" value={form.maritalStatus} onChange={(v) => set("maritalStatus", v)}
              options={["Single", "Married", "Divorced", "Widowed"]} />}

            <Field label="Date of Birth" value={form.dob} onChange={(v) => set("dob", v)} type="date" />
            {!(isAgent && isNew) && <Field label="Age" value={String(form.age)} onChange={(v) => set("age", Number(v))} type="number" />}
            <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} required />
            {!(isAgent && isNew) && <Field label="Secondary Phone" value={form.secondaryPhone} onChange={(v) => set("secondaryPhone", v)} />}

            {!(isAgent && isNew) && <Field label="Other Phone" value={form.otherPhone} onChange={(v) => set("otherPhone", v)} />}
            {!(isAgent && isNew) && <SelectField label="Gender" value={form.gender} onChange={(v) => set("gender", v)} required
              options={["Male", "Female"]} />}
            {!(isAgent && isNew) && <SelectField label="Religion" value={form.religion} onChange={(v) => set("religion", v)} required
              options={["Christian", "Muslim", "Hindu", "Other"]} />}
            {!(isAgent && isNew) && <Field label="Nationality" value={form.nationality ?? ""} onChange={(v) => set("nationality", v)} />}

            {!(isAgent && isNew) && <SelectField label="Abroad Status" value={form.abroadStatus} onChange={(v) => set("abroadStatus", v)} required
              options={["Yes", "No"]} />}
            {!(isAgent && isNew) && <SelectField label="Abroad Experience" value={form.abroadExperience} onChange={(v) => set("abroadExperience", v)} required
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
                  style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
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
              <SearchableSelect required ariaLabel="Search agent" value={form.agent} onChange={(value) => set("agent", value)} options={[...new Set([...agentOptions, ...(form.agent ? [form.agent] : [])])].map((name) => ({ value: name, label: name }))} placeholder="Type an agent name" />
            </div>}
          </div>
        )}

        {!(isAgent && isNew) && (viewMode === "content" || activeTab === "Passport & Docs") && (
          <div className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
            <SectionHeader title="Passport Information" />
            <Field label="NIN" value={form.nin} onChange={(v) => set("nin", v)} />
            <Field label="Passport Number" value={form.passportNumber} onChange={(v) => set("passportNumber", v)} />
            <Field label="Issue Date" value={form.passportIssue} onChange={(v) => set("passportIssue", v)} type="date" />
            <Field label="Expiry Date" value={form.passportExpiry} onChange={(v) => set("passportExpiry", v)} type="date" />
            <SelectField label="Passport Status" value={form.passportStatus} onChange={(v) => set("passportStatus", v)} options={["Available", "With Agent"]} required={Boolean(form.passportNumber.trim())} />
            {form.passportStatus === "Available" && <>
              <Field label="Storage Branch" value={form.passportBranch} onChange={(v) => set("passportBranch", v)} placeholder="e.g. Kampala" required={Boolean(form.passportNumber.trim())} />
              <Field label="Storage Location" value={form.passportStorageLocation} onChange={(v) => set("passportStorageLocation", v)} placeholder="e.g. Locker A-3" required={Boolean(form.passportNumber.trim())} />
            </>}

            <SectionHeader title="Preferred Locations" />
            <div className="col-span-4">
              <Field label="Preferred Cities" value={form.preferredCities} onChange={(v) => set("preferredCities", v)}
                placeholder="Type or select cities" />
            </div>
          </div>
        )}

        {!(isAgent && isNew) && (viewMode === "content" || activeTab === "Residence") && (
          <div className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
            <SectionHeader title="Residence Information" />
            <Field label="Place of Birth" value={form.placeOfBirth} onChange={(v) => set("placeOfBirth", v)} />
            <div className="col-span-2">
              <Field label="Physical Address" value={form.physicalAddress} onChange={(v) => set("physicalAddress", v)} />
            </div>
            <SelectField label="District" value={form.district} onChange={(v) => set("district", v)}
              options={["Kampala", "Wakiso", "Mukono", "Jinja", "Gulu", "Mbarara", "Masaka", "Entebbe"]} />
            <Field label="County" value={form.county} onChange={(v) => set("county", v)} />
            <div className="col-span-2">
              <Field label="Sub County" value={form.subCounty} onChange={(v) => set("subCounty", v)} />
            </div>
            <Field label="Parish" value={form.parish} onChange={(v) => set("parish", v)} />
          </div>
        )}

        {(viewMode === "content" || activeTab === "Parents & Kin") && (
          <div className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
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
            <Field label="First Name" value={form.kinFirstName} onChange={(v) => set("kinFirstName", v)} required />
            <Field label="Last Name" value={form.kinLastName} onChange={(v) => set("kinLastName", v)} required />
            <Field label="Phone" value={form.kinPhone} onChange={(v) => set("kinPhone", v)} required />
            <Field label="Relationship" value={form.kinRelationship} onChange={(v) => set("kinRelationship", v)} required
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

        {(viewMode === "content" || activeTab === "Job Info") && (
          <div className="responsive-grid-4 mb-8 grid grid-cols-4 gap-4">
            <SectionHeader title="Job & Contract Information" />
            <div className="col-span-2">
              <MultiField label="Job of Interest" value={form.jobOfInterest} onChange={(v) => set("jobOfInterest", v)} required
                options={["Administrator", "Housekeeper", "Cook", "Nanny", "Cleaner", "Driver", "Security Guard", "Cashier", "Waitress", "Nurse", "Labourer"]} />
            </div>
            <div className="col-span-2">
              <MultiField label="Preferred Countries" value={form.preferredCountries} onChange={(v) => set("preferredCountries", v)}
                options={["Saudi Arabia", "UAE", "Kuwait", "Qatar", "Oman", "Bahrain", "Jordan", "Lebanon"]} />
            </div>
            <div />
            <div />

            <SectionHeader title="Travel and Processing Status" />
            <SelectField label="Travel Status" value={form.travelStatus} onChange={(v) => set("travelStatus", v)}
              options={["Pending Travel", "Travelled", "Withdrawn"]} />
            <SelectField label="Visa Status" value={form.visaStatus} onChange={(v) => set("visaStatus", v)}
              options={["Pending", "Received", "Cancelled"]} />
            <SelectField label="Verification" value={form.verification} onChange={(v) => set("verification", v)}
              options={["Pending", "Verified", "Failed"]} />
            <SelectField label="Acceptance" value={form.acceptance} onChange={(v) => set("acceptance", v)}
              options={["Yes", "No"]} />
            <SelectField label="Branch" value={form.branch} onChange={(v) => set("branch", v)}
              options={["Kampala", "Masaka", "Gulu", "Mbarara", "Entebbe"]} />
          </div>
        )}

        {!(isAgent && isNew) && (viewMode === "content" || activeTab === "Education & Skills") && (
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

        {!(isAgent && isNew) && (viewMode === "content" || activeTab === "Finance") && canViewFinance && (
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

        {!(isAgent && isNew) && (viewMode === "content" || activeTab === "AI Tools") && (
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

        {!(isAgent && isNew) && (viewMode === "content" || activeTab === "Activity") && (canViewActivityLogs || canViewActivityByRole) && (
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
              Complete all required registration fields. If a passport number is entered, complete its passport details too.
            </p>
          )}
          <button type="button" onClick={onBack} className="rounded border px-5 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void saveCandidate()}
            disabled={saving || (isNew && !registrationComplete)}
            className="px-6 py-2 text-sm font-700 rounded disabled:opacity-50"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {saving ? "Saving…" : isNew ? "Register Candidate" : "Save Changes"}
          </button>
        </div>
      </div>
      {saveError ? <p role="alert" className="border-t px-6 py-2 text-sm text-red-600" style={{ borderColor: "var(--border)" }}>{saveError}</p> : null}
    </div>
  );
}
