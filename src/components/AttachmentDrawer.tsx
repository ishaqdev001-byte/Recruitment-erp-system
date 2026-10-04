import { useState } from "react";
import { FolderOpen, Paperclip, X } from "lucide-react";
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

export default function AttachmentDrawer({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
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
