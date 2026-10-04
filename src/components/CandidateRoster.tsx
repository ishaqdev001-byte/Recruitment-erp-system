import { useEffect, useState } from "react";

interface CandidateRecord {
  id: string;
  source_row_number: number | null;
  file_number: string;
  first_name: string;
  last_name: string;
  phone: string;
  date_of_birth: string | null;
  place_of_birth: string;
  agent_name: string;
  religion: string;
  position: string;
  nationality: string;
  father_name: string;
  mother_name: string;
}

function ageAtToday(dateOfBirth: string | null) {
  if (!dateOfBirth) return "—";
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return "—";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

export default function CandidateRoster() {
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/candidates", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load candidates.");
        if (!cancelled) setCandidates(payload.candidates as CandidateRecord[]);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Unable to load candidates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = candidates.filter((candidate) =>
    `${candidate.first_name} ${candidate.last_name} ${candidate.file_number} ${candidate.phone}`.toLowerCase().includes(normalizedSearch),
  );

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="candidate-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 id="candidate-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Candidates</h1>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{loading ? "Loading records" : `${candidates.length} records`}</p>
        </div>
        <input
          aria-label="Search candidates"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, file number, or mobile"
          className="w-full max-w-sm border px-3 py-2 text-sm outline-none"
          style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="sticky top-0" style={{ background: "var(--card)" }}>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
              {["S/N", "File No.", "Candidate Name", "Date of Birth", "Age", "Place of Birth", "Agent", "Religion", "Mobile", "Position", "Nationality", "Father Name", "Mother Name"].map((heading) => (
                <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase" style={{ color: "var(--muted-foreground)" }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={13} className="px-4 py-10 text-center" style={{ color: "var(--muted-foreground)" }}>Loading company records…</td></tr>}
            {error && <tr><td colSpan={13} role="alert" className="px-4 py-10 text-center" style={{ color: "#ef4444" }}>{error}</td></tr>}
            {!loading && !error && filtered.length === 0 && (
              <tr><td colSpan={13} className="px-4 py-10 text-center" style={{ color: "var(--muted-foreground)" }}>{candidates.length ? "No matching candidates." : "No candidate records found for this company."}</td></tr>
            )}
            {filtered.map((candidate) => (
              <tr key={candidate.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{candidate.source_row_number ?? "—"}</td>
                <td className="px-3 py-2 mono text-xs">{candidate.file_number}</td>
                <td className="whitespace-nowrap px-3 py-2 font-600">{candidate.first_name} {candidate.last_name}</td>
                <td className="px-3 py-2">{candidate.date_of_birth ?? "—"}</td>
                <td className="px-3 py-2">{ageAtToday(candidate.date_of_birth)}</td>
                <td className="px-3 py-2">{candidate.place_of_birth || "—"}</td>
                <td className="px-3 py-2">{candidate.agent_name || "—"}</td>
                <td className="px-3 py-2">{candidate.religion || "—"}</td>
                <td className="px-3 py-2 mono">{candidate.phone || "—"}</td>
                <td className="px-3 py-2">{candidate.position || "—"}</td>
                <td className="px-3 py-2">{candidate.nationality || "—"}</td>
                <td className="px-3 py-2">{candidate.father_name || "—"}</td>
                <td className="px-3 py-2">{candidate.mother_name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}