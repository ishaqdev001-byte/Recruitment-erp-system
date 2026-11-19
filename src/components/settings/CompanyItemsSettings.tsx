"use client"

import { useEffect, useState, type FormEvent } from "react"
import {
  Check,
  Package,
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react"

type CatalogItem = {
  id: string
  item_code: number
  name: string
  is_active: boolean
}

const fieldStyle = {
  background: "var(--secondary)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
}

function formatItemCode(value: number) {
  return `ITEM-${String(value).padStart(6, "0")}`
}

export default function CompanyItemsSettings() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [canManage, setCanManage] = useState(false)
  const [canToggle, setCanToggle] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [name, setName] = useState("")
  const [editingId, setEditingId] = useState("")
  const [editingName, setEditingName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState("")
  const [updatingSetting, setUpdatingSetting] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/finance/expense-items", {
        cache: "no-store",
      })
      const result = (await response.json()) as {
        items?: CatalogItem[]
        enabled?: boolean
        canManage?: boolean
        canToggle?: boolean
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error ?? "Unable to load company items.")
      setItems(result.items ?? [])
      setEnabled(Boolean(result.enabled))
      setCanManage(Boolean(result.canManage))
      setCanToggle(Boolean(result.canToggle))
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load company items.",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const addItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/finance/expense-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      const result = (await response.json()) as {
        item?: CatalogItem
        error?: string
      }
      if (!response.ok || !result.item)
        throw new Error(result.error ?? "Unable to add this catalog item.")
      setItems((current) =>
        [...current.filter((item) => item.id !== result.item!.id), result.item!]
          .sort((left, right) => left.item_code - right.item_code),
      )
      setName("")
      setNotice(`${formatItemCode(result.item.item_code)} added to the catalog.`)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to add this catalog item.",
      )
    } finally {
      setSaving(false)
    }
  }

  const saveItem = async (item: CatalogItem, changes: Record<string, unknown>) => {
    setUpdatingId(item.id)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/finance/expense-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, ...changes }),
      })
      const result = (await response.json()) as {
        item?: CatalogItem
        error?: string
      }
      if (!response.ok || !result.item)
        throw new Error(result.error ?? "Unable to update the catalog item.")
      setItems((current) =>
        current
          .map((entry) => (entry.id === item.id ? result.item! : entry))
          .sort((left, right) => left.item_code - right.item_code),
      )
      setEditingId("")
      setEditingName("")
      setNotice(`${formatItemCode(item.item_code)} updated.`)
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update the catalog item.",
      )
    } finally {
      setUpdatingId("")
    }
  }

  const toggleCatalog = async () => {
    setUpdatingSetting(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/finance/expense-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogEnabled: !enabled }),
      })
      const result = (await response.json()) as {
        enabled?: boolean
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error ?? "Unable to update catalog settings.")
      setEnabled(Boolean(result.enabled))
      setNotice(
        result.enabled
          ? "Catalog-backed item entry is enabled."
          : "Catalog-backed item entry is disabled; free-text item entry remains available.",
      )
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Unable to update catalog settings.",
      )
    } finally {
      setUpdatingSetting(false)
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
            <Package
              size={18}
              aria-hidden="true"
              style={{ color: "var(--primary)" }}
            />
            <h2
              className="text-xl font-700"
              style={{ color: "var(--foreground)" }}
            >
              Expense Items
            </h2>
          </div>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            Reusable company items have unique item codes and can be selected in
            expense requests and requisitions.
          </p>
        </div>
        {canManage && (
          <form onSubmit={addItem} className="flex w-full max-w-lg gap-2">
            <input
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="New expense item name"
              placeholder="Item name"
              className="min-w-0 flex-1 rounded border px-3 py-2 text-sm outline-none"
              style={fieldStyle}
            />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-600 disabled:opacity-50"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Plus size={15} aria-hidden="true" /> Add item
            </button>
          </form>
        )}
      </header>

      {error && (
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
          className="mx-6 mt-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600"
        >
          {notice}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {canToggle && (
          <section
            className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded border p-4"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div>
              <h3
                className="text-sm font-700"
                style={{ color: "var(--foreground)" }}
              >
                Require catalog items
              </h3>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                When disabled, item descriptions stay free text and the
                existing workflow is unchanged.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void toggleCatalog()}
              disabled={updatingSetting}
              aria-pressed={enabled}
              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-600 disabled:opacity-50"
              style={{
                borderColor: "var(--border)",
                color: enabled ? "var(--primary)" : "var(--muted-foreground)",
              }}
            >
              {enabled ? (
                <ToggleRight size={17} aria-hidden="true" />
              ) : (
                <ToggleLeft size={17} aria-hidden="true" />
              )}
              {updatingSetting
                ? "Saving…"
                : enabled
                  ? "Enabled"
                  : "Disabled"}
            </button>
          </section>
        )}

        {loading ? (
          <p
            className="py-10 text-center text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            Loading company items…
          </p>
        ) : items.length === 0 ? (
          <p
            className="py-16 text-center text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            No company items have been added yet.
          </p>
        ) : (
          <div
            className="overflow-x-auto rounded border"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--secondary)",
                  }}
                >
                  {["Item code", "Item name", "Status", ...(canManage ? ["Actions"] : [])].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-xs font-700 uppercase tracking-wide"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td
                      className="whitespace-nowrap px-4 py-3 font-mono text-xs font-700"
                      style={{ color: "var(--primary)" }}
                    >
                      {formatItemCode(item.item_code)}
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{ color: "var(--foreground)" }}
                    >
                      {editingId === item.id ? (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void saveItem(item, { name: editingName.trim() })
                          }}
                        >
                          <input
                            required
                            maxLength={200}
                            autoFocus
                            value={editingName}
                            onChange={(event) =>
                              setEditingName(event.target.value)
                            }
                            aria-label={`Rename ${item.name}`}
                            className="min-w-0 rounded border px-2 py-1 text-sm outline-none"
                            style={fieldStyle}
                          />
                          <button
                            type="submit"
                            disabled={updatingId === item.id}
                            aria-label="Save item name"
                            className="rounded p-1 text-emerald-600 disabled:opacity-50"
                          >
                            <Check size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={updatingId === item.id}
                            onClick={() => {
                              setEditingId("")
                              setEditingName("")
                            }}
                            aria-label="Cancel item rename"
                            className="rounded p-1 disabled:opacity-50"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            <X size={16} aria-hidden="true" />
                          </button>
                        </form>
                      ) : (
                        item.name
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{
                        color: item.is_active
                          ? "var(--primary)"
                          : "var(--muted-foreground)",
                      }}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {editingId !== item.id && (
                            <button
                              type="button"
                              disabled={updatingId === item.id}
                              onClick={() => {
                                setEditingId(item.id)
                                setEditingName(item.name)
                              }}
                              className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600 disabled:opacity-50"
                              style={{
                                borderColor: "var(--border)",
                                color: "var(--foreground)",
                              }}
                            >
                              <Pencil size={14} aria-hidden="true" /> Edit
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={updatingId === item.id}
                            onClick={() =>
                              void saveItem(item, { isActive: !item.is_active })
                            }
                            className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600 disabled:opacity-50"
                            style={{
                              borderColor: "var(--border)",
                              color: item.is_active
                                ? "#b7791f"
                                : "var(--primary)",
                            }}
                          >
                            {item.is_active ? (
                              <ToggleRight size={14} aria-hidden="true" />
                            ) : (
                              <ToggleLeft size={14} aria-hidden="true" />
                            )}
                            {item.is_active ? "Deactivate" : "Reactivate"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
