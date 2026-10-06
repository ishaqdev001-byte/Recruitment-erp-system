import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, Plus, Search, UserRound } from "lucide-react";

type SupplierRecord = {
  id: string;
  supplier_name: string;
  contact_person: string;
  phone: string;
  email: string;
  branch: string;
  status: string;
};

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadSuppliers = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/suppliers", { cache: "no-store" });
        const payload = await response.json() as { suppliers?: SupplierRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load company suppliers.");
        if (!cancelled) setSuppliers(payload.suppliers ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load company suppliers.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadSuppliers();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const filtered = suppliers.filter((supplier) =>
    `${supplier.supplier_name} ${supplier.contact_person} ${supplier.phone} ${supplier.email} ${supplier.branch}`
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId);

  const addSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: String(formData.get("supplierName") ?? "").trim(),
          contactPerson: String(formData.get("contactPerson") ?? "").trim(),
          phone: String(formData.get("phone") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim(),
          branch: String(formData.get("branch") ?? "").trim(),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to register this supplier.");
      setShowNew(false);
      setSearch("");
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to register this supplier.");
    } finally {
      setSaving(false);
    }
  };

  if (selectedSupplier) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-auto" aria-labelledby="supplier-detail-title">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSelectedSupplierId(null)} aria-label="Back to suppliers" title="Back to suppliers" className="flex h-9 w-9 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ArrowLeft size={17} aria-hidden="true" /></button>
            <div>
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Supplier profile</p>
              <h1 id="supplier-detail-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>{selectedSupplier.supplier_name}</h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-600" style={{ color: selectedSupplier.status === "active" ? "#10b981" : "#ef4444" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: selectedSupplier.status === "active" ? "#10b981" : "#ef4444" }} />
            {selectedSupplier.status === "active" ? "Active" : "Inactive"}
          </span>
        </header>
        <div className="max-w-2xl p-6">
          <section className="border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <h2 className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Supplier contact</h2>
            <dl className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>
              {[
                ["Supplier name", selectedSupplier.supplier_name],
                ["Contact person", selectedSupplier.contact_person],
                ["Phone number", selectedSupplier.phone],
                ["Email address", selectedSupplier.email],
                ["Registered branch", selectedSupplier.branch],
              ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0"><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</dt><dd className="break-all text-right text-sm font-600" style={{ color: "var(--foreground)" }}>{value}</dd></div>)}
            </dl>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="suppliers-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 id="suppliers-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Suppliers</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{loading ? "Loading company suppliers" : `${suppliers.length} suppliers in this company`}</p>
        </div>
        <button type="button" onClick={() => { setError(""); setShowNew(true); }} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Plus size={16} aria-hidden="true" />Add supplier</button>
      </header>

      <div className="grid grid-cols-1 border-b sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
        {[
          { label: "Total suppliers", value: suppliers.length, color: "var(--primary)" },
          { label: "Active", value: suppliers.filter((supplier) => supplier.status === "active").length, color: "#10b981" },
          { label: "Inactive", value: suppliers.filter((supplier) => supplier.status === "inactive").length, color: "#ef4444" },
        ].map(({ label, value, color }) => <div key={label} className="flex items-center gap-3 border-b px-6 py-4 last:border-0 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)" }}><div><div className="mono text-xl font-700" style={{ color }}>{value}</div><div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div></div></div>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <label className="flex w-full max-w-md items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search suppliers" placeholder="Search supplier, contact, phone, email, or branch" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{filtered.length} shown</span>
      </div>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-225 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Supplier", "Contact person", "Phone", "Email address", "Registered branch", "Status", ""].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading supplier records…</td></tr>}
              {!loading && !error && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{suppliers.length ? "No suppliers match this search." : "No suppliers registered yet."}</td></tr>}
              {!loading && filtered.map((supplier) => <tr key={supplier.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-4 py-3"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-700" style={{ background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary)" }}>{supplier.supplier_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || <UserRound size={15} aria-hidden="true" />}</span><span className="font-600" style={{ color: "var(--foreground)" }}>{supplier.supplier_name}</span></div></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{supplier.contact_person}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{supplier.phone}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{supplier.email}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{supplier.branch}</td>
                <td className="px-4 py-3"><span className="whitespace-nowrap px-2 py-1 text-xs font-600" style={{ color: supplier.status === "active" ? "#10b981" : "#ef4444", background: supplier.status === "active" ? "#10b98120" : "#ef444420" }}>{supplier.status === "active" ? "Active" : "Inactive"}</span></td>
                <td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedSupplierId(supplier.id)} className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Eye size={14} aria-hidden="true" />View</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <form onSubmit={addSupplier} className="max-h-[90dvh] w-full max-w-md overflow-y-auto border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="mb-5 text-lg font-700" style={{ color: "var(--foreground)" }}>Add supplier</h2>
          <div className="space-y-4">
            {[
              { name: "supplierName", label: "Supplier name", type: "text" },
              { name: "contactPerson", label: "Contact person", type: "text" },
              { name: "phone", label: "Phone number", type: "tel" },
              { name: "email", label: "Email address", type: "email" },
              { name: "branch", label: "Registered branch", type: "text" },
            ].map((field) => <label key={field.name} className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{field.label}<input required maxLength={field.name === "phone" ? 100 : 200} name={field.name} type={field.type} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>)}
          </div>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving supplier…" : "Save supplier"}</button><button type="button" onClick={() => setShowNew(false)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}
    </section>
  );
}