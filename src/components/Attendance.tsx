"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock3, LogIn, LogOut, UsersRound, X } from "lucide-react";

type AttendanceRecord = {
  id: string;
  employee_id: string;
  employee_name: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_comment: string;
  check_out_comment: string;
  status: "present" | "absent" | "leave" | "not_checked_in";
  leave_request_id: string | null;
  worked_minutes: number | null;
};
type Employee = { id: string; name: string; status: "active" | "disabled" };
type AttendancePayload = {
  date: string;
  mode: "daily" | "weekly" | "monthly";
  range: { startDate: string; endDate: string };
  currentUserId: string;
  employees: Employee[];
  records: AttendanceRecord[];
  permissions: { canViewTeam: boolean; canClock: boolean };
  error?: string;
};

const clockTime = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "—";
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const todayInKampala = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const shiftDate = (value: string, mode: AttendancePayload["mode"], direction: number) => {
  if (mode === "daily") return addDays(value, direction);
  if (mode === "weekly") return addDays(value, direction * 7);
  const date = new Date(`${value}T00:00:00.000Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + direction);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
};
const dateLabel = (value: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) => new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
const durationLabel = (minutes: number | null) => minutes === null ? "Incomplete" : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
const statusLabels: Record<AttendanceRecord["status"], string> = { present: "Present", absent: "Absent", leave: "On leave", not_checked_in: "Not checked in" };
const statusColors: Record<AttendanceRecord["status"], string> = { present: "#168358", absent: "#b43c45", leave: "#2878a8", not_checked_in: "#b7791f" };

export default function Attendance() {
  const [data, setData] = useState<AttendancePayload | null>(null);
  const [view, setView] = useState<AttendancePayload["mode"]>("daily");
  const [selectedDate, setSelectedDate] = useState(todayInKampala);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [clockAction, setClockAction] = useState<"check-in" | "check-out" | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ mode: view, date: selectedDate });
        const response = await fetch(`/api/attendance?${params}`, { cache: "no-store" });
        const payload = await response.json() as AttendancePayload;
        if (!response.ok) throw new Error(payload.error ?? "Unable to load attendance.");
        if (!cancelled) setData(payload);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load attendance.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey, selectedDate, view]);

  const records = data?.records ?? [];
  const ownRecord = records.find((record) => record.employee_id === data?.currentUserId && record.work_date === todayInKampala());
  const tableRecords = useMemo(() => {
    if (!data?.permissions.canViewTeam || view !== "daily" || selectedDate !== todayInKampala()) return records;
    const presentEmployees = new Set(records.map((record) => record.employee_id));
    const notCheckedIn = data.employees.filter((employee) => employee.status === "active" && !presentEmployees.has(employee.id)).map((employee): AttendanceRecord => ({
      id: `not-checked-in-${employee.id}`,
      employee_id: employee.id,
      employee_name: employee.name,
      work_date: selectedDate,
      check_in_at: null,
      check_out_at: null,
      check_in_comment: "",
      check_out_comment: "",
      status: "not_checked_in",
      leave_request_id: null,
      worked_minutes: 0,
    }));
    return [...records, ...notCheckedIn];
  }, [data, records, selectedDate, view]);
  const presentCount = records.filter((record) => record.status === "present").length;
  const absentCount = records.filter((record) => record.status === "absent").length;
  const leaveCount = records.filter((record) => record.status === "leave").length;
  const totalWorkedMinutes = records.reduce((total, record) => total + (record.worked_minutes ?? 0), 0);
  const latestPersonalDate = (() => {
    const date = new Date(`${todayInKampala()}T00:00:00.000Z`);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 3);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
    return date.toISOString().slice(0, 10);
  })();

  const recordTime = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clockAction) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: clockAction, comment: comment.trim() }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to record attendance.");
      setClockAction(null);
      setComment("");
      setReloadKey((key) => key + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to record attendance.");
    } finally {
      setSaving(false);
    }
  };

  const rangeLabel = data
    ? data.range.startDate === data.range.endDate
      ? dateLabel(data.range.startDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : `${dateLabel(data.range.startDate)} – ${dateLabel(data.range.endDate)}`
    : "Loading period…";

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="attendance-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2"><CalendarClock size={18} aria-hidden="true" style={{ color: "var(--primary)" }} /><h1 id="attendance-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Attendance</h1></div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{data?.permissions.canViewTeam ? "Team attendance" : "Your attendance · past three months only"} · {rangeLabel} · Kampala time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex border" style={{ borderColor: "var(--border)" }} role="group" aria-label="Attendance period">
            {(["daily", "weekly", "monthly"] as const).map((period) => <button key={period} type="button" onClick={() => setView(period)} className="px-3 py-2 text-xs font-600 capitalize" style={{ background: view === period ? "var(--primary)" : "var(--secondary)", color: view === period ? "var(--primary-foreground)" : "var(--muted-foreground)" }}>{period}</button>)}
          </div>
          <button type="button" aria-label="Previous period" onClick={() => setSelectedDate((current) => shiftDate(current, view, -1))} className="flex h-9 w-9 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ChevronLeft size={17} aria-hidden="true" /></button>
          <label className="sr-only" htmlFor="attendance-date">Attendance date</label>
          <input id="attendance-date" aria-label="Attendance date" type="date" value={selectedDate} min={data?.permissions.canViewTeam ? undefined : latestPersonalDate} max={todayInKampala()} onChange={(event) => setSelectedDate(event.target.value)} className="h-9 border px-2 text-sm" style={fieldStyle} />
          <button type="button" aria-label="Next period" disabled={selectedDate >= todayInKampala()} onClick={() => setSelectedDate((current) => shiftDate(current, view, 1) > todayInKampala() ? todayInKampala() : shiftDate(current, view, 1))} className="flex h-9 w-9 items-center justify-center border disabled:opacity-40" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ChevronRight size={17} aria-hidden="true" /></button>
          {data?.permissions.canClock && selectedDate === todayInKampala() && <button type="button" disabled={saving || loading || Boolean(ownRecord?.check_out_at)} onClick={() => setClockAction(ownRecord ? "check-out" : "check-in")} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: ownRecord ? "#b45309" : "var(--primary)", color: "#fff" }}>{ownRecord ? <LogOut size={16} aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}{ownRecord?.check_out_at ? `Completed at ${clockTime(ownRecord.check_out_at)}` : ownRecord ? "Check out" : "Check in"}</button>}
        </div>
      </header>

      <div className="grid grid-cols-2 border-b sm:grid-cols-4" style={{ borderColor: "var(--border)" }}>
        {[
          { label: "Present", value: presentCount, color: "#168358", icon: CircleCheck },
          { label: "Absent", value: absentCount, color: "#b43c45", icon: UsersRound },
          { label: "On leave", value: leaveCount, color: "#2878a8", icon: CalendarDays },
          { label: "Worked", value: durationLabel(totalWorkedMinutes), color: "var(--foreground)", icon: Clock3 },
        ].map((metric) => {
          const Icon = metric.icon;
          return <div key={metric.label} className="border-b px-5 py-4 last:border-0 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)" }}><div className="flex items-center gap-2"><Icon size={15} aria-hidden="true" style={{ color: metric.color }} /><span className="mono text-lg font-700" style={{ color: metric.color }}>{loading ? "—" : metric.value}</span></div><div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{metric.label}</div></div>;
        })}
      </div>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-240 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Date", "Employee", "Check in", "Check-in comment", "Check out", "Check-out comment", "Worked", "Status"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading attendance…</td></tr>}
              {!loading && !error && tableRecords.map((record) => <tr key={record.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{dateLabel(record.work_date)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs font-600" style={{ color: "var(--foreground)" }}>{record.employee_name}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{clockTime(record.check_in_at)}</td>
                <td className="max-w-56 px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{record.check_in_comment || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{clockTime(record.check_out_at)}</td>
                <td className="max-w-56 px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{record.check_out_comment || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{durationLabel(record.worked_minutes)}</td>
                <td className="whitespace-nowrap px-3 py-3"><span className="text-xs font-600" style={{ color: statusColors[record.status] }}>{statusLabels[record.status]}</span></td>
              </tr>)}
              {!loading && !error && tableRecords.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No attendance records in this period.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{data?.permissions.canViewTeam ? "Only the company owner, CEO, and general manager can view team attendance." : "Your personal history is limited to the most recent three months."} Attendance dates follow Africa/Kampala.</p>
      </div>

      {clockAction && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setClockAction(null); }}>
        <form onSubmit={recordTime} className="w-full max-w-md border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>{clockAction === "check-in" ? "Check in" : "Check out"}</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{dateLabel(todayInKampala(), { weekday: "long", month: "long", day: "numeric" })} · Kampala time</p></div><button type="button" onClick={() => setClockAction(null)} aria-label="Close attendance form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Comment<textarea required maxLength={1000} rows={3} value={comment} onChange={(event) => setComment(event.target.value)} className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} placeholder={clockAction === "check-in" ? "Add a note for the start of your day." : "Add a note for the end of your day."} /></label>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving || !comment.trim()} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Recording…" : clockAction === "check-in" ? "Confirm check-in" : "Confirm check-out"}</button><button type="button" onClick={() => setClockAction(null)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}
    </section>
  );
}
