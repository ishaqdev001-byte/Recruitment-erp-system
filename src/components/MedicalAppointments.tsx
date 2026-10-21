"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, Loader2, Plus, UserSearch } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type IncomeType = {
  id: string;
  name: string;
  income_kind: "medical" | "other";
  fee: number;
  account_id: string;
  account_name: string;
  is_default: boolean;
  is_active: boolean;
};

type MedicalAppointment = {
  id: string;
  candidate_first_name: string;
  candidate_last_name: string;
  candidate_date_of_birth: string;
  candidate_age: number;
  candidate_passport_number: string;
  candidate_phone: string;
  appointment_at: string;
  fee_amount: number;
  income_type_name: string;
  account_name: string;
  payment_reference: string;
  status: string;
};

type CandidateResult = {
  id: string;
  fileNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  passportNumber: string;
};

type IncomePayload = {
  incomeTypes?: IncomeType[];
  appointments?: MedicalAppointment[];
  permissions?: { canBookAppointments?: boolean; canViewAppointments?: boolean };
  error?: string;
};

type BookingForm = {
  candidateId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  passportNumber: string;
  phone: string;
  incomeTypeId: string;
  appointmentAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const readonlyStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--muted-foreground)", opacity: 0.9 };
const inputClass = "mt-1 w-full border px-3 py-2 text-sm outline-none";
const labelClass = "block text-xs font-700 uppercase tracking-wider";
const money = (n: number) => `UGX ${Number(n || 0).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function calcAge(dob: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const birth = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || birth > new Date()) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function defaultApptDate() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const emptyForm = (): BookingForm => ({
  candidateId: "", firstName: "", lastName: "", dateOfBirth: "",
  passportNumber: "", phone: "", incomeTypeId: "", appointmentAt: defaultApptDate(),
});

// ─── Candidate search combobox ────────────────────────────────────────────────

function CandidateSearch({ onSelect }: { onSelect: (candidate: CandidateResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CandidateResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  const search = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/candidates/search?q=${encodeURIComponent(value)}&limit=12`, { cache: "no-store" });
        const payload = await response.json() as { candidates?: CandidateResult[]; error?: string };
        if (response.ok) {
          setResults(payload.candidates ?? []);
          setOpen(true);
        }
      } catch {
        // silently ignore — user can still type manually
      } finally {
        setSearching(false);
      }
    }, 280);
  };

  const pick = (candidate: CandidateResult) => {
    setQuery(candidate.fullName);
    setOpen(false);
    setResults([]);
    onSelect(candidate);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <UserSearch size={14} className="pointer-events-none absolute left-3" style={{ color: "var(--muted-foreground)" }} aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Type a candidate name or file number…"
          className={`${inputClass} pl-9 pr-8`}
          style={fieldStyle}
          autoComplete="off"
        />
        {searching && (
          <Loader2 size={13} className="absolute right-3 animate-spin" style={{ color: "var(--muted-foreground)" }} aria-hidden="true" />
        )}
      </div>
      {open && results.length > 0 && (
        <ul
          role="listbox"
          aria-label="Candidate suggestions"
          className="absolute z-50 mt-1 w-full overflow-auto border shadow-xl"
          style={{ background: "var(--card)", borderColor: "var(--border)", maxHeight: "14rem" }}
        >
          {results.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:opacity-80"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-600" style={{ color: "var(--foreground)" }}>{c.fullName}</p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {c.fileNumber}
                    {c.passportNumber ? ` · ${c.passportNumber}` : ""}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </p>
                </div>
                {c.dateOfBirth && (
                  <span className="shrink-0 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    DOB: {c.dateOfBirth}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && results.length === 0 && query.trim().length > 1 && !searching && (
        <div className="absolute z-50 mt-1 w-full border px-3 py-3 text-xs" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          No candidates found matching "{query}". You can fill in the details manually below.
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MedicalAppointments() {
  const [incomeTypes, setIncomeTypes] = useState<IncomeType[]>([]);
  const [appointments, setAppointments] = useState<MedicalAppointment[]>([]);
  const [canBookAppointments, setCanBookAppointments] = useState(false);
  const [canViewAppointments, setCanViewAppointments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [candidateLocked, setCandidateLocked] = useState(false);
  const [form, setForm] = useState<BookingForm>(emptyForm());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/finance/other-income", { cache: "no-store" });
      const result = await response.json() as IncomePayload;
      if (!response.ok) throw new Error(result.error ?? "Unable to load medical appointments.");
      setIncomeTypes((result.incomeTypes ?? []).filter((t) => t.income_kind === "medical" && t.is_active && t.fee > 0));
      setAppointments(result.appointments ?? []);
      setCanBookAppointments(Boolean(result.permissions?.canBookAppointments));
      setCanViewAppointments(Boolean(result.permissions?.canViewAppointments));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load medical appointments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const age = calcAge(form.dateOfBirth);
  const selectedType = incomeTypes.find((t) => t.id === form.incomeTypeId) ?? null;

  const openForm = () => {
    setForm(emptyForm());
    setCandidateLocked(false);
    setError("");
    setNotice("");
    setShowForm(true);
  };

  const handleCandidateSelect = (candidate: CandidateResult) => {
    setForm((f) => ({
      ...f,
      candidateId: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      dateOfBirth: candidate.dateOfBirth,
      passportNumber: candidate.passportNumber,
      phone: candidate.phone,
    }));
    setCandidateLocked(true);
  };

  const clearCandidate = () => {
    setForm((f) => ({ ...f, candidateId: "", firstName: "", lastName: "", dateOfBirth: "", passportNumber: "", phone: "" }));
    setCandidateLocked(false);
  };

  const bookAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/finance/other-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "book-medical-appointment", ...form }),
      });
      const result = await response.json() as { warning?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to book appointment.");
      setShowForm(false);
      setForm(emptyForm());
      setCandidateLocked(false);
      if (result.warning) {
        setNotice(`Appointment booked. Note: ${result.warning}`);
      } else {
        setNotice("Medical appointment booked and income recorded against the configured account.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to book appointment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="med-appt-title">

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h1 id="med-appt-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Medical Appointments</h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Book candidate medical appointments. The fee is recorded as income against the configured account automatically.
          </p>
        </div>
        {canBookAppointments && (
          <button
            type="button"
            disabled={incomeTypes.length === 0}
            onClick={openForm}
            title={incomeTypes.length === 0 ? "Configure an active medical income type with a fee in Finance → Accounts & Other Income first." : undefined}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:opacity-50"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <Plus size={16} aria-hidden="true" />
            Book appointment
          </button>
        )}
      </header>

      {/* Alerts */}
      {incomeTypes.length === 0 && !loading && canBookAppointments && (
        <div className="mx-6 mt-4 border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm" style={{ color: "#b45309" }}>
          No active medical income types configured. Go to <strong>Finance → Accounts &amp; Other Income → Other Income</strong> to add one first.
        </div>
      )}
      {error && !showForm && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {notice && <div role="status" className="mx-6 mt-4 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{notice}</div>}

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {canViewAppointments ? (
          <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <table className="w-full min-w-240 text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                  {["Candidate", "DOB / Age", "Passport", "Phone", "Medical service", "Appointment", "Fee", "Account", "Reference", "Status"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={10} className="px-3 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading appointments…</td></tr>}
                {!loading && appointments.length === 0 && <tr><td colSpan={10} className="px-3 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No medical appointments booked yet.</td></tr>}
                {!loading && appointments.map((appt) => (
                  <tr key={appt.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="whitespace-nowrap px-3 py-3 font-600" style={{ color: "var(--foreground)" }}>{appt.candidate_first_name} {appt.candidate_last_name}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>
                      {appt.candidate_date_of_birth || "—"}
                      <span className="ml-1" style={{ color: "var(--muted-foreground)" }}>({appt.candidate_age}y)</span>
                    </td>
                    <td className="px-3 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{appt.candidate_passport_number}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{appt.candidate_phone}</td>
                    <td className="px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{appt.income_type_name}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{new Date(appt.appointment_at).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-3 mono text-xs font-600" style={{ color: "#17845b" }}>{money(appt.fee_amount)}</td>
                    <td className="px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{appt.account_name}</td>
                    <td className="px-3 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{appt.payment_reference || "—"}</td>
                    <td className="px-3 py-3 capitalize text-xs" style={{ color: appt.status === "completed" ? "#17845b" : appt.status === "cancelled" ? "#b43c45" : "var(--muted-foreground)" }}>{appt.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="border px-4 py-5 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            Candidate medical information is not visible for your role.
          </p>
        )}
      </div>

      {/* Booking modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setError(""); } }}
        >
          <form
            onSubmit={bookAppointment}
            className="max-h-[92dvh] w-full max-w-xl overflow-y-auto border p-5 sm:p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2 className="mb-1 text-lg font-700" style={{ color: "var(--foreground)" }}>Book medical appointment</h2>
            <p className="mb-5 text-xs" style={{ color: "var(--muted-foreground)" }}>
              Search for a registered candidate to auto-fill their details, or enter manually.
            </p>

            {error && <div role="alert" className="mb-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

            <div className="space-y-4">

              {/* Candidate search */}
              <div>
                <p className={`${labelClass} mb-1`} style={{ color: "var(--muted-foreground)" }}>Search candidate</p>
                {candidateLocked ? (
                  <div className="flex items-center justify-between gap-3 border px-3 py-2" style={{ background: "var(--secondary)", borderColor: "#168358" }}>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} style={{ color: "#168358" }} aria-hidden="true" />
                      <span className="text-sm font-600" style={{ color: "var(--foreground)" }}>
                        {form.firstName} {form.lastName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearCandidate}
                      className="text-xs font-600"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <CandidateSearch onSelect={handleCandidateSelect} />
                )}
              </div>

              {/* Candidate details — auto-filled when locked, editable when manual */}
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                  First name
                  <input
                    required
                    maxLength={200}
                    readOnly={candidateLocked}
                    value={form.firstName}
                    onChange={(e) => !candidateLocked && setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className={inputClass}
                    style={candidateLocked ? readonlyStyle : fieldStyle}
                  />
                </label>
                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                  Last name
                  <input
                    required
                    maxLength={200}
                    readOnly={candidateLocked}
                    value={form.lastName}
                    onChange={(e) => !candidateLocked && setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className={inputClass}
                    style={candidateLocked ? readonlyStyle : fieldStyle}
                  />
                </label>
                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                  Date of birth
                  <input
                    required
                    type="date"
                    readOnly={candidateLocked}
                    max={new Date().toISOString().slice(0, 10)}
                    value={form.dateOfBirth}
                    onChange={(e) => !candidateLocked && setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                    className={inputClass}
                    style={candidateLocked ? readonlyStyle : fieldStyle}
                  />
                </label>
                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                  Age
                  <input
                    readOnly
                    value={age !== null ? `${age} years` : "Calculated from date of birth"}
                    className={inputClass}
                    style={readonlyStyle}
                  />
                </label>
                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                  Passport number
                  <input
                    required
                    maxLength={100}
                    readOnly={candidateLocked && Boolean(form.passportNumber)}
                    value={form.passportNumber}
                    onChange={(e) => setForm((f) => ({ ...f, passportNumber: e.target.value }))}
                    className={inputClass}
                    style={candidateLocked && form.passportNumber ? readonlyStyle : fieldStyle}
                    placeholder={candidateLocked && !form.passportNumber ? "Not on record — enter manually" : ""}
                  />
                </label>
                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                  Phone number
                  <input
                    required
                    type="tel"
                    maxLength={100}
                    readOnly={candidateLocked && Boolean(form.phone)}
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className={inputClass}
                    style={candidateLocked && form.phone ? readonlyStyle : fieldStyle}
                    placeholder={candidateLocked && !form.phone ? "Not on record — enter manually" : ""}
                  />
                </label>
              </div>

              {/* Medical service */}
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                Medical service
                <select
                  required
                  value={form.incomeTypeId}
                  onChange={(e) => setForm((f) => ({ ...f, incomeTypeId: e.target.value }))}
                  className={inputClass}
                  style={fieldStyle}
                >
                  <option value="">Select medical service…</option>
                  {incomeTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} · {money(t.fee)}</option>
                  ))}
                </select>
              </label>

              {/* Fee & account summary */}
              {selectedType && (
                <div className="grid grid-cols-2 gap-y-2 border-y py-3 text-sm" style={{ borderColor: "var(--border)" }}>
                  <span style={{ color: "var(--muted-foreground)" }}>Candidate fee</span>
                  <span className="text-right font-700 mono" style={{ color: "#17845b" }}>{money(selectedType.fee)}</span>
                  <span style={{ color: "var(--muted-foreground)" }}>Credited to account</span>
                  <span className="text-right" style={{ color: "var(--foreground)" }}>{selectedType.account_name}</span>
                  <span style={{ color: "var(--muted-foreground)" }}>Recorded as</span>
                  <span className="text-right text-xs" style={{ color: "var(--muted-foreground)" }}>Income · Medical category</span>
                </div>
              )}

              {/* Appointment datetime */}
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                Appointment date &amp; time
                <input
                  required
                  type="datetime-local"
                  value={form.appointmentAt}
                  onChange={(e) => setForm((f) => ({ ...f, appointmentAt: e.target.value }))}
                  className={inputClass}
                  style={fieldStyle}
                />
              </label>

              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Booking records the fee as an income credit in Finance → Payments &amp; Deposits automatically.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => { setShowForm(false); setError(""); }}
                className="border px-4 py-2.5 text-sm disabled:opacity-50"
                style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 text-sm font-600 disabled:opacity-50"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                {saving ? "Booking…" : "Book & record payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
