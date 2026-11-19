"use client"

import { useEffect, useState, type FormEvent } from "react"

import {
  Briefcase,
  Edit2,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react"

type Position = {
  id: string

  name: string

  is_active: boolean

  created_at: string

  updated_at: string
}

const fieldStyle = {
  background: "var(--secondary)",

  borderColor: "var(--border)",

  color: "var(--foreground)",
}

export default function PositionsSettings() {
  const [positions, setPositions] = useState<Position[]>([])

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")

  const [notice, setNotice] = useState("")

  const [showForm, setShowForm] = useState(false)

  const [editing, setEditing] = useState<Position | null>(null)

  const [name, setName] = useState("")

  const load = async () => {
    setLoading(true)

    setError("")

    try {
      const response = await fetch("/api/settings/positions", {
        cache: "no-store",
      })

      const result = (await response.json()) as {
        positions?: Position[]

        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to load positions.")

      setPositions(result.positions ?? [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load positions.",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const closeForm = () => {
    setShowForm(false)

    setEditing(null)

    setName("")

    setError("")
  }

  const openAdd = () => {
    setEditing(null)

    setName("")

    setError("")

    setNotice("")

    setShowForm(true)
  }

  const openEdit = (position: Position) => {
    setEditing(position)

    setName(position.name)

    setError("")

    setNotice("")

    setShowForm(true)
  }

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setSaving(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/settings/positions", {
        method: editing ? "PATCH" : "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(
          editing
            ? { id: editing.id, name: name.trim() }
            : { name: name.trim() },
        ),
      })

      const result = (await response.json()) as {
        position?: Position

        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to save the position.")

      const savedPosition = result.position

      if (savedPosition) {
        setPositions((current) => {
          const exists = current.some((item) => item.id === savedPosition.id)

          const updated = exists
            ? current.map((item) =>
                item.id === savedPosition.id ? savedPosition : item,
              )
            : [...current, savedPosition]

          return updated.sort((a, b) => a.name.localeCompare(b.name))
        })
      }

      setNotice(editing ? "Position updated." : "Position added.")

      closeForm()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the position.",
      )
    } finally {
      setSaving(false)
    }
  }

  const updatePosition = async (
    position: Position,

    action: "active" | "delete",
  ) => {
    setError("")

    setNotice("")

    if (
      action === "delete" &&
      !window.confirm(
        `Delete "${position.name}"? Existing staff records will keep this position as historical text.`,
      )
    )
      return

    try {
      const response = await fetch("/api/settings/positions", {
        method: action === "delete" ? "DELETE" : "PATCH",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(
          action === "delete"
            ? { id: position.id }
            : { id: position.id, isActive: !position.is_active },
        ),
      })

      const result = (await response.json()) as {
        position?: Position

        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to update the position.")

      if (action === "delete") {
        setPositions((current) =>
          current.filter((item) => item.id !== position.id),
        )

        setNotice("Position deleted. Existing staff history was retained.")
      } else if (result.position) {
        const savedPosition = result.position

        setPositions((current) =>
          current.map((item) =>
            item.id === savedPosition.id ? savedPosition : item,
          ),
        )

        setNotice(
          `${position.name} ${
            savedPosition.is_active ? "activated" : "deactivated"
          }.`,
        )
      }
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update the position.",
      )
    }
  }

  const active = positions.filter((position) => position.is_active)

  const inactive = positions.filter((position) => !position.is_active)

  const renderPositions = (items: Position[], isActive: boolean) => (
    <section>
      <h3
        className="mb-3 text-xs font-700 uppercase tracking-wider"
        style={{ color: "var(--muted-foreground)" }}
      >
        {isActive ? "Active" : "Inactive"} ({items.length})
      </h3>
      <div
        className={`overflow-x-auto rounded border${
          isActive ? "" : " opacity-70"
        }`}
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div className="app-table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-left"
                style={{ borderColor: "var(--border)" }}
              >
                <th
                  className="px-4 py-3 text-xs font-700 uppercase tracking-wide"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Position
                </th>
                <th
                  className="px-4 py-3 text-xs font-700 uppercase tracking-wide"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Status
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-700 uppercase tracking-wide"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((position) => (
                <tr
                  key={position.id}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td
                    className="px-4 py-3 font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    {position.name}
                  </td>
                  <td
                    className="px-4 py-3 text-xs"
                    style={{
                      color: isActive ? "#168358" : "var(--muted-foreground)",
                    }}
                  >
                    {isActive ? "Active" : "Inactive"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(position)}
                        className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                        style={{
                          borderColor: "var(--border)",

                          color: "var(--foreground)",
                        }}
                      >
                        <Edit2 size={12} aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void updatePosition(position, "active")}
                        className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                        style={{
                          borderColor: "var(--border)",

                          color: isActive ? "#b7791f" : "#168358",
                        }}
                      >
                        {isActive ? (
                          <ToggleRight size={13} aria-hidden="true" />
                        ) : (
                          <ToggleLeft size={13} aria-hidden="true" />
                        )}
                        {isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void updatePosition(position, "delete")}
                        className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600 text-red-500"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <Trash2 size={12} aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <div className="flex items-center gap-2">
            <Briefcase
              size={18}
              aria-hidden="true"
              style={{ color: "var(--primary)" }}
            />
            <h2
              className="text-xl font-700"
              style={{ color: "var(--foreground)" }}
            >
              Positions
            </h2>
          </div>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            Manage the positions available when adding or inviting staff.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-600"
          style={{
            background: "var(--primary)",

            color: "var(--primary-foreground)",
          }}
        >
          <Plus size={16} aria-hidden="true" />
          Add position
        </button>
      </div>

      {error && !showForm && (
        <div
          role="alert"
          className="mx-6 mt-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mx-6 mt-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
        >
          {notice}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
        {loading && (
          <p
            className="py-10 text-center text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            Loading positions…
          </p>
        )}
        {!loading && positions.length === 0 && (
          <div className="py-16 text-center">
            <Briefcase
              size={36}
              className="mx-auto mb-3 opacity-30"
              style={{ color: "var(--muted-foreground)" }}
            />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              No positions configured yet.
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Add a position here to make it available in staff forms.
            </p>
          </div>
        )}
        {!loading && active.length > 0 && renderPositions(active, true)}
        {!loading && inactive.length > 0 && renderPositions(inactive, false)}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm()
          }}
        >
          <form
            onSubmit={submitForm}
            className="w-full max-w-md rounded border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="mb-5 flex items-start justify-between">
              <h3
                className="text-base font-700"
                style={{ color: "var(--foreground)" }}
              >
                {editing ? "Edit position" : "Add position"}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="rounded p-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
              >
                {error}
              </div>
            )}

            <label
              className="mb-1 block text-xs font-600 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Position name
              <input
                type="text"
                required
                maxLength={150}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded border px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none"
                style={fieldStyle}
                placeholder="e.g. Finance Officer"
              />
            </label>

            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",

                  color: "var(--primary-foreground)",
                }}
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Add position"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={closeForm}
                className="rounded border px-4 py-2.5 text-sm font-600"
                style={{
                  borderColor: "var(--border)",

                  color: "var(--foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
