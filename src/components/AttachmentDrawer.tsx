import { useEffect, useState, type FormEvent } from "react";
import { Check, Download, Eye, Paperclip, Pencil, Trash2, Upload, X } from "lucide-react";

interface CandidateIdentity {
  id: string;
  firstName: string;
  lastName: string;
  fileNumber: string;
}

interface CandidateDocument {
  id: string;
  file_name: string;
  file_size: number;
  document_type: string;
  created_at: string;
  updated_at: string;
  uploaded_by: string;
  updated_by: string | null;
  uploaded_by_name: string;
  updated_by_name: string;
  expires_at: string | null;
  notes: string;
  status: string;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDocumentType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AttachmentDrawer({ candidate, onClose }: { candidate: CandidateIdentity; onClose: () => void }) {
  const [documents, setDocuments] = useState<CandidateDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("other");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/candidates/${encodeURIComponent(candidate.id)}/documents`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { documents?: CandidateDocument[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load candidate documents.");
        if (!cancelled) setDocuments(payload.documents ?? []);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Unable to load candidate documents.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [candidate.id, refreshKey]);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("documentType", documentType);
      formData.set("notes", notes);
      if (expiresAt) formData.set("expiresAt", expiresAt);
      const response = await fetch(`/api/candidates/${encodeURIComponent(candidate.id)}/documents`, { method: "POST", body: formData });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to upload the attachment.");
      setFile(null);
      setNotes("");
      setExpiresAt("");
      setShowUpload(false);
      setRefreshKey((key) => key + 1);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload the attachment.");
    } finally {
      setUploading(false);
    }
  };

  const saveRename = async (documentId: string) => {
    setSavingId(documentId);
    setError("");
    try {
      const response = await fetch(`/api/candidate-documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: editingName }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to rename this attachment.");
      setEditingId(null);
      setRefreshKey((key) => key + 1);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Unable to rename this attachment.");
    } finally {
      setSavingId(null);
    }
  };

  const deleteDocuments = async (ids: string[]) => {
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected ${ids.length === 1 ? "attachment" : "attachments"}? This cannot be undone.`)) return;
    setSavingId(ids[0]);
    setError("");
    try {
      for (const id of ids) {
        const response = await fetch(`/api/candidate-documents/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!response.ok) {
          const payload = await response.json() as { error?: string };
          throw new Error(payload.error || "Unable to delete the selected attachment(s).");
        }
      }
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setRefreshKey((key) => key + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the selected attachment(s).");
      setRefreshKey((key) => key + 1);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <button type="button" aria-label="Close attachments" onClick={onClose} className="fixed inset-0 z-40 cursor-default" style={{ background: "#00000066" }} />
      <aside aria-label={`${candidate.firstName} ${candidate.lastName} attachments`} className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-120 flex-col border-l shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-700" style={{ background: "var(--secondary)", color: "var(--primary)" }}>
              {candidate.firstName[0]}{candidate.lastName[0]}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-700" style={{ color: "var(--foreground)" }}>{candidate.firstName} {candidate.lastName}</h2>
              <p className="mt-0.5 truncate text-xs" style={{ color: "var(--muted-foreground)" }}>{candidate.fileNumber}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close attachments" className="flex h-8 w-8 shrink-0 items-center justify-center rounded" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button>
        </header>

        <div className="flex items-center gap-2 border-b px-5 py-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          <Paperclip size={15} aria-hidden="true" />
          <span>{loading ? "Loading documents…" : `${documents.length} ${documents.length === 1 ? "attachment" : "attachments"}`}</span>
          <button type="button" onClick={() => setShowUpload((current) => !current)} className="ml-auto inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Upload size={14} aria-hidden="true" /> Add attachment</button>
        </div>

        {showUpload ? (
          <form onSubmit={handleUpload} className="space-y-3 border-b p-5" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
            <label className="block text-xs font-700" style={{ color: "var(--foreground)" }}>File
              <input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded border p-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground)" }} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-700" style={{ color: "var(--foreground)" }}>Type
                <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-xs" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  {[["cv", "CV"], ["passport", "Passport"], ["medical", "Medical"], ["id", "ID"], ["certificate", "Certificate"], ["contract", "Contract"], ["visa", "Visa"], ["payment_receipt", "Payment receipt"], ["photo", "Photo"], ["other", "Other"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-700" style={{ color: "var(--foreground)" }}>Expiry date
                <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-xs" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </label>
            </div>
            <label className="block text-xs font-700" style={{ color: "var(--foreground)" }}>Notes
              <textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full resize-y rounded border px-2 py-2 text-xs" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            </label>
            <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>PDF, JPEG, PNG, or WebP up to 4 MB.</p>
            <div className="flex gap-2">
              <button type="submit" disabled={uploading} className="rounded px-3 py-2 text-xs font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{uploading ? "Uploading…" : "Upload file"}</button>
              <button type="button" onClick={() => setShowUpload(false)} className="rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Cancel</button>
            </div>
          </form>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {error ? <p role="alert" className="m-5 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">{error}</p> : null}
          {selectedIds.length > 0 ? <div className="flex items-center justify-between border-b px-5 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}><span>{selectedIds.length} selected</span><button type="button" disabled={savingId !== null} onClick={() => void deleteDocuments(selectedIds)} className="inline-flex items-center gap-1 rounded px-2 py-1 font-600 disabled:opacity-50" style={{ color: "#dc2626" }}><Trash2 size={14} aria-hidden="true" /> Delete selected</button></div> : null}
          {!loading && !error && documents.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-2 px-6 text-center" style={{ color: "var(--muted-foreground)" }}>
              <Paperclip size={26} strokeWidth={1.7} aria-hidden="true" />
              <p className="text-sm">No documents have been uploaded for this candidate.</p>
            </div>
          ) : null}
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {documents.map((document) => (
              <article key={document.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <input type="checkbox" aria-label={`Select ${document.file_name}`} checked={selectedIds.includes(document.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))} className="mt-0.5 h-4 w-4 shrink-0 accent-amber-700" />
                    <div className="min-w-0 flex-1">
                    {editingId === document.id ? (
                      <div className="flex items-center gap-1.5">
                        <input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={255} className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                        <button type="button" aria-label="Save file name" disabled={savingId === document.id} onClick={() => void saveRename(document.id)} className="flex h-8 w-8 items-center justify-center rounded" style={{ color: "var(--primary)" }}><Check size={16} aria-hidden="true" /></button>
                        <button type="button" aria-label="Cancel rename" onClick={() => setEditingId(null)} className="flex h-8 w-8 items-center justify-center rounded" style={{ color: "var(--muted-foreground)" }}><X size={16} aria-hidden="true" /></button>
                      </div>
                    ) : <h3 className="wrap-break-word text-sm font-600" style={{ color: "var(--foreground)" }}>{document.file_name}</h3>}
                    <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {formatDocumentType(document.document_type)} · {formatFileSize(document.file_size)} · {new Date(document.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {document.updated_by && document.updated_by !== document.uploaded_by
                        ? `Uploaded by ${document.uploaded_by_name} · Last edited by ${document.updated_by_name} on ${new Date(document.updated_at).toLocaleDateString()}`
                        : `Uploaded and last updated by ${document.updated_by_name} on ${new Date(document.updated_at).toLocaleDateString()}`}
                    </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded px-2 py-1 text-[10px] font-700 uppercase" style={{ background: document.status === "verified" ? "#dcfce7" : "var(--secondary)", color: document.status === "verified" ? "#166534" : "var(--muted-foreground)" }}>{document.status}</span>
                </div>
                {document.expires_at ? <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>Expires {new Date(`${document.expires_at}T00:00:00`).toLocaleDateString()}</p> : null}
                {document.notes ? <p className="mt-2 wrap-break-word text-xs" style={{ color: "var(--muted-foreground)" }}>{document.notes}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2 pl-6">
                  <a href={`/api/candidate-documents/${encodeURIComponent(document.id)}?disposition=inline`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Eye size={14} aria-hidden="true" /> Preview</a>
                  <a href={`/api/candidate-documents/${encodeURIComponent(document.id)}`} className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--primary)" }}><Download size={14} aria-hidden="true" /> Download</a>
                  {editingId !== document.id ? <button type="button" onClick={() => { setEditingId(document.id); setEditingName(document.file_name); }} className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Pencil size={14} aria-hidden="true" /> Rename</button> : null}
                  <button type="button" disabled={savingId === document.id} onClick={() => void deleteDocuments([document.id])} className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-600 disabled:opacity-50" style={{ borderColor: "#ef444440", color: "#dc2626" }}><Trash2 size={14} aria-hidden="true" /> Delete</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
import { FolderOpen } from "lucide-react";
import type { Candidate } from "./Candidates";

const CATEGORIES = ["Passport", "CV", "Medical", "ID", "Certificates", "Contracts", "Visa", "Payment Receipts", "Photos", "Other"] as const;

interface Attachment {
  id: number;
  name: string;
  category: typeof CATEGORIES[number];
  type: string;
  size: string;
  uploadDate: string;
  uploadedBy: string;
  status: "Verified" | "Pending" | "Rejected";
  notes: string;
}

const statusColor: Record<string, string> = { Verified: "#10b981", Pending: "#f59e0b", Rejected: "#ef4444" };
const catColor: Record<string, string> = {
  Passport: "#6366f1", CV: "#3b82f6", Medical: "#10b981", ID: "#f59e0b",
  Certificates: "#8b5cf6", Contracts: "#14b8a6", Visa: "#ec4899",
  "Payment Receipts": "#f97316", Photos: "#84cc16", Other: "#6b7280",
};

function LegacyAttachmentDrawer({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: "", category: "Passport" as typeof CATEGORIES[number], notes: "" });

  const filtered = activeCategory === "All" ? attachments : attachments.filter((a) => a.category === activeCategory);
  const countByCategory = CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = attachments.filter((a) => a.category === cat).length;
    return acc;
  }, {});

  const handleDelete = (id: number) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setConfirmDelete(null);
  };

  const handleRename = (id: number) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, name: renameName || a.name } : a)));
    setRenaming(null);
  };

  const handleUpload = () => {
    if (!uploadForm.name) return;
    const ext = uploadForm.name.includes(".") ? uploadForm.name.split(".").pop()!.toUpperCase() : "FILE";
    setAttachments((prev) => [...prev, {
      id: Date.now(), name: uploadForm.name, category: uploadForm.category,
      type: ext, size: "— KB", uploadDate: "Aug 26, 2026", uploadedBy: "Aisha Khan",
      status: "Pending", notes: uploadForm.notes,
    }]);
    setUploadForm({ name: "", category: "Passport", notes: "" });
    setShowUpload(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ background: "#00000055" }} onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col shadow-2xl"
        style={{ width: "480px", background: "var(--card)", borderLeft: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start justify-between" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-700"
              style={{ background: "#6366f130", color: "#6366f1" }}>
              {candidate.firstName[0]}{candidate.lastName[0]}
            </div>
            <div>
              <div className="font-700 text-sm" style={{ color: "var(--foreground)" }}>{candidate.firstName} {candidate.lastName}</div>
              <div className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{candidate.fileNumber}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close attachments" className="flex items-center justify-center rounded p-1" style={{ color: "var(--muted-foreground)" }}><X size={17} aria-hidden="true" /></button>
        </div>

        {/* Stats */}
        <div className="px-5 py-3 border-b flex items-center gap-4" style={{ borderColor: "var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span className="mono font-700 text-base" style={{ color: "var(--foreground)" }}>{attachments.length}</span> attachments
          </span>
          <button
            onClick={() => setShowUpload(true)}
            className="ml-auto px-4 py-1.5 text-xs font-700 rounded"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            + Add Attachment
          </button>
        </div>

        {/* Category filter */}
        <div className="px-5 py-3 border-b overflow-x-auto" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-1.5">
            <button
              onClick={() => setActiveCategory("All")}
              className="px-2.5 py-1 text-xs font-600 rounded-full shrink-0"
              style={{
                background: activeCategory === "All" ? "var(--primary)" : "var(--secondary)",
                color: activeCategory === "All" ? "var(--primary-foreground)" : "var(--muted-foreground)",
              }}
            >
              All ({attachments.length})
            </button>
            {CATEGORIES.filter((c) => countByCategory[c] > 0 || true).map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className="px-2.5 py-1 text-xs font-600 rounded-full shrink-0"
                style={{
                  background: activeCategory === c ? catColor[c] : "var(--secondary)",
                  color: activeCategory === c ? "#fff" : "var(--muted-foreground)",
                }}
              >
                {c} {countByCategory[c] > 0 ? `(${countByCategory[c]})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: "var(--muted-foreground)" }}>
              <Paperclip size={28} strokeWidth={1.7} aria-hidden="true" />
              <span className="text-sm">No attachments in this category</span>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {filtered.map((a) => (
                <div key={a.id} className="px-5 py-4">
                  {renaming === a.id ? (
                    <div className="flex gap-2 mb-2">
                      <input
                        value={renameName}
                        onChange={(e) => setRenameName(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs rounded border outline-none"
                        style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                        autoFocus
                      />
                      <button onClick={() => handleRename(a.id)} className="px-2 py-1 text-xs rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Save</button>
                      <button onClick={() => setRenaming(null)} className="px-2 py-1 text-xs rounded" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="mono text-xs font-700 px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: catColor[a.category] + "22", color: catColor[a.category] }}>
                          {a.type}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-600 truncate" style={{ color: "var(--foreground)" }}>{a.name}</div>
                          <div className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{a.size} · {a.uploadDate}</div>
                        </div>
                      </div>
                      <span
                        className="mono text-xs font-600 px-1.5 py-0.5 rounded shrink-0"
                        style={{ color: statusColor[a.status], background: statusColor[a.status] + "22" }}
                      >
                        {a.status}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: catColor[a.category] + "18", color: catColor[a.category] }}
                    >
                      {a.category}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>by {a.uploadedBy}</span>
                  </div>
                  {a.notes && <p className="text-xs mt-1 italic" style={{ color: "var(--muted-foreground)" }}>{a.notes}</p>}
                  <div className="flex gap-1.5 mt-3">
                    <button className="px-2.5 py-1 text-xs rounded border font-600" style={{ borderColor: "var(--border)", color: "#3b82f6" }}>Preview</button>
                    <button className="px-2.5 py-1 text-xs rounded border font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Download</button>
                    <button
                      onClick={() => { setRenaming(a.id); setRenameName(a.name); }}
                      className="px-2.5 py-1 text-xs rounded border font-600"
                      style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => setConfirmDelete(a.id)}
                      className="px-2.5 py-1 text-xs rounded border font-600 ml-auto"
                      style={{ borderColor: "#ef444440", color: "#ef4444" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete confirmation */}
        {confirmDelete !== null && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: "#00000077" }}>
            <div className="rounded border p-6 w-80" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="font-700 mb-2" style={{ color: "var(--foreground)" }}>Delete Attachment?</h3>
              <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
                This action cannot be undone. The file will be permanently removed.
              </p>
              <div className="flex gap-3">
                <button onClick={() => handleDelete(confirmDelete)}
                  className="flex-1 py-2 text-sm font-700 rounded"
                  style={{ background: "#ef4444", color: "#fff" }}>
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2 text-sm rounded border"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload modal */}
        {showUpload && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: "#00000077" }}>
            <div className="rounded border p-6 w-80" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="font-700 mb-4" style={{ color: "var(--foreground)" }}>Add Attachment</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-600 block mb-1" style={{ color: "var(--muted-foreground)" }}>File Name *</label>
                  <input type="text" value={uploadForm.name} onChange={(e) => setUploadForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. passport_scan.pdf"
                    className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                </div>
                <div>
                  <label className="text-xs font-600 block mb-1" style={{ color: "var(--muted-foreground)" }}>Category *</label>
                  <select value={uploadForm.category} onChange={(e) => setUploadForm((f) => ({ ...f, category: e.target.value as typeof CATEGORIES[number] }))}
                    className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-600 block mb-1" style={{ color: "var(--muted-foreground)" }}>Notes</label>
                  <textarea value={uploadForm.notes} onChange={(e) => setUploadForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2} placeholder="Optional description..."
                    className="w-full px-3 py-2 text-sm rounded border outline-none resize-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                </div>
                <div className="flex items-center justify-center gap-2 rounded border-2 border-dashed p-4 cursor-pointer"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  <FolderOpen size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span className="text-xs text-center">Click to select file or drag & drop<br />PDF, DOC, JPG, PNG up to 20MB</span>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleUpload}
                  className="flex-1 py-2 text-sm font-700 rounded"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                  Upload
                </button>
                <button onClick={() => setShowUpload(false)}
                  className="flex-1 py-2 text-sm rounded border"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
