import { useState } from "react";

const stages = [
  "Applied",
  "Screening",
  "Technical",
  "Final Round",
  "Offer",
] as const;

type Stage = typeof stages[number];

interface Candidate {
  id: number;
  name: string;
  role: string;
  dept: string;
  days: number;
  avatar: string;
  score?: number;
  tags: string[];
}

const initialData: Record<Stage, Candidate[]> = {
  Applied: [
    { id: 1, name: "Omar Farouk", role: "Backend Engineer III", dept: "Engineering", days: 1, avatar: "OF", score: undefined, tags: ["Python", "AWS"] },
    { id: 2, name: "Leila Ahmadi", role: "UX Researcher", dept: "Design", days: 2, avatar: "LA", score: undefined, tags: ["Figma", "Research"] },
    { id: 3, name: "Devon Blake", role: "Sales Lead", dept: "Sales", days: 3, avatar: "DB", score: undefined, tags: ["B2B", "SaaS"] },
    { id: 4, name: "Nadia Osei", role: "Data Scientist II", dept: "Data", days: 1, avatar: "NO", score: undefined, tags: ["ML", "Python"] },
  ],
  Screening: [
    { id: 5, name: "Carlos Vega", role: "DevOps Engineer", dept: "Infrastructure", days: 5, avatar: "CV", score: 78, tags: ["K8s", "Terraform"] },
    { id: 6, name: "Hana Yoshida", role: "Frontend Engineer", dept: "Engineering", days: 4, avatar: "HY", score: 85, tags: ["React", "TypeScript"] },
    { id: 7, name: "Kwame Asante", role: "Product Manager", dept: "Product", days: 7, avatar: "KA", score: 72, tags: ["Roadmap", "Analytics"] },
  ],
  Technical: [
    { id: 8, name: "Priya Nair", role: "Product Designer", dept: "Design", days: 11, avatar: "PN", score: 91, tags: ["Systems", "Mobile"] },
    { id: 9, name: "James Okafor", role: "DevOps Lead", dept: "Infrastructure", days: 9, avatar: "JO", score: 87, tags: ["K8s", "Go"] },
  ],
  "Final Round": [
    { id: 10, name: "Sofia Reyes", role: "Staff Engineer", dept: "Engineering", days: 18, avatar: "SR", score: 94, tags: ["Distributed", "Rust"] },
    { id: 11, name: "Tariq Hassan", role: "ML Engineer", dept: "Data", days: 22, avatar: "TH", score: 89, tags: ["PyTorch", "MLOps"] },
  ],
  Offer: [
    { id: 12, name: "Marcus Chen", role: "Senior Engineer", dept: "Engineering", days: 28, avatar: "MC", score: 97, tags: ["Accepted"] },
    { id: 13, name: "Yuki Tanaka", role: "Frontend Engineer", dept: "Engineering", days: 31, avatar: "YT", score: 88, tags: ["Pending"] },
  ],
};

const stageColors: Record<Stage, string> = {
  Applied: "#6366f1",
  Screening: "#8b5cf6",
  Technical: "#f59e0b",
  "Final Round": "#3b82f6",
  Offer: "#10b981",
};

const avatarColors = ["#6366f1", "#8b5cf6", "#f59e0b", "#3b82f6", "#10b981", "#ec4899"];

export default function Pipeline() {
  const [data, setData] = useState(initialData);
  const [dragging, setDragging] = useState<{ candidate: Candidate; from: Stage } | null>(null);
  const [filter, setFilter] = useState("");

  const handleDragStart = (candidate: Candidate, from: Stage) => {
    setDragging({ candidate, from });
  };

  const handleDrop = (to: Stage) => {
    if (!dragging || dragging.from === to) return;
    setData((prev) => {
      const fromList = prev[dragging.from].filter((c) => c.id !== dragging.candidate.id);
      const toList = [...prev[to], dragging.candidate];
      return { ...prev, [dragging.from]: fromList, [to]: toList };
    });
    setDragging(null);
  };

  const totalCandidates = Object.values(data).flat().length;

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-700" style={{ color: "var(--foreground)" }}>Hiring Pipeline</h1>
          <p className="text-sm mono mt-1" style={{ color: "var(--muted-foreground)" }}>
            {totalCandidates} active candidates · drag to move stages
          </p>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search candidates..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded border outline-none w-48"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
          />
          <select
            className="px-3 py-2 text-sm rounded border outline-none"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            <option>All Departments</option>
            <option>Engineering</option>
            <option>Design</option>
            <option>Data</option>
            <option>Sales</option>
          </select>
        </div>
      </div>

      <div className="flex gap-4 flex-1 overflow-x-auto pb-2">
        {stages.map((stage) => {
          const candidates = data[stage].filter(
            (c) => !filter || c.name.toLowerCase().includes(filter.toLowerCase()) || c.role.toLowerCase().includes(filter.toLowerCase())
          );
          return (
            <div
              key={stage}
              className="flex flex-col rounded border min-w-60 w-60 shrink-0"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage)}
            >
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: stageColors[stage] }} />
                  <span className="text-xs font-700 uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
                    {stage}
                  </span>
                </div>
                <span className="mono text-xs font-600 px-1.5 py-0.5 rounded" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                  {candidates.length}
                </span>
              </div>
              <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                {candidates.map((c, i) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => handleDragStart(c, stage)}
                    className="rounded p-3 border cursor-grab active:cursor-grabbing transition-all hover:border-opacity-50"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700 shrink-0"
                        style={{ background: avatarColors[i % avatarColors.length] + "30", color: avatarColors[i % avatarColors.length] }}
                      >
                        {c.avatar}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-600 truncate" style={{ color: "var(--foreground)" }}>{c.name}</p>
                        <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{c.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{c.days}d</span>
                      {c.score && (
                        <span
                          className="mono text-xs font-700 px-1.5 py-0.5 rounded"
                          style={{
                            color: c.score >= 90 ? "#10b981" : c.score >= 75 ? "#f59e0b" : "#ef4444",
                            background: c.score >= 90 ? "#10b98120" : c.score >= 75 ? "#f59e0b20" : "#ef444420",
                          }}
                        >
                          {c.score}
                        </span>
                      )}
                    </div>
                    {c.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.tags.map((t) => (
                          <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
