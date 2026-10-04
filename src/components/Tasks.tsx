import { useState } from "react";
import { ArrowLeft, CircleCheck } from "lucide-react";

type Priority = "High" | "Medium" | "Low";
type TaskStatus = "To Do" | "In Progress" | "Completed" | "Overdue";

interface Task {
  id: number;
  title: string;
  linkedType: string;
  linkedName: string;
  assignedTo: string;
  agent: string;
  priority: Priority;
  due: string;
  status: TaskStatus;
  notes: string;
}

const tasks: Task[] = [
  { id: 1, title: "Follow up on passport renewal — James Okello", linkedType: "Candidate", linkedName: "James Okello", assignedTo: "Aisha Khan", agent: "Asiimwe david", priority: "High", due: "Aug 26, 2026", status: "Overdue", notes: "Passport expired May 2025. Candidate needs to renew urgently." },
  { id: 2, title: "Collect medical certificate — Suzan Mirembe", linkedType: "Candidate", linkedName: "Suzan Mirembe", assignedTo: "Director Vicent", agent: "Asiimwe david", priority: "High", due: "Aug 28, 2026", status: "To Do", notes: "Medical exam completed but certificate not yet received." },
  { id: 3, title: "Send invoice to Gulf Manpower Ltd", linkedType: "Employer", linkedName: "Gulf Manpower Ltd", assignedTo: "Aisha Khan", agent: "Director Vicent", priority: "Medium", due: "Aug 27, 2026", status: "In Progress", notes: "Invoice INV-2026-003 — UGX 3,500,000" },
  { id: 4, title: "Collect deposit from Godfrey Kamuhangire", linkedType: "Payment", linkedName: "CRSL-957214073", assignedTo: "Director Vicent", agent: "Director Vicent", priority: "High", due: "Aug 30, 2026", status: "To Do", notes: "Outstanding balance UGX 3,500,000. Candidate should pay 2nd instalment." },
  { id: 5, title: "Verify passport — Alice Namukasa stored in Safe A-5", linkedType: "Passport", linkedName: "C00567234", assignedTo: "Aisha Khan", agent: "Director Vicent", priority: "Low", due: "Sep 2, 2026", status: "To Do", notes: "" },
  { id: 6, title: "Submit visa application — Alice Namukasa (Kuwait)", linkedType: "Document", linkedName: "Alice Namukasa", assignedTo: "Aisha Khan", agent: "Director Vicent", priority: "High", due: "Aug 26, 2026", status: "In Progress", notes: "KW visa application ready. Submit to embassy by end of day." },
  { id: 7, title: "Review and sign employer contract — Qatar Construction Co.", linkedType: "Employer", linkedName: "Qatar Construction Co.", assignedTo: "Aisha Khan", agent: "Director Vicent", priority: "Medium", due: "Sep 5, 2026", status: "To Do", notes: "" },
  { id: 8, title: "Generate CV for Godfrey Kamuhangire", linkedType: "Candidate", linkedName: "Godfrey Kamuhangire", assignedTo: "Director Vicent", agent: "Director Vicent", priority: "Medium", due: "Aug 28, 2026", status: "Completed", notes: "CV generated with AI and attached to profile." },
];

const priorityColor: Record<Priority, string> = { High: "#ef4444", Medium: "#f59e0b", Low: "#10b981" };
const statusColor: Record<TaskStatus, string> = { "To Do": "#6366f1", "In Progress": "#f59e0b", Completed: "#10b981", Overdue: "#ef4444" };
const linkedColor: Record<string, string> = { Candidate: "#6366f1", Employer: "#3b82f6", Payment: "#10b981", Document: "#8b5cf6", Passport: "#f59e0b", Job: "#14b8a6" };

export default function Tasks() {
  const [items, setItems] = useState<Task[]>(tasks);
  const [filter, setFilter] = useState<TaskStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "All">("All");
  const [selected, setSelected] = useState<Task | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const filtered = items.filter((t) => {
    const ms = filter === "All" || t.status === filter;
    const mp = priorityFilter === "All" || t.priority === priorityFilter;
    return ms && mp;
  });

  const counts = { todo: items.filter(t => t.status === "To Do").length, inprog: items.filter(t => t.status === "In Progress").length, overdue: items.filter(t => t.status === "Overdue").length, done: items.filter(t => t.status === "Completed").length };

  const markDone = (id: number) => setItems((prev) => prev.map((t) => t.id === id ? { ...t, status: "Completed" as TaskStatus } : t));

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
            <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Tasks & Follow-ups</h1>
            <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              {counts.overdue > 0 && <span style={{ color: "#ef4444" }}>{counts.overdue} overdue · </span>}
              {counts.todo} to do · {counts.inprog} in progress
            </p>
          </div>
          <button onClick={() => setShowNew(true)} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            + New Task
          </button>
        </div>

        <div className="px-6 py-3 border-b flex items-center gap-3 shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-1.5">
            {(["All", "To Do", "In Progress", "Overdue", "Completed"] as const).map((s) => (
              <button key={s} onClick={() => setFilter(s as TaskStatus | "All")}
                className="px-3 py-1 text-xs font-600 rounded"
                style={{ background: filter === s ? "var(--primary)" : "var(--secondary)", color: filter === s ? "var(--primary-foreground)" : "var(--muted-foreground)" }}>
                {s}
              </button>
            ))}
          </div>
          <div className="h-4 w-px mx-1" style={{ background: "var(--border)" }} />
          <div className="flex gap-1.5">
            {(["All", "High", "Medium", "Low"] as const).map((p) => (
              <button key={p} onClick={() => setPriorityFilter(p as Priority | "All")}
                className="px-2.5 py-1 text-xs font-600 rounded"
                style={{ background: priorityFilter === p ? (p === "All" ? "var(--secondary)" : priorityColor[p as Priority] + "33") : "transparent", color: p === "All" ? "var(--muted-foreground)" : priorityColor[p as Priority] || "var(--muted-foreground)", border: `1px solid ${p === "All" ? "var(--border)" : priorityColor[p as Priority] + "44"}` }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {filtered.map((t) => (
              <div key={t.id}
                className="px-6 py-4 cursor-pointer flex items-start gap-4"
                style={{ background: selected?.id === t.id ? "var(--secondary)" : "transparent" }}
                onClick={() => setSelected(selected?.id === t.id ? null : t)}>
                <button
                  onClick={(e) => { e.stopPropagation(); if (t.status !== "Completed") markDone(t.id); }}
                  className="w-5 h-5 rounded border flex items-center justify-center mt-0.5 shrink-0 transition-colors"
                  style={{ borderColor: t.status === "Completed" ? "#10b981" : "var(--border)", background: t.status === "Completed" ? "#10b981" : "transparent" }}>
                  {t.status === "Completed" && <CircleCheck size={15} strokeWidth={2} aria-hidden="true" className="text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={`text-sm font-600 ${t.status === "Completed" ? "line-through opacity-60" : ""}`}
                      style={{ color: "var(--foreground)" }}>
                      {t.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="mono text-xs font-600 px-1.5 py-0.5 rounded"
                      style={{ color: statusColor[t.status], background: statusColor[t.status] + "20" }}>
                      {t.status}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{ color: priorityColor[t.priority], background: priorityColor[t.priority] + "20" }}>
                      {t.priority}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{ color: linkedColor[t.linkedType] || "#6b7280", background: (linkedColor[t.linkedType] || "#6b7280") + "20" }}>
                      {t.linkedType}: {t.linkedName}
                    </span>
                    <span className="mono text-xs" style={{ color: t.status === "Overdue" ? "#ef4444" : "var(--muted-foreground)" }}>
                      Due {t.due}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Assigned to {t.assignedTo}</span>
                  </div>
                  {t.notes && <p className="text-xs mt-1.5 italic" style={{ color: "var(--muted-foreground)" }}>{t.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selected && (
        <div className="detail-panel w-72 border-l overflow-auto shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setSelected(null)} className="text-xs mb-3 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}><ArrowLeft size={13} aria-hidden="true" />Close</button>
            <h2 className="text-sm font-700 mb-2" style={{ color: "var(--foreground)" }}>{selected.title}</h2>
            <div className="flex gap-2 flex-wrap">
              <span className="mono text-xs font-600 px-1.5 py-0.5 rounded" style={{ color: statusColor[selected.status], background: statusColor[selected.status] + "20" }}>{selected.status}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: priorityColor[selected.priority], background: priorityColor[selected.priority] + "20" }}>{selected.priority} Priority</span>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: "Linked To", value: `${selected.linkedType}: ${selected.linkedName}` },
              { label: "Assigned To", value: selected.assignedTo },
              { label: "Agent", value: selected.agent },
              { label: "Due Date", value: selected.due },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-700 uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                <div className="text-sm" style={{ color: "var(--foreground)" }}>{value}</div>
              </div>
            ))}
            {selected.notes && (
              <div>
                <div className="text-xs font-700 uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>Notes</div>
                <div className="text-xs italic" style={{ color: "var(--muted-foreground)" }}>{selected.notes}</div>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              {selected.status !== "Completed" && (
                <button onClick={() => { markDone(selected.id); setSelected(null); }}
                  className="py-2 text-sm font-600 rounded" style={{ background: "#10b981", color: "#fff" }}>
                  Mark as Completed
                </button>
              )}
              <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Edit Task</button>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-md" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-700 mb-4" style={{ color: "var(--foreground)" }}>New Task</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>Task Title *</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Describe the task..."
                  className="w-full px-3 py-2 text-sm rounded border outline-none"
                  style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </div>
              {[
                { label: "Linked To (Candidate/Employer/etc)", ph: "e.g. Godfrey Kamuhangire" },
                { label: "Assigned To", ph: "Staff member" },
                { label: "Due Date", ph: "" },
              ].map(({ label, ph }) => (
                <div key={label}>
                  <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>{label}</label>
                  <input type="text" placeholder={ph} className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                </div>
              ))}
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>Priority</label>
                <select className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  <option>High</option><option>Medium</option><option>Low</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowNew(false); setNewTitle(""); }}
                className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                Create Task
              </button>
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
