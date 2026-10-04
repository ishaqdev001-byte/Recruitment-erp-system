import { useState } from "react";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const dates = [17, 18, 19, 20, 21];
const hours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

interface Interview {
  id: number;
  candidate: string;
  role: string;
  type: string;
  day: number;
  hour: number;
  duration: number;
  interviewers: string[];
  status: string;
  link?: string;
}

const interviews: Interview[] = [
  { id: 1, candidate: "Sofia Reyes", role: "Staff Backend Engineer", type: "System Design", day: 0, hour: 9, duration: 90, interviewers: ["Reza K.", "Mei L."], status: "Confirmed", link: "meet.google.com/abc" },
  { id: 2, candidate: "Priya Nair", role: "Product Designer", type: "Portfolio Review", day: 1, hour: 11, duration: 60, interviewers: ["Aisha K.", "Tyler J."], status: "Confirmed" },
  { id: 3, candidate: "James Okafor", role: "DevOps Lead", type: "Technical", day: 1, hour: 14, duration: 60, interviewers: ["Sam W."], status: "Pending" },
  { id: 4, candidate: "Tariq Hassan", role: "ML Engineer", type: "Behavioral", day: 2, hour: 10, duration: 45, interviewers: ["Aisha K.", "Chen L."], status: "Confirmed" },
  { id: 5, candidate: "Hana Yoshida", role: "Frontend Engineer", type: "Coding Challenge", day: 3, hour: 9, duration: 90, interviewers: ["Mei L."], status: "Confirmed" },
  { id: 6, candidate: "Kwame Asante", role: "Product Manager", type: "Case Study", day: 3, hour: 15, duration: 60, interviewers: ["Tyler J.", "Reza K."], status: "Pending" },
  { id: 7, candidate: "Carlos Vega", role: "DevOps Engineer", type: "Screening Call", day: 4, hour: 11, duration: 30, interviewers: ["Aisha K."], status: "Confirmed" },
];

const typeColors: Record<string, string> = {
  "System Design": "#6366f1",
  "Portfolio Review": "#ec4899",
  "Technical": "#f59e0b",
  "Behavioral": "#3b82f6",
  "Coding Challenge": "#8b5cf6",
  "Case Study": "#14b8a6",
  "Screening Call": "#6b7280",
};

const upcoming = [
  { time: "Today, 3:00 PM", candidate: "James Okafor", type: "DevOps Lead · Technical", status: "Pending" },
  { time: "Tomorrow, 10:00 AM", candidate: "Tariq Hassan", type: "ML Engineer · Behavioral", status: "Confirmed" },
  { time: "Wed Aug 19, 9:00 AM", candidate: "Hana Yoshida", type: "Frontend Engineer · Coding", status: "Confirmed" },
  { time: "Thu Aug 20, 3:00 PM", candidate: "Kwame Asante", type: "Product Manager · Case Study", status: "Pending" },
  { time: "Fri Aug 21, 11:00 AM", candidate: "Carlos Vega", type: "DevOps Engineer · Screening", status: "Confirmed" },
];

export default function Interviews() {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [view, setView] = useState<"week" | "list">("week");

  const getInterview = (day: number, hour: number) =>
    interviews.find((i) => i.day === day && i.hour === hour);

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-700" style={{ color: "var(--foreground)" }}>Interviews</h1>
          <p className="text-sm mono mt-1" style={{ color: "var(--muted-foreground)" }}>
            Week of Aug 17–21, 2026 · {interviews.length} scheduled
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            {(["week", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-4 py-1.5 text-xs font-600 uppercase tracking-wider"
                style={{
                  background: view === v ? "var(--secondary)" : "var(--card)",
                  color: view === v ? "var(--primary)" : "var(--muted-foreground)",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <button className="px-4 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            + Schedule
          </button>
        </div>
      </div>

      {view === "week" ? (
        <div className="flex-1 overflow-auto rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="grid min-w-190 border-b" style={{ gridTemplateColumns: "60px repeat(5, 1fr)", borderColor: "var(--border)" }}>
            <div className="border-r" style={{ borderColor: "var(--border)" }} />
            {days.map((d, i) => (
              <div
                key={d}
                className="px-4 py-3 text-center border-r cursor-pointer"
                style={{
                  borderColor: "var(--border)",
                  background: selectedDay === i ? "var(--secondary)" : "transparent",
                }}
                onClick={() => setSelectedDay(selectedDay === i ? null : i)}
              >
                <div className="text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{d}</div>
                <div
                  className="text-lg font-700 mono mt-0.5"
                  style={{ color: selectedDay === i ? "var(--primary)" : "var(--foreground)" }}
                >
                  {dates[i]}
                </div>
              </div>
            ))}
          </div>

          {hours.map((h, hi) => (
            <div
              key={h}
              className="grid min-w-190 border-b"
              style={{ gridTemplateColumns: "60px repeat(5, 1fr)", borderColor: "var(--border)", minHeight: "72px" }}
            >
              <div className="border-r px-2 py-2 flex items-start justify-end" style={{ borderColor: "var(--border)" }}>
                <span className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{h}</span>
              </div>
              {days.map((_, di) => {
                const interview = getInterview(di, parseInt(h));
                return (
                  <div key={di} className="border-r p-1.5 relative" style={{ borderColor: "var(--border)" }}>
                    {interview && (
                      <div
                        className="rounded p-2 cursor-pointer transition-opacity hover:opacity-90"
                        style={{
                          background: typeColors[interview.type] + "20",
                          borderLeft: `3px solid ${typeColors[interview.type]}`,
                        }}
                      >
                        <div className="text-xs font-600 truncate" style={{ color: "var(--foreground)" }}>{interview.candidate}</div>
                        <div className="text-xs truncate mt-0.5" style={{ color: typeColors[interview.type] }}>{interview.type}</div>
                        <div className="mono text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{interview.duration}m</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["Candidate", "Role", "Type", "Interviewers", "Duration", "Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {interviews.map((i) => (
                <tr key={i.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="px-5 py-4 font-600" style={{ color: "var(--foreground)" }}>{i.candidate}</td>
                  <td className="px-5 py-4 text-xs" style={{ color: "var(--muted-foreground)" }}>{i.role}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-600 px-2 py-1 rounded mono" style={{ color: typeColors[i.type], background: typeColors[i.type] + "20" }}>
                      {i.type}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs" style={{ color: "var(--muted-foreground)" }}>{i.interviewers.join(", ")}</td>
                  <td className="px-5 py-4 mono text-xs" style={{ color: "var(--foreground)" }}>{i.duration}m</td>
                  <td className="px-5 py-4">
                    <span
                      className="text-xs font-600 px-2 py-1 rounded mono"
                      style={{ color: i.status === "Confirmed" ? "#10b981" : "#f59e0b", background: i.status === "Confirmed" ? "#10b98120" : "#f59e0b20" }}
                    >
                      {i.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h3 className="text-xs font-700 uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>Upcoming</h3>
        <div className="flex gap-4 overflow-x-auto pb-1">
          {upcoming.map((u, i) => (
            <div key={i} className="rounded border p-3 min-w-48 shrink-0" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
              <div className="mono text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>{u.time}</div>
              <div className="text-sm font-600" style={{ color: "var(--foreground)" }}>{u.candidate}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{u.type}</div>
              <span
                className="mono text-xs font-600 mt-2 block"
                style={{ color: u.status === "Confirmed" ? "#10b981" : "#f59e0b" }}
              >
                {u.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
