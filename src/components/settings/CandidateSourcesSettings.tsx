"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Plus, Tags } from "lucide-react"

type CandidateSource = { id: string; source: string }

const fieldStyle = {
  background: "var(--secondary)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
}

export default function CandidateSourcesSettings() {
  const [sources, setSources] = useState<CandidateSource[]>([])
  const [canManage, setCanManage] = useState(false)
  const [sourceName, setSourceName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/candidates/sources", { cache: "no-store" })
      const result = await response.json() as {
        sources?: CandidateSource[]
        canManageSources?: boolean
        error?: string
      }
      if (!response.ok) throw new Error(result.error ?? "Unable to load candidate sources.")
      setSources(result.sources ?? [])
      setCanManage(Boolean(result.canManageSources))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load candidate sources.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const addSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/candidates/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceName.trim() }),
      })
      const result = await response.json() as { source?: CandidateSource; error?: string }
      if (!response.ok || !result.source) {
        throw new Error(result.error ?? "Unable to add this candidate source.")
      }
      setSources((current) =>
        [...current, result.source!].sort((a, b) => a.source.localeCompare(b.source)),
      )
      setSourceName("")
      setNotice("Candidate source added.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add this candidate source.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <div className="flex items-center gap-2">
            <Tags size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h2 className="text-xl font-700" style={{ color: "var(--foreground)" }}>
              Candidate Sources
            </h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Configure the sources staff can select when registering candidates.
          </p>
        </div>
        {canManage && (
          <form onSubmit={addSource} className="flex w-full max-w-lg gap-2">
            <input
              required
              maxLength={80}
              value={sourceName}
              onChange={(event) => setSourceName(event.target.value)}
              aria-label="New candidate source"
              placeholder="Source name"
              className="min-w-0 flex-1 rounded border px-3 py-2 text-sm outline-none"
              style={fieldStyle}
            />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-600 disabled:opacity-50"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              <Plus size={14} aria-hidden="true" />
              {saving ? "Adding…" : "Add source"}
            </button>
          </form>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {error && (
          <p role="alert" className="mb-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mb-4 border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </p>
        )}
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading candidate sources…</p>
        ) : sources.length ? (
          <div className="max-w-3xl divide-y border" style={{ borderColor: "var(--border)" }}>
            {sources.map((source) => (
              <div key={source.id} className="px-4 py-3 text-sm" style={{ color: "var(--foreground)" }}>
                {source.source}
              </div>
            ))}
          </div>
        ) : (
          !error && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No candidate sources are configured.</p>
        )}
      </div>
    </div>
  )
}
