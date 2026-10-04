import { useState } from "react";
import { CircleCheck, LoaderCircle, Sparkles } from "lucide-react";

type AITab = "cv" | "medical" | "history";

const candidates = [
  { id: 1, name: "Godfrey Kamuhangire", fileNo: "CRSL-957214073", role: "Administrator", country: "Saudi Arabia" },
  { id: 2, name: "Alice Namukasa", fileNo: "CRSL-283710044", role: "Cook", country: "Kuwait" },
  { id: 3, name: "Suzan Mirembe", fileNo: "CRSL-143345563", role: "Housekeeper", country: "UAE" },
];

const generatedCVSample = `CURRICULUM VITAE

GODFREY KAMUHANGIRE
Phone: +256 788 424 573 | NIN: CM8502310K8QYJ
Location: KAKIRI, Wakiso District, Uganda

PROFESSIONAL SUMMARY
Experienced administrative professional with 5+ years of experience in organizational management and administrative support. Seeking an administrative position in Saudi Arabia to leverage strong organizational skills and international work exposure.

EMPLOYMENT HISTORY
• Senior Administrative Assistant — Gulf Enterprises Ltd (2020–2023)
• Office Coordinator — Kampala Municipal Council (2018–2020)
• Data Entry Clerk — Uganda Revenue Authority (2016–2018)

EDUCATION
• Certificate in Business Administration — Makerere University Business School (2015)
• Uganda Certificate of Education — St. Mary's College Kisubi (2012)

SKILLS
• MS Office Suite (Word, Excel, PowerPoint)
• Record management and filing
• Communication and interpersonal skills
• Data entry and analysis
• Time management

LANGUAGES
• English (Fluent) | Luganda (Native) | Runyankore (Native)

REFERENCES
Available upon request.`;

const generatedMedicalSample = `MEDICAL EXAMINATION REPORT

Candidate: GODFREY KAMUHANGIRE
Date of Birth: 10/10/1985 | Age: 40
Passport No: A00846507
Examination Date: August 26, 2026

PHYSICAL EXAMINATION
Height: — cm | Weight: — kg
Blood Pressure: —/— mmHg
Pulse Rate: — bpm
Vision: —

LABORATORY RESULTS
HIV/AIDS: Negative | Hepatitis B: Negative | Hepatitis C: Negative
Tuberculosis: Negative | Malaria: Negative
Blood Group: —

RADIOLOGY
Chest X-Ray: Normal | No signs of active tuberculosis

DECLARATION
The above-named candidate has been examined and found FIT for employment abroad.

Examining Doctor: Dr. _______________
Clinic/Hospital: _______________
Date: August 26, 2026
Stamp: [OFFICIAL STAMP]`;

const history = [
  { date: "Aug 24, 2026", candidate: "Alice Namukasa", action: "CV Generated", generatedBy: "Aisha Khan", status: "Attached" },
  { date: "Aug 22, 2026", candidate: "Godfrey Kamuhangire", action: "Medical Generated", generatedBy: "Director Vicent", status: "Pending Review" },
  { date: "Aug 20, 2026", candidate: "Suzan Mirembe", action: "CV Generated", generatedBy: "Aisha Khan", status: "Exported" },
  { date: "Aug 18, 2026", candidate: "Alice Namukasa", action: "CV Regenerated", generatedBy: "Aisha Khan", status: "Attached" },
];

export default function AIAssistant() {
  const [tab, setTab] = useState<AITab>("cv");
  const [selectedCandidate, setSelectedCandidate] = useState<typeof candidates[0] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(generatedCVSample);

  const handleGenerate = () => {
    setGenerating(true);
    setGenerated(false);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
      setContent(tab === "cv" ? generatedCVSample : generatedMedicalSample);
    }, 2200);
  };

  const tabs = [
    { id: "cv" as AITab, label: "Generate CV" },
    { id: "medical" as AITab, label: "Generate Medical" },
    { id: "history" as AITab, label: "History" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>AI Assistant</h1>
        <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>Automate recruitment documentation with AI</p>
      </div>

      <div className="flex border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setGenerated(false); setGenerating(false); }}
            className="px-5 py-3 text-sm font-600 inline-flex items-center gap-2"
            style={{ color: tab === t.id ? "var(--primary)" : "var(--muted-foreground)", borderBottom: tab === t.id ? "2px solid var(--primary)" : "2px solid transparent" }}>
            {t.id !== "history" && <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />}
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {(tab === "cv" || tab === "medical") && (
          <div className="max-w-4xl mx-auto">
            <div className="rounded border p-5 mb-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="text-xs font-700 uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
                Select Candidate
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {candidates.map((c) => (
                  <button key={c.id} onClick={() => setSelectedCandidate(c)}
                    className="rounded border p-3 text-left transition-all"
                    style={{
                      background: selectedCandidate?.id === c.id ? "var(--secondary)" : "transparent",
                      borderColor: selectedCandidate?.id === c.id ? "var(--primary)" : "var(--border)",
                    }}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700"
                        style={{ background: "#6366f130", color: "#6366f1" }}>
                        {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <span className="text-sm font-600" style={{ color: "var(--foreground)" }}>{c.name}</span>
                    </div>
                    <div className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{c.fileNo}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{c.role} · {c.country}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-center mb-5">
              <button
                onClick={handleGenerate}
                disabled={!selectedCandidate || generating}
                className="flex items-center gap-2 px-8 py-3 text-base font-700 rounded transition-all"
                style={{
                  background: !selectedCandidate ? "var(--secondary)" : "var(--primary)",
                  color: !selectedCandidate ? "var(--muted-foreground)" : "var(--primary-foreground)",
                  cursor: !selectedCandidate || generating ? "not-allowed" : "pointer",
                }}
              >
                {generating ? (
                  <>
                    <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                    Generating with AI…
                  </>
                ) : (
                  <>
                    <Sparkles size={17} strokeWidth={1.8} aria-hidden="true" />
                    {tab === "cv" ? "Generate CV with AI" : "Generate Medical with AI"}
                  </>
                )}
              </button>
            </div>

            {generating && (
              <div className="rounded border p-8 text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="mb-3 flex justify-center" style={{ color: "var(--primary)" }}><Sparkles size={30} strokeWidth={1.6} aria-hidden="true" /></div>
                <p className="text-sm font-600 mb-1" style={{ color: "var(--foreground)" }}>
                  AI is generating the {tab === "cv" ? "CV" : "medical document"} for {selectedCandidate?.name}…
                </p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Pulling candidate data and applying company template</p>
                <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
                  <div className="h-full rounded-full" style={{ background: "var(--primary)", width: "60%", transition: "width 2s" }} />
                </div>
              </div>
            )}

            {generated && !generating && (
              <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <CircleCheck size={16} strokeWidth={1.8} aria-hidden="true" style={{ color: "#10b981" }} />
                    <span className="text-sm font-700" style={{ color: "var(--foreground)" }}>
                      {tab === "cv" ? "CV" : "Medical Document"} generated for {selectedCandidate?.name}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(!editing)}
                      className="px-3 py-1 text-xs font-600 rounded border"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                      {editing ? "View" : "Edit"}
                    </button>
                    <button onClick={handleGenerate}
                      className="px-3 py-1 text-xs font-600 rounded border"
                      style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                      Regenerate
                    </button>
                    <button className="px-3 py-1 text-xs font-600 rounded border" style={{ borderColor: "var(--border)", color: "#10b981" }}>
                      Attach to Candidate
                    </button>
                    <button className="px-3 py-1 text-xs font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                      Export PDF
                    </button>
                  </div>
                </div>
                <div className="p-5">
                  {editing ? (
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={30}
                      className="w-full px-3 py-2 text-sm rounded border outline-none resize-y mono"
                      style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "JetBrains Mono, monospace" }}
                    />
                  ) : (
                    <pre className="text-sm whitespace-pre-wrap mono" style={{ color: "var(--foreground)", fontFamily: "JetBrains Mono, monospace", lineHeight: "1.6" }}>
                      {content}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {["Date", "Candidate", "Action", "Generated By", "Status"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{h.date}</td>
                    <td className="px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>{h.candidate}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--primary)" }}>{h.action}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{h.generatedBy}</td>
                    <td className="px-4 py-3">
                      <span className="mono text-xs font-600 px-1.5 py-0.5 rounded"
                        style={{ color: h.status === "Attached" ? "#10b981" : h.status === "Exported" ? "#3b82f6" : "#f59e0b", background: h.status === "Attached" ? "#10b98120" : h.status === "Exported" ? "#3b82f620" : "#f59e0b20" }}>
                        {h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
