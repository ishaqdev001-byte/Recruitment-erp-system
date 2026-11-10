"use client"

import { useEffect, useState } from "react"

import { Bell, MessageSquareText, RefreshCw, StickyNote } from "lucide-react"

type AgentNote = {
  id: string

  subject: string

  body: string

  candidate_names: string[]

  created_at: string
}

export default function AgentCommunicationsNotes() {
  const [notes, setNotes] = useState<AgentNote[]>([])

  const [loading, setLoading] = useState(true)

  const [refreshing, setRefreshing] = useState(false)

  const [error, setError] = useState("")

  const loadNotes = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    setError("")

    try {
      const response = await fetch("/api/communications/agent-notes", {
        cache: "no-store",
      })

      const payload = (await response.json()) as {
        notes?: AgentNote[]

        error?: string
      }

      if (!response.ok)
        throw new Error(payload.error ?? "Unable to load your notes.")

      setNotes(payload.notes ?? [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your notes.",
      )
    } finally {
      setLoading(false)

      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadNotes()
  }, [])

  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-lg border"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <header
        className="flex items-center justify-between gap-3 border-b p-4 sm:p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: "var(--secondary)", color: "var(--primary)" }}
          >
            <MessageSquareText size={19} aria-hidden="true" />
          </div>
          <div>
            <h1
              className="text-lg font-700"
              style={{ color: "var(--foreground)" }}
            >
              Communications
            </h1>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Notes sent to you by your company
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadNotes(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-600 disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          <RefreshCw
            size={14}
            className={refreshing ? "animate-spin" : ""}
            aria-hidden="true"
          />
          Refresh
        </button>
      </header>

      <div
        className="flex items-start gap-2 border-b px-4 py-3 text-xs sm:px-5"
        style={{
          background: "var(--secondary)",
          borderColor: "var(--border)",
          color: "var(--muted-foreground)",
        }}
      >
        <Bell size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          To receive alerts when you are away from the app, open the
          notification center and enable Browser and system alerts. Allow
          notifications in your browser when prompted.
        </p>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {error && (
          <p role="alert" className="p-5 text-sm text-red-500">
            {error}
          </p>
        )}
        {loading ? (
          <p
            role="status"
            className="p-8 text-center text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            Loading your notes…
          </p>
        ) : !error && notes.length === 0 ? (
          <div className="p-10 text-center">
            <StickyNote
              size={24}
              className="mx-auto mb-2"
              aria-hidden="true"
              style={{ color: "var(--muted-foreground)" }}
            />
            <p
              className="text-sm font-600"
              style={{ color: "var(--foreground)" }}
            >
              No notes yet
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Company messages about your candidates will appear here.
            </p>
          </div>
        ) : (
          notes.map((note) => (
            <article key={note.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2
                  className="text-sm font-700"
                  style={{ color: "var(--foreground)" }}
                >
                  {note.subject}
                </h2>
                <time
                  className="text-xs"
                  dateTime={note.created_at}
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {new Date(note.created_at).toLocaleString()}
                </time>
              </div>
              {note.candidate_names.length > 0 && (
                <p
                  className="mt-2 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Candidates: {note.candidate_names.join(", ")}
                </p>
              )}
              <p
                className="mt-3 whitespace-pre-wrap break-words text-sm leading-6"
                style={{ color: "var(--foreground)" }}
              >
                {note.body}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
