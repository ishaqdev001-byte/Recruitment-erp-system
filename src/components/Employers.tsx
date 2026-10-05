import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Plus, Search, X } from "lucide-react";

type Employer = {
  id: string;
  company_name: string;
  contact_persons: string[];
  phone_numbers: string[];
  email_addresses: string[];
  countries: string[];
  created_at: string;
};

type EmployerForm = {
  company: string;
  contacts: string[];
  phones: string[];
  emails: string[];
  countries: string[];
};

const emptyForm = (): EmployerForm => ({ company: "", contacts: [""], phones: [""], emails: [""], countries: [""] });

export default function Employers() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [selectedEmployerId, setSelectedEmployerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<EmployerForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadEmployers = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/employers", { cache: "no-store" });
        const payload = await response.json() as { employers?: Employer[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load company contractors.");
        if (!cancelled) setEmployers(payload.employers ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load company contractors.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadEmployers();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const filtered = employers.filter((e) =>
    `${e.company_name} ${e.contact_persons.join(" ")} ${e.phone_numbers.join(" ")} ${e.email_addresses.join(" ")} ${e.countries.join(" ")}`
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );

  const selected = employers.find((employer) => employer.id === selectedEmployerId) ?? null;

  const updateFormField = (field: keyof EmployerForm, index: number, value: string) => {
    setForm((current) => {
      if (field === "company") return { ...current, company: value };
      const values = [...current[field]];
      values[index] = value;
      return { ...current, [field]: values };
    });
  };

  const addFormField = (field: Exclude<keyof EmployerForm, "company">) => {
    setForm((current) => ({ ...current, [field]: [...current[field], ""] }));
  };

  const saveEmployer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/employers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.company,
          contacts: form.contacts,
          phones: form.phones,
          emails: form.emails,
          countries: form.countries,
        }),
      });
      const payload = await response.json() as { employer?: Employer; error?: string };
      if (!response.ok || !payload.employer) throw new Error(payload.error ?? "Unable to register this contractor.");
      setForm(emptyForm());
      setShowNew(false);
      setSearch("");
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to register this contractor.");
    } finally {
      setSaving(false);
    }
  };

  const closeNewEmployer = () => {
    setForm(emptyForm());
    setShowNew(false);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
              <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Contractors</h1>
            <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>{loading ? "Loading contractors" : error ? "Contractor records unavailable" : `${employers.length} total contractors`}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <label className="flex items-center gap-2 rounded border px-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search employers" type="search" placeholder="Search employers" value={search} onChange={(e) => setSearch(e.target.value)} className="w-52 bg-transparent py-1.5 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
              <button type="button" onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded px-4 py-1.5 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              <Plus size={16} aria-hidden="true" /> Add contractor
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {error && <div role="alert" className="mb-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
          <div className="overflow-x-auto rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <table className="w-full min-w-190 text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {["Company", "Contact person(s)", "Phone number(s)", "Email address(es)", "Country(s)"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading contractor records…</td></tr>}
                {!loading && !error && filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{employers.length ? "No contractors match this search." : "No contractors registered yet."}</td></tr>}
                {!loading && filtered.map((e) => (
                  <tr key={e.id} className="border-b cursor-pointer"
                    style={{ borderColor: "var(--border)", background: selectedEmployerId === e.id ? "var(--secondary)" : "transparent" }}
                    onClick={() => setSelectedEmployerId(selectedEmployerId === e.id ? null : e.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-700 shrink-0"
                          style={{ background: "#6366f130", color: "#6366f1" }}>
                          {e.company_name.split(" ").map(w => w[0]).join("").slice(0,2)}
                        </div>
                        <span className="font-600" style={{ color: "var(--foreground)" }}>{e.company_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{e.contact_persons.join(", ")}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{e.phone_numbers.join(", ")}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{e.email_addresses.join(", ")}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{e.countries.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <div className="detail-panel w-72 border-l overflow-auto shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setSelectedEmployerId(null)} className="text-xs mb-3 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}><ArrowLeft size={13} aria-hidden="true" />Close</button>
            <div className="w-12 h-12 rounded flex items-center justify-center text-base font-700 mb-3"
              style={{ background: "#6366f130", color: "#6366f1" }}>
              {selected.company_name.split(" ").map((word) => word[0]).join("").slice(0, 2)}
            </div>
            <h2 className="font-700" style={{ color: "var(--foreground)" }}>{selected.company_name}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{selected.countries.join(", ")}</p>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: "Contact person(s)", value: selected.contact_persons.join(", ") },
              { label: "Phone number(s)", value: selected.phone_numbers.join(", ") },
              { label: "Email address(es)", value: selected.email_addresses.join(", ") },
              { label: "Country(s)", value: selected.countries.join(", ") },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-700 uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                <div className="text-sm" style={{ color: "var(--foreground)" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeNewEmployer(); }}>
          <form onSubmit={saveEmployer} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Register contractor</h2>
              <button type="button" onClick={closeNewEmployer} aria-label="Close employer form" className="rounded p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="space-y-4">
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Company name<input required maxLength={200} autoFocus value={form.company} onChange={(event) => updateFormField("company", 0, event.target.value)} placeholder="e.g. Gulf Manpower Ltd" className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
              {([
                { field: "contacts", label: "Contact person(s)", type: "text", placeholder: "Full name" },
                { field: "phones", label: "Phone number(s)", type: "tel", placeholder: "+XXX XX XXX XXXX" },
                { field: "emails", label: "Email address(es)", type: "email", placeholder: "contact@company.com" },
                { field: "countries", label: "Country(s)", type: "text", placeholder: "e.g. Saudi Arabia" },
              ] as const).map(({ field, label, type, placeholder }) => (
                <fieldset key={field} className="space-y-2">
                  <legend className="mb-2 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{label}</legend>
                  {form[field].map((value, index) => (
                    <div key={`${field}-${index}`} className="flex items-center gap-2">
                      <input required={index === 0} maxLength={field === "phones" ? 100 : 200} type={type} value={value} onChange={(event) => updateFormField(field, index, event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 rounded border px-3 py-2 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                      {form[field].length > 1 && <button type="button" aria-label={`Remove ${label.toLowerCase()} ${index + 1}`} onClick={() => setForm((current) => ({ ...current, [field]: current[field].filter((_, itemIndex) => itemIndex !== index) }))} className="rounded p-2" style={{ color: "var(--muted-foreground)" }}><X size={15} aria-hidden="true" /></button>}
                    </div>
                  ))}
                  <button type="button" onClick={() => addFormField(field)} className="inline-flex items-center gap-1.5 py-1 text-xs font-600" style={{ color: "var(--primary)" }}><Plus size={14} aria-hidden="true" />Add more</button>
                </fieldset>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button type="submit" disabled={saving} className="flex-1 rounded py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save employer"}</button>
              <button type="button" onClick={closeNewEmployer} className="flex-1 rounded border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
