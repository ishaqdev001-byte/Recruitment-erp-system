"use client"

import { useEffect, useState, type FormEvent } from "react"

import { Plus, Tags, ToggleLeft, ToggleRight } from "lucide-react"

type ExpenseCategory = {
  id: string

  name: string

  is_active: boolean

  created_at: string
}

const fieldStyle = {
  background: "var(--secondary)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
}

export default function ExpenseCategoriesSettings() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])

  const [canManage, setCanManage] = useState(false)

  const [name, setName] = useState("")

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [updatingId, setUpdatingId] = useState("")

  const [error, setError] = useState("")

  const [notice, setNotice] = useState("")

  const load = async () => {
    setLoading(true)

    setError("")

    try {
      const response = await fetch("/api/settings/expense-categories", {
        cache: "no-store",
      })

      const result = (await response.json()) as {
        categories?: ExpenseCategory[]
        canManage?: boolean
        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to load expense categories.")

      setCategories(result.categories ?? [])

      setCanManage(Boolean(result.canManage))
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load expense categories.",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setSaving(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/settings/expense-categories", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ name: name.trim() }),
      })

      const result = (await response.json()) as {
        category?: ExpenseCategory
        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to add expense category.")

      if (result.category)
        setCategories((current) =>
          [...current, result.category!].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        )

      setName("")

      setNotice("Expense category added.")
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to add expense category.",
      )
    } finally {
      setSaving(false)
    }
  }

  const toggleCategory = async (category: ExpenseCategory) => {
    setUpdatingId(category.id)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/settings/expense-categories", {
        method: "PATCH",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          id: category.id,
          isActive: !category.is_active,
        }),
      })

      const result = (await response.json()) as {
        category?: ExpenseCategory
        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to update expense category.")

      if (result.category)
        setCategories((current) =>
          current.map((item) =>
            item.id === category.id ? result.category! : item,
          ),
        )

      setNotice(
        `${category.name} ${category.is_active ? "deactivated" : "activated"}.`,
      )
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update expense category.",
      )
    } finally {
      setUpdatingId("")
    }
  }

  const active = categories.filter((category) => category.is_active)

  const inactive = categories.filter((category) => !category.is_active)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <div className="flex items-center gap-2">
            <Tags
              size={18}
              aria-hidden="true"
              style={{ color: "var(--primary)" }}
            />
            <h2
              className="text-xl font-700"
              style={{ color: "var(--foreground)" }}
            >
              Expense Categories
            </h2>
          </div>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            {canManage
              ? "Manage the categories used when recording expenses and requisitions."
              : "Categories available for expenses and requisitions."}
          </p>
        </div>
        {canManage && (
          <form onSubmit={addCategory} className="flex w-full max-w-lg gap-2">
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="New expense category name"
              placeholder="Category name"
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
              <Plus size={15} aria-hidden="true" /> Add category
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
        {loading && (
          <p
            className="py-10 text-center text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            Loading expense categories…
          </p>
        )}
        {!loading && categories.length === 0 && (
          <div className="py-16 text-center">
            <Tags
              size={34}
              className="mx-auto mb-3 opacity-30"
              aria-hidden="true"
              style={{ color: "var(--muted-foreground)" }}
            />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {canManage
                ? "No expense categories configured yet. Add one to enable expense and requisition entry."
                : "No expense categories have been configured yet."}
            </p>
          </div>
        )}

        {!loading && active.length > 0 && (
          <section>
            <h3
              className="mb-3 text-xs font-700 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Active ({active.length})
            </h3>
            <div
              className="overflow-x-auto rounded border"
              style={{
                borderColor: "var(--border)",
                background: "var(--card)",
              }}
            >
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
                      Category
                    </th>
                    {canManage && (
                      <th
                        className="px-4 py-3 text-right text-xs font-700 uppercase tracking-wide"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {active.map((category) => (
                    <tr
                      key={category.id}
                      className="border-b last:border-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td
                        className="px-4 py-3 font-600"
                        style={{ color: "var(--foreground)" }}
                      >
                        {category.name}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={updatingId === category.id}
                            onClick={() => void toggleCategory(category)}
                            className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600 disabled:opacity-50"
                            style={{
                              borderColor: "var(--border)",
                              color: "#b7791f",
                            }}
                          >
                            <ToggleRight size={14} aria-hidden="true" />{" "}
                            Deactivate
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && canManage && inactive.length > 0 && (
          <section className="mt-8">
            <h3
              className="mb-3 text-xs font-700 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Inactive ({inactive.length})
            </h3>
            <div
              className="overflow-x-auto rounded border"
              style={{
                borderColor: "var(--border)",
                background: "var(--card)",
              }}
            >
              <table className="w-full text-sm">
                <tbody>
                  {inactive.map((category) => (
                    <tr
                      key={category.id}
                      className="border-b last:border-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {category.name}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={updatingId === category.id}
                          onClick={() => void toggleCategory(category)}
                          className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600 disabled:opacity-50"
                          style={{
                            borderColor: "var(--border)",
                            color: "var(--primary)",
                          }}
                        >
                          <ToggleLeft size={14} aria-hidden="true" /> Activate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
