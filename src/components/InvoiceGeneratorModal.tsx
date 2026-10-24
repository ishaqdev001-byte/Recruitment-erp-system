"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { generateInvoicePDF, downloadInvoicePDF, type InvoiceData as InvoiceDataType } from "@/lib/invoice-pdf";

type InvoiceRecipientType = "contractor" | "supplier" | "candidate" | "agent";

type InvoiceData = {
  recipientType: InvoiceRecipientType;
  recipientId: string;
  recipientName: string;
  description: string;
  amount: number;
  dueDate: string;
};

type CompanyInfo = {
  name?: string;
  email?: string;
  phone?: string;
  office_address?: string;
  city?: string;
  country?: string;
  registration_number?: string;
  website?: string;
};

type PaymentInfo = {
  payment_method: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  swift_code: string;
  currency: string;
  payment_reference: string;
};

export default function InvoiceGeneratorModal({
  isOpen,
  onClose,
  recipients,
  agents,
  company,
  paymentMethods,
  onGenerate,
}: {
  isOpen: boolean;
  onClose: () => void;
  recipients: Array<{ type: "contractor" | "supplier" | "candidate"; id: string; name: string }>;
  agents: Array<{ id: string; name: string; phone?: string }>;
  company: CompanyInfo & { logo?: string };
  paymentMethods: Array<PaymentInfo & { id: string; is_default: boolean }>;
  onGenerate: (invoice: InvoiceData, preview: InvoicePreview) => Promise<void>;
}) {
  const [step, setStep] = useState<"form" | "preview" | "edit">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState<{
    recipientType: InvoiceRecipientType;
    recipientId: string;
    description: string;
    amount: string;
    dueDate: string;
  }>({
    recipientType: "contractor",
    recipientId: "",
    description: "",
    amount: "",
    dueDate: getDefaultDueDate(),
  });
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [editData, setEditData] = useState<InvoiceData | null>(null);

  function getDefaultDueDate() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  }

  const selectedRecipient = formData.recipientType === "agent" 
    ? agents.find((a) => a.id === formData.recipientId)
    : recipients.find((r) => r.id === formData.recipientId && r.type === formData.recipientType);
  const defaultPayment = paymentMethods.find((p) => p.is_default) || paymentMethods[0];

  const handleGeneratePreview = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!selectedRecipient || !formData.description.trim() || !formData.amount || parseFloat(formData.amount) <= 0) {
      setError("Please fill in all required fields with valid values.");
      return;
    }

    const invoiceData: InvoiceData = {
      recipientType: formData.recipientType,
      recipientId: formData.recipientId,
      recipientName: selectedRecipient.name,
      description: formData.description.trim(),
      amount: parseFloat(formData.amount),
      dueDate: formData.dueDate,
    };

    // Generate invoice number
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
    const issuedDate = new Date().toISOString().slice(0, 10);

    const invoicePreview: InvoicePreview = {
      invoiceNumber,
      issuedDate,
      dueDate: invoiceData.dueDate,
      company: {
        name: company.name || "Company Name",
        email: company.email || "",
        phone: company.phone || "",
        address: company.office_address || "",
        city: company.city || "",
        country: company.country || "",
        registrationNumber: company.registration_number || "",
        website: company.website || "",
        logo: company.logo || "",
      },
      billTo: {
        name: invoiceData.recipientName,
        type: invoiceData.recipientType,
      },
      items: [
        {
          description: invoiceData.description,
          quantity: 1,
          unitAmount: invoiceData.amount,
          total: invoiceData.amount,
        },
      ],
      subtotal: invoiceData.amount,
      otherCharges: 0,
      totalAmount: invoiceData.amount,
      currency: defaultPayment?.currency || "UGX",
      paymentInfo: defaultPayment || {
        payment_method: "Bank Transfer",
        bank_name: "",
        account_name: "",
        account_number: "",
        swift_code: "",
        currency: "UGX",
        payment_reference: "",
      },
    };

    setPreview(invoicePreview);
    setEditData(invoiceData);
    setStep("preview");
  };

  const handleEditInvoice = () => {
    setStep("edit");
  };

  const handleSaveEdits = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!editData || !preview) {
      setError("Invalid invoice data.");
      return;
    }

    // Validate edits
    const editForm = e.currentTarget as HTMLFormElement & {
      description: HTMLInputElement;
      amount: HTMLInputElement;
      dueDate: HTMLInputElement;
      subtotal: HTMLInputElement;
      otherCharges: HTMLInputElement;
    };

    const updatedPreview: InvoicePreview = {
      ...preview,
      items: [
        {
          description: editForm.description.value.trim(),
          quantity: 1,
          unitAmount: parseFloat(editForm.amount.value),
          total: parseFloat(editForm.amount.value),
        },
      ],
      subtotal: parseFloat(editForm.amount.value),
      otherCharges: parseFloat(editForm.otherCharges.value) || 0,
      totalAmount: parseFloat(editForm.amount.value) + (parseFloat(editForm.otherCharges.value) || 0),
      dueDate: editForm.dueDate.value,
    };

    setEditData({
      ...editData,
      description: editForm.description.value.trim(),
      amount: parseFloat(editForm.amount.value),
      dueDate: editForm.dueDate.value,
    });

    setPreview(updatedPreview);
    setStep("preview");
  };

  const handleSaveInvoice = async () => {
    if (!editData || !preview) {
      setError("Invalid invoice data.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await onGenerate(editData, preview);
      onClose();
      setStep("form");
      setFormData({ recipientType: "contractor", recipientId: "", description: "", amount: "", dueDate: getDefaultDueDate() });
      setPreview(null);
      setEditData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invoice.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!preview) {
      setError("Invalid invoice data.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const pdfBytes = await generateInvoicePDF(preview as any);
      downloadInvoicePDF(pdfBytes, preview.invoiceNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate PDF.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    if (step === "preview") {
      setStep("form");
      setPreview(null);
      setEditData(null);
    } else if (step === "edit") {
      setStep("preview");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <section
        role="dialog"
        aria-modal="true"
        className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto border"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>
                {step === "form" && "Generate Invoice"}
                {step === "preview" && "Invoice Preview"}
                {step === "edit" && "Edit Invoice"}
              </h2>
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                {step === "form" && "Enter invoice details to generate a new invoice."}
                {step === "preview" && "Review the invoice before saving."}
                {step === "edit" && "Make changes to the invoice details."}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-lg font-400"
              style={{ color: "var(--muted-foreground)" }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {error && <p className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

        <div className="p-6">
          {step === "form" && (
            <form onSubmit={handleGeneratePreview} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-700 uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                    Recipient type
                  </label>
                  <select
                    value={formData.recipientType}
                    onChange={(e) => setFormData({ ...formData, recipientType: e.target.value as InvoiceRecipientType, recipientId: "" })}
                    className="w-full border px-3 py-2 text-sm outline-none rounded"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  >
                    <option value="contractor">Contractor / Employer</option>
                    <option value="supplier">Supplier</option>
                    <option value="candidate">Candidate</option>
                    <option value="agent">Recruitment Agent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-700 uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                    Recipient
                  </label>
                  <select
                    required
                    value={formData.recipientId}
                    onChange={(e) => setFormData({ ...formData, recipientId: e.target.value })}
                    className="w-full border px-3 py-2 text-sm outline-none rounded"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  >
                    <option value="">Select {formData.recipientType === "agent" ? "agent" : formData.recipientType}</option>
                    {formData.recipientType === "agent"
                      ? agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} {agent.phone ? `(${agent.phone})` : ""}
                          </option>
                        ))
                      : recipients
                          .filter((r) => r.type === formData.recipientType)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-700 uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                  Description
                </label>
                <input
                  required
                  type="text"
                  maxLength={2000}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g. Placement Fee — Cook"
                  className="w-full border px-3 py-2 text-sm outline-none rounded"
                  style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-700 uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                    Amount ({defaultPayment?.currency || "UGX"})
                  </label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full border px-3 py-2 text-sm outline-none rounded mono"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-700 uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                    Due date
                  </label>
                  <input
                    required
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full border px-3 py-2 text-sm outline-none rounded"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="border px-4 py-2.5 text-sm rounded"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-600 rounded"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  Generate Preview
                </button>
              </div>
            </form>
          )}

          {step === "preview" && preview && (
            <div className="space-y-6">
              <InvoicePreview invoice={preview} />

              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleGoBack}
                  className="inline-flex items-center gap-1.5 border px-4 py-2.5 text-sm rounded"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
                <button
                  onClick={handleDownloadPDF}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 border px-4 py-2.5 text-sm rounded disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                >
                  <Download size={14} />
                  Download PDF
                </button>
                <button
                  onClick={handleEditInvoice}
                  className="border px-4 py-2.5 text-sm rounded"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                >
                  Edit Details
                </button>
                <button
                  onClick={handleSaveInvoice}
                  disabled={loading}
                  className="px-5 py-2.5 text-sm font-600 rounded disabled:opacity-50"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  {loading ? "Saving…" : "Save Invoice"}
                </button>
              </div>
            </div>
          )}

          {step === "edit" && editData && preview && (
            <form onSubmit={handleSaveEdits} className="space-y-5">
              <div>
                <label className="block text-xs font-700 uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                  Description
                </label>
                <input
                  required
                  type="text"
                  name="description"
                  maxLength={2000}
                  defaultValue={editData.description}
                  placeholder="e.g. Placement Fee — Cook"
                  className="w-full border px-3 py-2 text-sm outline-none rounded"
                  style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-700 uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                    Amount ({preview.currency})
                  </label>
                  <input
                    required
                    type="number"
                    name="amount"
                    min="0.01"
                    step="0.01"
                    defaultValue={editData.amount}
                    className="w-full border px-3 py-2 text-sm outline-none rounded mono"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-700 uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                    Other charges
                  </label>
                  <input
                    type="number"
                    name="otherCharges"
                    min="0"
                    step="0.01"
                    defaultValue={preview.otherCharges || 0}
                    className="w-full border px-3 py-2 text-sm outline-none rounded mono"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-700 uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                    Due date
                  </label>
                  <input
                    required
                    type="date"
                    name="dueDate"
                    defaultValue={editData.dueDate}
                    className="w-full border px-3 py-2 text-sm outline-none rounded"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="inline-flex items-center gap-1.5 border px-4 py-2.5 text-sm rounded"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                >
                  <ArrowLeft size={14} />
                  Back to Preview
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-600 rounded"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  Update Preview
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

type InvoicePreview = {
  invoiceNumber: string;
  issuedDate: string;
  dueDate: string;
  company: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    registrationNumber: string;
    website: string;
    logo?: string;
  };
  billTo: {
    name: string;
    type: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    total: number;
  }>;
  subtotal: number;
  otherCharges: number;
  totalAmount: number;
  currency: string;
  paymentInfo: {
    payment_method: string;
    bank_name: string;
    account_name: string;
    account_number: string;
    swift_code: string;
    currency: string;
    payment_reference: string;
  };
};

function InvoicePreview({ invoice }: { invoice: InvoicePreview }) {
  const formatCurrency = (amount: number, currency: string) => {
    return `${currency} ${Number(amount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div
      className="border rounded p-6 max-w-2xl mx-auto relative"
      style={{ background: "#ffffff", borderColor: "var(--border)" }}
    >
      {/* Logo Watermark - Background */}
      {invoice.company.logo && (
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center rounded"
          style={{
            opacity: 0.08,
            background: `url('${invoice.company.logo}') center/contain no-repeat`,
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div className="flex items-center gap-4">
            {invoice.company.logo && (
              <img
                src={invoice.company.logo}
                alt={invoice.company.name}
                className="h-12 w-auto"
                style={{ maxWidth: "120px" }}
              />
            )}
            <div>
              <h1 className="text-2xl font-700 mb-1" style={{ color: "#000" }}>
                INVOICE
              </h1>
              <p className="text-xs" style={{ color: "#666" }}>
                {invoice.company.name}
              </p>
            </div>
          </div>
          <div className="text-right text-xs" style={{ color: "#666" }}>
            <div className="font-600 mb-2">{invoice.invoiceNumber}</div>
            <div>Issued: {new Date(invoice.issuedDate).toLocaleDateString()}</div>
            <div>Due: {new Date(invoice.dueDate).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Company & Bill To */}
        <div className="grid grid-cols-2 gap-8 mb-8 text-xs" style={{ color: "#333" }}>
          <div>
            <p className="font-600 mb-2" style={{ color: "#666" }}>
              FROM
            </p>
            <p className="font-600">{invoice.company.name}</p>
            {invoice.company.address && <p>{invoice.company.address}</p>}
            {invoice.company.city && <p>{invoice.company.city}</p>}
            {invoice.company.country && <p>{invoice.company.country}</p>}
            {invoice.company.phone && <p>{invoice.company.phone}</p>}
            {invoice.company.email && <p>{invoice.company.email}</p>}
          </div>
          <div>
            <p className="font-600 mb-2" style={{ color: "#666" }}>
              BILL TO
            </p>
            <p className="font-600">{invoice.billTo.name}</p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full mb-6 text-xs border-collapse">
          <thead>
            <tr style={{ background: "#f3f4f6", borderBottom: "1px solid #ddd" }}>
              <th className="text-left p-2 font-600" style={{ color: "#333" }}>
                Description
              </th>
              <th className="text-right p-2 font-600" style={{ color: "#333" }}>
                Qty
              </th>
              <th className="text-right p-2 font-600" style={{ color: "#333" }}>
                Unit Amount
              </th>
              <th className="text-right p-2 font-600" style={{ color: "#333" }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                <td className="p-2" style={{ color: "#333" }}>
                  {item.description}
                </td>
                <td className="text-right p-2" style={{ color: "#333" }}>
                  {item.quantity}
                </td>
                <td className="text-right p-2 mono" style={{ color: "#333" }}>
                  {formatCurrency(item.unitAmount, invoice.currency)}
                </td>
                <td className="text-right p-2 mono font-600" style={{ color: "#333" }}>
                  {formatCurrency(item.total, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8 text-xs">
          <div className="w-64">
            <div className="flex justify-between mb-2 pb-2" style={{ borderBottom: "1px solid #ddd" }}>
              <span style={{ color: "#666" }}>Subtotal:</span>
              <span className="mono font-600" style={{ color: "#333" }}>
                {formatCurrency(invoice.subtotal, invoice.currency)}
              </span>
            </div>
            {invoice.otherCharges > 0 && (
              <div className="flex justify-between mb-2" style={{ color: "#666" }}>
                <span>Other charges:</span>
                <span className="mono">{formatCurrency(invoice.otherCharges, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 font-700" style={{ borderTop: "2px solid #333", color: "#000" }}>
              <span>TOTAL AMOUNT DUE:</span>
              <span className="mono">{formatCurrency(invoice.totalAmount, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {/* Payment Information */}
        <div className="text-xs p-4 rounded" style={{ background: "#f9fafb", borderColor: "var(--border)" }}>
          <p className="font-600 mb-3" style={{ color: "#333" }}>
            PAYMENT INFORMATION
          </p>
          <div style={{ color: "#666" }}>
            <p>
              <span className="font-600">Payment method:</span> {invoice.paymentInfo.payment_method}
            </p>
            {invoice.paymentInfo.bank_name && (
              <p>
                <span className="font-600">Bank:</span> {invoice.paymentInfo.bank_name}
              </p>
            )}
            {invoice.paymentInfo.account_name && (
              <p>
                <span className="font-600">Account name:</span> {invoice.paymentInfo.account_name}
              </p>
            )}
            {invoice.paymentInfo.account_number && (
              <p>
                <span className="font-600">Account number:</span> {invoice.paymentInfo.account_number}
              </p>
            )}
            {invoice.paymentInfo.swift_code && (
              <p>
                <span className="font-600">SWIFT code:</span> {invoice.paymentInfo.swift_code}
              </p>
            )}
            {invoice.paymentInfo.payment_reference && (
              <p>
                <span className="font-600">Payment reference:</span> {invoice.paymentInfo.payment_reference}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs mt-8" style={{ color: "#999" }}>
          <p>Thank you for choosing {invoice.company.name}</p>
        </div>
      </div>
    </div>
  );
}
