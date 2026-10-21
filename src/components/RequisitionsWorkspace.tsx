"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Edit2,
  FileText,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type RequisitionStatus = "pending" | "gm_review" | "finance_review" | "approved" | "rejected";
type PaymentStatus = "unpaid" | "partial" | "paid";
type StageDecision = "pending" | "approved" | "rejected";

type Requisition = {
  id: string;
  requisition_number: string;
  title: string;
  department_id?: string;
  department_name: string;
  currency_id?: string;
  currency_code: string;
  service_provider_id?: string;
  service_provider_name: string;
  due_date: string;
  notes: string;
  total_amount: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  status: RequisitionStatus;
  general_manager_status: StageDecision;
  general_manager_reviewed_at: string | null;
  general_manager_note: string;
  finance_status: StageDecision;
  finance_reviewed_at: string | null;
  finance_note: string;
  director_status: StageDecision;
  director_reviewed_at: string | null;
  director_note: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type RequisitionItem = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  total_amount: number;
  sort_order: number;
};

type CompanyAccount = {
  id: string;
  name: string;
  account_type: string;
  account_number: string;
  is_default: boolean;
};

type RequisitionPayment = {
  id: string;
  account_id: string;
  amount: number;
  payment_date: string;
  reference: string;
  notes: string;
  recorded_by: string;
  created_at: string;
};

type LookupItem = { id: string; name: string; code?: string; symbol?: string; is_active?: boolean };

type DraftItem = {
  _key: string;
  description: string;
  quantity: string;
  rate: string;
};

type Permissions = {
  canCreate: boolean;
  canReview: boolean;
  canVerify: boolean;
  canAuthorize: boolean;
};

type ReqNotification = {
  id: string;
  requisition_id: string;
  stage: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtAmount = (n: number, currency = "") =>
  `${currency ? currency + " " : ""}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const statusConfig: Record<RequisitionStatus, { label: string; color: string; bg: string }> = {
  pending:        { label: "Pending",        color: "#f59e0b", bg: "#f59e0b20" },
  gm_review:      { label: "GM Review",      color: "#6366f1", bg: "#6366f120" },
  finance_review: { label: "Finance Review", color: "#3b82f6", bg: "#3b82f620" },
  approved:       { label: "Approved",       color: "#10b981", bg: "#10b98120" },
  rejected:       { label: "Rejected",       color: "#ef4444", bg: "#ef444420" },
};

const paymentStatusConfig: Record<PaymentStatus, { label: string; color: string; bg: string }> = {
  unpaid:  { label: "Unpaid",           color: "#ef4444", bg: "#ef444420" },
  partial: { label: "Partially Paid",   color: "#f59e0b", bg: "#f59e0b20" },
  paid:    { label: "Fully Paid",       color: "#10b981", bg: "#10b98120" },
};

const stageDecisionColor: Record<StageDecision, string> = {
  pending:  "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
};

function emptyDraftItem(): DraftItem {
  return { _key: `${Date.now()}-${Math.random()}`, description: "", quantity: "", rate: "" };
}

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

// ─── Shared line-items editor (used in both create/edit and verifier-edit forms) ─

function LineItemsEditor({
  items,
  onItemsChange,
  currencyCode,
  error,
  onErrorChange,
}: {
  items: DraftItem[];
  onItemsChange: (items: DraftItem[]) => void;
  currencyCode: string;
  error: string;
  onErrorChange: (e: string) => void;
}) {
  const [input, setInput] = useState<DraftItem>(emptyDraftItem());

  const itemTotal = (item: DraftItem) => (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);

  const totals = items.reduce(
    (acc, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || 0;
      return { totalRate: acc.totalRate + rate, total: acc.total + qty * rate };
    },
    { totalRate: 0, total: 0 },
  );

  const addItem = () => {
    const desc = input.description.trim();
    const qty = parseFloat(input.quantity);
    const rate = parseFloat(input.rate);
    if (!desc) { onErrorChange("Enter an item description."); return; }
    if (!qty || qty <= 0) { onErrorChange("Enter a valid quantity."); return; }
    if (isNaN(rate) || rate < 0) { onErrorChange("Enter a valid rate."); return; }
    onErrorChange("");
    onItemsChange([...items, { ...input, _key: `${Date.now()}-${Math.random()}` }]);
    setInput(emptyDraftItem());
  };

  const deleteItem = (key: string) => onItemsChange(items.filter((i) => i._key !== key));

  const editItem = (key: string) => {
    const item = items.find((i) => i._key === key);
    if (!item) return;
    setInput({ ...item });
    onItemsChange(items.filter((i) => i._key !== key));
  };

  return (
    <div>
      <h3 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Line Items</h3>

      {/* Input row */}
      <div className="rounded border p-4 mb-3" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
        <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>Fill in the item details and click Add Item to add it to the table.</p>
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-6">
            <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Description <span className="text-red-400">*</span></label>
            <input type="text" maxLength={500} value={input.description}
              onChange={(e) => setInput((v) => ({ ...v, description: e.target.value }))}
              className="w-full rounded border px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
              placeholder="Item description" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Qty <span className="text-red-400">*</span></label>
            <input type="number" min="0.0001" step="any" value={input.quantity}
              onChange={(e) => setInput((v) => ({ ...v, quantity: e.target.value }))}
              className="w-full rounded border px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
              placeholder="1" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Rate <span className="text-red-400">*</span></label>
            <input type="number" min="0" step="any" value={input.rate}
              onChange={(e) => setInput((v) => ({ ...v, rate: e.target.value }))}
              className="w-full rounded border px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
              placeholder="0.00" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Total</label>
            <div className="rounded border px-3 py-2.5 text-sm mono font-600"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "#6366f1" }}>
              {fmtAmount(itemTotal(input))}
            </div>
          </div>
        </div>
        <button type="button" onClick={addItem}
          className="mt-3 inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-600"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
          <Plus size={15} aria-hidden="true" /> Add Item
        </button>
      </div>

      {/* Items table */}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                {["Description", "Qty", "Rate", "Total", "Actions"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-xs font-700 uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._key} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2.5" style={{ color: "var(--foreground)" }}>{item.description}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{item.quantity}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtAmount(parseFloat(item.rate) || 0)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 mono font-700" style={{ color: "#6366f1" }}>{fmtAmount(itemTotal(item))}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => editItem(item._key)}
                        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-600"
                        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                        <Edit2 size={11} aria-hidden="true" /> Edit
                      </button>
                      <button type="button" onClick={() => deleteItem(item._key)}
                        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-600"
                        style={{ borderColor: "var(--border)", color: "#ef4444" }}>
                        <Trash2 size={11} aria-hidden="true" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                <td colSpan={2} className="px-3 py-2.5 text-xs font-700 uppercase tracking-wide text-right" style={{ color: "var(--muted-foreground)" }}>
                  {items.length} item{items.length !== 1 ? "s" : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 mono text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
                  Σ Rate: {fmtAmount(totals.totalRate)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 mono font-700 text-base" style={{ color: "#6366f1" }}>
                  {fmtAmount(totals.total, currencyCode)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {items.length === 0 && (
        <div className="rounded border border-dashed px-4 py-8 text-center" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No items added yet. Use the form above to add line items.</p>
        </div>
      )}
    </div>
  );
}

// ─── Lookup autocomplete ──────────────────────────────────────────────────────

function LookupSelect({
  label, required, value, displayValue, placeholder,
  apiPath, searchParam, labelKey, onChange, onClear,
}: {
  label: string; required?: boolean; value: string; displayValue: string;
  placeholder: string; apiPath: string; searchParam?: string;
  labelKey: keyof LookupItem; onChange: (item: LookupItem) => void; onClear: () => void;
}) {
  const [query, setQuery] = useState(displayValue);
  const [results, setResults] = useState<LookupItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(displayValue); }, [displayValue]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = async (q: string) => {
    setLoading(true);
    try {
      const sep = apiPath.includes("?") ? "&" : "?";
      const url = q ? `${apiPath}${sep}${searchParam ?? "q"}=${encodeURIComponent(q)}` : apiPath;
      const res = await fetch(url, { cache: "no-store" });
      const payload = await res.json() as Record<string, LookupItem[]>;
      const key = Object.keys(payload)[0];
      setResults((payload[key] ?? []).filter((item) => item.is_active !== false));
    } catch { setResults([]); } finally { setLoading(false); }
  };

  const handleInput = (v: string) => {
    setQuery(v);
    if (!v) { onClear(); setResults([]); setOpen(false); return; }
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void search(v), 250);
  };

  const select = (item: LookupItem) => {
    onChange(item);
    setQuery(String(item[labelKey] ?? ""));
    setOpen(false); setResults([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
        {label}{required && <span className="text-red-400"> *</span>}
      </label>
      <div className="relative flex items-center">
        <input type="text" value={query} onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { setOpen(true); if (!results.length) void search(query); }}
          className="w-full rounded border px-3 py-2.5 pr-8 text-sm outline-none"
          style={fieldStyle} placeholder={placeholder} autoComplete="off" />
        {value ? (
          <button type="button" onClick={() => { onClear(); setQuery(""); setResults([]); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }}>
            <X size={14} aria-hidden="true" />
          </button>
        ) : (
          <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted-foreground)" }} aria-hidden="true" />
        )}
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded border shadow-lg"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          {loading && <div className="flex items-center gap-2 px-3 py-2.5 text-xs" style={{ color: "var(--muted-foreground)" }}><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Searching…</div>}
          {!loading && results.length === 0 && <div className="px-3 py-2.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{query ? "No results found." : "Start typing to search."}</div>}
          {!loading && results.map((item) => (
            <button key={item.id} type="button" onMouseDown={() => select(item)}
              className="w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--secondary)] transition-colors"
              style={{ color: "var(--foreground)" }}>
              {String(item[labelKey] ?? "")}
              {item.code && item.code !== item.name && <span className="ml-2 text-xs mono" style={{ color: "var(--muted-foreground)" }}>{item.code}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Approval timeline ────────────────────────────────────────────────────────

function ApprovalTimeline({ req }: { req: Requisition }) {
  const stages = [
    { label: "Submitted", sublabel: fmtDate(req.created_at), status: "approved" as StageDecision, note: "" },
    { label: "General Manager Review", sublabel: req.general_manager_reviewed_at ? fmtDate(req.general_manager_reviewed_at) : "Awaiting review", status: req.general_manager_status, note: req.general_manager_note },
    { label: "Finance / Cashier Verification", sublabel: req.finance_reviewed_at ? fmtDate(req.finance_reviewed_at) : "Awaiting verification", status: req.finance_status, note: req.finance_note },
    { label: "Director / CEO Authorisation", sublabel: req.director_reviewed_at ? fmtDate(req.director_reviewed_at) : "Awaiting authorisation", status: req.director_status, note: req.director_note },
  ];
  return (
    <div className="space-y-0">
      {stages.map((stage, i) => {
        const color = stageDecisionColor[stage.status];
        return (
          <div key={stage.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
                style={{ borderColor: color, background: stage.status !== "pending" ? color + "20" : "var(--secondary)" }}>
                {stage.status === "approved" ? <CheckCircle2 size={14} style={{ color }} aria-hidden="true" /> :
                  stage.status === "rejected" ? <XCircle size={14} style={{ color }} aria-hidden="true" /> :
                    <div className="h-2 w-2 rounded-full" style={{ background: color }} />}
              </div>
              {i < stages.length - 1 && <div className="my-0.5 w-px flex-1" style={{ background: "var(--border)", minHeight: "20px" }} />}
            </div>
            <div className="pb-4 min-w-0">
              <div className="text-sm font-600" style={{ color: "var(--foreground)" }}>{stage.label}</div>
              <div className="text-xs mt-0.5" style={{ color: stage.status === "pending" ? "#f59e0b" : "var(--muted-foreground)" }}>{stage.sublabel}</div>
              {stage.note && (
                <div className="mt-1.5 rounded border px-2.5 py-1.5 text-xs italic" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)", background: "var(--secondary)" }}>
                  "{stage.note}"
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RequisitionsWorkspace() {
  // ── List state ──────────────────────────────────────────────────────────────
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({ canCreate: false, canReview: false, canVerify: false, canAuthorize: false });
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequisitionStatus | "">("");
  const [myOnly, setMyOnly] = useState(false);

  // ── Detail panel state ──────────────────────────────────────────────────────
  const [detailReq, setDetailReq] = useState<Requisition | null>(null);
  const [detailItems, setDetailItems] = useState<RequisitionItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPayments, setDetailPayments] = useState<RequisitionPayment[]>([]);

  // ── Create/Edit form ────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formDeptId, setFormDeptId] = useState("");
  const [formDeptName, setFormDeptName] = useState("");
  const [formCurrencyId, setFormCurrencyId] = useState("");
  const [formCurrencyCode, setFormCurrencyCode] = useState("");
  const [formProviderId, setFormProviderId] = useState("");
  const [formProviderName, setFormProviderName] = useState("");
  const [formItems, setFormItems] = useState<DraftItem[]>([]);
  const [formItemError, setFormItemError] = useState("");

  // ── Verifier item-edit modal ────────────────────────────────────────────────
  const [verifierEditTarget, setVerifierEditTarget] = useState<Requisition | null>(null);
  const [verifierItems, setVerifierItems] = useState<DraftItem[]>([]);
  const [verifierItemError, setVerifierItemError] = useState("");
  const [verifierSaving, setVerifierSaving] = useState(false);
  const [verifierError, setVerifierError] = useState("");

  // ── Review modal ────────────────────────────────────────────────────────────
  const [reviewTarget, setReviewTarget] = useState<{ req: Requisition; stage: "general_manager" | "finance" | "director" } | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected">("approved");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");

  // ── Payment modal ───────────────────────────────────────────────────────────
  const [paymentTarget, setPaymentTarget] = useState<Requisition | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<CompanyAccount[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentResult, setPaymentResult] = useState<{ amountPaid: number; totalAmount: number; balance: number; paymentStatus: string } | null>(null);

  // ── Notifications ───────────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<ReqNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // ── Load list ────────────────────────────────────────────────────────────────
  const loadList = async () => {
    setLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (myOnly) params.set("mine", "1");
      const res = await fetch(`/api/requisitions?${params}`, { cache: "no-store" });
      const payload = await res.json() as { requisitions?: Requisition[]; permissions?: Permissions; currentUserId?: string; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to load requisitions.");
      setRequisitions(payload.requisitions ?? []);
      if (payload.permissions) setPermissions(payload.permissions);
      if (payload.currentUserId) setCurrentUserId(payload.currentUserId);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Unable to load requisitions.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadList(); }, [statusFilter, myOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notifications ─────────────────────────────────────────────────────────
  const loadNotifications = async () => {
    try {
      const res = await fetch("/api/requisitions/notifications", { cache: "no-store" });
      const payload = await res.json() as { notifications?: ReqNotification[]; unreadCount?: number };
      if (res.ok) { setNotifications(payload.notifications ?? []); setUnreadCount(payload.unreadCount ?? 0); }
    } catch { /* silent */ }
  };

  useEffect(() => {
    void loadNotifications();
    const handle = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const markAllRead = async () => {
    try {
      await fetch("/api/requisitions/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  // ── Detail ────────────────────────────────────────────────────────────────
  const openDetail = async (req: Requisition) => {
    setDetailReq(req);
    setDetailItems([]);
    setDetailPayments([]);
    setDetailLoading(true);
    try {
      const [detailRes, paymentsRes] = await Promise.all([
        fetch(`/api/requisitions/${req.id}`, { cache: "no-store" }),
        fetch(`/api/requisitions/payments?requisitionId=${req.id}`, { cache: "no-store" }),
      ]);
      const [detailPayload, paymentsPayload] = await Promise.all([
        detailRes.json() as Promise<{ requisition?: Requisition; items?: RequisitionItem[]; error?: string }>,
        paymentsRes.json() as Promise<{ payments?: RequisitionPayment[]; accounts?: CompanyAccount[]; error?: string }>,
      ]);
      if (detailRes.ok && detailPayload.requisition) {
        setDetailReq(detailPayload.requisition);
        setDetailItems(detailPayload.items ?? []);
      }
      if (paymentsRes.ok) setDetailPayments(paymentsPayload.payments ?? []);
    } catch { /* keep stale */ }
    setDetailLoading(false);
  };

  const closeDetail = () => { setDetailReq(null); setDetailItems([]); setDetailPayments([]); };

  // ── Create / Edit form ────────────────────────────────────────────────────
  const resetForm = () => {
    setFormTitle(""); setFormDueDate(""); setFormNotes("");
    setFormDeptId(""); setFormDeptName("");
    setFormCurrencyId(""); setFormCurrencyCode("");
    setFormProviderId(""); setFormProviderName("");
    setFormItems([]); setFormItemError(""); setFormError("");
    setEditingId(null);
  };

  const openCreateForm = () => { resetForm(); setShowForm(true); };

  const openEditForm = async (req: Requisition) => {
    resetForm();
    setFormTitle(req.title); setFormDueDate(req.due_date); setFormNotes(req.notes);
    setFormDeptName(req.department_name); setFormCurrencyCode(req.currency_code);
    setFormProviderName(req.service_provider_name);
    setEditingId(req.id);
    setShowForm(true);
    try {
      const res = await fetch(`/api/requisitions/${req.id}`, { cache: "no-store" });
      const payload = await res.json() as { requisition?: Requisition; items?: RequisitionItem[] };
      if (res.ok && payload.requisition) {
        setFormDeptId(payload.requisition.department_id ?? "");
        setFormCurrencyId(payload.requisition.currency_id ?? "");
        setFormProviderId(payload.requisition.service_provider_id ?? "");
        if (payload.items) {
          setFormItems(payload.items.map((item) => ({
            _key: item.id, description: item.description,
            quantity: String(item.quantity), rate: String(item.rate),
          })));
        }
      }
    } catch { /* keep defaults */ }
  };

  const formTotals = formItems.reduce(
    (acc, item) => acc + (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0),
    0,
  );

  const submitForm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formItems.length === 0) { setFormError("Add at least one line item before submitting."); return; }
    setFormSaving(true); setFormError("");
    try {
      const payload = {
        id: editingId ?? undefined,
        title: formTitle.trim(),
        departmentId: formDeptId || null,
        currencyId: formCurrencyId || null,
        serviceProviderId: formProviderId || null,
        dueDate: formDueDate,
        notes: formNotes.trim(),
        items: formItems.map((item) => ({
          description: item.description.trim(),
          quantity: parseFloat(item.quantity),
          rate: parseFloat(item.rate),
        })),
      };
      const res = await fetch("/api/requisitions", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json() as { requisitionId?: string; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to save requisition.");
      setShowForm(false); resetForm();
      await loadList(); await loadNotifications();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save requisition.");
    } finally { setFormSaving(false); }
  };

  // ── Verifier edit ─────────────────────────────────────────────────────────
  const openVerifierEdit = async (req: Requisition) => {
    setVerifierEditTarget(req);
    setVerifierItems([]);
    setVerifierItemError(""); setVerifierError("");
    try {
      const res = await fetch(`/api/requisitions/${req.id}`, { cache: "no-store" });
      const payload = await res.json() as { items?: RequisitionItem[] };
      if (res.ok && payload.items) {
        setVerifierItems(payload.items.map((item) => ({
          _key: item.id, description: item.description,
          quantity: String(item.quantity), rate: String(item.rate),
        })));
      }
    } catch { /* keep empty */ }
  };

  const submitVerifierEdit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!verifierEditTarget) return;
    if (verifierItems.length === 0) { setVerifierError("At least one line item is required."); return; }
    setVerifierSaving(true); setVerifierError("");
    try {
      const res = await fetch("/api/requisitions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: verifierEditTarget.id,
          items: verifierItems.map((item) => ({
            description: item.description.trim(),
            quantity: parseFloat(item.quantity),
            rate: parseFloat(item.rate),
          })),
        }),
      });
      const result = await res.json() as { ok?: boolean; totalAmount?: number; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to save changes.");
      setVerifierEditTarget(null);
      await loadList();
      if (detailReq?.id === verifierEditTarget.id) await openDetail(verifierEditTarget);
    } catch (err) {
      setVerifierError(err instanceof Error ? err.message : "Unable to save changes.");
    } finally { setVerifierSaving(false); }
  };

  // ── Review ────────────────────────────────────────────────────────────────
  const openReview = (req: Requisition) => {
    const stage =
      req.status === "pending" ? "general_manager" :
        req.status === "gm_review" ? "finance" :
          req.status === "finance_review" ? "director" : null;
    if (!stage) return;
    setReviewTarget({ req, stage });
    setReviewDecision("approved"); setReviewNote(""); setReviewError("");
  };

  const submitReview = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setReviewSaving(true); setReviewError("");
    try {
      const res = await fetch("/api/requisitions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requisitionId: reviewTarget.req.id, stage: reviewTarget.stage, decision: reviewDecision, note: reviewNote.trim() }),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to submit review.");
      setReviewTarget(null);
      await loadList(); await loadNotifications();
      if (detailReq?.id === reviewTarget.req.id) await openDetail(detailReq);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Unable to submit review.");
    } finally { setReviewSaving(false); }
  };

  // ── Payment ───────────────────────────────────────────────────────────────
  const openPayment = async (req: Requisition) => {
    setPaymentTarget(req);
    setPaymentAccountId(""); setPaymentAmount(""); setPaymentReference(""); setPaymentNotes("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentError(""); setPaymentResult(null);
    try {
      const res = await fetch(`/api/requisitions/payments?requisitionId=${req.id}`, { cache: "no-store" });
      const payload = await res.json() as { accounts?: CompanyAccount[]; error?: string };
      if (res.ok) {
        const accounts = payload.accounts ?? [];
        setPaymentAccounts(accounts);
        const def = accounts.find((a) => a.is_default);
        if (def) setPaymentAccountId(def.id);
      }
    } catch { /* keep empty */ }
  };

  const submitPayment = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!paymentTarget) return;
    const amount = parseFloat(paymentAmount);
    if (!paymentAccountId) { setPaymentError("Select an account to deduct from."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setPaymentError("Enter a valid amount greater than zero."); return; }
    setPaymentSaving(true); setPaymentError("");
    try {
      const res = await fetch("/api/requisitions/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisitionId: paymentTarget.id,
          accountId: paymentAccountId,
          amount,
          paymentDate,
          reference: paymentReference.trim(),
          notes: paymentNotes.trim(),
        }),
      });
      const result = await res.json() as { paymentId?: string; amountPaid?: number; totalAmount?: number; balance?: number; paymentStatus?: string; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to record payment.");
      setPaymentResult({
        amountPaid: result.amountPaid ?? 0,
        totalAmount: result.totalAmount ?? 0,
        balance: result.balance ?? 0,
        paymentStatus: result.paymentStatus ?? "partial",
      });
      setPaymentAmount(""); setPaymentReference(""); setPaymentNotes("");
      await loadList();
      if (detailReq?.id === paymentTarget.id) await openDetail(paymentTarget);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Unable to record payment.");
    } finally { setPaymentSaving(false); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getReviewAction = (req: Requisition): string | null => {
    if (req.status === "pending" && permissions.canReview) return "GM Review";
    if (req.status === "gm_review" && permissions.canVerify) return "Finance Verify";
    if (req.status === "finance_review" && permissions.canAuthorize) return "Authorise";
    return null;
  };

  const canVerifierEdit = (req: Requisition) => req.status === "finance_review" && permissions.canVerify;
  const canPay = (req: Requisition) => req.status === "approved" && permissions.canVerify && req.payment_status !== "paid";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-4 flex items-center justify-between gap-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Requisitions</h1>
          <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>Purchase requisition management and approvals</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <div ref={notifRef} className="relative">
            <button type="button" onClick={() => { setShowNotifications((v) => !v); if (!showNotifications && unreadCount > 0) void markAllRead(); }}
              className="relative flex items-center justify-center rounded border p-2"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
              aria-label={`Requisition notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}>
              <Bell size={17} style={{ color: "var(--muted-foreground)" }} aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-700"
                  style={{ background: "#ef4444", color: "#fff" }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded border shadow-xl overflow-hidden"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Requisition Notifications</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No notifications yet.</div>}
                  {notifications.map((n) => (
                    <div key={n.id} className="border-b px-4 py-3 last:border-0"
                      style={{ borderColor: "var(--border)", background: n.is_read ? "transparent" : "var(--secondary)" }}>
                      <div className="text-xs font-600 mb-0.5" style={{ color: "var(--foreground)" }}>{n.title}</div>
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{n.body}</div>
                      <div className="mt-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>{fmtDate(n.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {permissions.canCreate && (
            <button type="button" onClick={openCreateForm}
              className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-600"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              <Plus size={16} aria-hidden="true" /> Create Requisition
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b px-6 py-3 flex flex-wrap items-center gap-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-600 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RequisitionStatus | "")}
            className="rounded border px-2.5 py-1.5 text-xs outline-none" style={fieldStyle}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="gm_review">GM Review</option>
            <option value="finance_review">Finance Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={myOnly} onChange={(e) => setMyOnly(e.target.checked)} className="h-3.5 w-3.5 rounded" />
          <span className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>My requisitions only</span>
        </label>
        <span className="ml-auto text-xs mono" style={{ color: "var(--muted-foreground)" }}>{requisitions.length} record{requisitions.length !== 1 ? "s" : ""}</span>
      </div>

      {listError && <div role="alert" className="mx-6 mt-4 shrink-0 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{listError}</div>}

      {/* List table */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-20 gap-2" style={{ color: "var(--muted-foreground)" }}>
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            <span className="text-sm">Loading requisitions…</span>
          </div>
        )}
        {!loading && requisitions.length === 0 && !listError && (
          <div className="flex flex-col items-center justify-center py-20">
            <ClipboardList size={40} className="mb-3 opacity-25" style={{ color: "var(--muted-foreground)" }} aria-hidden="true" />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No requisitions found.</p>
            {permissions.canCreate && <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Click "Create Requisition" to submit one.</p>}
          </div>
        )}
        {!loading && requisitions.length > 0 && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ background: "var(--card)" }}>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["Ref", "Title", "Department", "Currency", "Total Amount", "Paid", "Status", "Payment", "Actions"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requisitions.map((req) => {
                const cfg = statusConfig[req.status];
                const pymtCfg = paymentStatusConfig[req.payment_status ?? "unpaid"];
                const reviewAction = getReviewAction(req);
                const isOwn = req.created_by === currentUserId;
                return (
                  <tr key={req.id} className="border-b hover:bg-[var(--secondary)] transition-colors cursor-pointer" style={{ borderColor: "var(--border)" }}
                    onClick={() => void openDetail(req)}>
                    <td className="whitespace-nowrap px-4 py-3 mono text-xs font-600" style={{ color: "var(--primary)" }}>{req.requisition_number}</td>
                    <td className="px-4 py-3 max-w-44"><span className="line-clamp-2 text-sm font-600" style={{ color: "var(--foreground)" }}>{req.title}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{req.department_name || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 mono text-xs font-600" style={{ color: "var(--muted-foreground)" }}>{req.currency_code}</td>
                    <td className="whitespace-nowrap px-4 py-3 mono font-700" style={{ color: "#6366f1" }}>{fmtAmount(req.total_amount, req.currency_code)}</td>
                    <td className="whitespace-nowrap px-4 py-3 mono text-xs" style={{ color: "#10b981" }}>{req.amount_paid > 0 ? fmtAmount(req.amount_paid, req.currency_code) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded px-2 py-0.5 text-xs font-600" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {req.status === "approved" && (
                        <span className="rounded px-2 py-0.5 text-xs font-600" style={{ background: pymtCfg.bg, color: pymtCfg.color }}>{pymtCfg.label}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => void openDetail(req)}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-600"
                          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                          <ChevronRight size={12} aria-hidden="true" /> View
                        </button>
                        {isOwn && req.status === "pending" && (
                          <button type="button" onClick={() => void openEditForm(req)}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-600"
                            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                            <Edit2 size={11} aria-hidden="true" /> Edit
                          </button>
                        )}
                        {canVerifierEdit(req) && (
                          <button type="button" onClick={() => void openVerifierEdit(req)}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-600"
                            style={{ borderColor: "var(--border)", color: "#3b82f6" }}>
                            <Edit2 size={11} aria-hidden="true" /> Edit Items
                          </button>
                        )}
                        {reviewAction && (
                          <button type="button" onClick={() => openReview(req)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-600"
                            style={{ background: "#6366f120", color: "#6366f1" }}>
                            <ShieldCheck size={12} aria-hidden="true" /> {reviewAction}
                          </button>
                        )}
                        {canPay(req) && (
                          <button type="button" onClick={() => void openPayment(req)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-600"
                            style={{ background: "#10b98120", color: "#10b981" }}>
                            <CircleDollarSign size={12} aria-hidden="true" /> Pay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail panel ── */}
      {detailReq && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeDetail(); }}>
          <div className="flex h-full w-full max-w-2xl flex-col border-l overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="shrink-0 border-b px-6 py-4 flex items-start justify-between gap-3" style={{ borderColor: "var(--border)" }}>
              <div className="min-w-0">
                <div className="mono text-xs font-600" style={{ color: "var(--primary)" }}>{detailReq.requisition_number}</div>
                <h2 className="mt-1 text-lg font-700 leading-tight" style={{ color: "var(--foreground)" }}>{detailReq.title}</h2>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <span className="rounded px-2 py-0.5 text-xs font-600"
                    style={{ background: statusConfig[detailReq.status].bg, color: statusConfig[detailReq.status].color }}>
                    {statusConfig[detailReq.status].label}
                  </span>
                  {detailReq.status === "approved" && (
                    <span className="rounded px-2 py-0.5 text-xs font-600"
                      style={{ background: paymentStatusConfig[detailReq.payment_status ?? "unpaid"].bg, color: paymentStatusConfig[detailReq.payment_status ?? "unpaid"].color }}>
                      {paymentStatusConfig[detailReq.payment_status ?? "unpaid"].label}
                    </span>
                  )}
                  {detailReq.department_name && <span className="rounded px-2 py-0.5 text-xs" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>{detailReq.department_name}</span>}
                  {detailReq.service_provider_name && <span className="rounded px-2 py-0.5 text-xs" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>{detailReq.service_provider_name}</span>}
                </div>
              </div>
              <button type="button" onClick={closeDetail} className="shrink-0 rounded p-1.5" style={{ color: "var(--muted-foreground)" }}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailLoading && (
                <div className="flex items-center gap-2 py-8 justify-center" style={{ color: "var(--muted-foreground)" }}>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" /><span className="text-sm">Loading…</span>
                </div>
              )}
              {!detailLoading && (
                <>
                  {/* Meta grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["Due Date", fmtDate(detailReq.due_date)],
                      ["Currency", detailReq.currency_code],
                      ["Submitted", fmtDate(detailReq.created_at)],
                      ["Total Amount", fmtAmount(detailReq.total_amount, detailReq.currency_code)],
                      ...(detailReq.status === "approved" ? [
                        ["Amount Paid", fmtAmount(detailReq.amount_paid, detailReq.currency_code)],
                        ["Balance", fmtAmount(Math.max(detailReq.total_amount - detailReq.amount_paid, 0), detailReq.currency_code)],
                      ] : []),
                    ].map(([label, value]) => (
                      <div key={label} className="rounded border p-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
                        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                        <div className="mono font-700 text-sm" style={{ color: label === "Balance" && detailReq.amount_paid < detailReq.total_amount ? "#ef4444" : label === "Amount Paid" ? "#10b981" : "var(--foreground)" }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {detailReq.notes && (
                    <div className="rounded border p-4" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                      <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Notes</div>
                      <p className="text-sm" style={{ color: "var(--foreground)" }}>{detailReq.notes}</p>
                    </div>
                  )}

                  {/* Line items */}
                  <div>
                    <h3 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Line Items</h3>
                    {detailItems.length === 0 ? (
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No items loaded.</p>
                    ) : (
                      <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                              {["Description", "Qty", "Rate", "Total"].map((h) => (
                                <th key={h} className="px-3 py-2.5 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detailItems.map((item) => (
                              <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                                <td className="px-3 py-2.5" style={{ color: "var(--foreground)" }}>{item.description}</td>
                                <td className="whitespace-nowrap px-3 py-2.5 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{item.quantity}</td>
                                <td className="whitespace-nowrap px-3 py-2.5 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtAmount(item.rate)}</td>
                                <td className="whitespace-nowrap px-3 py-2.5 mono font-700" style={{ color: "#6366f1" }}>{fmtAmount(item.total_amount, detailReq.currency_code)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                              <td colSpan={3} className="px-3 py-2.5 text-right text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Total</td>
                              <td className="whitespace-nowrap px-3 py-2.5 mono font-700 text-base" style={{ color: "#6366f1" }}>{fmtAmount(detailReq.total_amount, detailReq.currency_code)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Payment history */}
                  {detailPayments.length > 0 && (
                    <div>
                      <h3 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment History</h3>
                      <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                              {["Date", "Amount", "Reference", "Notes"].map((h) => (
                                <th key={h} className="px-3 py-2.5 text-xs font-700 uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detailPayments.map((p) => (
                              <tr key={p.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                                <td className="whitespace-nowrap px-3 py-2.5 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtDate(p.payment_date)}</td>
                                <td className="whitespace-nowrap px-3 py-2.5 mono font-700" style={{ color: "#10b981" }}>{fmtAmount(p.amount, detailReq.currency_code)}</td>
                                <td className="px-3 py-2.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.reference || "—"}</td>
                                <td className="px-3 py-2.5 text-xs max-w-xs" style={{ color: "var(--muted-foreground)" }}><span className="block truncate">{p.notes || "—"}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Approval timeline */}
                  <div>
                    <h3 className="mb-4 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Approval Progress</h3>
                    <ApprovalTimeline req={detailReq} />
                  </div>

                  {/* Action buttons from detail panel */}
                  <div className="flex flex-col gap-2">
                    {canVerifierEdit(detailReq) && (
                      <button type="button" onClick={() => void openVerifierEdit(detailReq)}
                        className="w-full rounded py-2.5 text-sm font-600"
                        style={{ background: "#3b82f620", color: "#3b82f6", border: "1px solid #3b82f640" }}>
                        <Edit2 size={15} className="inline mr-2" aria-hidden="true" />
                        Edit Items (Finance Adjustment)
                      </button>
                    )}
                    {getReviewAction(detailReq) && (
                      <button type="button" onClick={() => openReview(detailReq)}
                        className="w-full rounded py-2.5 text-sm font-600"
                        style={{ background: "#6366f1", color: "#fff" }}>
                        <ShieldCheck size={15} className="inline mr-2" aria-hidden="true" />
                        {getReviewAction(detailReq)}
                      </button>
                    )}
                    {canPay(detailReq) && (
                      <button type="button" onClick={() => void openPayment(detailReq)}
                        className="w-full rounded py-2.5 text-sm font-600"
                        style={{ background: "#10b981", color: "#fff" }}>
                        <CircleDollarSign size={15} className="inline mr-2" aria-hidden="true" />
                        Make Payment
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit form ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-8"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowForm(false); resetForm(); } }}>
          <form onSubmit={submitForm} className="w-full max-w-3xl rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="sticky top-0 z-10 border-b px-6 py-4 flex items-center justify-between"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>
                <FileText size={18} className="inline mr-2" aria-hidden="true" />
                {editingId ? "Edit Requisition" : "Create Requisition"}
              </h2>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="rounded p-1.5" style={{ color: "var(--muted-foreground)" }}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {formError && <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{formError}</div>}
              <div>
                <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Title <span className="text-red-400">*</span></label>
                <input type="text" required maxLength={200} value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded border px-3 py-2.5 text-sm outline-none" style={fieldStyle}
                  placeholder="e.g. Office Supplies — October 2026" />
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Due Date <span className="text-red-400">*</span></label>
                  <input type="date" required value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full rounded border px-3 py-2.5 text-sm outline-none" style={fieldStyle} />
                </div>
                <LookupSelect label="Department" value={formDeptId} displayValue={formDeptName}
                  placeholder="Type to search departments…" apiPath="/api/settings/departments" labelKey="name"
                  onChange={(item) => { setFormDeptId(item.id); setFormDeptName(item.name); }}
                  onClear={() => { setFormDeptId(""); setFormDeptName(""); }} />
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <LookupSelect label="Currency" value={formCurrencyId} displayValue={formCurrencyCode}
                  placeholder="Type to search currencies…" apiPath="/api/settings/currencies" labelKey="code"
                  onChange={(item) => { setFormCurrencyId(item.id); setFormCurrencyCode(item.code ?? item.name); }}
                  onClear={() => { setFormCurrencyId(""); setFormCurrencyCode(""); }} />
                <LookupSelect label="Service Provider" value={formProviderId} displayValue={formProviderName}
                  placeholder="Type to search providers…" apiPath="/api/settings/service-providers" searchParam="q" labelKey="name"
                  onChange={(item) => { setFormProviderId(item.id); setFormProviderName(item.name); }}
                  onClear={() => { setFormProviderId(""); setFormProviderName(""); }} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Notes</label>
                <textarea rows={2} maxLength={2000} value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full rounded border px-3 py-2.5 text-sm outline-none resize-none" style={fieldStyle}
                  placeholder="Purpose, justification, or additional context…" />
              </div>
              <LineItemsEditor items={formItems} onItemsChange={setFormItems} currencyCode={formCurrencyCode}
                error={formItemError} onErrorChange={setFormItemError} />
            </div>
            <div className="sticky bottom-0 border-t px-6 py-4 flex items-center justify-between gap-4"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {formItems.length > 0 && <span>Total: <span className="mono font-700" style={{ color: "#6366f1" }}>{fmtAmount(formTotals, formCurrencyCode)}</span></span>}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                  className="rounded border px-5 py-2.5 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formSaving || formItems.length === 0}
                  className="rounded px-6 py-2.5 text-sm font-600 disabled:opacity-50"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                  {formSaving ? "Submitting…" : editingId ? "Save Changes" : "Submit Requisition"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Verifier item-edit modal ── */}
      {verifierEditTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-8"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setVerifierEditTarget(null); }}>
          <form onSubmit={submitVerifierEdit} className="w-full max-w-3xl rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="sticky top-0 z-10 border-b px-6 py-4 flex items-center justify-between"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <div>
                <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Finance Item Adjustment</h2>
                <p className="mt-0.5 text-xs mono" style={{ color: "var(--primary)" }}>{verifierEditTarget.requisition_number} — {verifierEditTarget.title}</p>
              </div>
              <button type="button" onClick={() => setVerifierEditTarget(null)} className="rounded p-1.5" style={{ color: "var(--muted-foreground)" }}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="rounded border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm" style={{ color: "#3b82f6" }}>
                As Finance / Cashier, you can adjust item descriptions, quantities, and rates before verifying this requisition. The requisition header (title, department, due date) cannot be changed at this stage.
              </div>
              {verifierError && <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{verifierError}</div>}
              <LineItemsEditor items={verifierItems} onItemsChange={setVerifierItems}
                currencyCode={verifierEditTarget.currency_code}
                error={verifierItemError} onErrorChange={setVerifierItemError} />
            </div>
            <div className="sticky bottom-0 border-t px-6 py-4 flex justify-end gap-3"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <button type="button" onClick={() => setVerifierEditTarget(null)}
                className="rounded border px-5 py-2.5 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                Cancel
              </button>
              <button type="submit" disabled={verifierSaving || verifierItems.length === 0}
                className="rounded px-6 py-2.5 text-sm font-600 disabled:opacity-50"
                style={{ background: "#3b82f6", color: "#fff" }}>
                {verifierSaving ? "Saving…" : "Save Item Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Review modal ── */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setReviewTarget(null); }}>
          <form onSubmit={submitReview} className="w-full max-w-md rounded border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-base font-700" style={{ color: "var(--foreground)" }}>
                  {{ general_manager: "General Manager Review", finance: "Finance / Cashier Verification", director: "Director / CEO Authorisation" }[reviewTarget.stage]}
                </h3>
                <p className="mt-1 text-xs mono" style={{ color: "var(--primary)" }}>{reviewTarget.req.requisition_number} — {reviewTarget.req.title}</p>
              </div>
              <button type="button" onClick={() => setReviewTarget(null)} className="rounded p-1" style={{ color: "var(--muted-foreground)" }}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {reviewError && <div role="alert" className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{reviewError}</div>}
            <div className="mb-5 rounded border p-3 flex items-center justify-between" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Requisition total</span>
              <span className="mono font-700" style={{ color: "#6366f1" }}>{fmtAmount(reviewTarget.req.total_amount, reviewTarget.req.currency_code)}</span>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Decision <span className="text-red-400">*</span></label>
                <div className="flex gap-3">
                  {(["approved", "rejected"] as const).map((d) => (
                    <label key={d} className="flex-1 flex items-center justify-center gap-2 rounded border py-2.5 cursor-pointer"
                      style={{
                        borderColor: reviewDecision === d ? (d === "approved" ? "#10b981" : "#ef4444") : "var(--border)",
                        background: reviewDecision === d ? (d === "approved" ? "#10b98115" : "#ef444415") : "var(--secondary)",
                        color: reviewDecision === d ? (d === "approved" ? "#10b981" : "#ef4444") : "var(--muted-foreground)",
                      }}>
                      <input type="radio" name="decision" value={d} checked={reviewDecision === d} onChange={() => setReviewDecision(d)} className="sr-only" />
                      {d === "approved" ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
                      <span className="text-sm font-600">{d === "approved" ? "Approve" : "Reject"}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                  Note / Message {reviewDecision === "rejected" && <span className="text-red-400">*</span>}
                </label>
                <textarea rows={3} maxLength={1000} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
                  required={reviewDecision === "rejected"}
                  className="w-full rounded border px-3 py-2.5 text-sm outline-none resize-none" style={fieldStyle}
                  placeholder={reviewDecision === "rejected" ? "Explain why this is being rejected…" : "Optional comments or conditions…"} />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button type="submit" disabled={reviewSaving}
                className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50"
                style={{ background: reviewDecision === "approved" ? "#10b981" : "#ef4444", color: "#fff" }}>
                {reviewSaving ? "Submitting…" : reviewDecision === "approved" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
              <button type="button" onClick={() => setReviewTarget(null)}
                className="rounded border px-4 py-2.5 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Payment modal ── */}
      {paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { if (!paymentResult) setPaymentTarget(null); } }}>
          <div className="w-full max-w-lg rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            {/* Header */}
            <div className="border-b px-6 py-4 flex items-start justify-between" style={{ borderColor: "var(--border)" }}>
              <div>
                <h3 className="text-base font-700" style={{ color: "var(--foreground)" }}>Make Payment</h3>
                <p className="mt-0.5 text-xs mono" style={{ color: "var(--primary)" }}>{paymentTarget.requisition_number} — {paymentTarget.title}</p>
              </div>
              <button type="button" onClick={() => setPaymentTarget(null)} className="rounded p-1" style={{ color: "var(--muted-foreground)" }}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="p-6">
              {/* Amount summary */}
              <div className="mb-5 grid grid-cols-3 gap-3">
                {[
                  { label: "Required Amount", value: fmtAmount(paymentTarget.total_amount, paymentTarget.currency_code), color: "#6366f1" },
                  { label: "Already Paid", value: fmtAmount(paymentTarget.amount_paid ?? 0, paymentTarget.currency_code), color: "#10b981" },
                  { label: "Balance Due", value: fmtAmount(Math.max(paymentTarget.total_amount - (paymentTarget.amount_paid ?? 0), 0), paymentTarget.currency_code), color: "#ef4444" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded border p-3 text-center" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                    <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                    <div className="mono font-700 text-sm" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Post-payment result banner */}
              {paymentResult && (
                <div className={`mb-5 rounded border p-4 ${paymentResult.paymentStatus === "paid" ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {paymentResult.paymentStatus === "paid"
                      ? <CheckCircle2 size={18} className="text-emerald-400" aria-hidden="true" />
                      : <CircleDollarSign size={18} className="text-amber-400" aria-hidden="true" />}
                    <span className={`text-sm font-700 ${paymentResult.paymentStatus === "paid" ? "text-emerald-400" : "text-amber-400"}`}>
                      {paymentResult.paymentStatus === "paid" ? "All money paid — zero balance" : "Partially paid"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><span style={{ color: "var(--muted-foreground)" }}>Total paid: </span><span className="mono font-700 text-emerald-400">{fmtAmount(paymentResult.amountPaid, paymentTarget.currency_code)}</span></div>
                    <div><span style={{ color: "var(--muted-foreground)" }}>Required: </span><span className="mono font-700" style={{ color: "var(--foreground)" }}>{fmtAmount(paymentResult.totalAmount, paymentTarget.currency_code)}</span></div>
                    <div><span style={{ color: "var(--muted-foreground)" }}>Balance: </span><span className={`mono font-700 ${paymentResult.balance === 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtAmount(paymentResult.balance, paymentTarget.currency_code)}</span></div>
                  </div>
                </div>
              )}

              {paymentError && <div role="alert" className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{paymentError}</div>}

              {/* Payment form — shown unless fully paid */}
              {(paymentTarget.payment_status !== "paid" && !paymentResult?.paymentStatus?.includes("paid")) || paymentResult?.paymentStatus === "partial" ? (
                <form onSubmit={submitPayment} className="space-y-4">
                  {/* Account selector */}
                  <div>
                    <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                      Pay from Account <span className="text-red-400">*</span>
                    </label>
                    {paymentAccounts.length === 0 ? (
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No active accounts found. Create an account in Finance → Accounts first.</p>
                    ) : (
                      <select value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)} required
                        className="w-full rounded border px-3 py-2.5 text-sm outline-none" style={fieldStyle}>
                        <option value="">— Select account —</option>
                        {paymentAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}{acc.account_number ? ` (${acc.account_number})` : ""} — {acc.account_type.replace("_", " ")}{acc.is_default ? " ★" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                      Amount to Pay ({paymentTarget.currency_code}) <span className="text-red-400">*</span>
                    </label>
                    <input type="number" min="0.01" step="any" required value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full rounded border px-3 py-2.5 text-sm mono outline-none" style={fieldStyle}
                      placeholder={`Max: ${fmtAmount(Math.max(paymentTarget.total_amount - (paymentTarget.amount_paid ?? 0), 0))}`} />
                    {/* Live balance preview */}
                    {paymentAmount && Number.isFinite(parseFloat(paymentAmount)) && (
                      <div className="mt-1.5 flex items-center gap-3 text-xs">
                        {(() => {
                          const entering = parseFloat(paymentAmount) || 0;
                          const alreadyPaid = paymentTarget.amount_paid ?? 0;
                          const newPaid = alreadyPaid + entering;
                          const balance = Math.max(paymentTarget.total_amount - newPaid, 0);
                          const fully = newPaid >= paymentTarget.total_amount;
                          return (
                            <>
                              <span style={{ color: "var(--muted-foreground)" }}>After payment:</span>
                              <span className="mono font-700" style={{ color: "#10b981" }}>Paid {fmtAmount(Math.min(newPaid, paymentTarget.total_amount), paymentTarget.currency_code)}</span>
                              <span className="mono font-700" style={{ color: fully ? "#10b981" : "#ef4444" }}>
                                {fully ? "✓ Zero balance" : `Balance ${fmtAmount(balance, paymentTarget.currency_code)}`}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment Date</label>
                      <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full rounded border px-3 py-2.5 text-sm outline-none" style={fieldStyle} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Reference</label>
                      <input type="text" maxLength={100} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full rounded border px-3 py-2.5 text-sm outline-none" style={fieldStyle}
                        placeholder="e.g. cheque no., receipt no." />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Notes</label>
                    <textarea rows={2} maxLength={1000} value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)}
                      className="w-full rounded border px-3 py-2.5 text-sm outline-none resize-none" style={fieldStyle}
                      placeholder="Optional payment notes…" />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button type="submit" disabled={paymentSaving || !paymentAccountId}
                      className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50"
                      style={{ background: "#10b981", color: "#fff" }}>
                      {paymentSaving ? "Recording…" : "Record Payment"}
                    </button>
                    <button type="button" onClick={() => setPaymentTarget(null)}
                      className="rounded border px-4 py-2.5 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                      Close
                    </button>
                  </div>
                </form>
              ) : (
                <div className="pt-2 text-center">
                  <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>This requisition has been fully paid.</p>
                  <button type="button" onClick={() => setPaymentTarget(null)}
                    className="rounded px-6 py-2.5 text-sm font-600" style={{ background: "#10b981", color: "#fff" }}>
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
