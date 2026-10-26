"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Building2, Plus, Trash2, Edit2, Loader2 } from "lucide-react";

type Hospital = {
  id: string;
  name: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  city?: string;
  country?: string;
  is_active: boolean;
  created_at: string;
};

type DoctorAffiliation = {
  id: string;
  doctor_user_id: string;
  doctor_name: string;
  doctor_email: string;
  hospital_id: string;
  hospital_name: string;
  fee_to_doctor: number;
  is_primary: boolean;
  created_at: string;
};

type DoctorOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const inputClass = "mt-1 w-full border px-3 py-2 text-sm outline-none";
const labelClass = "block text-xs font-700 uppercase tracking-wider";
const money = (n: number) => `UGX ${Number(n || 0).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function HospitalManagement() {
  const [tab, setTab] = useState<"hospitals" | "affiliations">("hospitals");
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [affiliations, setAffiliations] = useState<DoctorAffiliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showHospitalForm, setShowHospitalForm] = useState(false);
  const [editingHospitalId, setEditingHospitalId] = useState("");
  const [showAffiliationForm, setShowAffiliationForm] = useState(false);
  const [editingAffiliationId, setEditingAffiliationId] = useState("");

  const [hospitalForm, setHospitalForm] = useState({
    name: "",
    contactPhone: "",
    contactEmail: "",
    address: "",
    city: "",
    country: "",
  });

  const [affiliationForm, setAffiliationForm] = useState({
    doctorUserId: "",
    hospitalId: "",
    feeToDoctor: "",
    isPrimary: false,
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [hospitalsRes, doctorsRes, affiliationsRes] = await Promise.all([
        fetch("/api/medical/hospitals", { cache: "no-store" }),
        fetch("/api/users/doctors", { cache: "no-store" }),
        fetch("/api/medical/doctor-affiliations", { cache: "no-store" }),
      ]);

      if (!hospitalsRes.ok) throw new Error("Unable to load hospitals.");
      if (!doctorsRes.ok) throw new Error("Unable to load doctors.");
      if (!affiliationsRes.ok) throw new Error("Unable to load doctor affiliations.");

      const hospitalsData = await hospitalsRes.json() as { hospitals?: Hospital[] };
      const doctorsData = await doctorsRes.json() as { doctors?: DoctorOption[] };
      const affiliationsData = await affiliationsRes.json() as { affiliations?: DoctorAffiliation[] };

      setHospitals(hospitalsData.hospitals ?? []);
      setDoctors(doctorsData.doctors ?? []);
      setAffiliations(affiliationsData.affiliations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load hospital data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetHospitalForm = () => {
    setHospitalForm({
      name: "",
      contactPhone: "",
      contactEmail: "",
      address: "",
      city: "",
      country: "",
    });
    setEditingHospitalId("");
  };

  const openHospitalForm = (hospital?: Hospital) => {
    if (hospital) {
      setHospitalForm({
        name: hospital.name,
        contactPhone: hospital.contact_phone || "",
        contactEmail: hospital.contact_email || "",
        address: hospital.address || "",
        city: hospital.city || "",
        country: hospital.country || "",
      });
      setEditingHospitalId(hospital.id);
    } else {
      resetHospitalForm();
    }
    setShowHospitalForm(true);
  };

  const saveHospital = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!hospitalForm.name.trim()) {
      setError("Hospital name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/medical/hospitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingHospitalId ? "update-hospital" : "create-hospital",
          ...(editingHospitalId && { hospitalId: editingHospitalId }),
          ...hospitalForm,
        }),
      });

      const result = await response.json() as { hospital?: Hospital; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save hospital.");

      setShowHospitalForm(false);
      resetHospitalForm();
      setNotice(editingHospitalId ? "Hospital updated successfully." : "Hospital created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save hospital.");
    } finally {
      setSaving(false);
    }
  };

  const resetAffiliationForm = () => {
    setAffiliationForm({
      doctorUserId: "",
      hospitalId: "",
      feeToDoctor: "",
      isPrimary: false,
    });
    setEditingAffiliationId("");
  };

  const openAffiliationForm = (affiliation?: DoctorAffiliation) => {
    if (affiliation) {
      setAffiliationForm({
        doctorUserId: affiliation.doctor_user_id,
        hospitalId: affiliation.hospital_id,
        feeToDoctor: String(affiliation.fee_to_doctor),
        isPrimary: affiliation.is_primary,
      });
      setEditingAffiliationId(affiliation.id);
    } else {
      resetAffiliationForm();
    }
    setShowAffiliationForm(true);
  };

  const saveAffiliation = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!affiliationForm.doctorUserId || !affiliationForm.hospitalId) {
      setError("Please select a doctor and hospital.");
      return;
    }

    const feeToDoctor = Number(affiliationForm.feeToDoctor);
    if (!Number.isFinite(feeToDoctor) || feeToDoctor < 0) {
      setError("Please enter a valid fee amount.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/medical/doctor-affiliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingAffiliationId ? "update-affiliation" : "link-doctor-hospital",
          ...(editingAffiliationId && { affiliationId: editingAffiliationId }),
          doctorUserId: affiliationForm.doctorUserId,
          hospitalId: affiliationForm.hospitalId,
          feeToDoctor,
          isPrimary: affiliationForm.isPrimary,
        }),
      });

      const result = await response.json() as { affiliation?: DoctorAffiliation; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save affiliation.");

      setShowAffiliationForm(false);
      resetAffiliationForm();
      setNotice(editingAffiliationId ? "Affiliation updated successfully." : "Doctor linked to hospital successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save affiliation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="hospital-title">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h1 id="hospital-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Hospital Management</h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Manage hospitals/medical centers and doctor affiliations with fee tracking.
          </p>
        </div>
        {tab === "hospitals" && (
          <button
            type="button"
            onClick={() => openHospitalForm()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <Plus size={16} aria-hidden="true" />
            Add hospital
          </button>
        )}
        {tab === "affiliations" && (
          <button
            type="button"
            onClick={() => openAffiliationForm()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <Plus size={16} aria-hidden="true" />
            Link doctor
          </button>
        )}
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b px-6" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          onClick={() => setTab("hospitals")}
          className={`px-4 py-3 text-sm font-600 border-b-2 transition-colors ${
            tab === "hospitals"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Hospitals
        </button>
        <button
          type="button"
          onClick={() => setTab("affiliations")}
          className={`px-4 py-3 text-sm font-600 border-b-2 transition-colors ${
            tab === "affiliations"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Doctor Affiliations
        </button>
      </div>

      {/* Alerts */}
      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {notice && <div role="status" className="mx-6 mt-4 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{notice}</div>}

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {tab === "hospitals" && (
          <>
            {loading ? (
              <div className="text-center py-10">
                <Loader2 className="inline animate-spin" size={24} style={{ color: "var(--primary)" }} />
                <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Loading hospitals…</p>
              </div>
            ) : hospitals.length === 0 ? (
              <p className="text-center py-10 text-sm" style={{ color: "var(--muted-foreground)" }}>
                No hospitals added yet. Click "Add hospital" to get started.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {hospitals.map((hospital) => (
                  <div
                    key={hospital.id}
                    className="border p-4 rounded-lg"
                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-700 text-lg" style={{ color: "var(--foreground)" }}>
                        {hospital.name}
                      </h3>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openHospitalForm(hospital)}
                          className="p-1 text-blue-600 hover:bg-blue-500/10 rounded"
                          title="Edit hospital"
                        >
                          <Edit2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {hospital.contact_phone && <p>📞 {hospital.contact_phone}</p>}
                      {hospital.contact_email && <p>✉️ {hospital.contact_email}</p>}
                      {hospital.address && <p>📍 {hospital.address}</p>}
                      {hospital.city && <p className="text-xs">{hospital.city}{hospital.country ? `, ${hospital.country}` : ""}</p>}
                    </div>
                    <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                      Status: <span className={hospital.is_active ? "text-green-600" : "text-red-600"}>{hospital.is_active ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "affiliations" && (
          <>
            {loading ? (
              <div className="text-center py-10">
                <Loader2 className="inline animate-spin" size={24} style={{ color: "var(--primary)" }} />
                <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Loading affiliations…</p>
              </div>
            ) : affiliations.length === 0 ? (
              <p className="text-center py-10 text-sm" style={{ color: "var(--muted-foreground)" }}>
                No doctor affiliations yet. Link a doctor to a hospital to get started.
              </p>
            ) : (
              <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      <th className="px-4 py-3 text-left font-700 text-xs uppercase" style={{ color: "var(--muted-foreground)" }}>Doctor</th>
                      <th className="px-4 py-3 text-left font-700 text-xs uppercase" style={{ color: "var(--muted-foreground)" }}>Hospital</th>
                      <th className="px-4 py-3 text-left font-700 text-xs uppercase" style={{ color: "var(--muted-foreground)" }}>Doctor Fee</th>
                      <th className="px-4 py-3 text-center font-700 text-xs uppercase" style={{ color: "var(--muted-foreground)" }}>Primary</th>
                      <th className="px-4 py-3 text-center font-700 text-xs uppercase" style={{ color: "var(--muted-foreground)" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affiliations.map((aff) => (
                      <tr key={aff.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--foreground)" }}>
                          <div className="font-600">{aff.doctor_name}</div>
                          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{aff.doctor_email}</div>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--foreground)" }}>{aff.hospital_name}</td>
                        <td className="px-4 py-3 font-600 mono" style={{ color: "#17845b" }}>{money(aff.fee_to_doctor)}</td>
                        <td className="px-4 py-3 text-center">
                          {aff.is_primary ? (
                            <span className="inline-block px-2 py-1 rounded text-xs font-600 bg-blue-500/20 text-blue-700">Primary</span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => openAffiliationForm(aff)}
                            className="p-1 text-blue-600 hover:bg-blue-500/10 rounded inline-block"
                            title="Edit affiliation"
                          >
                            <Edit2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hospital Form Modal */}
      {showHospitalForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowHospitalForm(false);
          }}
        >
          <form
            onSubmit={saveHospital}
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2 className="mb-4 text-lg font-700" style={{ color: "var(--foreground)" }}>
              {editingHospitalId ? "Edit Hospital" : "Add Hospital"}
            </h2>

            {error && <div role="alert" className="mb-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

            <div className="space-y-4">
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                Hospital Name *
                <input
                  required
                  maxLength={255}
                  value={hospitalForm.name}
                  onChange={(e) => setHospitalForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                  style={fieldStyle}
                  placeholder="e.g., Mulago Hospital"
                />
              </label>

              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                Contact Phone
                <input
                  type="tel"
                  maxLength={100}
                  value={hospitalForm.contactPhone}
                  onChange={(e) => setHospitalForm((f) => ({ ...f, contactPhone: e.target.value }))}
                  className={inputClass}
                  style={fieldStyle}
                  placeholder="+256 701 234 567"
                />
              </label>

              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                Contact Email
                <input
                  type="email"
                  maxLength={255}
                  value={hospitalForm.contactEmail}
                  onChange={(e) => setHospitalForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  className={inputClass}
                  style={fieldStyle}
                  placeholder="contact@hospital.com"
                />
              </label>

              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                Address
                <input
                  maxLength={500}
                  value={hospitalForm.address}
                  onChange={(e) => setHospitalForm((f) => ({ ...f, address: e.target.value }))}
                  className={inputClass}
                  style={fieldStyle}
                  placeholder="Street address"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                  City
                  <input
                    maxLength={100}
                    value={hospitalForm.city}
                    onChange={(e) => setHospitalForm((f) => ({ ...f, city: e.target.value }))}
                    className={inputClass}
                    style={fieldStyle}
                    placeholder="Kampala"
                  />
                </label>

                <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                  Country
                  <input
                    maxLength={100}
                    value={hospitalForm.country}
                    onChange={(e) => setHospitalForm((f) => ({ ...f, country: e.target.value }))}
                    className={inputClass}
                    style={fieldStyle}
                    placeholder="Uganda"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowHospitalForm(false)}
                className="px-4 py-2 text-sm font-600 border rounded"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-600 rounded text-white disabled:opacity-50"
                style={{ background: "var(--primary)" }}
              >
                {saving ? "Saving…" : editingHospitalId ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Affiliation Form Modal */}
      {showAffiliationForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowAffiliationForm(false);
          }}
        >
          <form
            onSubmit={saveAffiliation}
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2 className="mb-4 text-lg font-700" style={{ color: "var(--foreground)" }}>
              {editingAffiliationId ? "Edit Doctor-Hospital Link" : "Link Doctor to Hospital"}
            </h2>

            {error && <div role="alert" className="mb-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

            <div className="space-y-4">
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                Doctor *
                <select
                  required
                  value={affiliationForm.doctorUserId}
                  onChange={(e) => setAffiliationForm((f) => ({ ...f, doctorUserId: e.target.value }))}
                  className={inputClass}
                  style={fieldStyle}
                  disabled={Boolean(editingAffiliationId)}
                >
                  <option value="">Select doctor…</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.firstName} {d.lastName} ({d.email})
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                Hospital *
                <select
                  required
                  value={affiliationForm.hospitalId}
                  onChange={(e) => setAffiliationForm((f) => ({ ...f, hospitalId: e.target.value }))}
                  className={inputClass}
                  style={fieldStyle}
                  disabled={Boolean(editingAffiliationId)}
                >
                  <option value="">Select hospital…</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
                Fee to Doctor (per service) *
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  max="999999999.99"
                  value={affiliationForm.feeToDoctor}
                  onChange={(e) => setAffiliationForm((f) => ({ ...f, feeToDoctor: e.target.value }))}
                  className={inputClass}
                  style={fieldStyle}
                  placeholder="0.00"
                />
              </label>

              <label className="flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                <input
                  type="checkbox"
                  checked={affiliationForm.isPrimary}
                  onChange={(e) => setAffiliationForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                  className="w-4 h-4"
                />
                <span className="text-sm font-600">Make this the primary hospital for this doctor</span>
              </label>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowAffiliationForm(false)}
                className="px-4 py-2 text-sm font-600 border rounded"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-600 rounded text-white disabled:opacity-50"
                style={{ background: "var(--primary)" }}
              >
                {saving ? "Saving…" : editingAffiliationId ? "Update" : "Link"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
