import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles, X } from "lucide-react";
import type { Candidate } from "./Candidates";

interface Props {
  candidate: Candidate;
  isNew: boolean;
  onSave: (c: Candidate) => void | Promise<void>;
  onBack: () => void;
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

const tabs = ["Personal", "Passport & Docs", "Residence", "Parents & Kin", "Job Info", "Education & Skills", "Finance", "AI Tools", "Activity"] as const;
type Tab = typeof tabs[number];

const paymentHistory = [
  { date: "Aug 20, 2026", type: "Deposit", method: "Mobile Money", amount: 1500000, ref: "DEP-001", by: "Aisha Khan", status: "Deposit Received" },
];

const activityLog = [
  { time: "Aug 26, 2026 09:14", user: "Aisha Khan", action: "Viewed candidate profile" },
  { time: "Aug 20, 2026 11:32", user: "Aisha Khan", action: "Recorded payment — UGX 1,500,000" },
  { time: "Aug 15, 2026 14:10", user: "Director Vicent", action: "Updated stage to Registration" },
  { time: "Aug 11, 2026 09:00", user: "Director Vicent", action: "Created candidate profile" },
];

export default function CandidateDetail({ candidate, isNew, onSave, onBack }: Props) {
  const [form, setForm] = useState<Candidate>({ ...candidate });
  const [activeProjectNames, setActiveProjectNames] = useState<string[]>([]);
  const [projectLoadError, setProjectLoadError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Personal");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { projects?: { project_name: string; status: string }[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load assigned projects.");
        if (!cancelled) setActiveProjectNames((payload.projects ?? []).filter((project) => project.status === "active").map((project) => project.project_name));
      })
      .catch((error: unknown) => {
        if (!cancelled) setProjectLoadError(error instanceof Error ? error.message : "Unable to load assigned projects.");
      });
    return () => { cancelled = true; };
  }, []);

  const set = (key: keyof Candidate, val: string | string[] | number) =>
    setForm((f) => ({ ...f, [key]: val }));

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
      <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-lg font-700" style={{ color: "var(--foreground)" }}>
          {isNew ? "New Candidate Enquiry" : `Edit Candidate: ${form.firstName} ${form.lastName}`}
        </h1>
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm font-600 rounded inline-flex items-center gap-2"
          style={{ background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)" }}
        >
          <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" /> Back to List
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className="px-5 py-3 text-sm font-600 transition-colors"
            style={{
              color: activeTab === t ? "var(--primary)" : "var(--muted-foreground)",
              borderBottom: activeTab === t ? "2px solid var(--primary)" : "2px solid transparent",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === "Personal" && (
          <div className="responsive-grid-4 grid grid-cols-4 gap-4">
            <Field label="File Number" value={form.fileNumber} onChange={(v) => set("fileNumber", v)} required />
            <Field label="First Name" value={form.firstName} onChange={(v) => set("firstName", v)} required />
            <Field label="Last Name" value={form.lastName} onChange={(v) => set("lastName", v)} required />
            <Field label="Other Names" value={form.otherNames} onChange={(v) => set("otherNames", v)} />
            <SelectField label="Marital Status" value={form.maritalStatus} onChange={(v) => set("maritalStatus", v)}
              options={["Single", "Married", "Divorced", "Widowed"]} />

            <Field label="Date of Birth" value={form.dob} onChange={(v) => set("dob", v)} type="date" />
            <Field label="Age" value={String(form.age)} onChange={(v) => set("age", Number(v))} type="number" />
            <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} required />
            <Field label="Secondary Phone" value={form.secondaryPhone} onChange={(v) => set("secondaryPhone", v)} />

            <Field label="Other Phone" value={form.otherPhone} onChange={(v) => set("otherPhone", v)} />
            <SelectField label="Gender" value={form.gender} onChange={(v) => set("gender", v)} required
              options={["Male", "Female"]} />
            <SelectField label="Religion" value={form.religion} onChange={(v) => set("religion", v)} required
              options={["Christian", "Muslim", "Hindu", "Other"]} />
            <Field label="Nationality" value={form.nationality ?? ""} onChange={(v) => set("nationality", v)} />

            <SelectField label="Abroad Status" value={form.abroadStatus} onChange={(v) => set("abroadStatus", v)} required
              options={["Yes", "No"]} />
            <SelectField label="Abroad Experience" value={form.abroadExperience} onChange={(v) => set("abroadExperience", v)} required
              options={["None", "Certificate", "1 Year", "2 Years", "3 Years", "5+ Years"]} />
            <SelectField label="Source" value={form.source} onChange={(v) => set("source", v)} required
              options={["Walk-in", "Referred By Friend", "Agent Referral", "Social Media", "Newspaper", "Online"]} />
            <div />

            <div className="col-span-2">
              <SelectField label="Agent" value={form.agent} onChange={(v) => set("agent", v)} required
                options={["Director Vicent", "Asiimwe david", "Aisha Tendo", "Peter Mukasa"]} />
            </div>
            <div className="col-span-2">
              <MultiField label="Media Channel" value={form.mediaChannel} onChange={(v) => set("mediaChannel", v)} required
                options={["Facebook", "Instagram", "Twitter", "WhatsApp", "Newspaper", "Radio", "TV", "Others"]} />
            </div>
          </div>
        )}

        {activeTab === "Passport & Docs" && (
          <div className="responsive-grid-4 grid grid-cols-4 gap-4">
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

            <SectionHeader title="Physical Attributes" />
            <Field label="Height (cm)" value={form.height} onChange={(v) => set("height", v)} placeholder="0" />
            <Field label="Weight (kg)" value={form.weight} onChange={(v) => set("weight", v)} placeholder="0" />
            <Field label="Shirt Size" value={form.shirtSize} onChange={(v) => set("shirtSize", v)} />
            <Field label="Shoe Size" value={form.shoeSize} onChange={(v) => set("shoeSize", v)} />
            <Field label="Waist Size" value={form.waistSize} onChange={(v) => set("waistSize", v)} />
            <div className="col-span-3">
              <Field label="Preferred Cities" value={form.preferredCities} onChange={(v) => set("preferredCities", v)}
                placeholder="Type or select cities" />
            </div>
          </div>
        )}

        {activeTab === "Residence" && (
          <div className="responsive-grid-4 grid grid-cols-4 gap-4">
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

        {activeTab === "Parents & Kin" && (
          <div className="responsive-grid-4 grid grid-cols-4 gap-4">
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

            <SectionHeader title="First Next of Kin (Mandatory)" />
            <Field label="First Name" value={form.kinFirstName} onChange={(v) => set("kinFirstName", v)} required />
            <Field label="Last Name" value={form.kinLastName} onChange={(v) => set("kinLastName", v)} required />
            <Field label="Phone" value={form.kinPhone} onChange={(v) => set("kinPhone", v)} required />
            <Field label="Relationship" value={form.kinRelationship} onChange={(v) => set("kinRelationship", v)} required
              placeholder="e.g. Wife, Brother, Parent" />

            <SectionHeader title="Emergency Contact (Optional)" />
            <Field label="First Name" value={form.emergencyFirstName} onChange={(v) => set("emergencyFirstName", v)} />
            <Field label="Last Name" value={form.emergencyLastName} onChange={(v) => set("emergencyLastName", v)} />
            <Field label="Phone" value={form.emergencyPhone} onChange={(v) => set("emergencyPhone", v)} />
            <Field label="Relationship" value={form.emergencyRelationship} onChange={(v) => set("emergencyRelationship", v)} />
          </div>
        )}

        {activeTab === "Education & Skills" && (
          <div className="responsive-grid-4 grid grid-cols-4 gap-4">
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

        {activeTab === "Finance" && (
          <div>
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total Required", value: "UGX 5,000,000", color: "var(--foreground)" },
                { label: "Total Deposited", value: "UGX 1,500,000", color: "#8b5cf6" },
                { label: "Total Paid", value: "UGX 1,500,000", color: "#10b981" },
                { label: "Outstanding Balance", value: "UGX 3,500,000", color: "#ef4444" },
              ].map((k) => (
                <div key={k.label} className="rounded border p-4" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
                  <div className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
                  <div className="mono text-lg font-700" style={{ color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Payment History</h3>
              <button className="px-3 py-1 text-xs font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>+ Add Payment</button>
            </div>
            <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead><tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {["Date", "Type", "Method", "Amount", "Ref", "Recorded By", "Status"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {paymentHistory.map((p, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{p.date}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{p.type}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.method}</td>
                      <td className="px-4 py-3 mono font-700" style={{ color: "#10b981" }}>+UGX {p.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{p.ref}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.by}</td>
                      <td className="px-4 py-3"><span className="mono text-xs font-600 px-1.5 py-0.5 rounded" style={{ color: "#8b5cf6", background: "#8b5cf620" }}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "AI Tools" && (
          <div className="max-w-xl mx-auto pt-4">
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

        {activeTab === "Activity" && (
          <div className="max-w-2xl">
            <h3 className="text-xs font-700 uppercase tracking-widest mb-4" style={{ color: "var(--muted-foreground)" }}>Activity History</h3>
            <div className="space-y-0">
              {activityLog.map((a, i) => (
                <div key={i} className="flex gap-4 pb-4">
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: "var(--primary)" }} />
                    {i < activityLog.length - 1 && <div className="w-px flex-1 mt-1" style={{ background: "var(--border)" }} />}
                  </div>
                  <div className="pb-2">
                    <div className="text-sm" style={{ color: "var(--foreground)" }}>{a.action}</div>
                    <div className="text-xs mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>{a.user} · {a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Job Info" && (
          <div className="responsive-grid-4 grid grid-cols-4 gap-4">
            <SectionHeader title="Job & Contract Information" />
            <div className="col-span-2">
              <MultiField label="Job of Interest" value={form.jobOfInterest} onChange={(v) => set("jobOfInterest", v)} required
                options={["Administrator", "Housekeeper", "Cook", "Nanny", "Cleaner", "Driver", "Security Guard", "Cashier", "Waitress", "Nurse", "Labourer"]} />
            </div>
            <div className="col-span-2">
              <MultiField label="Preferred Countries" value={form.preferredCountries} onChange={(v) => set("preferredCountries", v)}
                options={["Saudi Arabia", "UAE", "Kuwait", "Qatar", "Oman", "Bahrain", "Jordan", "Lebanon"]} />
            </div>
            <div className="col-span-2">
              <SelectField label="Assigned Contracts" value={form.assignedContracts} onChange={(v) => set("assignedContracts", v)}
                options={[...new Set([...activeProjectNames, ...(form.assignedContracts ? [form.assignedContracts] : [])])]} />
              {projectLoadError && <p role="alert" className="mt-1 text-xs text-red-400">Unable to load active projects. Visa invoicing requires an assigned active project.</p>}
            </div>
            <div />
            <div />

            <SectionHeader title="Application Status" />
            <SelectField label="Stage" value={form.stage} onChange={(v) => set("stage", v)}
              options={["Registration", "Visa Processing", "Final Round", "Travelled", "Withdrawn"]} />
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
      </div>

      {/* Save bar */}
      <div
        className="px-6 py-4 border-t flex items-center justify-between shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div className="flex gap-2">
          {tabs.map((t, i) => (
            <div key={t} className="w-2 h-2 rounded-full" style={{ background: activeTab === t ? "var(--primary)" : "var(--border)" }} />
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onBack} className="px-5 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            Cancel
          </button>
          <button
            onClick={() => void saveCandidate()}
            disabled={saving}
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
