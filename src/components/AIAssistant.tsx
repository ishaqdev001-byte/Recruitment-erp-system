import { useEffect, useState } from "react";
import { Check, CircleCheck, Download, LoaderCircle, MessageSquarePlus, Search, Send, Sparkles } from "lucide-react";
import AttachmentDrawer from "./AttachmentDrawer";

type AITab = "candidates" | "chat";
type DocumentType = "cv" | "medical" | "academic";
type ChatMessage = { role: "user" | "assistant"; content: string };
type Candidate = {
  id: string;
  file_number: string;
  first_name: string;
  last_name: string;
  position: string | null;
  nationality: string | null;
};

export default function AIAssistant() {
  const [tab, setTab] = useState<AITab>("candidates");
  const [documentType, setDocumentType] = useState<DocumentType>("cv");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [generatingCandidateId, setGeneratingCandidateId] = useState<string | null>(null);
  const [generatingDocumentType, setGeneratingDocumentType] = useState<DocumentType | null>(null);
  const [generated, setGenerated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [usageTokens, setUsageTokens] = useState<number | null>(null);
  const [usageNotice, setUsageNotice] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [viewCandidate, setViewCandidate] = useState<Candidate | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);

  const filteredCandidates = candidates.filter((candidate) =>
    `${candidate.first_name} ${candidate.last_name} ${candidate.file_number} ${candidate.position ?? ""} ${candidate.nationality ?? ""}`
      .toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

  useEffect(() => {
    const loadCandidates = async () => {
      try {
        const response = await fetch("/api/ai", { cache: "no-store" });
        const payload = await response.json() as { candidates?: Candidate[]; configured?: boolean; usageTokens?: number | null; usageError?: string; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load candidates.");
        setCandidates(payload.candidates ?? []);
        setConfigured(Boolean(payload.configured));
        setUsageTokens(payload.usageTokens ?? null);
        setUsageNotice(payload.usageError ?? "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load candidates.");
      } finally {
        setLoadingCandidates(false);
      }
    };
    void loadCandidates();
  }, []);

  const handleGenerate = async (candidate: Candidate, requestedType: DocumentType) => {
    setSelectedCandidate(candidate);
    setDocumentType(requestedType);
    setGeneratingCandidateId(candidate.id);
    setGeneratingDocumentType(requestedType);
    setGenerated(false);
    setError("");
    setUsageNotice("");
    setStorageNotice("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id, documentType: requestedType }),
      });
      const payload = await response.json() as { document?: string; fileName?: string; saved?: boolean; storageWarning?: string; usageTokens?: number | null; error?: string };
      if (!response.ok || !payload.document) throw new Error(payload.error ?? "Unable to generate the document.");
      setContent(payload.document);
      setGenerated(true);
      setEditing(false);
      setStorageNotice(payload.storageWarning ?? (payload.saved ? `${payload.fileName ?? "Draft"} saved in this candidate's documents.` : ""));
      setUsageNotice(payload.usageTokens === null || payload.usageTokens === undefined ? "The company usage total could not be updated." : "");
      if (typeof payload.usageTokens === "number") setUsageTokens(payload.usageTokens);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Unable to generate the document.");
    } finally {
      setGeneratingCandidateId(null);
      setGeneratingDocumentType(null);
    }
  };

  const handleSendInquiry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatSending) return;
    const nextMessages = [...chatMessages, { role: "user" as const, content: message }];
    setChatInput("");
    setChatMessages(nextMessages);
    setChatSending(true);
    setError("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", messages: nextMessages.slice(-20) }),
      });
      const payload = await response.json() as { answer?: string; usageTokens?: number | null; error?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.error ?? "Unable to answer this inquiry.");
      setChatMessages((messages) => [...messages, { role: "assistant", content: payload.answer! }]);
      if (typeof payload.usageTokens === "number") setUsageTokens(payload.usageTokens);
      else setUsageNotice("The company usage total could not be updated.");
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Unable to answer this inquiry.");
    } finally {
      setChatSending(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedCandidate?.file_number ?? "candidate"}-${tab}-draft.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: "candidates" as AITab, label: "Candidates" },
    { id: "chat" as AITab, label: "Ask AI" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>AI Assistant</h1>
          <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>Automate recruitment documentation with AI</p>
        </div>
        <div className="shrink-0 text-right" aria-label="Company total OpenAI token usage">
          <div className="text-[10px] font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Total usage</div>
          <div className="mono text-sm font-700" style={{ color: "var(--foreground)" }}>{usageTokens === null ? "Unavailable" : `${new Intl.NumberFormat().format(usageTokens)} tokens`}</div>
        </div>
      </div>

      <div className="flex border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setGenerated(false); setError(""); }}
            className="px-5 py-3 text-sm font-600 inline-flex items-center gap-2"
            style={{ color: tab === t.id ? "var(--primary)" : "var(--muted-foreground)", borderBottom: tab === t.id ? "2px solid var(--primary)" : "2px solid transparent" }}>
            {t.id === "chat" && <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />}
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === "candidates" && (
          <div className="mx-auto max-w-7xl space-y-4">
            {!configured && !loadingCandidates && <p role="status" className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm" style={{ color: "var(--foreground)" }}>OpenAI is not configured. Add OPENAI_API_KEY to the server environment to enable generation and inquiries.</p>}
            {error && <p role="alert" className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm" style={{ color: "var(--foreground)" }}>{error}</p>}
            {usageNotice && <p role="status" className="text-xs" style={{ color: "var(--muted-foreground)" }}>{usageNotice}</p>}
            <div className="overflow-hidden rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
                <label className="flex items-center gap-2 border px-3" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                  <Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
                  <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} aria-label="Search candidates" placeholder="Search by name, file number, role, or nationality" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} />
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-212.5 text-sm">
                  <thead>
                    <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                      {["Candidate", "File number", "Position / nationality", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-[10px] font-700 uppercase tracking-wide">{heading}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {filteredCandidates.map((candidate) => (
                      <tr key={candidate.id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-700" style={{ background: "#6366f130", color: "#6366f1" }}>{candidate.first_name[0]}{candidate.last_name[0]}</div>
                            <span className="font-600" style={{ color: "var(--foreground)" }}>{candidate.first_name} {candidate.last_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{candidate.file_number}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{[candidate.position, candidate.nationality].filter(Boolean).join(" · ") || "Not provided"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {(["cv", "medical", "academic"] as const).map((type) => (
                              <button key={type} type="button" disabled={!configured || generatingCandidateId !== null} onClick={() => void handleGenerate(candidate, type)}
                                aria-label={`Generate ${type === "cv" ? "CV" : type === "medical" ? "medical form" : "academic summary"} for ${candidate.first_name} ${candidate.last_name}`}
                                className="inline-flex items-center gap-1 border px-2 py-1.5 text-[11px] font-600 disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                                {generatingCandidateId === candidate.id && generatingDocumentType === type ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> : null}
                                {type === "cv" ? "CV" : type === "medical" ? "Medical" : "Academic"}
                              </button>
                            ))}
                            <button type="button" onClick={() => setViewCandidate(candidate)} className="border px-2.5 py-1.5 text-[11px] font-600" style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>View</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loadingCandidates && <p className="px-4 py-5 text-sm" style={{ color: "var(--muted-foreground)" }}>Loading company candidates...</p>}
              {!loadingCandidates && !filteredCandidates.length && !error && <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{candidates.length ? "No candidates match this search." : "No candidates are available in this workspace."}</p>}
            </div>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Candidate information sent to OpenAI is limited to fields used for the selected draft. Medical forms require clinician completion. Academic summaries are unofficial and never invent examination results.</p>
            {storageNotice && <p role="status" className="text-sm" style={{ color: "var(--primary)" }}>{storageNotice}</p>}
            {generatingCandidateId && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Generating {generatingDocumentType} for {selectedCandidate?.first_name} {selectedCandidate?.last_name}…</p>}
            {generated && selectedCandidate && (
              <section className="overflow-hidden rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2"><CircleCheck size={16} aria-hidden="true" style={{ color: "#10b981" }} /><span className="text-sm font-700" style={{ color: "var(--foreground)" }}>{documentType === "academic" ? "Unofficial academic summary" : documentType === "cv" ? "CV draft" : "Medical form draft"} · {selectedCandidate.first_name} {selectedCandidate.last_name}</span></div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(!editing)} className="border px-3 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>{editing ? "Preview" : "Edit"}</button>
                    <button type="button" onClick={handleDownload} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Download size={13} aria-hidden="true" /> Download text</button>
                  </div>
                </div>
                <div className="p-5">
                  {editing ? <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={24} className="w-full resize-y border px-3 py-2 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /> : <pre className="whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--foreground)" }}>{content}</pre>}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "chat" && (
          <div className="mx-auto flex h-full min-h-128 max-w-4xl flex-col border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <div><h2 className="text-sm font-700" style={{ color: "var(--foreground)" }}>Recruitment inquiry</h2><p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Ask a question or continue the conversation</p></div>
              <button type="button" aria-label="New conversation" title="New conversation" onClick={() => { setChatMessages([]); setError(""); }} className="border p-2" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}><MessageSquarePlus size={16} aria-hidden="true" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
              {!chatMessages.length && <p className="py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>What would you like help with?</p>}
              {chatMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <p className="max-w-[85%] whitespace-pre-wrap px-4 py-3 text-sm leading-6" style={{ background: message.role === "user" ? "var(--secondary)" : "transparent", color: "var(--foreground)" }}>{message.content}</p>
                </div>
              ))}
              {chatSending && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Thinking…</p>}
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </div>
            <form onSubmit={(event) => void handleSendInquiry(event)} className="border-t p-3" style={{ borderColor: "var(--border)" }}>
              <label className="sr-only" htmlFor="ai-inquiry">Your inquiry</label>
              <div className="flex items-end gap-2 border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                <textarea id="ai-inquiry" required maxLength={4000} rows={2} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask anything about recruitment operations" className="min-h-11 min-w-0 flex-1 resize-y bg-transparent py-1 text-sm outline-none" style={{ color: "var(--foreground)" }} />
                <button type="submit" disabled={!configured || chatSending || !chatInput.trim()} aria-label="Send inquiry" title="Send inquiry" className="flex h-9 w-9 shrink-0 items-center justify-center disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Send size={15} aria-hidden="true" /></button>
              </div>
              <p className="mt-2 text-center text-[10px]" style={{ color: "var(--muted-foreground)" }}>Inquiry messages are processed by OpenAI and are not saved as a conversation.</p>
            </form>
          </div>
        )}
      </div>
      {viewCandidate && <AttachmentDrawer candidate={{ id: viewCandidate.id, firstName: viewCandidate.first_name, lastName: viewCandidate.last_name, fileNumber: viewCandidate.file_number }} generatedOnly onClose={() => setViewCandidate(null)} />}
    </div>
  );
}
