"use client"

import { useState } from "react"

import { Edit2, Plus, Trash2 } from "lucide-react"

export type CompanyCatalogItem = { id: string; name: string }

export type DraftLineItem = {
  _key: string

  catalogItemId: string | null

  description: string

  quantity: string

  rate: string
}

function emptyDraftItem(): DraftLineItem {
  return {
    _key: `${Date.now()}-${Math.random()}`,

    catalogItemId: null,

    description: "",

    quantity: "",

    rate: "",
  }
}

const fmtAmount = (amount: number, currency = "") =>
  `${currency ? `${currency} ` : ""}${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,

    maximumFractionDigits: 2,
  })}`

export default function CompanyItemsEditor({
  items,

  onItemsChange,

  catalogItems,

  onCreateCatalogItem,

  currencyCode,

  error,

  onErrorChange,

  catalogError,
}: {
  items: DraftLineItem[]

  onItemsChange: (items: DraftLineItem[]) => void

  catalogItems: CompanyCatalogItem[]

  onCreateCatalogItem: (name: string) => Promise<CompanyCatalogItem>

  currencyCode: string

  error: string

  onErrorChange: (error: string) => void

  catalogError?: string
}) {
  const [input, setInput] = useState<DraftLineItem>(emptyDraftItem())

  const [saveToCatalog, setSaveToCatalog] = useState(false)

  const [savingCatalogItem, setSavingCatalogItem] = useState(false)

  const itemTotal = (item: DraftLineItem) =>
    (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0)

  const total = items.reduce((sum, item) => sum + itemTotal(item), 0)

  const addItem = async () => {
    const description = input.description.trim()

    const quantity = parseFloat(input.quantity)

    const rate = parseFloat(input.rate)

    if (!description) {
      onErrorChange("Enter an item description.")

      return
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      onErrorChange("Enter a valid quantity.")

      return
    }

    if (!Number.isFinite(rate) || rate < 0) {
      onErrorChange("Enter a valid rate.")

      return
    }

    let catalogItemId = input.catalogItemId

    if (saveToCatalog && !catalogItemId) {
      setSavingCatalogItem(true)

      try {
        const catalogItem = await onCreateCatalogItem(description)

        catalogItemId = catalogItem.id
      } catch (saveError) {
        onErrorChange(
          saveError instanceof Error
            ? saveError.message
            : "Unable to add this item to the company catalog.",
        )

        setSavingCatalogItem(false)

        return
      }

      setSavingCatalogItem(false)
    }

    onErrorChange("")

    onItemsChange([
      ...items,

      {
        ...input,

        _key: `${Date.now()}-${Math.random()}`,

        catalogItemId,

        description,

        quantity: String(quantity),

        rate: String(rate),
      },
    ])

    setInput(emptyDraftItem())

    setSaveToCatalog(false)
  }

  const deleteItem = (key: string) =>
    onItemsChange(items.filter((item) => item._key !== key))

  const editItem = (key: string) => {
    const item = items.find((entry) => entry._key === key)

    if (!item) return

    setInput({ ...item })

    setSaveToCatalog(false)

    onItemsChange(items.filter((entry) => entry._key !== key))
  }

  const setDescription = (description: string) => {
    setInput((current) => {
      const selectedItem = catalogItems.find(
        (item) => item.id === current.catalogItemId,
      )

      const keepsSelection =
        selectedItem?.name.trim().toLocaleLowerCase() ===
        description.trim().toLocaleLowerCase()

      return {
        ...current,

        description,

        catalogItemId: keepsSelection ? current.catalogItemId : null,
      }
    })
  }

  return (
    <div>
      <h3
        className="mb-3 text-xs font-700 uppercase tracking-wider"
        style={{ color: "var(--muted-foreground)" }}
      >
        Line items
      </h3>

      {catalogError && (
        <p role="status" className="mb-3 text-xs text-amber-500">
          {catalogError} You can still add items by description.
        </p>
      )}

      <div
        className="mb-3 rounded border p-4"
        style={{
          borderColor: "var(--border)",

          background: "var(--secondary)",
        }}
      >
        <label
          className="mb-3 block text-xs font-600 uppercase tracking-wider"
          style={{ color: "var(--muted-foreground)" }}
        >
          Choose a company item
          <select
            value={input.catalogItemId ?? ""}
            onChange={(event) => {
              const selectedItem = catalogItems.find(
                (item) => item.id === event.target.value,
              )

              setInput((current) => ({
                ...current,

                catalogItemId: selectedItem?.id ?? null,

                description: selectedItem?.name ?? current.description,
              }))

              setSaveToCatalog(false)
            }}
            className="mt-1 w-full rounded border px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none"
            style={{
              background: "var(--card)",

              borderColor: "var(--border)",

              color: "var(--foreground)",
            }}
          >
            <option value="">
              Enter a new item or select from the catalog
            </option>
            {catalogItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-12 items-end gap-3">
          <div className="col-span-12 sm:col-span-6">
            <label
              className="mb-1 block text-xs font-600 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Description <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              maxLength={500}
              value={input.description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--card)",

                borderColor: "var(--border)",

                color: "var(--foreground)",
              }}
              placeholder="Item description"
            />
          </div>
          <div className="col-span-4 sm:col-span-2">
            <label
              className="mb-1 block text-xs font-600 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Qty <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min="0.0001"
              step="any"
              value={input.quantity}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,

                  quantity: event.target.value,
                }))
              }
              className="w-full rounded border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--card)",

                borderColor: "var(--border)",

                color: "var(--foreground)",
              }}
              placeholder="1"
            />
          </div>
          <div className="col-span-4 sm:col-span-2">
            <label
              className="mb-1 block text-xs font-600 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Rate <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={input.rate}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,

                  rate: event.target.value,
                }))
              }
              className="w-full rounded border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--card)",

                borderColor: "var(--border)",

                color: "var(--foreground)",
              }}
              placeholder="0.00"
            />
          </div>
          <div className="col-span-4 sm:col-span-2">
            <span
              className="mb-1 block text-xs font-600 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Total
            </span>
            <div
              className="rounded border px-3 py-2.5 text-sm font-600"
              style={{
                background: "var(--card)",

                borderColor: "var(--border)",

                color: "#6366f1",
              }}
            >
              {fmtAmount(itemTotal(input))}
            </div>
          </div>
        </div>

        {!input.catalogItemId && (
          <label
            className="mt-3 flex items-center gap-2 text-xs"
            style={{ color: "var(--foreground)" }}
          >
            <input
              type="checkbox"
              checked={saveToCatalog}
              onChange={(event) => setSaveToCatalog(event.target.checked)}
            />
            Save this item in the reusable company catalog
          </label>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void addItem()}
          disabled={savingCatalogItem}
          className="mt-3 inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-600 disabled:opacity-50"
          style={{
            background: "var(--primary)",

            color: "var(--primary-foreground)",
          }}
        >
          <Plus size={15} aria-hidden="true" />
          {savingCatalogItem ? "Saving catalog item…" : "Add item"}
        </button>
      </div>

      {items.length > 0 ? (
        <div
          className="overflow-x-auto rounded border"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="app-table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left"
                  style={{
                    borderColor: "var(--border)",

                    background: "var(--secondary)",
                  }}
                >
                  {["Description", "Qty", "Rate", "Total", "Actions"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="whitespace-nowrap px-3 py-2.5 text-xs font-700 uppercase tracking-wide"
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
                    key={item._key}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td
                      className="px-3 py-2.5"
                      style={{ color: "var(--foreground)" }}
                    >
                      {item.description}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2.5 text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {item.quantity}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2.5 text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {fmtAmount(parseFloat(item.rate) || 0)}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2.5 font-700"
                      style={{ color: "#6366f1" }}
                    >
                      {fmtAmount(itemTotal(item))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => editItem(item._key)}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-600"
                          style={{
                            borderColor: "var(--border)",

                            color: "var(--foreground)",
                          }}
                        >
                          <Edit2 size={11} aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteItem(item._key)}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-600"
                          style={{
                            borderColor: "var(--border)",

                            color: "#ef4444",
                          }}
                        >
                          <Trash2 size={11} aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className="border-t"
                  style={{
                    borderColor: "var(--border)",

                    background: "var(--secondary)",
                  }}
                >
                  <td
                    colSpan={3}
                    className="px-3 py-2.5 text-right text-xs font-700 uppercase tracking-wide"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {items.length} item{items.length === 1 ? "" : "s"}
                  </td>
                  <td
                    className="whitespace-nowrap px-3 py-2.5 text-base font-700"
                    style={{ color: "#6366f1" }}
                  >
                    {fmtAmount(total, currencyCode)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div
          className="rounded border border-dashed px-4 py-8 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No items added yet. Add one or select it from the company catalog.
          </p>
        </div>
      )}
    </div>
  )
}
