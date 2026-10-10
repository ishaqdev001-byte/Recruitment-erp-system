"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronRight, Cloud, Eye, File, FilePlus2, Folder, FolderInput, FolderPlus, HardDriveDownload, LayoutGrid, List, Pencil, RefreshCw, Search, Trash2, Upload, Users, X } from "lucide-react";

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
type DrivePermissions = { canUpload: boolean; canEdit: boolean; canMove: boolean; canDeleteAny: boolean; canDeleteOwn: boolean; canManage: boolean; canViewFinance: boolean };
type DrivePayload = { items: DriveItem[]; currentUserId: string; isPrimaryCompanyUser: boolean; companyRoot: { id: string; name: string } | null; usersFolder: { id: string; name: string } | null; personalFolder: { id: string; name: string } | null; permissions: DrivePermissions; error?: string };
type CandidateFolder = { id: string; file_number: string; first_name: string; last_name: string; created_at: string };
type CandidateDocument = { id: string; file_name: string; file_type: string; file_size: number; document_type: string; created_at: string; uploaded_by_name: string; updated_by_name: string; canDelete: boolean; canEdit: boolean };
type BrowseSection = "drive" | "candidates" | "candidate-documents";
type ExplorerEntry = { id: string; kind: "folder" | "candidate" | "file" | "document"; name: string; addedAt: string | null; size: number | null; creator: string; lastEditedBy: string; searchText?: string; source: DriveItem | CandidateFolder | CandidateDocument };
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
  const [browseSection, setBrowseSection] = useState<BrowseSection>("drive");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: "All files" }]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateFolder[]>([]);
  const [candidateDocuments, setCandidateDocuments] = useState<CandidateDocument[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateFolder | null>(null);
  const [viewMode, setViewMode] = useState<"icons" | "list">("list");
  const [permissions, setPermissions] = useState<DrivePermissions>({ canUpload: false, canEdit: false, canMove: false, canDeleteAny: false, canDeleteOwn: false, canManage: false, canViewFinance: false });
  const [currentUserId, setCurrentUserId] = useState("");
  const [isPrimaryCompanyUser, setIsPrimaryCompanyUser] = useState(false);
  const [companyRoot, setCompanyRoot] = useState<{ id: string; name: string } | null>(null);
  const [usersFolder, setUsersFolder] = useState<{ id: string; name: string } | null>(null);
  const [personalFolder, setPersonalFolder] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [desktopPromptOpen, setDesktopPromptOpen] = useState(false);
  const [mountInfo, setMountInfo] = useState<{ id: string; label: string; username: string; password: string; webdavUrl: string } | null>(null);
  const [mountBusy, setMountBusy] = useState(false);
  const [editingItem, setEditingItem] = useState<DriveItem | null>(null);
  const [editingCandidateDocument, setEditingCandidateDocument] = useState<CandidateDocument | null>(null);
  const [editName, setEditName] = useState("");
  const [movingItem, setMovingItem] = useState<DriveItem | null>(null);
  const [folders, setFolders] = useState<DriveItem[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [deletingItem, setDeletingItem] = useState<DriveItem | null>(null);
  const [deletingCandidateDocument, setDeletingCandidateDocument] = useState<CandidateDocument | null>(null);
  const [selectedItem, setSelectedItem] = useState<DriveItem | null>(null);
  const [backupProgress, setBackupProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

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
          setIsPrimaryCompanyUser(payload.isPrimaryCompanyUser);
          if (payload.companyRoot) setCompanyRoot(payload.companyRoot);
          if (payload.usersFolder) setUsersFolder(payload.usersFolder);
          if (payload.personalFolder) setPersonalFolder(payload.personalFolder);
          else if (payload.isPrimaryCompanyUser) setPersonalFolder(null);
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

  useEffect(() => {
    if (browseSection !== "candidates") return;
    let cancelled = false;
    const loadCandidates = async () => {
      setCandidateLoading(true);
      setError("");
      try {
        const response = await fetch("/api/candidates", { cache: "no-store" });
        const payload = await response.json() as { candidates?: CandidateFolder[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load candidate folders.");
        if (!cancelled) setCandidates(payload.candidates ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load candidate folders.");
      } finally {
        if (!cancelled) setCandidateLoading(false);
      }
    };
    void loadCandidates();
    return () => { cancelled = true; };
  }, [browseSection, reloadKey]);

  useEffect(() => {
    if (browseSection !== "candidate-documents" || !selectedCandidate) return;
    let cancelled = false;
    const loadDocuments = async () => {
      setDocumentLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/candidates/${encodeURIComponent(selectedCandidate.id)}/documents`, { cache: "no-store" });
        const payload = await response.json() as { documents?: CandidateDocument[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load candidate documents.");
        if (!cancelled) setCandidateDocuments(payload.documents ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load candidate documents.");
      } finally {
        if (!cancelled) setDocumentLoading(false);
      }
    };
    void loadDocuments();
    return () => { cancelled = true; };
  }, [browseSection, reloadKey, selectedCandidate]);

  useEffect(() => {
    let cancelled = false;
    const loadMount = async () => {
      try {
        const response = await fetch("/api/drive/mount", { cache: "no-store" });
        const payload = await response.json() as { mount?: { id: string; label: string; createdAt: string; lastUsedAt?: string | null; revokedAt?: string | null } | null; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load the drive mount.");
        if (!cancelled && payload.mount) {
          setMountInfo({ id: payload.mount.id, label: payload.mount.label, username: "", password: "", webdavUrl: "" });
        }
      } catch {
        // The mount is optional at first use.
      }
    };
    void loadMount();
    return () => { cancelled = true; };
  }, []);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredItems = useMemo(() => items.filter((item) => `${item.name} ${item.created_by_name} ${item.modified_by_name} ${item.file_type ?? ""} ${item.source_type ?? ""}`.toLocaleLowerCase().includes(normalizedSearch)), [items, normalizedSearch]);
  const canDelete = (item: DriveItem) => permissions.canDeleteAny
    || (item.category === "finance" && permissions.canManage)
    || (!item.is_system && permissions.canDeleteOwn && item.created_by === currentUserId);

  const switchCategory = (next: DriveCategory) => {
    setBrowseSection("drive");
    setCategory(next);
    setCurrentFolderId(null);
    setBreadcrumbs([{ id: null, name: next === "shared" ? "All files" : "Finance" }]);
    setSearch("");
    setError("");
    setSelectedItem(null);
  };

  const openCandidatesFolder = () => {
    setBrowseSection("candidates");
    setSelectedCandidate(null);
    setCategory("shared");
    setCurrentFolderId(null);
    setBreadcrumbs([{ id: null, name: companyRoot?.name ?? "Company" }, { id: "candidate-root", name: "Candidates" }]);
    setSearch("");
    setSelectedItem(null);
  };

  const openAllFiles = () => {
    setBrowseSection("drive");
    setCategory("shared");
    setCurrentFolderId(null);
    setBreadcrumbs([{ id: null, name: "All files" }]);
    setSearch("");
    setSelectedItem(null);
  };

  const openUsersFolder = () => {
    if (!usersFolder) return;
    setBrowseSection("drive");
    setCategory("shared");
    setCurrentFolderId(usersFolder.id);
    setBreadcrumbs([{ id: null, name: companyRoot?.name ?? "Company" }, { id: usersFolder.id, name: usersFolder.name }]);
    setSearch("");
    setSelectedItem(null);
  };

  const openCandidateFolder = (candidate: CandidateFolder) => {
    setSelectedCandidate(candidate);
    setBrowseSection("candidate-documents");
    setSelectedItem(null);
    setBreadcrumbs([
      { id: null, name: companyRoot?.name ?? "Company" },
      { id: "candidate-root", name: "Candidates" },
      { id: candidate.id, name: `${candidate.first_name} ${candidate.last_name}` },
    ]);
    setSearch("");
  };

  const goToBreadcrumb = (index: number) => {
    if (browseSection !== "drive") {
      if (index === 0) {
        setBrowseSection("drive");
        setSelectedCandidate(null);
        switchCategory("shared");
      } else if (index === 1) {
        openCandidatesFolder();
      } else if (index === 2 && selectedCandidate) {
        openCandidateFolder(selectedCandidate);
      }
      return;
    }
    const next = breadcrumbs[index];
    setCurrentFolderId(next.id);
    setBreadcrumbs((current) => current.slice(0, index + 1));
    setSearch("");
    setSelectedItem(null);
  };

  const openPersonalFolder = () => {
    if (!personalFolder) return;
    setBrowseSection("drive");
    setCategory("shared");
    setCurrentFolderId(personalFolder.id);
    setBreadcrumbs([{ id: null, name: companyRoot?.name ?? "Company" }, ...(usersFolder ? [{ id: usersFolder.id, name: usersFolder.name }] : []), { id: personalFolder.id, name: personalFolder.name }]);
    setSearch("");
    setSelectedItem(null);
  };

  const openQuickAccess = (target: "all-files" | "finance" | "candidates" | "users" | "personal") => {
    if (target === "all-files") openAllFiles();
    else if (target === "finance") switchCategory("finance");
    else if (target === "candidates") openCandidatesFolder();
    else if (target === "users") openUsersFolder();
    else openPersonalFolder();
  };

  const selectItem = (item: DriveItem) => {
    setSelectedItem(item);
  };

  const openFolder = (item: DriveItem) => {
    setCurrentFolderId(item.id);
    setBreadcrumbs((current) => [...current, { id: item.id, name: item.name }]);
    setSearch("");
    setSelectedItem(null);
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

  const ensureBackupFolder = async (parentId: string, name: string) => {
    const response = await fetch("/api/drive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "shared", parentId, name }),
    });
    const payload = await response.json() as { item?: DriveItem; error?: string };
    if (response.ok && payload.item) return payload.item.id;
    if (response.status !== 409) throw new Error(payload.error ?? `Unable to create folder ${name}.`);

    const listResponse = await fetch(`/api/drive?category=shared&parentId=${encodeURIComponent(parentId)}`, { cache: "no-store" });
    const listPayload = await listResponse.json() as DrivePayload;
    if (!listResponse.ok) throw new Error(listPayload.error ?? `Unable to look up folder ${name}.`);
    const existing = listPayload.items.find((item) => item.item_type === "folder" && item.name === name && item.created_by === currentUserId);
    if (!existing) throw new Error(`A folder named ${name} already exists and belongs to another user.`);
    return existing.id;
  };

  const syncFolder = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []) as (File & { webkitRelativePath?: string })[];
    event.target.value = "";
    if (!files.length) return;
    if (!personalFolder || !permissions.canUpload) {
      setError("Your personal drive folder is not available for sync.");
      return;
    }

    const rootName = files[0].webkitRelativePath?.split("/").filter(Boolean)[0];
    if (!rootName) {
      setError("The selected folder could not be read by this browser.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    setBackupProgress({ done: 0, total: files.length });
    let uploaded = 0;
    let backupRootId = "";
    try {
      backupRootId = await ensureBackupFolder(personalFolder.id, rootName);
      const folderIds = new Map<string, string>([["", backupRootId]]);

      for (const file of files) {
        const relativeParts = (file.webkitRelativePath || file.name).split("/").filter(Boolean);
        let parentId = backupRootId;
        let currentPath = "";
        for (const folderName of relativeParts.slice(1, -1)) {
          currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
          let folderId = folderIds.get(currentPath);
          if (!folderId) {
            folderId = await ensureBackupFolder(parentId, folderName);
            folderIds.set(currentPath, folderId);
          }
          parentId = folderId;
        }

        const formData = new FormData();
        formData.set("file", file, file.name);
        formData.set("category", "shared");
        formData.set("parentId", parentId);
        formData.set("replaceExisting", "true");
        const response = await fetch("/api/drive", { method: "POST", body: formData });
        const payload = await response.json() as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? `Sync stopped at ${file.name}.`);
        }
        uploaded += 1;
        setBackupProgress({ done: uploaded, total: files.length });
      }

      setCategory("shared");
      setCurrentFolderId(backupRootId);
      setBreadcrumbs([
        { id: null, name: "Shared drive" },
        ...(companyRoot ? [{ id: companyRoot.id, name: companyRoot.name }] : []),
        { id: personalFolder.id, name: personalFolder.name },
        { id: backupRootId, name: rootName },
      ]);
      setSearch("");
      setSelectedItem(null);
      setNotice(`Synced ${uploaded} files from ${rootName} to your drive folder.`);
      setReloadKey((key) => key + 1);
    } catch (backupError) {
      setError(`${backupError instanceof Error ? backupError.message : "Folder sync failed."}${uploaded ? ` ${uploaded} of ${files.length} files were synced.` : ""}`);
      if (backupRootId) {
        setCategory("shared");
        setCurrentFolderId(backupRootId);
        setReloadKey((key) => key + 1);
      }
    } finally {
      setSaving(false);
      setBackupProgress(null);
    }
  };

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem && !editingCandidateDocument) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(editingItem
        ? `/api/drive/${encodeURIComponent(editingItem.id)}`
        : `/api/candidate-documents/${encodeURIComponent(editingCandidateDocument!.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingItem ? { name: editName } : { fileName: editName }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to rename item.");
      setEditingItem(null);
      setEditingCandidateDocument(null);
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
      setSelectedItem(null);
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

  const downloadFolder = async (item: DriveItem) => {
    setError("");
    try {
      const response = await fetch(`/api/drive/${encodeURIComponent(item.id)}?download=zip`);
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Unable to download folder.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${item.name}.zip`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download folder.");
    }
  };

  const rootLabel = category === "shared" ? companyRoot?.name ?? "Company drive" : "Finance";
  const driveEntries: ExplorerEntry[] = filteredItems.map((item) => ({
    id: item.id,
    kind: item.item_type,
    name: item.name,
    addedAt: item.created_at,
    size: item.file_size,
    creator: item.created_by_name || "—",
    lastEditedBy: item.modified_by_name || "—",
    source: item,
  }));
  const candidateEntries: ExplorerEntry[] = candidates.map((candidate) => ({
    id: candidate.id,
    kind: "candidate",
    name: `${candidate.first_name} ${candidate.last_name}`.trim(),
    addedAt: candidate.created_at,
    size: null,
    creator: "—",
    lastEditedBy: "—",
    searchText: candidate.file_number,
    source: candidate,
  }));
  const documentEntries: ExplorerEntry[] = candidateDocuments.map((document) => ({
    id: document.id,
    kind: "document",
    name: document.file_name,
    addedAt: document.created_at,
    size: document.file_size,
    creator: document.uploaded_by_name || "—",
    lastEditedBy: document.updated_by_name || document.uploaded_by_name || "—",
    source: document,
  }));
  const allExplorerEntries = browseSection === "drive" ? driveEntries : browseSection === "candidates" ? candidateEntries : documentEntries;
  const explorerEntries = allExplorerEntries.filter((entry) => `${entry.name} ${entry.creator} ${entry.searchText ?? ""}`.toLocaleLowerCase().includes(normalizedSearch));
  const explorerLoading = browseSection === "drive" ? loading : browseSection === "candidates" ? candidateLoading : documentLoading;
  const sectionLabel = browseSection === "candidates" ? "Candidates" : browseSection === "candidate-documents" ? `${selectedCandidate?.first_name ?? ""} ${selectedCandidate?.last_name ?? ""}`.trim() : rootLabel;

  const openExplorerEntry = (entry: ExplorerEntry) => {
    if (entry.kind === "folder") openFolder(entry.source as DriveItem);
    else if (entry.kind === "candidate") openCandidateFolder(entry.source as CandidateFolder);
    else if (entry.kind === "file") selectItem(entry.source as DriveItem);
    else void downloadCandidateDocument(entry.source as CandidateDocument);
  };

  const downloadCandidateDocument = async (candidateDocument: CandidateDocument) => {
    setError("");
    try {
      const response = await fetch(`/api/candidate-documents/${encodeURIComponent(candidateDocument.id)}`);
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Unable to download candidate document.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = candidateDocument.file_name;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download candidate document.");
    }
  };

  const viewCandidateDocument = (candidateDocument: CandidateDocument) => {
    window.open(`/api/candidate-documents/${encodeURIComponent(candidateDocument.id)}?disposition=inline`, "_blank", "noopener,noreferrer");
  };

  const deleteCandidateDocument = async () => {
    if (!deletingCandidateDocument) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/candidate-documents/${encodeURIComponent(deletingCandidateDocument.id)}`, { method: "DELETE" });
      const payload = response.status === 204 ? {} : await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete candidate document.");
      setDeletingCandidateDocument(null);
      setReloadKey((key) => key + 1);
      setNotice("Candidate document deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete candidate document.");
    } finally {
      setSaving(false);
    }
  };

  const viewDriveFile = (item: DriveItem) => {
    window.open(`/api/drive/${encodeURIComponent(item.id)}?disposition=inline`, "_blank", "noopener,noreferrer");
  };

  const generateMount = async () => {
    setMountBusy(true);
    setError("");
    try {
      const response = await fetch("/api/drive/mount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", label: `${companyName} network drive` }),
      });
      const payload = await response.json() as { mount?: { id: string; label: string; username: string; password: string; webdavUrl: string }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to create the mounted share.");
      if (payload.mount) setMountInfo(payload.mount);
      setNotice("Mounted network share credential generated.");
    } catch (mountError) {
      setError(mountError instanceof Error ? mountError.message : "Unable to create the mounted share.");
    } finally {
      setMountBusy(false);
    }
  };

  const revokeMount = async () => {
    setMountBusy(true);
    setError("");
    try {
      const response = await fetch("/api/drive/mount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const payload = await response.json() as { revoked?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to revoke the mounted share.");
      setMountInfo(null);
      setNotice("Mounted network share revoked.");
    } catch (mountError) {
      setError(mountError instanceof Error ? mountError.message : "Unable to revoke the mounted share.");
    } finally {
      setMountBusy(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: "linear-gradient(180deg, rgba(15,23,42,0.04), rgba(15,23,42,0.0))" }} aria-labelledby="document-mgt-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-4 sm:px-6" style={{ borderColor: "var(--border)" }}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border" style={{ background: "rgba(59,130,246,0.10)", borderColor: "rgba(96,165,250,0.2)", color: "#60a5fa" }}>
            <HardDriveDownload size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 id="document-mgt-title" className="text-xl font-700 tracking-tight" style={{ color: "var(--foreground)" }}>Document Mgt</h1>
            <p className="mt-1 truncate text-xs" style={{ color: "var(--muted-foreground)" }}>{initials(companyName)} / {breadcrumbs.map((crumb) => crumb.name).join(" / ")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {browseSection === "drive" && category === "shared" && (
            <>
              <button type="button" disabled={!permissions.canUpload || !personalFolder || saving} onClick={() => folderInput.current?.click()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", background: "rgba(148,163,184,0.04)", color: "var(--foreground)" }}>
                <FolderInput size={15} aria-hidden="true" />
                {backupProgress ? `Syncing ${backupProgress.done}/${backupProgress.total}` : "Sync folder"}
              </button>
              <button type="button" onClick={() => setDesktopPromptOpen(true)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", background: "rgba(148,163,184,0.04)", color: "var(--foreground)" }}>
                <Cloud size={15} aria-hidden="true" />
                Desktop access
              </button>
            </>
          )}
          {browseSection === "drive" && <>
            <button type="button" disabled={!permissions.canUpload || loading || saving} onClick={() => setShowNewFolder(true)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", background: "rgba(148,163,184,0.04)", color: "var(--foreground)" }}>
              <FolderPlus size={15} aria-hidden="true" />
              New folder
            </button>
            <button type="button" disabled={!permissions.canUpload || loading || saving} onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-700 shadow-lg disabled:opacity-50" style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
              <Upload size={15} aria-hidden="true" />
              Upload
            </button>
          </>}
          <input ref={fileInput} type="file" className="hidden" onChange={(event) => void uploadFile(event)} />
          <input ref={folderInput} type="file" multiple className="hidden" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(event) => void syncFolder(event)} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="flex w-full shrink-0 flex-row flex-wrap items-center gap-1 border-b p-2 md:w-48 md:flex-col md:flex-nowrap md:items-stretch md:gap-0 md:border-b-0 md:border-r md:p-3" style={{ borderColor: "var(--border)", background: "rgba(15,23,42,0.02)" }}>
          <div className="w-full min-w-0 flex flex-wrap items-center gap-1 md:mb-3 md:flex-col md:items-stretch">
            <div className="mb-2 flex items-center gap-2 px-2 text-[10px] font-700 uppercase tracking-[0.18em]" style={{ color: "var(--muted-foreground)" }}>
              <Folder size={12} aria-hidden="true" />
              Quick access
            </div>

            <button type="button" onClick={() => openQuickAccess("all-files")} className="flex w-auto shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-600 md:w-full md:gap-2.5" style={{ background: browseSection === "drive" && category === "shared" && currentFolderId === null ? "rgba(59,130,246,0.12)" : "transparent", color: browseSection === "drive" && category === "shared" && currentFolderId === null ? "#60a5fa" : "var(--muted-foreground)" }}>
              <Folder size={14} aria-hidden="true" />
              All files
            </button>
            {permissions.canViewFinance && (
              <button type="button" onClick={() => openQuickAccess("finance")} className="flex w-auto shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-600 md:w-full md:gap-2.5" style={{ background: category === "finance" ? "rgba(59,130,246,0.12)" : "transparent", color: category === "finance" ? "#60a5fa" : "var(--muted-foreground)" }}>
                <FilePlus2 size={15} aria-hidden="true" />
                Finance
              </button>
            )}
            <button type="button" onClick={() => openQuickAccess("candidates")} className="flex w-auto shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-600 md:w-full md:gap-2.5" style={{ background: browseSection !== "drive" ? "rgba(59,130,246,0.12)" : "transparent", color: browseSection !== "drive" ? "#60a5fa" : "var(--muted-foreground)" }}>
              <Users size={15} aria-hidden="true" />
              Candidates
            </button>
            {usersFolder && <button type="button" onClick={() => openQuickAccess("users")} className="flex w-auto shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-600 md:w-full md:gap-2.5" style={{ background: currentFolderId === usersFolder.id && browseSection === "drive" ? "rgba(59,130,246,0.12)" : "transparent", color: currentFolderId === usersFolder.id && browseSection === "drive" ? "#60a5fa" : "var(--muted-foreground)" }}>
              <Users size={15} aria-hidden="true" />
              Users
            </button>}
            {!isPrimaryCompanyUser && personalFolder && <button type="button" onClick={() => openQuickAccess("personal")} className="flex w-auto shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-600 md:w-full md:gap-2.5" style={{ background: currentFolderId === personalFolder.id && browseSection === "drive" ? "rgba(59,130,246,0.12)" : "transparent", color: currentFolderId === personalFolder.id && browseSection === "drive" ? "#60a5fa" : "var(--muted-foreground)" }}>
              <Folder size={15} aria-hidden="true" />
              Personal vault
            </button>}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--border)", background: "rgba(15,23,42,0.02)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm" aria-label="Folder path">
                {breadcrumbs.map((crumb, index) => (
                  <span key={`${crumb.id ?? "root"}-${index}`} className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => goToBreadcrumb(index)} className="max-w-40 truncate rounded px-1.5 py-1 text-sm font-600" style={{ color: index === breadcrumbs.length - 1 ? "var(--foreground)" : "var(--muted-foreground)" }}>
                      {crumb.name}
                    </button>
                    {index < breadcrumbs.length - 1 && <ChevronRight size={14} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />}
                  </span>
                ))}
              </nav>

            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 sm:max-w-md" style={{ borderColor: "var(--border)", background: "rgba(148,163,184,0.04)" }}>
                <Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
                <input aria-label="Search drive" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files or folders" className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" style={{ color: "var(--foreground)" }} />
              </label>

              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                <span>{explorerEntries.length} items</span>
                <span aria-hidden="true">·</span>
                <span>{viewMode === "icons" ? "Icon view" : "List view"}</span>
                <button type="button" onClick={() => setViewMode("icons")} aria-label="Icon view" aria-pressed={viewMode === "icons"} title="Icon view" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", background: viewMode === "icons" ? "var(--secondary)" : "transparent", color: "var(--foreground)" }}><LayoutGrid size={15} aria-hidden="true" /></button>
                <button type="button" onClick={() => setViewMode("list")} aria-label="List view" aria-pressed={viewMode === "list"} title="List view" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", background: viewMode === "list" ? "var(--secondary)" : "transparent", color: "var(--foreground)" }}><List size={15} aria-hidden="true" /></button>
                <button type="button" onClick={() => setReloadKey((key) => key + 1)} aria-label="Refresh files" title="Refresh" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}><RefreshCw size={14} aria-hidden="true" /></button>
              </div>
            </div>
          </div>

          {error && <div role="alert" className="mx-4 mt-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          {notice && (
            <div role="status" className="mx-4 mt-3 flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
              <Check size={15} aria-hidden="true" />
              {notice}
              <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message" className="ml-auto">
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
            {explorerLoading ? (
              <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                Loading {sectionLabel.toLocaleLowerCase()}…
              </div>
            ) : !error && explorerEntries.length > 0 && viewMode === "list" ? (
              <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <table className="w-full min-w-160 text-sm">
                  <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["File name", "Date added", "Size", "Creator", "Actions", "Last edited by"].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
                  <tbody>{explorerEntries.map((entry) => <tr key={`${entry.kind}-${entry.id}`} className="border-b last:border-0 hover:bg-black/5" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2.5"><button type="button" onClick={() => openExplorerEntry(entry)} className="flex min-w-0 items-center gap-2 text-left"><span style={{ color: entry.kind === "folder" || entry.kind === "candidate" ? "#d89a28" : "var(--primary)" }}>{entry.kind === "folder" || entry.kind === "candidate" ? <Folder size={17} aria-hidden="true" /> : <File size={16} aria-hidden="true" />}</span><span className="max-w-105 truncate font-600" style={{ color: "var(--foreground)" }}>{entry.name}</span></button></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{entry.addedAt ? dateLabel(entry.addedAt) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{sizeLabel(entry.size)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{entry.creator}</td>
                    <td className="whitespace-nowrap px-4 py-2"><div className="flex items-center gap-1">
                      {entry.kind === "file" && (() => { const item = entry.source as DriveItem; const canPreview = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(item.mime_type ?? ""); return <>
                        {canPreview && <button type="button" onClick={() => viewDriveFile(item)} aria-label={`View ${entry.name}`} title="View" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Eye size={15} aria-hidden="true" /></button>}
                        <button type="button" onClick={() => void downloadFile(item)} aria-label={`Download ${entry.name}`} title="Download" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ArrowDownToLine size={15} aria-hidden="true" /></button>
                        {permissions.canEdit && !item.is_system && <button type="button" onClick={() => { setEditingItem(item); setEditName(item.name); }} aria-label={`Rename ${entry.name}`} title="Rename" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Pencil size={15} aria-hidden="true" /></button>}
                        {canDelete(item) && <button type="button" onClick={() => setDeletingItem(item)} aria-label={`Delete ${entry.name}`} title="Delete" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "#ef444440", color: "#dc2626" }}><Trash2 size={15} aria-hidden="true" /></button>}
                      </>; })()}
                      {entry.kind === "folder" && (() => { const folder = entry.source as DriveItem; return <>
                        <button type="button" onClick={() => void downloadFolder(folder)} aria-label={`Download ${entry.name}`} title="Download folder as ZIP" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ArrowDownToLine size={15} aria-hidden="true" /></button>
                        {permissions.canEdit && !folder.is_system && <button type="button" onClick={() => { setEditingItem(folder); setEditName(folder.name); }} aria-label={`Rename ${entry.name}`} title="Rename" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Pencil size={15} aria-hidden="true" /></button>}
                        {canDelete(folder) && <button type="button" onClick={() => setDeletingItem(folder)} aria-label={`Delete ${entry.name}`} title="Delete folder" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "#ef444440", color: "#dc2626" }}><Trash2 size={15} aria-hidden="true" /></button>}
                      </>; })()}
                      {entry.kind === "document" && (() => { const candidateDocument = entry.source as CandidateDocument; return <>
                        <button type="button" onClick={() => viewCandidateDocument(candidateDocument)} aria-label={`View ${entry.name}`} title="View" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Eye size={15} aria-hidden="true" /></button>
                        <button type="button" onClick={() => void downloadCandidateDocument(candidateDocument)} aria-label={`Download ${entry.name}`} title="Download" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ArrowDownToLine size={15} aria-hidden="true" /></button>
                        {candidateDocument.canEdit && <button type="button" onClick={() => { setEditingCandidateDocument(candidateDocument); setEditName(candidateDocument.file_name); }} aria-label={`Rename ${entry.name}`} title="Rename" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Pencil size={15} aria-hidden="true" /></button>}
                        {candidateDocument.canDelete && <button type="button" onClick={() => setDeletingCandidateDocument(candidateDocument)} aria-label={`Delete ${entry.name}`} title="Delete" className="flex h-8 w-8 items-center justify-center border" style={{ borderColor: "#ef444440", color: "#dc2626" }}><Trash2 size={15} aria-hidden="true" /></button>}
                      </>; })()}
                    </div></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{entry.lastEditedBy}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            ) : !error && explorerEntries.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {explorerEntries.map((entry) => <button key={`${entry.kind}-${entry.id}`} type="button" onClick={() => openExplorerEntry(entry)} className="group flex min-h-42.5 flex-col border p-3 text-left transition-colors hover:bg-black/5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                  <span className="mb-4 flex h-11 w-11 items-center justify-center border" style={{ borderColor: entry.kind === "folder" || entry.kind === "candidate" ? "#d89a2855" : "var(--border)", background: entry.kind === "folder" || entry.kind === "candidate" ? "#d89a2812" : "var(--secondary)", color: entry.kind === "folder" || entry.kind === "candidate" ? "#d89a28" : "var(--primary)" }}>{entry.kind === "folder" || entry.kind === "candidate" ? <Folder size={21} aria-hidden="true" /> : <File size={19} aria-hidden="true" />}</span>
                  <span className="w-full truncate text-sm font-700" style={{ color: "var(--foreground)" }}>{entry.name}</span>
                  <span className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{entry.addedAt ? dateLabel(entry.addedAt) : "—"}</span>
                  <span className="mt-auto pt-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{sizeLabel(entry.size)} · {entry.creator}</span>
                </button>)}
              </div>
            ) : (
              <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                {search ? "No items match your search." : browseSection === "candidates" ? "No candidate folders found." : browseSection === "candidate-documents" ? "This candidate has no uploaded documents." : "This folder is empty."}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedItem && (
        <aside className="detail-panel border-l p-0" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <div className="text-sm font-700" style={{ color: "var(--foreground)" }}>{selectedItem.item_type === "folder" ? "Folder details" : "File details"}</div>
            <button type="button" onClick={() => setSelectedItem(null)} className="flex h-8 w-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }} aria-label="Close details drawer">
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-5 p-4">
            <div className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(59,130,246,0.08)" }}>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border" style={{ borderColor: "rgba(96,165,250,0.25)", background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}>
                {selectedItem.item_type === "folder" ? <Folder size={20} aria-hidden="true" /> : <File size={18} aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-700" style={{ color: "var(--foreground)" }}>{selectedItem.name}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{selectedItem.item_type === "folder" ? "Company folder" : fileTypeLabel(selectedItem)}</div>
              </div>
            </div>

            <div className="space-y-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
              <div className="flex items-center justify-between gap-3"><span>Type</span><span className="font-600" style={{ color: "var(--foreground)" }}>{fileTypeLabel(selectedItem)}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Size</span><span className="font-600" style={{ color: "var(--foreground)" }}>{sizeLabel(selectedItem.file_size)}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Updated</span><span className="font-600" style={{ color: "var(--foreground)" }}>{dateLabel(selectedItem.updated_at)}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Created by</span><span className="font-600" style={{ color: "var(--foreground)" }}>{selectedItem.created_by_name || "—"}</span></div>
            </div>

            <div className="space-y-2">
              {selectedItem.item_type === "file" && (
                <button type="button" onClick={() => void downloadFile(selectedItem)} className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-700" style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
                  <ArrowDownToLine size={15} aria-hidden="true" />
                  Download
                </button>
              )}

              {selectedItem.item_type === "folder" && (
                <button type="button" onClick={() => openFolder(selectedItem)} className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-700" style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
                  <Folder size={15} aria-hidden="true" />
                  Open folder
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {permissions.canMove && !selectedItem.is_system && (
                  <button type="button" onClick={() => void openMoveDialog(selectedItem)} className="rounded-xl border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                    Move
                  </button>
                )}
                {permissions.canEdit && !selectedItem.is_system && (
                  <button type="button" onClick={() => { setEditingItem(selectedItem); setEditName(selectedItem.name); setSelectedItem(null); }} className="rounded-xl border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                    Rename
                  </button>
                )}
                {canDelete(selectedItem) && (
                  <button type="button" onClick={() => { setDeletingItem(selectedItem); setSelectedItem(null); }} className="rounded-xl border px-3 py-2 text-sm font-600" style={{ borderColor: "rgba(239,68,68,0.35)", color: "#f87171" }}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>
      )}

      {showNewFolder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewFolder(false); }}>
        <form onSubmit={createFolder} className="w-full max-w-md rounded-2xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Create folder</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Add a folder in {rootLabel}.</p></div><button type="button" onClick={() => setShowNewFolder(false)} aria-label="Close folder form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Folder name<input required maxLength={255} autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none rounded-xl" style={fieldStyle} /></label>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 rounded-xl py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Creating…" : "Create folder"}</button><button type="button" onClick={() => setShowNewFolder(false)} className="flex-1 rounded-xl border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}

      {(editingItem || editingCandidateDocument) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditingItem(null); setEditingCandidateDocument(null); } }}>
        <form onSubmit={saveName} className="w-full max-w-md rounded-2xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Rename item</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{editingItem?.name ?? editingCandidateDocument?.file_name}</p></div><button type="button" onClick={() => { setEditingItem(null); setEditingCandidateDocument(null); }} aria-label="Close rename form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Name<input required maxLength={255} value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none rounded-xl" style={fieldStyle} /></label>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 rounded-xl py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save name"}</button><button type="button" onClick={() => { setEditingItem(null); setEditingCandidateDocument(null); }} className="flex-1 rounded-xl border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}

      {movingItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setMovingItem(null); }}>
        <form onSubmit={moveItem} className="w-full max-w-md rounded-2xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Move item</h2><p className="mt-1 truncate text-sm" style={{ color: "var(--muted-foreground)" }}>{movingItem.name}</p></div><button type="button" onClick={() => setMovingItem(null)} aria-label="Close move form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Destination<select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none rounded-xl" style={fieldStyle}><option value={companyRoot?.id ?? ""}>{rootLabel}</option>{folders.filter((folder) => folder.id !== companyRoot?.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 rounded-xl py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Moving…" : "Move here"}</button><button type="button" onClick={() => setMovingItem(null)} className="flex-1 rounded-xl border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}

      {deletingItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeletingItem(null); }}>
        <div className="w-full max-w-md rounded-2xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Delete {deletingItem.item_type}?</h2><p className="mt-2 wrap-break-word text-sm" style={{ color: "var(--muted-foreground)" }}>{deletingItem.name}{deletingItem.item_type === "folder" ? " must be empty before it can be deleted." : " will be removed from company storage."}</p>
          <div className="mt-6 flex gap-3"><button type="button" disabled={saving} onClick={() => void deleteItem()} className="flex-1 rounded-xl py-2 text-sm font-600 disabled:opacity-50" style={{ background: "#b43c45", color: "white" }}>{saving ? "Deleting…" : "Delete"}</button><button type="button" onClick={() => setDeletingItem(null)} className="flex-1 rounded-xl border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </div>
      </div>}

      {deletingCandidateDocument && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeletingCandidateDocument(null); }}>
        <div className="w-full max-w-md border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Delete candidate document?</h2>
          <p className="mt-2 break-words text-sm" style={{ color: "var(--muted-foreground)" }}>{deletingCandidateDocument.file_name} will be removed from this candidate’s documents.</p>
          <div className="mt-6 flex gap-3"><button type="button" disabled={saving} onClick={() => void deleteCandidateDocument()} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "#b43c45", color: "white" }}>{saving ? "Deleting…" : "Delete"}</button><button type="button" onClick={() => setDeletingCandidateDocument(null)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </div>
      </div>}

      {desktopPromptOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDesktopPromptOpen(false); }}>
        <div className="w-full max-w-lg rounded-2xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Desktop access</h2><p className="mt-2 text-sm leading-6" style={{ color: "var(--muted-foreground)" }}>Sync folder copies a selected laptop folder and its subfolders into your personal drive. Selecting it again updates files you previously synced; this browser does not monitor local changes. The mounted network share provides direct Explorer access to company storage.</p></div><button type="button" onClick={() => setDesktopPromptOpen(false)} aria-label="Close desktop access information" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          {mountInfo ? <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4" style={{ borderColor: "var(--border)" }}><div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Mounted share</div><div className="mt-3 space-y-2 text-sm"><div><span className="font-600" style={{ color: "var(--foreground)" }}>URL:</span> <span className="break-all" style={{ color: "var(--muted-foreground)" }}>{mountInfo.webdavUrl}</span></div><div><span className="font-600" style={{ color: "var(--foreground)" }}>Username:</span> <span style={{ color: "var(--muted-foreground)" }}>{mountInfo.username}</span></div><div><span className="font-600" style={{ color: "var(--foreground)" }}>Password:</span> <span style={{ color: "var(--muted-foreground)" }}>{mountInfo.password}</span></div></div><div className="mt-4 flex gap-3"><button type="button" onClick={() => void revokeMount()} disabled={mountBusy} className="flex-1 rounded-xl border py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>{mountBusy ? "Revoking…" : "Revoke mount"}</button><button type="button" onClick={() => setDesktopPromptOpen(false)} className="flex-1 rounded-xl py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Close</button></div></div> : <div className="mt-5 flex gap-3"><button type="button" onClick={() => void generateMount()} disabled={mountBusy} className="flex-1 rounded-xl py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{mountBusy ? "Creating…" : "Create mount credential"}</button><button type="button" onClick={() => { setDesktopPromptOpen(false); openPersonalFolder(); }} className="flex-1 rounded-xl border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Open my drive</button></div>}
        </div>
      </div>}
    </section>
  );
}
