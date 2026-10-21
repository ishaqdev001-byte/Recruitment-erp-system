"use client";

import { useEffect, useState, type FormEvent } from "react";

type Qualification = { qualification: string; institution: string; year: number | "" };
type Experience = { employer: string; position: string; location: string; startDate: string; endDate: string; responsibilities: string };
type StaffProfile = {
  id: string;
  name: string;
  position: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
  localAddress: string;
  permanentAddress: string;
  nextOfKin: string;
  nextOfKinPhone: string;
  emergencyContactAddress: string;
  passportNumber: string;
  passportExpiry: string;
  nationalIdNumber: string;
  nationalIdExpiry: string;
  academicQualifications: Qualification[];
  professionalQualifications: Qualification[];
  workExperience: Experience[];
  languages: string[];
  hasCriminalRecord: boolean;
  criminalCaseType: string;
  criminalCaseYear: number | "";
  criminalCaseStatus: string;
};
type PersonalDocument = { id: string; document_type: string; file_name: string; file_type: string; file_size: number; created_at: string };
type MyPayslip = { id: string; pay_period: string; gross_amount: number; benefits_total: number; deductions_total: number; net_amount: number; payment_date: string; payment_method: string; payment_reference: string; payslipUrl: string };

const emptyQualification = (): Qualification => ({ qualification: "", institution: "", year: "" });
const emptyExperience = (): Experience => ({ employer: "", position: "", location: "", startDate: "", endDate: "", responsibilities: "" });
const emptyProfile: StaffProfile = {
  id: "", name: "", position: "", phone: "", dateOfBirth: "", sex: "", localAddress: "", permanentAddress: "",
  nextOfKin: "", nextOfKinPhone: "", emergencyContactAddress: "", passportNumber: "", passportExpiry: "",
  nationalIdNumber: "", nationalIdExpiry: "", academicQualifications: [emptyQualification(), emptyQualification()],
  professionalQualifications: [emptyQualification(), emptyQualification()], workExperience: [], languages: [],
  hasCriminalRecord: false, criminalCaseType: "", criminalCaseYear: "", criminalCaseStatus: "",
};
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const documentTypeOptions = [
  ["passport", "Passport"], ["national_id", "National ID"], ["academic_qualification", "Academic qualification"],
  ["professional_qualification", "Professional qualification"], ["employment_record", "Employment record"], ["other", "Other"],
] as const;

export default function HumanResources({ isOwner }: { isOwner: boolean }) {
  const [profile, setProfile] = useState<StaffProfile>(emptyProfile);
  const [documents, setDocuments] = useState<PersonalDocument[]>([]);
  const [payslips, setPayslips] = useState<MyPayslip[]>([]);
  const [languagesText, setLanguagesText] = useState("");
  const [documentType, setDocumentType] = useState<(typeof documentTypeOptions)[number][0]>("passport");
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDocuments = async () => {
    const response = await fetch("/api/workspace/staff/documents", { cache: "no-store" });
    const result = await response.json() as { documents?: PersonalDocument[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Unable to load personal documents.");
    setDocuments(result.documents ?? []);
  };

  const loadPayslips = async () => {
    const response = await fetch("/api/workspace/staff/paychecks", { cache: "no-store" });
    const result = await response.json() as { payslips?: MyPayslip[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Unable to load payslips.");
    setPayslips(result.payslips ?? []);
  };

  useEffect(() => {
    if (isOwner) {
      setProfileLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setProfileLoading(true);
      setError("");
      try {
        const response = await fetch("/api/workspace/staff/profile", { cache: "no-store" });
        if (!response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            const result = await response.json() as { error?: string };
            throw new Error(result.error ?? "Unable to load your HR profile.");
          } else {
            const text = await response.text();
            console.error("Non-JSON response from HR profile API:", text.substring(0, 500));
            throw new Error("The server returned an unexpected response. Please check if the development server is running correctly.");
          }
        }
        const result = await response.json() as { profile?: StaffProfile; error?: string };
        if (cancelled || !result.profile) return;
        const normalized = {
          ...emptyProfile,
          ...result.profile,
          academicQualifications: result.profile.academicQualifications?.length ? result.profile.academicQualifications : [emptyQualification(), emptyQualification()],
          professionalQualifications: result.profile.professionalQualifications?.length ? result.profile.professionalQualifications : [emptyQualification(), emptyQualification()],
          workExperience: result.profile.workExperience ?? [],
          languages: result.profile.languages ?? [],
        };
        setProfile(normalized);
        setLanguagesText(normalized.languages.join(", "));
        await Promise.all([loadDocuments(), loadPayslips()]);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load your HR profile.");
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isOwner]);

  const setField = <K extends keyof StaffProfile>(key: K, value: StaffProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const updateQualification = (type: "academicQualifications" | "professionalQualifications", index: number, key: keyof Qualification, value: string) => {
    setProfile((current) => ({ ...current, [type]: current[type].map((item, itemIndex) => itemIndex === index ? { ...item, [key]: key === "year" ? (value ? Number(value) : "") : value } : item) }));
  };

  const updateExperience = (index: number, key: keyof Experience, value: string) => {
    setProfile((current) => ({ ...current, workExperience: current.workExperience.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = { ...profile, languages: languagesText.split(",").map((language) => language.trim()).filter(Boolean) };
      const response = await fetch("/api/workspace/staff/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const result = await response.json() as { error?: string };
          throw new Error(result.error ?? "Unable to save your HR profile.");
        } else {
          const text = await response.text();
          console.error("Non-JSON response from HR profile save API:", text.substring(0, 500));
          throw new Error("The server returned an unexpected response. Please check if the development server is running correctly.");
        }
      }
      const result = await response.json() as { profile?: StaffProfile; error?: string };
      if (result.profile) setProfile(result.profile);
      setNotice("Your HR profile has been updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save your HR profile.");
    } finally {
      setSaving(false);
    }
  };

  const uploadDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.namedItem("personal-document") as HTMLInputElement | null;
    if (!file?.files?.[0]) {
      setError("Choose a document file to upload.");
      return;
    }
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const payload = new FormData();
      payload.set("documentType", documentType);
      payload.set("file", file.files[0]);
      const response = await fetch("/api/workspace/staff/documents", { method: "POST", body: payload });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to upload document.");
      form.reset();
      await loadDocuments();
      setNotice("Personal document uploaded.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload document.");
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (document: PersonalDocument) => {
    if (!window.confirm(`Delete ${document.file_name}?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/workspace/staff/documents/${encodeURIComponent(document.id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to delete document.");
      await loadDocuments();
      setNotice("Personal document deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete document.");
    }
  };

  const inputClass = "mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none";
  const labelClass = "block text-xs font-700 uppercase tracking-wider";

  if (isOwner) {
    return <div className="p-6"><h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Human Resource</h1><p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Employee self-service is for non-owner company accounts. Manage staff records in Users &amp; Roles.</p></div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b px-6 py-5" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Human Resource</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Your employee record</p>
      </div>
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        {error && <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {notice && <div role="status" className="rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{notice}</div>}
        {profileLoading ? <p className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading your HR profile…</p> : !profile.id ? null : (
          <>
            <form onSubmit={submitProfile} className="space-y-6">
              <section className="rounded border p-4 sm:p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <h2 className="mb-4 text-sm font-700" style={{ color: "var(--foreground)" }}>Personal details</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Full name<input required maxLength={200} value={profile.name} onChange={(event) => setField("name", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Position<input readOnly value={profile.position} className={`${inputClass} opacity-70`} style={fieldStyle} /></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Phone number<input required maxLength={60} value={profile.phone} onChange={(event) => setField("phone", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Date of birth<input required type="date" value={profile.dateOfBirth} onChange={(event) => setField("dateOfBirth", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Sex<select required value={profile.sex} onChange={(event) => setField("sex", event.target.value)} className={inputClass} style={fieldStyle}><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option></select></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Local address<input required maxLength={500} value={profile.localAddress} onChange={(event) => setField("localAddress", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Permanent address<input required maxLength={500} value={profile.permanentAddress} onChange={(event) => setField("permanentAddress", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Next of kin<input required maxLength={200} value={profile.nextOfKin} onChange={(event) => setField("nextOfKin", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Next of kin phone<input required maxLength={60} value={profile.nextOfKinPhone} onChange={(event) => setField("nextOfKinPhone", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                  <label className={`${labelClass} sm:col-span-2`} style={{ color: "var(--muted-foreground)" }}>Emergency contact address<input required maxLength={500} value={profile.emergencyContactAddress} onChange={(event) => setField("emergencyContactAddress", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                </div>
              </section>

              <section className="rounded border p-4 sm:p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <h2 className="mb-4 text-sm font-700" style={{ color: "var(--foreground)" }}>Identification</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Passport number<input required maxLength={30} value={profile.passportNumber} onChange={(event) => setField("passportNumber", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Passport expiry date<input required type="date" value={profile.passportExpiry} onChange={(event) => setField("passportExpiry", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>National ID number<input required maxLength={40} value={profile.nationalIdNumber} onChange={(event) => setField("nationalIdNumber", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                  <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>National ID expiry date<input required type="date" value={profile.nationalIdExpiry} onChange={(event) => setField("nationalIdExpiry", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                </div>
              </section>

              {(["academicQualifications", "professionalQualifications"] as const).map((type) => (
                <section key={type} className="rounded border p-4 sm:p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-700" style={{ color: "var(--foreground)" }}>{type === "academicQualifications" ? "Academic qualifications" : "Professional qualifications"}</h2>
                    <button type="button" onClick={() => setProfile((current) => ({ ...current, [type]: [...current[type], emptyQualification()] }))} className="rounded border px-3 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Add qualification</button>
                  </div>
                  <div className="space-y-4">
                    {profile[type].map((qualification, index) => (
                      <div key={`${type}-${index}`} className="grid gap-3 border-t pt-4 sm:grid-cols-[1.2fr_1fr_120px_auto]" style={{ borderColor: "var(--border)" }}>
                        <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Qualification<input required maxLength={200} value={qualification.qualification} onChange={(event) => updateQualification(type, index, "qualification", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                        <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Institution<input required maxLength={200} value={qualification.institution} onChange={(event) => updateQualification(type, index, "institution", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                        <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Year<input required type="number" min={1900} max={new Date().getFullYear()} value={qualification.year} onChange={(event) => updateQualification(type, index, "year", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                        {profile[type].length > 2 && <button type="button" onClick={() => setProfile((current) => ({ ...current, [type]: current[type].filter((_, itemIndex) => itemIndex !== index) }))} className="self-end rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Remove</button>}
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <section className="rounded border p-4 sm:p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="text-sm font-700" style={{ color: "var(--foreground)" }}>Employment experience</h2><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Enter your most recent employment first.</p></div>
                  <button type="button" onClick={() => setProfile((current) => ({ ...current, workExperience: [emptyExperience(), ...current.workExperience] }))} className="rounded border px-3 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Add experience</button>
                </div>
                <div className="space-y-4">
                  {profile.workExperience.map((experience, index) => (
                    <div key={`experience-${index}`} className="grid gap-3 border-t pt-4 sm:grid-cols-2" style={{ borderColor: "var(--border)" }}>
                      <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>{index === 0 ? "Most recent employer" : "Employer"}<input required maxLength={200} value={experience.employer} onChange={(event) => updateExperience(index, "employer", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                      <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Position<input required maxLength={150} value={experience.position} onChange={(event) => updateExperience(index, "position", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                      <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Location<input required maxLength={200} value={experience.location} onChange={(event) => updateExperience(index, "location", event.target.value)} className={inputClass} style={fieldStyle} /></label>
                      <div className="grid grid-cols-2 gap-3"><label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Start date<input required type="date" value={experience.startDate} onChange={(event) => updateExperience(index, "startDate", event.target.value)} className={inputClass} style={fieldStyle} /></label><label className={labelClass} style={{ color: "var(--muted-foreground)" }}>End date<input type="date" value={experience.endDate} onChange={(event) => updateExperience(index, "endDate", event.target.value)} className={inputClass} style={fieldStyle} /></label></div>
                      <label className={`${labelClass} sm:col-span-2`} style={{ color: "var(--muted-foreground)" }}>Responsibilities<textarea rows={2} maxLength={2000} value={experience.responsibilities} onChange={(event) => updateExperience(index, "responsibilities", event.target.value)} className={`${inputClass} resize-y`} style={fieldStyle} /></label>
                      <button type="button" onClick={() => setProfile((current) => ({ ...current, workExperience: current.workExperience.filter((_, itemIndex) => itemIndex !== index) }))} className="justify-self-start rounded border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Remove experience</button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded border p-4 sm:p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <h2 className="mb-4 text-sm font-700" style={{ color: "var(--foreground)" }}>Languages and declarations</h2>
                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Languages known<input required value={languagesText} onChange={(event) => setLanguagesText(event.target.value)} className={inputClass} style={fieldStyle} placeholder="English, Luganda, Kiswahili" /></label>
                <fieldset className="mt-5">
                  <legend className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Any criminal records?</legend>
                  <div className="mt-2 flex gap-2">
                    {[false, true].map((value) => <button key={String(value)} type="button" aria-pressed={profile.hasCriminalRecord === value} onClick={() => setField("hasCriminalRecord", value)} className="rounded border px-4 py-2 text-sm" style={{ borderColor: profile.hasCriminalRecord === value ? "var(--primary)" : "var(--border)", color: profile.hasCriminalRecord === value ? "var(--primary)" : "var(--muted-foreground)" }}>{value ? "Yes" : "No"}</button>)}
                  </div>
                </fieldset>
                {profile.hasCriminalRecord && <div className="mt-4 grid gap-4 sm:grid-cols-3"><label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Type of case<input required maxLength={200} value={profile.criminalCaseType} onChange={(event) => setField("criminalCaseType", event.target.value)} className={inputClass} style={fieldStyle} /></label><label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Year<input required type="number" min={1900} max={new Date().getFullYear()} value={profile.criminalCaseYear} onChange={(event) => setField("criminalCaseYear", event.target.value ? Number(event.target.value) : "")} className={inputClass} style={fieldStyle} /></label><label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Current case status<input required maxLength={200} value={profile.criminalCaseStatus} onChange={(event) => setField("criminalCaseStatus", event.target.value)} className={inputClass} style={fieldStyle} /></label></div>}
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => setShowDocuments((visible) => !visible)} className="rounded border px-4 py-2.5 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>{showDocuments ? "Hide personal documents" : "Update personal documents"}</button>
                <button type="submit" disabled={saving} className="rounded px-5 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save HR profile"}</button>
              </div>
            </form>

            {showDocuments && <section className="rounded border p-4 sm:p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h2 className="mb-4 text-sm font-700" style={{ color: "var(--foreground)" }}>Personal documents</h2>
              <form onSubmit={uploadDocument} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Document type<select value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)} className={inputClass} style={fieldStyle}>{documentTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Select file<input required name="personal-document" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" className={`${inputClass} file:mr-3 file:rounded file:border-0 file:px-3 file:py-1`} style={fieldStyle} /></label>
                <button type="submit" disabled={uploading} className="rounded px-4 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{uploading ? "Uploading…" : "Upload"}</button>
              </form>
              <div className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>
                {documents.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><div className="truncate text-sm font-600" style={{ color: "var(--foreground)" }}>{document.file_name}</div><div className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{documentTypeOptions.find(([value]) => value === document.document_type)?.[1] ?? document.document_type} · {(document.file_size / 1024 / 1024).toFixed(2)} MB</div></div><div className="flex gap-2"><a href={`/api/workspace/staff/documents/${encodeURIComponent(document.id)}`} className="rounded border px-3 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Download</a><button type="button" onClick={() => void deleteDocument(document)} className="rounded border px-3 py-1.5 text-xs" style={{ borderColor: "#ef444440", color: "#ef4444" }}>Delete</button></div></div>)}
                {!documents.length && <p className="py-5 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No personal documents uploaded.</p>}
              </div>
            </section>}

            <section className="rounded border p-4 sm:p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h2 className="mb-3 text-sm font-700" style={{ color: "var(--foreground)" }}>My payslips</h2>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {payslips.map((payslip) => <div key={payslip.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="text-sm font-600" style={{ color: "var(--foreground)" }}>{new Date(`${payslip.pay_period}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div><div className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>Net pay UGX {Number(payslip.net_amount).toLocaleString("en-UG", { minimumFractionDigits: 2 })} · paid {new Date(`${payslip.payment_date}T00:00:00`).toLocaleDateString("en-GB")}</div></div><a href={payslip.payslipUrl} className="rounded border px-3 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Download payslip</a></div>)}
                {!payslips.length && <p className="py-5 text-sm" style={{ color: "var(--muted-foreground)" }}>No payslips available yet.</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}