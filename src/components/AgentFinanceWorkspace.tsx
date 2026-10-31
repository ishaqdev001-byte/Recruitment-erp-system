"use client"

import { useEffect, useState } from "react"

type PaymentRecord = { id: string; amount: number; paid_at: string }
type InvoiceRecord = {
  id: string
  invoice_number: string
  recipient_type: "agent" | "candidate"
  recipient_name: string
  description: string
  amount: number
  due_date: string
  issued_at: string
  payments: PaymentRecord[]
  deposit_amount: number
}
type ReceiptRecord = {
  id: string
  receipt_number: string
  received_from: string
  category: string
  amount: number
  payment_method: string
  external_reference: string
  notes: string
  received_at: string
}

const money = (amount: number) =>
  `UGX ${amount.toLocaleString("en-UG", { maximumFractionDigits: 2 })}`
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

export default function AgentFinanceWorkspace() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const response = await fetch("/api/agent-finance", {
          cache: "no-store",
        })
        const result = (await response.json()) as {
          invoices?: InvoiceRecord[]
          receipts?: ReceiptRecord[]
          error?: string
        }
        if (!response.ok) {
          throw new Error(result.error ?? "Unable to load invoices and receipts.")
        }
        if (!cancelled) {
          setInvoices(result.invoices ?? [])
          setReceipts(result.receipts ?? [])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load invoices and receipts.",
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>
          Agent invoices and receipts
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Invoices billed to you and visa invoices or receipts for your assigned candidates.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
        >
          {error}
        </p>
      )}

      <section className="overflow-x-auto border" style={{ borderColor: "var(--border)" }}>
        <h2 className="border-b px-4 py-3 text-sm font-700" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
          Invoices
        </h2>
        <table className="w-full min-w-180 text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
              {["Invoice", "Billed to", "Description", "Amount", "Paid", "Balance", "Due date"].map((heading) => (
                <th key={heading} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--muted-foreground)" }}>Loading invoices…</td></tr>}
            {!loading && !error && invoices.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--muted-foreground)" }}>No agent or assigned-candidate visa invoices found.</td></tr>}
            {invoices.map((invoice) => {
              const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0) + invoice.deposit_amount
              return (
                <tr key={invoice.id} className="border-b" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                  <td className="whitespace-nowrap px-4 py-3 font-600">{invoice.invoice_number}</td>
                  <td className="px-4 py-3">{invoice.recipient_name}</td>
                  <td className="px-4 py-3">{invoice.description}</td>
                  <td className="whitespace-nowrap px-4 py-3">{money(invoice.amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{money(paid)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{money(Math.max(0, invoice.amount - paid))}</td>
                  <td className="whitespace-nowrap px-4 py-3">{dateLabel(invoice.due_date)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto border" style={{ borderColor: "var(--border)" }}>
        <h2 className="border-b px-4 py-3 text-sm font-700" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
          Candidate receipts
        </h2>
        <table className="w-full min-w-140 text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
              {["Receipt", "Candidate", "Category", "Amount", "Method", "Received"].map((heading) => (
                <th key={heading} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--muted-foreground)" }}>Loading receipts…</td></tr>}
            {!loading && !error && receipts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--muted-foreground)" }}>No receipts found for your assigned candidates.</td></tr>}
            {receipts.map((receipt) => (
              <tr key={receipt.id} className="border-b" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                <td className="whitespace-nowrap px-4 py-3 font-600">{receipt.receipt_number}</td>
                <td className="px-4 py-3">{receipt.received_from}</td>
                <td className="px-4 py-3">{receipt.category}</td>
                <td className="whitespace-nowrap px-4 py-3">{money(Number(receipt.amount))}</td>
                <td className="px-4 py-3">{receipt.payment_method}</td>
                <td className="whitespace-nowrap px-4 py-3">{dateLabel(receipt.received_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  )
}
