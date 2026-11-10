"use client"

import { useEffect, useState } from "react"

import { Eye, X } from "lucide-react"

import type { Candidate } from "./Candidates"

type CandidateField = keyof Candidate

const sections: {
  title: string

  fields: { label: string; key: CandidateField }[]
}[] = [
  {
    title: "Personal details",

    fields: [
      { label: "File number", key: "fileNumber" },

      { label: "First name", key: "firstName" },

      { label: "Other names", key: "otherNames" },

      { label: "Last name", key: "lastName" },

      { label: "Date of birth", key: "dob" },

      { label: "Age", key: "age" },

      { label: "Gender", key: "gender" },

      { label: "Marital status", key: "maritalStatus" },

      { label: "Religion", key: "religion" },

      { label: "Nationality", key: "nationality" },

      { label: "Phone", key: "phone" },

      { label: "Secondary phone", key: "secondaryPhone" },

      { label: "Other phone", key: "otherPhone" },

      { label: "Registration source", key: "source" },

      { label: "Agent", key: "agent" },

      { label: "Media channel", key: "mediaChannel" },
    ],
  },

  {
    title: "Identity and passport",

    fields: [
      { label: "National ID", key: "nin" },

      { label: "Passport number", key: "passportNumber" },

      { label: "Passport issue date", key: "passportIssue" },

      { label: "Passport expiry date", key: "passportExpiry" },

      { label: "Passport status", key: "passportStatus" },

      { label: "Passport branch", key: "passportBranch" },

      { label: "Passport storage location", key: "passportStorageLocation" },

      { label: "Verification", key: "verification" },
    ],
  },

  {
    title: "Residence",

    fields: [
      { label: "Place of birth", key: "placeOfBirth" },

      { label: "Country of residence", key: "residenceCountry" },

      { label: "State of residence", key: "residenceState" },

      { label: "Physical address", key: "physicalAddress" },

      { label: "District", key: "district" },

      { label: "County", key: "county" },

      { label: "Sub-county", key: "subCounty" },

      { label: "Parish", key: "parish" },
    ],
  },

  {
    title: "Family and emergency contacts",

    fields: [
      { label: "Father's name", key: "fatherName" },

      { label: "Father's phone", key: "fatherPhone" },

      { label: "Father's status", key: "fatherStatus" },

      { label: "Mother's name", key: "motherName" },

      { label: "Mother's phone", key: "motherPhone" },

      { label: "Mother's status", key: "motherStatus" },

      { label: "Next of kin first name", key: "kinFirstName" },

      { label: "Next of kin last name", key: "kinLastName" },

      { label: "Next of kin phone", key: "kinPhone" },

      { label: "Next of kin relationship", key: "kinRelationship" },

      { label: "Emergency contact first name", key: "emergencyFirstName" },

      { label: "Emergency contact last name", key: "emergencyLastName" },

      { label: "Emergency contact phone", key: "emergencyPhone" },

      { label: "Emergency contact relationship", key: "emergencyRelationship" },
    ],
  },

  {
    title: "Education and employment",

    fields: [
      { label: "Education qualification", key: "educationQualification" },

      { label: "Education institution", key: "educationInstitution" },

      { label: "Year completed", key: "educationYearCompleted" },

      { label: "Field of study", key: "educationField" },

      { label: "Last employer", key: "lastEmployer" },

      { label: "Previous job title", key: "previousJobTitle" },

      { label: "Employment from", key: "employmentFrom" },

      { label: "Employment to", key: "employmentTo" },

      { label: "Employment duties", key: "employmentDuties" },

      { label: "Key skills", key: "keySkills" },

      { label: "Languages spoken", key: "languagesSpoken" },

      { label: "Certifications", key: "certifications" },
    ],
  },

  {
    title: "Recruitment and placement",

    fields: [
      { label: "Jobs of interest", key: "jobOfInterest" },

      { label: "Preferred countries", key: "preferredCountries" },

      { label: "Preferred cities", key: "preferredCities" },

      { label: "Assigned contracts", key: "assignedContracts" },

      { label: "Recruitment stage", key: "stage" },

      { label: "Travel status", key: "travelStatus" },

      { label: "Visa status", key: "visaStatus" },

      { label: "Acceptance", key: "acceptance" },

      { label: "Contracts", key: "contracts" },

      { label: "Contract manager", key: "contractManager" },

      { label: "Branch", key: "branch" },

      { label: "Abroad status", key: "abroadStatus" },

      { label: "Abroad experience", key: "abroadExperience" },

      { label: "Recruiter notes", key: "recruiterNotes" },

      { label: "Created by", key: "createdByName" },

      { label: "Created at", key: "createdAt" },

      { label: "Last updated by", key: "updatedByName" },

      { label: "Last updated at", key: "updatedAt" },
    ],
  },
]

type CandidateFinance = {
  summary: {
    totalInvoiced: number
    totalDeposits: number
    totalPaid: number
    outstandingBalance: number
  }
  invoices: {
    id: string
    invoice_number: string
    description: string
    amount: number
    status: string
    issued_at: string
  }[]
  receipts: {
    id: string
    receipt_number: string
    category: string
    amount: number
    payment_method: string
    received_at: string
  }[]
  payments: {
    id: string
    invoice_id: string
    amount: number
    paid_at: string
  }[]
}

function displayValue(value: Candidate[keyof Candidate]) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—"

  if (typeof value === "number") return value > 0 ? String(value) : "—"

  if (typeof value === "string") return value.trim() || "—"

  return "—"
}

export default function CandidateReadOnlyDetails({
  candidate,
  canViewFinance,
  onClose,
}: {
  candidate: Candidate
  canViewFinance: boolean
  onClose: () => void
}) {
  const [finance, setFinance] = useState<CandidateFinance | null>(null)
  const [financeLoading, setFinanceLoading] = useState(false)
  const [financeError, setFinanceError] = useState("")

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!canViewFinance) return

    const controller = new AbortController()
    setFinanceLoading(true)
    setFinanceError("")

    void fetch(`/api/candidates/${encodeURIComponent(candidate.id)}/finance`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as CandidateFinance & {
          error?: string
        }
        if (!response.ok)
          throw new Error(payload.error ?? "Unable to load candidate finance records.")
        setFinance(payload)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setFinanceError(
          error instanceof Error
            ? error.message
            : "Unable to load candidate finance records.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setFinanceLoading(false)
      })

    return () => controller.abort()
  }, [candidate.id, canViewFinance])

  const formatAmount = (value: number) => `UGX ${Number(value).toLocaleString()}`
  const formatDate = (value: string) =>
    value ? new Date(value).toLocaleDateString() : "—"

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-read-only-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <header
          className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Eye
                size={17}
                aria-hidden="true"
                style={{ color: "var(--primary)" }}
              />
              <h2
                id="candidate-read-only-title"
                className="text-base font-700"
                style={{ color: "var(--foreground)" }}
              >
                Candidate details
              </h2>
            </div>
            <p
              className="mt-1 break-words text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              {candidate.firstName} {candidate.otherNames} {candidate.lastName}
              {candidate.fileNumber ? ` · ${candidate.fileNumber}` : ""}
              <span className="ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-700 uppercase tracking-wide">
                View only
              </span>
            </p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close candidate details"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-[var(--secondary)]"
            style={{ color: "var(--muted-foreground)" }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {sections.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3
                className="mb-3 border-b pb-2 text-xs font-700 uppercase tracking-wider"
                style={{
                  borderColor: "var(--border)",

                  color: "var(--muted-foreground)",
                }}
              >
                {section.title}
              </h3>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.fields.map(({ key, label }) => (
                  <div key={key} className="min-w-0">
                    <dt
                      className="text-[11px] font-600"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {label}
                    </dt>
                    <dd
                      className="mt-1 break-words text-sm"
                      style={{ color: "var(--foreground)" }}
                    >
                      {displayValue(candidate[key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          {canViewFinance && (
            <section aria-labelledby="candidate-read-only-finance-heading">
              <h3
                id="candidate-read-only-finance-heading"
                className="mb-3 border-b pb-2 text-xs font-700 uppercase tracking-wider"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                Candidate finance
              </h3>
              {financeLoading ? (
                <p role="status" className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Loading finance records…
                </p>
              ) : financeError ? (
                <p role="alert" className="text-sm text-red-500">{financeError}</p>
              ) : finance ? (
                <div className="space-y-5">
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Total invoiced", finance.summary.totalInvoiced],
                      ["Total deposited", finance.summary.totalDeposits],
                      ["Total paid", finance.summary.totalPaid],
                      ["Outstanding balance", finance.summary.outstandingBalance],
                    ].map(([label, amount]) => (
                      <div
                        key={label}
                        className="rounded border p-3"
                        style={{ background: "var(--secondary)", borderColor: "var(--border)" }}
                      >
                        <dt className="text-[11px] font-600" style={{ color: "var(--muted-foreground)" }}>
                          {label}
                        </dt>
                        <dd className="mt-1 text-sm font-700" style={{ color: "var(--foreground)" }}>
                          {formatAmount(Number(amount))}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <div className="space-y-4">
                    <div>
                      <h4 className="mb-2 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                        Invoices
                      </h4>
                      {finance.invoices.length ? (
                        <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
                          <table className="w-full min-w-[560px] text-left text-xs">
                            <thead><tr className="border-b" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                              <th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th>
                            </tr></thead>
                            <tbody>{finance.invoices.map((invoice) => (
                              <tr key={invoice.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                                <td className="px-3 py-2">{invoice.invoice_number || "—"}</td><td className="px-3 py-2">{invoice.description || "—"}</td><td className="px-3 py-2">{formatDate(invoice.issued_at)}</td><td className="px-3 py-2 whitespace-nowrap">{formatAmount(invoice.amount)}</td><td className="px-3 py-2">{invoice.status}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      ) : <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No candidate invoices found.</p>}
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                        Deposits and invoice payments
                      </h4>
                      {finance.receipts.length + finance.payments.length ? (
                        <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
                          <table className="w-full min-w-[500px] text-left text-xs">
                            <thead><tr className="border-b" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                              <th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Amount</th>
                            </tr></thead>
                            <tbody>
                              {finance.receipts.map((receipt) => (
                                <tr key={`receipt-${receipt.id}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                                  <td className="px-3 py-2">{formatDate(receipt.received_at)}</td><td className="px-3 py-2">{receipt.category || "Deposit"}</td><td className="px-3 py-2">{receipt.receipt_number || "—"}</td><td className="px-3 py-2">{receipt.payment_method || "—"}</td><td className="px-3 py-2 whitespace-nowrap">{formatAmount(receipt.amount)}</td>
                                </tr>
                              ))}
                              {finance.payments.map((payment) => (
                                <tr key={`payment-${payment.id}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                                  <td className="px-3 py-2">{formatDate(payment.paid_at)}</td><td className="px-3 py-2">Invoice payment</td><td className="px-3 py-2">{payment.invoice_id}</td><td className="px-3 py-2">—</td><td className="px-3 py-2 whitespace-nowrap">{formatAmount(payment.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No deposits or invoice payments found.</p>}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          )}
        </div>
        <footer
          className="flex justify-end border-t px-4 py-3 sm:px-6"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-4 py-2 text-sm font-600"
            style={{
              borderColor: "var(--border)",

              color: "var(--foreground)",
            }}
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  )
}
