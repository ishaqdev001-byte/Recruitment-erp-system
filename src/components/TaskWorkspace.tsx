import { useEffect, useState, type FormEvent } from "react";
import { AlarmClock, Bell, CalendarClock, Check, CircleCheck, ListPlus, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { SearchableSelect } from "./SearchableSelect";

type Priority = "High" | "Medium" | "Low";
type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";
type TaskRecord = {
  id: string;
  list_id: string;
  parent_task_id: string | null;
  title: string;
  notes: string;
  due_at: string | null;
  reminder_at: string | null;
  assigned_to: string | null;
  priority: Priority;
  recurrence: Recurrence;
  sms_reminder_enabled: boolean;
  is_completed: boolean;
  is_starred: boolean;
};
type TaskList = { id: string; name: string; position: number };
type Member = { id: string; name: string };
type TaskPayload = {
  tasks?: TaskRecord[];
  lists?: TaskList[];
  members?: Member[];
  permissions?: { canCreate?: boolean; canEdit?: boolean; canDelete?: boolean; canSendSms?: boolean };
  error?: string;
};
type TaskDraft = {
  title: string;
  notes: string;
  dueAt: string;
  reminder: string;
  assignedTo: string;
  priority: Priority;
  recurrence: Recurrence;
  listId: string;
  parentTaskId: string;
  smsReminderEnabled: boolean;
};

const inputStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const priorityColor: Record<Priority, string> = { High: "#bd3d3d", Medium: "#b7791f", Low: "#17845b" };
const recurrenceLabels: Record<Recurrence, string> = { none: "Does not repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function reminderLead(task: TaskRecord) {
  if (!task.due_at || !task.reminder_at) return "none";
  const difference = Date.parse(task.due_at) - Date.parse(task.reminder_at);
  if (difference === 0) return "0";
  if (difference === 600000) return "10";
  if (difference === 3600000) return "60";
  if (difference === 86400000) return "1440";
  return "none";
}

function freshDraft(listId: string, parentTaskId = ""): TaskDraft {
  return { title: "", notes: "", dueAt: "", reminder: "none", assignedTo: "", priority: "Medium", recurrence: "none", listId, parentTaskId, smsReminderEnabled: false };
}

function dueLabel(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  const overdue = date.getTime() < Date.now();
  return `${overdue ? "Overdue · " : "Due "}${date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export default function TaskWorkspace() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canSendSms, setCanSendSms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeListId, setActiveListId] = useState("");
  const [filter, setFilter] = useState<"open" | "completed" | "starred" | "all">("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(freshDraft(""));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [editingList, setEditingList] = useState<TaskList | null>(null);
  const [listName, setListName] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("unsupported");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/tasks", { cache: "no-store" });
        const payload = await response.json() as TaskPayload;
        if (!response.ok) throw new Error(payload.error ?? "Unable to load tasks.");
        if (cancelled) return;
        setTasks(payload.tasks ?? []);
        setLists(payload.lists ?? []);
        setMembers(payload.members ?? []);
        setCanCreate(Boolean(payload.permissions?.canCreate));
        setCanEdit(Boolean(payload.permissions?.canEdit));
        setCanDelete(Boolean(payload.permissions?.canDelete));
        setCanSendSms(Boolean(payload.permissions?.canSendSms));
        setActiveListId((current) => (payload.lists ?? []).some((list) => list.id === current) ? current : payload.lists?.[0]?.id ?? "");
        setError("");
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load tasks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 60000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [reloadKey]);

  useEffect(() => {
    setNotificationPermission("Notification" in window ? window.Notification.permission : "unsupported");
  }, []);

  const activeList = lists.find((list) => list.id === activeListId) ?? null;
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const listTasks = tasks.filter((task) => task.list_id === activeListId);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matches = (task: TaskRecord) => {
    const filterMatch = filter === "all" || (filter === "completed" ? task.is_completed : filter === "starred" ? task.is_starred : !task.is_completed);
    return filterMatch && `${task.title} ${task.notes}`.toLocaleLowerCase().includes(normalizedSearch);
  };
  const visibleTasks = listTasks.filter((task) => !task.parent_task_id && matches(task));
  const completedCount = listTasks.filter((task) => task.is_completed).length;
  const openCount = listTasks.filter((task) => !task.is_completed).length;

  const openCreate = (parentTaskId = "") => {
    setEditingId(null);
    setDraft(freshDraft(activeListId, parentTaskId));
    setError("");
    setShowTaskForm(true);
  };

  const openEdit = (task: TaskRecord) => {
    setEditingId(task.id);
    setDraft({
      title: task.title,
      notes: task.notes,
      dueAt: localDateTime(task.due_at),
      reminder: reminderLead(task),
      assignedTo: task.assigned_to ?? "",
      priority: task.priority,
      recurrence: task.recurrence,
      listId: task.list_id,
      parentTaskId: task.parent_task_id ?? "",
      smsReminderEnabled: task.sms_reminder_enabled,
    });
    setError("");
    setShowTaskForm(true);
  };

  const saveTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const dueAt = draft.dueAt ? new Date(draft.dueAt) : null;
    const reminderAt = dueAt && draft.reminder !== "none"
      ? new Date(dueAt.getTime() - Number(draft.reminder) * 60000).toISOString()
      : null;
    const body = {
      title: draft.title,
      notes: draft.notes,
      dueAt: dueAt?.toISOString() ?? null,
      reminderAt,
      assignedTo: draft.assignedTo || null,
      priority: draft.priority,
      recurrence: draft.recurrence,
      listId: draft.listId,
      parentTaskId: draft.parentTaskId || null,
      ...(canSendSms ? { smsReminderEnabled: draft.smsReminderEnabled } : {}),
    };
    try {
      const response = await fetch(editingId ? `/api/tasks/${encodeURIComponent(editingId)}` : "/api/tasks", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save this task.");
      setShowTaskForm(false);
      window.dispatchEvent(new Event("task-reminders-changed"));
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this task.");
    } finally {
      setSaving(false);
    }
  };

  const updateTask = async (task: TaskRecord, values: Record<string, unknown>) => {
    setError("");
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update this task.");
      window.dispatchEvent(new Event("task-reminders-changed"));
      setReloadKey((key) => key + 1);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update this task.");
    }
  };

  const deleteTask = async (task: TaskRecord) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setError(payload.error ?? "Unable to delete this task."); return; }
    window.dispatchEvent(new Event("task-reminders-changed"));
    setSelectedId(null);
    setReloadKey((key) => key + 1);
  };

  const saveList = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/tasks/lists", {
        method: editingList ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingList?.id, name: listName }),
      });
      const payload = await response.json() as { list?: TaskList; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save this list.");
      setShowListForm(false);
      setEditingList(null);
      setListName("");
      setReloadKey((key) => key + 1);
    } catch (listError) {
      setError(listError instanceof Error ? listError.message : "Unable to save this list.");
    } finally {
      setSaving(false);
    }
  };

  const deleteList = async () => {
    if (!activeList) return;
    const response = await fetch("/api/tasks/lists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeList.id }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setError(payload.error ?? "Unable to delete this list."); return; }
    setReloadKey((key) => key + 1);
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) return;
    setNotificationPermission(await window.Notification.requestPermission());
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="tasks-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <h1 id="tasks-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Tasks</h1>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{openCount} open · {completedCount} completed{lists.length > 0 ? ` · ${lists.length} lists` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && <button type="button" onClick={() => { setEditingList(null); setListName(""); setShowListForm(true); }} title="Create task list" aria-label="Create task list" className="inline-flex h-9 w-9 items-center justify-center border sm:hidden" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ListPlus size={16} aria-hidden="true" /></button>}
          {activeList && canEdit && <button type="button" onClick={() => { setEditingList(activeList); setListName(activeList.name); setShowListForm(true); }} title="Rename task list" aria-label="Rename task list" className="inline-flex h-9 w-9 items-center justify-center border sm:hidden" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Pencil size={15} aria-hidden="true" /></button>}
          {notificationPermission === "default" && <button type="button" onClick={() => void enableNotifications()} title="Enable browser task reminders" aria-label="Enable browser task reminders" className="inline-flex h-9 items-center gap-2 border px-2.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Bell size={15} aria-hidden="true" /><span className="hidden sm:inline">Enable reminders</span></button>}
          {notificationPermission === "granted" && <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "#17845b" }}><Bell size={14} aria-hidden="true" />Reminders on</span>}
          <button type="button" onClick={() => openCreate()} disabled={!canCreate || !activeListId} className="inline-flex h-9 items-center gap-2 px-3 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Plus size={16} aria-hidden="true" />New task</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r sm:flex" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <span className="text-[10px] font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Task lists</span>
            <button type="button" aria-label="Create task list" title="Create task list" disabled={!canCreate} onClick={() => { setEditingList(null); setListName(""); setShowListForm(true); }} className="p-1 disabled:opacity-40" style={{ color: "var(--muted-foreground)" }}><ListPlus size={16} aria-hidden="true" /></button>
          </div>
          <nav className="space-y-0.5 px-2">
            {lists.map((list) => (
              <button key={list.id} type="button" onClick={() => { setActiveListId(list.id); setSelectedId(null); }} className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs font-600" style={{ background: activeListId === list.id ? "var(--secondary)" : "transparent", color: activeListId === list.id ? "var(--primary)" : "var(--muted-foreground)" }}>
                <span className="truncate">{list.name}</span><span className="mono ml-2 text-[10px]">{tasks.filter((task) => task.list_id === list.id && !task.is_completed).length}</span>
              </button>
            ))}
          </nav>
          {activeList && canEdit && <div className="mt-3 flex gap-2 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <button type="button" onClick={() => { setEditingList(activeList); setListName(activeList.name); setShowListForm(true); }} className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}><Pencil size={13} aria-hidden="true" />Rename</button>
            {canDelete && <button type="button" onClick={() => void deleteList()} className="inline-flex items-center gap-1.5 text-xs" style={{ color: "#bd3d3d" }}><Trash2 size={13} aria-hidden="true" />Delete</button>}
          </div>}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <select aria-label="Task list" value={activeListId} onChange={(event) => { setActiveListId(event.target.value); setSelectedId(null); }} className="min-w-0 max-w-48 border px-2.5 py-2 text-sm sm:hidden" style={inputStyle}>
              {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
            </select>
            <label className="flex min-w-36 flex-1 items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
            <div role="tablist" aria-label="Filter tasks" className="flex gap-1 overflow-x-auto">
              {([{ id: "open", label: "Open" }, { id: "starred", label: "Starred" }, { id: "completed", label: "Completed" }, { id: "all", label: "All" }] as const).map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={filter === tab.id} onClick={() => setFilter(tab.id)} className="shrink-0 border-b-2 px-2.5 py-2 text-xs font-600" style={{ borderColor: filter === tab.id ? "var(--primary)" : "transparent", color: filter === tab.id ? "var(--primary)" : "var(--muted-foreground)" }}>{tab.label}</button>)}
            </div>
          </div>

          {error && <div role="alert" className="mx-4 mt-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 sm:mx-6">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError("")} className="float-right"><X size={16} aria-hidden="true" /></button></div>}
          <div className="min-h-0 flex-1 overflow-auto">
            {loading && <p className="px-6 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading tasks...</p>}
            {!loading && !error && lists.length === 0 && <div className="px-6 py-12 text-center"><p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No task lists are available for this workspace.</p></div>}
            {!loading && activeList && visibleTasks.length === 0 && <div className="px-6 py-12 text-center"><p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{search ? "No tasks match your search." : filter === "open" ? "You're all caught up in this list." : "No tasks in this view."}</p>{canCreate && filter === "open" && !search && <button type="button" onClick={() => openCreate()} className="mt-3 text-sm font-600" style={{ color: "var(--primary)" }}>Create a task</button>}</div>}
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {visibleTasks.map((task) => {
                const subtasks = listTasks.filter((child) => child.parent_task_id === task.id && matches(child));
                return <div key={task.id}>
                  <TaskRow task={task} memberName={members.find((member) => member.id === task.assigned_to)?.name} selected={selectedId === task.id} onSelect={() => setSelectedId(selectedId === task.id ? null : task.id)} onComplete={() => void updateTask(task, { isCompleted: !task.is_completed })} onStar={() => void updateTask(task, { isStarred: !task.is_starred })} />
                  {subtasks.length > 0 && <div className="ml-8 border-l sm:ml-12" style={{ borderColor: "var(--border)" }}>{subtasks.map((child) => <TaskRow key={child.id} task={child} memberName={members.find((member) => member.id === child.assigned_to)?.name} selected={selectedId === child.id} onSelect={() => setSelectedId(selectedId === child.id ? null : child.id)} onComplete={() => void updateTask(child, { isCompleted: !child.is_completed })} onStar={() => void updateTask(child, { isStarred: !child.is_starred })} />)}</div>}
                </div>;
              })}
            </div>
          </div>
        </div>

        {selected && <aside className="detail-panel fixed inset-y-0 right-0 z-30 w-full max-w-sm overflow-y-auto border-l shadow-xl sm:static sm:z-auto sm:w-72 sm:shadow-none" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <header className="flex items-start justify-between border-b p-5" style={{ borderColor: "var(--border)" }}><div className="min-w-0"><p className="text-[10px] font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Task details</p><h2 className="mt-1 wrap-break-word text-sm font-700" style={{ color: "var(--foreground)" }}>{selected.title}</h2></div><button type="button" aria-label="Close task details" onClick={() => setSelectedId(null)} className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={17} aria-hidden="true" /></button></header>
          <div className="space-y-4 p-5">
            {[
              ["List", lists.find((list) => list.id === selected.list_id)?.name ?? ""],
              ["Due", selected.due_at ? new Date(selected.due_at).toLocaleString() : "No due date"],
              ["Assigned to", members.find((member) => member.id === selected.assigned_to)?.name ?? "Unassigned"],
              ["Priority", selected.priority],
              ["Repeats", recurrenceLabels[selected.recurrence]],
              ["Reminder", selected.reminder_at ? new Date(selected.reminder_at).toLocaleString() : "None"],
            ].map(([label, value]) => <div key={label}><div className="text-[10px] font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{label}</div><div className="mt-1 text-sm" style={{ color: "var(--foreground)" }}>{value}</div></div>)}
            {selected.notes && <div><div className="text-[10px] font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Notes</div><p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--foreground)" }}>{selected.notes}</p></div>}
            <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
              {canEdit && <button type="button" onClick={() => openEdit(selected)} className="inline-flex flex-1 items-center justify-center gap-2 border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Pencil size={14} aria-hidden="true" />Edit</button>}
              {canCreate && !selected.parent_task_id && <button type="button" onClick={() => openCreate(selected.id)} className="inline-flex flex-1 items-center justify-center gap-2 border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Plus size={14} aria-hidden="true" />Subtask</button>}
              {canDelete && <button type="button" aria-label="Delete task" title="Delete task" onClick={() => void deleteTask(selected)} className="border p-2" style={{ borderColor: "var(--border)", color: "#bd3d3d" }}><Trash2 size={15} aria-hidden="true" /></button>}
            </div>
          </div>
        </aside>}
      </div>

      {showTaskForm && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6">
        <form onSubmit={(event) => void saveTask(event)} className="my-auto max-h-[94dvh] w-full max-w-xl overflow-y-auto border p-5 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>{editingId ? "Edit task" : draft.parentTaskId ? "Add subtask" : "New task"}</h2>{draft.parentTaskId && <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Subtask of {tasks.find((task) => task.id === draft.parentTaskId)?.title}</p>}</div><button type="button" aria-label="Close task form" onClick={() => setShowTaskForm(false)} className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Task title *</span><input autoFocus required maxLength={300} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="w-full border px-3 py-2.5 text-sm outline-none" style={inputStyle} placeholder="What needs to be done?" /></label>
            <label><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Task list</span><select required value={draft.listId} onChange={(event) => setDraft({ ...draft, listId: event.target.value })} className="w-full border px-3 py-2.5 text-sm" style={inputStyle}>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
            <label><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Assigned to</span><SearchableSelect ariaLabel="Search company user to assign" value={draft.assignedTo} onChange={(assignedTo) => setDraft({ ...draft, assignedTo })} options={members.map((member) => ({ value: member.id, label: member.name }))} placeholder="Type a staff name" className="normal-case tracking-normal" style={inputStyle} /></label>
            <label><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Due date and time</span><span className="flex items-center gap-2 border px-3" style={inputStyle}><CalendarClock size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value, reminder: event.target.value ? draft.reminder : "none", smsReminderEnabled: event.target.value ? draft.smsReminderEnabled : false })} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></span></label>
            <label><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Reminder</span><span className="flex items-center gap-2 border px-3" style={inputStyle}><AlarmClock size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><select disabled={!draft.dueAt} value={draft.reminder} onChange={(event) => setDraft({ ...draft, reminder: event.target.value, smsReminderEnabled: event.target.value === "none" ? false : draft.smsReminderEnabled })} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm disabled:opacity-50"><option value="none">No reminder</option><option value="0">At due time</option><option value="10">10 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></span></label>
            <label><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Repeat</span><select disabled={!draft.dueAt} value={draft.recurrence} onChange={(event) => setDraft({ ...draft, recurrence: event.target.value as Recurrence })} className="w-full border px-3 py-2.5 text-sm disabled:opacity-50" style={inputStyle}>{Object.entries(recurrenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Priority</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })} className="w-full border px-3 py-2.5 text-sm" style={inputStyle}><option>Medium</option><option>High</option><option>Low</option></select></label>
            {canSendSms && <label className="flex items-center gap-2 border px-3 py-3 text-sm sm:col-span-2" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><input type="checkbox" checked={draft.smsReminderEnabled} disabled={!draft.dueAt || draft.reminder === "none"} onChange={(event) => setDraft({ ...draft, smsReminderEnabled: event.target.checked })} /><span>Send an SMS reminder to the assignee when due</span></label>}
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Notes</span><textarea rows={4} maxLength={10000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="w-full resize-y border px-3 py-2.5 text-sm outline-none" style={inputStyle} placeholder="Add details" /></label>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowTaskForm(false)} className="border px-4 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button><button type="submit" disabled={saving || !draft.listId} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving..." : <><Check size={15} aria-hidden="true" />{editingId ? "Save changes" : "Create task"}</>}</button></div>
        </form>
      </div>}

      {showListForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <form onSubmit={(event) => void saveList(event)} className="w-full max-w-sm border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-700" style={{ color: "var(--foreground)" }}>{editingList ? "Rename list" : "New task list"}</h2><button type="button" aria-label="Close list form" onClick={() => setShowListForm(false)} className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={17} aria-hidden="true" /></button></div>
          <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>List name</span><input autoFocus required maxLength={100} value={listName} onChange={(event) => setListName(event.target.value)} className="w-full border px-3 py-2.5 text-sm" style={inputStyle} /></label>
          {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowListForm(false)} className="border px-4 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving..." : "Save list"}</button></div>
        </form>
      </div>}
    </section>
  );
}

function TaskRow({ task, memberName, selected, onSelect, onComplete, onStar }: {
  task: TaskRecord;
  memberName?: string;
  selected: boolean;
  onSelect: () => void;
  onComplete: () => void;
  onStar: () => void;
}) {
  const isOverdue = !task.is_completed && task.due_at !== null && Date.parse(task.due_at) < Date.now();
  return <div className="flex items-start gap-3 px-4 py-3 sm:px-6" style={{ background: selected ? "var(--secondary)" : "transparent" }}>
    <button type="button" onClick={onComplete} aria-label={task.is_completed ? "Mark task incomplete" : "Mark task complete"} title={task.is_completed ? "Mark incomplete" : "Mark complete"} className="mt-0.5 shrink-0" style={{ color: task.is_completed ? "#17845b" : "var(--muted-foreground)" }}>{task.is_completed ? <CircleCheck size={19} aria-hidden="true" /> : <span className="block h-4.5 w-4.5 rounded-full border" style={{ borderColor: "var(--border)" }} />}</button>
    <div className="min-w-0 flex-1">
      <button type="button" onClick={onSelect} className={`block max-w-full text-left text-sm font-600 ${task.is_completed ? "line-through opacity-60" : ""}`} style={{ color: "var(--foreground)" }}>{task.title}</button>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
        <span className="inline-flex items-center gap-1" style={{ color: isOverdue ? "#bd3d3d" : "var(--muted-foreground)" }}><CalendarClock size={12} aria-hidden="true" />{dueLabel(task.due_at)}</span>
        <span className="font-600" style={{ color: priorityColor[task.priority] }}>{task.priority}</span>
        {memberName && <span>{memberName}</span>}
        {task.reminder_at && <span className="inline-flex items-center gap-1" title={`Reminder ${new Date(task.reminder_at).toLocaleString()}`}><Bell size={11} aria-hidden="true" />Reminder</span>}
        {task.recurrence !== "none" && <span>{recurrenceLabels[task.recurrence]}</span>}
      </div>
      {task.notes && <p className="mt-1.5 line-clamp-2 text-xs" style={{ color: "var(--muted-foreground)" }}>{task.notes}</p>}
    </div>
    <button type="button" onClick={onStar} aria-label={task.is_starred ? "Remove star" : "Star task"} title={task.is_starred ? "Remove star" : "Star task"} className="shrink-0 p-1" style={{ color: task.is_starred ? "#b7791f" : "var(--muted-foreground)" }}><Star size={15} fill={task.is_starred ? "currentColor" : "none"} aria-hidden="true" /></button>
  </div>;
}