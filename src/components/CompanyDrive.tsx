"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronRight, Cloud, File, FilePlus2, Folder, FolderInput, FolderPlus, HardDriveDownload, House, Pencil, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";

type DriveCategory = "shared" | "finance";
type DriveItem = {
  id: string;
  parent_id: string | null;
  item_type: "folder" | "file";
  category: DriveCategory;
  name: string;
  is_system: boolean;
  file_type: string | null;
  mime_type: string | null;
  file_size: number | null;
  source_type: "invoice" | "receipt" | null;
  source_id: string | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: string;
  updated_at: string;
  created_by_name: string;
  modified_by_name: string;
};
type DrivePermissions = { canUpload: boolean; canEdit: boolean; canMove: boolean; canDeleteAny: boolean; canDeleteOwn: boolean; canManage: boolean };
type DrivePayload = { items: DriveItem[]; currentUserId: string; companyRoot: { id: string; name: string } | null; personalFolder: { id: string; name: string } | null; permissions: DrivePermissions; error?: string };
type Breadcrumb = { id: string | null; name: string };

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const fileTypeLabel = (item: DriveItem) => item.item_type === "folder" ? "Folder" : (item.file_type ?? "File").toUpperCase();
const sizeLabel = (size: number | null) => {
  if (size === null) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};
const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const initials = (value: string) => {
  const words = value.toLocaleUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 3).map((word) => word[0]).join("") : (words[0] ?? "CO").slice(0, 3)) || "CO";
};

export default function CompanyDrive({ companyName }: { companyName: string }) {
  const [category, setCategory] = useState<DriveCategory>("shared");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: "Shared drive" }]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [permissions, setPermissions] = useState<DrivePermissions>({ canUpload: false, canEdit: false, canMove: false, canDeleteAny: false, canDeleteOwn: false, canManage: false });
  const [currentUserId, setCurrentUserId] = useState("");
  const [companyRoot, setCompanyRoot] = useState<{ id: string; name: string } | null>(null);
  const [personalFolder, setPersonalFolder] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [desktopPromptOpen, setDesktopPromptOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DriveItem | null>(null);
  const [editName, setEditName] = useState("");
  const [movingItem, setMovingItem] = useState<DriveItem | null>(null);
  const [folders, setFolders] = useState<DriveItem[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [deletingItem, setDeletingItem] = useState<DriveItem | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ category });
      if (currentFolderId) params.set("parentId", currentFolderId);
      try {
        const response = await fetch(`/api/drive?${params}`, { cache: "no-store" });
        const payload = await response.json() as DrivePayload;
        if (!response.ok) throw new Error(payload.error ?? "Unable to load company drive.");
        if (!cancelled) {
          setItems(payload.items ?? []);
          setPermissions(payload.permissions);
          setCurrentUserId(payload.currentUserId);
          if (payload.companyRoot) setCompanyRoot(payload.companyRoot);
          if (payload.personalFolder) setPersonalFolder(payload.personalFolder);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load company drive.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [category, currentFolderId, reloadKey]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredItems = useMemo(() => items.filter((item) => `${item.name} ${item.created_by_name} ${item.modified_by_name} ${item.file_type ?? ""} ${item.source_type ?? ""}`.toLocaleLowerCase().includes(normalizedSearch)), [items, normalizedSearch]);
  const syncedCount = items.filter((item) => item.item_type === "file").length;
  const canDelete = (item: DriveItem) => permissions.canDeleteAny
    || (item.category === "finance" && permissions.canManage)
    || (!item.is_system && permissions.canDeleteOwn && item.created_by === currentUserId);

  const switchCategory = (next: DriveCategory) => {
    setCategory(next);
    setCurrentFolderId(null);
    setBreadcrumbs([{ id: null, name: next === "shared" ? "Shared drive" : "Finance" }]);
    setSearch("");
    setError("");
  };

  const openFolder = (item: DriveItem) => {
    setCurrentFolderId(item.id);
    setBreadcrumbs((current) => [...current, { id: item.id, name: item.name }]);
    setSearch("");
  };

  const goToBreadcrumb = (index: number) => {
    const next = breadcrumbs[index];
    setCurrentFolderId(next.id);
    setBreadcrumbs((current) => current.slice(0, index + 1));
    setSearch("");
  };

  const openPersonalFolder = () => {
    if (!personalFolder) return;
    setCategory("shared");
    setCurrentFolderId(personalFolder.id);
    setBreadcrumbs([{ id: null, name: "Shared drive" }, ...(companyRoot ? [{ id: companyRoot.id, name: companyRoot.name }] : []), { id: personalFolder.id, name: personalFolder.name }]);
    setSearch("");
  };

  const createFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, parentId: currentFolderId, name: folderName }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to create folder.");
      setShowNewFolder(false);
      setFolderName("");
      setNotice("Folder created in the company drive.");
      setReloadKey((key) => key + 1);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create folder.");
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("category", category);
      if (currentFolderId) formData.set("parentId", currentFolderId);
      const response = await fetch("/api/drive", { method: "POST", body: formData });
      const payload = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to upload file.");
      setNotice(payload.status === "synced" ? "File uploaded and synced to company storage." : "File uploaded.");
      setReloadKey((key) => key + 1);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload file.");
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  };

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/drive/${encodeURIComponent(editingItem.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to rename item.");
      setEditingItem(null);
      setReloadKey((key) => key + 1);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Unable to rename item.");
    } finally {
      setSaving(false);
    }
  };

  const openMoveDialog = async (item: DriveItem) => {
    setMovingItem(item);
    setDestinationId("");
    setError("");
    try {
      const response = await fetch(`/api/drive?category=${category}&allFolders=true`, { cache: "no-store" });
      const payload = await response.json() as DrivePayload;
      if (!response.ok) throw new Error(payload.error ?? "Unable to load destination folders.");
      setFolders(payload.items.filter((folder) => folder.id !== item.id));
      setDestinationId(payload.companyRoot?.id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load destination folders.");
    }
  };

  const moveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!movingItem) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/drive/${encodeURIComponent(movingItem.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: destinationId || null }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to move item.");
      setMovingItem(null);
      setReloadKey((key) => key + 1);
      setNotice("Item moved.");
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Unable to move item.");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async () => {
    if (!deletingItem) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/drive/${encodeURIComponent(deletingItem.id)}`, { method: "DELETE" });
      const payload = response.status === 204 ? {} : await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete item.");
      setDeletingItem(null);
      setReloadKey((key) => key + 1);
      setNotice("Item deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete item.");
    } finally {
      setSaving(false);
    }
  };

  const downloadFile = async (item: DriveItem) => {
    setError("");
    try {
      const response = await fetch(`/api/drive/${encodeURIComponent(item.id)}`);
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Unable to download file.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = item.name;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download file.");
    }
  };

  const rootLabel = category === "shared" ? companyRoot?.name ?? "Company drive" : "Finance";

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="document-mgt-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><HardDriveDownload size={18} aria-hidden="true" style={{ color: "var(--primary)" }} /><h1 id="document-mgt-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Document Mgt</h1></div>
          <p className="mt-1 truncate text-sm" style={{ color: "var(--muted-foreground)" }}>{initials(companyName)} / {breadcrumbs.map((crumb) => crumb.name).join(" / ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {category === "shared" && <button type="button" onClick={() => setDesktopPromptOpen(true)} className="inline-flex items-center gap-2 border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Cloud size={15} aria-hidden="true" />Set up desktop sync</button>}
          <button type="button" disabled={!permissions.canUpload || loading || saving} onClick={() => setShowNewFolder(true)} className="inline-flex items-center gap-2 border px-3 py-2 text-sm font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><FolderPlus size={15} aria-hidden="true" />New folder</button>
          <button type="button" disabled={!permissions.canUpload || loading || saving} onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Upload size={15} aria-hidden="true" />Upload</button>
          <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(event) => void uploadFile(event)} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 border-r p-3 md:block" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="mb-2 px-2 text-[10px] font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Storage</div>
          <button type="button" onClick={() => switchCategory("shared")} className="mb-1 flex w-full items-center gap-2 px-2 py-2 text-left text-sm font-600" style={{ background: category === "shared" ? "var(--secondary)" : "transparent", color: category === "shared" ? "var(--primary)" : "var(--muted-foreground)" }}><House size={15} aria-hidden="true" />Shared drive</button>
          <button type="button" disabled={!personalFolder} onClick={openPersonalFolder} className="mb-1 flex w-full items-center gap-2 px-2 py-2 text-left text-sm disabled:opacity-50" style={{ background: currentFolderId === personalFolder?.id ? "var(--secondary)" : "transparent", color: "var(--foreground)" }}><Folder size={15} aria-hidden="true" />My folder</button>
          {permissions.canManage && <button type="button" onClick={() => switchCategory("finance")} className="mt-4 flex w-full items-center gap-2 border-t px-2 py-3 text-left text-sm font-600" style={{ borderColor: "var(--border)", color: category === "finance" ? "var(--primary)" : "var(--muted-foreground)" }}><FilePlus2 size={15} aria-hidden="true" />Finance files</button>}
          <div className="mt-5 border-t px-2 pt-4" style={{ borderColor: "var(--border)" }}><div className="flex items-center gap-2 text-xs font-600" style={{ color: "var(--foreground)" }}><Cloud size={14} aria-hidden="true" style={{ color: "#168358" }} />InterServer storage</div><p className="mt-1 text-[11px] leading-4" style={{ color: "var(--muted-foreground)" }}>Uploaded files sync to company storage.</p></div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm" aria-label="Folder path">
              {breadcrumbs.map((crumb, index) => <span key={`${crumb.id ?? "root"}-${index}`} className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => goToBreadcrumb(index)} className="max-w-40 truncate px-1 py-1" style={{ color: index === breadcrumbs.length - 1 ? "var(--foreground)" : "var(--muted-foreground)" }}>{crumb.name}</button>{index < breadcrumbs.length - 1 && <ChevronRight size={14} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />}</span>)}
            </nav>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <label className="flex min-w-0 flex-1 items-center gap-2 border px-3 sm:w-64" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}><Search size={14} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search drive" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this folder" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
              <button type="button" onClick={() => setReloadKey((key) => key + 1)} aria-label="Refresh files" title="Refresh" className="flex h-9 w-9 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}><RefreshCw size={15} aria-hidden="true" /></button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}><span>{filteredItems.length} items</span><span aria-hidden="true">·</span><span>{syncedCount} synced</span></div>
            <div className="flex items-center gap-2 md:hidden">
              <button type="button" onClick={() => switchCategory("shared")} className="border px-2 py-1 text-xs" style={{ borderColor: "var(--border)", color: category === "shared" ? "var(--primary)" : "var(--muted-foreground)" }}>Shared</button>
              {permissions.canManage && <button type="button" onClick={() => switchCategory("finance")} className="border px-2 py-1 text-xs" style={{ borderColor: "var(--border)", color: category === "finance" ? "var(--primary)" : "var(--muted-foreground)" }}>Finance</button>}
            </div>
          </div>

          {error && <div role="alert" className="mx-4 mt-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          {notice && <div role="status" className="mx-4 mt-3 flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400"><Check size={15} aria-hidden="true" />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message" className="ml-auto"><X size={15} aria-hidden="true" /></button></div>}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-260 text-sm">
              <thead className="sticky top-0 z-10" style={{ background: "var(--card)" }}><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Name", "Status", "Date modified", "Date created", "Type", "Size", "Created by", "Edited by", ""].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-[10px] font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading {rootLabel.toLocaleLowerCase()}…</td></tr>}
                {!loading && !error && filteredItems.map((item) => {
                  const canDeleteItem = canDelete(item);
                  const canEditItem = permissions.canEdit && !item.is_system;
                  const Icon = item.item_type === "folder" ? Folder : File;
                  return <tr key={item.id} className="border-b transition-colors hover:bg-black/2.5" style={{ borderColor: "var(--border)" }}>
                    <td className="max-w-72 px-3 py-2.5"><div className="flex min-w-0 items-center gap-2"><Icon size={17} aria-hidden="true" style={{ color: item.item_type === "folder" ? "#bf8b2e" : "var(--primary)" }} />{item.item_type === "folder" ? <button type="button" onClick={() => openFolder(item)} className="truncate text-left text-xs font-600" style={{ color: "var(--foreground)" }}>{item.name}</button> : <span className="truncate text-xs font-600" style={{ color: "var(--foreground)" }}>{item.name}</span>}</div></td>
                    <td className="whitespace-nowrap px-3 py-2.5">{item.item_type === "file" ? <span className="inline-flex items-center gap-1 text-[11px] font-600" style={{ color: "#168358" }}><Check size={13} aria-hidden="true" />Synced</span> : <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Ready</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11px]" style={{ color: "var(--muted-foreground)" }}>{dateLabel(item.updated_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11px]" style={{ color: "var(--muted-foreground)" }}>{dateLabel(item.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11px] uppercase" style={{ color: "var(--muted-foreground)" }}>{fileTypeLabel(item)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 mono text-[11px]" style={{ color: "var(--muted-foreground)" }}>{sizeLabel(item.file_size)}</td>
                    <td className="max-w-36 truncate px-3 py-2.5 text-[11px]" style={{ color: "var(--muted-foreground)" }}>{item.created_by_name}</td>
                    <td className="max-w-36 truncate px-3 py-2.5 text-[11px]" style={{ color: "var(--muted-foreground)" }}>{item.modified_by_name}</td>
                    <td className="whitespace-nowrap px-2 py-2"><div className="flex items-center gap-1">
                      {item.item_type === "file" && <button type="button" aria-label={`Download ${item.name}`} title="Download" onClick={() => void downloadFile(item)} className="p-1.5" style={{ color: "var(--muted-foreground)" }}><ArrowDownToLine size={15} aria-hidden="true" /></button>}
                      {permissions.canMove && !item.is_system && <button type="button" aria-label={`Move ${item.name}`} title="Move" onClick={() => void openMoveDialog(item)} className="p-1.5" style={{ color: "var(--muted-foreground)" }}><FolderInput size={15} aria-hidden="true" /></button>}
                      {canEditItem && <button type="button" aria-label={`Rename ${item.name}`} title="Rename" onClick={() => { setEditingItem(item); setEditName(item.name); }} className="p-1.5" style={{ color: "var(--muted-foreground)" }}><Pencil size={14} aria-hidden="true" /></button>}
                      {canDeleteItem && <button type="button" aria-label={`Delete ${item.name}`} title="Delete" onClick={() => setDeletingItem(item)} className="p-1.5" style={{ color: "#b43c45" }}><Trash2 size={15} aria-hidden="true" /></button>}
                    </div></td>
                  </tr>;
                })}
                {!loading && !error && filteredItems.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{search ? "No items match your search." : "This folder is empty."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showNewFolder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewFolder(false); }}>
        <form onSubmit={createFolder} className="w-full max-w-md border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Create folder</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Add a folder to {rootLabel}.</p></div><button type="button" onClick={() => setShowNewFolder(false)} aria-label="Close folder form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Folder name<input required maxLength={255} autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Creating…" : "Create folder"}</button><button type="button" onClick={() => setShowNewFolder(false)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}

      {editingItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingItem(null); }}>
        <form onSubmit={saveName} className="w-full max-w-md border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Rename item</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{editingItem.name}</p></div><button type="button" onClick={() => setEditingItem(null)} aria-label="Close rename form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Name<input required maxLength={255} value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save name"}</button><button type="button" onClick={() => setEditingItem(null)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}

      {movingItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setMovingItem(null); }}>
        <form onSubmit={moveItem} className="w-full max-w-md border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Move item</h2><p className="mt-1 truncate text-sm" style={{ color: "var(--muted-foreground)" }}>{movingItem.name}</p></div><button type="button" onClick={() => setMovingItem(null)} aria-label="Close move form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Destination<select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}><option value={companyRoot?.id ?? ""}>{rootLabel}</option>{folders.filter((folder) => folder.id !== companyRoot?.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Moving…" : "Move here"}</button><button type="button" onClick={() => setMovingItem(null)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}

      {deletingItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeletingItem(null); }}>
        <div className="w-full max-w-md border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Delete {deletingItem.item_type}?</h2><p className="mt-2 wrap-break-word text-sm" style={{ color: "var(--muted-foreground)" }}>{deletingItem.name}{deletingItem.item_type === "folder" ? " must be empty before it can be deleted." : " will be removed from company storage."}</p>
          <div className="mt-6 flex gap-3"><button type="button" disabled={saving} onClick={() => void deleteItem()} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "#b43c45", color: "white" }}>{saving ? "Deleting…" : "Delete"}</button><button type="button" onClick={() => setDeletingItem(null)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </div>
      </div>}

      {desktopPromptOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDesktopPromptOpen(false); }}>
        <div className="w-full max-w-lg border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Desktop sync</h2><p className="mt-2 text-sm leading-6" style={{ color: "var(--muted-foreground)" }}>Your personal folder is in the company drive, and uploads from this workspace sync to InterServer storage. A browser cannot create a folder on your computer or keep local files synchronized. That requires a separately installed sync client or a mounted network share.</p></div><button type="button" onClick={() => setDesktopPromptOpen(false)} aria-label="Close desktop sync information" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <div className="mt-5 flex gap-3"><button type="button" onClick={() => { setDesktopPromptOpen(false); openPersonalFolder(); }} className="flex-1 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Open my drive folder</button><button type="button" onClick={() => setDesktopPromptOpen(false)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Close</button></div>
        </div>
      </div>}
    </section>
  );
}
