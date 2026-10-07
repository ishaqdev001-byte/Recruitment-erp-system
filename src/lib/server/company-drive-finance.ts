import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { randomUUID } from "node:crypto";
import type { DriveAccess } from "@/lib/server/company-drive";
import { uploadCompanyDriveFile } from "@/lib/storage/interserver";

type FinanceAccess = Exclude<DriveAccess, { error: string }>;
type InvoiceSource = {
  id: string;
  invoice_number: string;
  recipient_name: string;
  description: string;
  amount: number | string;
  due_date: string;
  issued_at: string;
  status: string;
  created_by: string | null;
  updated_at: string;
};
type ReceiptSource = {
  id: string;
  receipt_number: string;
  received_from: string;
  category: string;
  amount: number | string;
  payment_method: string;
  external_reference: string;
  notes: string;
  received_at: string;
  created_by: string | null;
  created_at: string;
};

async function renderFinancePdf(title: string, fields: [string, string][]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("COMPANY FINANCE DOCUMENT", { x: 48, y: 775, size: 9, font: bold, color: rgb(0.05, 0.43, 0.48) });
  page.drawText(title.replace(/[^\x20-\x7E]/g, " "), { x: 48, y: 735, size: 22, font: bold, color: rgb(0.12, 0.16, 0.19) });
  let y = 690;
  for (const [label, value] of fields) {
    page.drawText(label.toUpperCase(), { x: 48, y, size: 8, font: bold, color: rgb(0.38, 0.43, 0.47) });
    page.drawText(value.replace(/[^\x20-\x7E]/g, " ").slice(0, 110), { x: 48, y: y - 18, size: 11, font: regular, color: rgb(0.12, 0.16, 0.19) });
    y -= 54;
  }
  return Buffer.from(await pdf.save());
}

async function storeFinancePdf(access: FinanceAccess, source: {
  id: string;
  name: string;
  sourceType: "invoice" | "receipt";
  createdBy: string | null;
  updatedAt: string;
  fields: [string, string][];
}) {
  const { data: existing, error: existingError } = await access.supabase.from("company_drive_items")
    .select("id, storage_path, updated_at")
    .eq("company_id", access.companyId)
    .eq("category", "finance")
    .eq("source_type", source.sourceType)
    .eq("source_id", source.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && new Date(existing.updated_at).valueOf() >= new Date(source.updatedAt).valueOf()) return;

  const itemId = existing?.id ?? randomUUID();
  const storagePath = existing?.storage_path ?? `company/${access.companyId}/drive/${itemId}.pdf`;
  const content = await renderFinancePdf(source.name, source.fields);
  await uploadCompanyDriveFile(storagePath, content);

  const item = {
    company_id: access.companyId,
    item_type: "file",
    category: "finance",
    name: source.name,
    file_type: "pdf",
    mime_type: "application/pdf",
    file_size: content.byteLength,
    storage_path: storagePath,
    source_type: source.sourceType,
    source_id: source.id,
    created_by: existing ? undefined : source.createdBy,
    modified_by: access.userId,
  };
  const result = existing
    ? await access.supabase.from("company_drive_items").update(item).eq("id", itemId).select("id").single()
    : await access.supabase.from("company_drive_items").insert({ ...item, id: itemId }).select("id").single();
  if (result.error || !result.data) throw result.error ?? new Error("Finance file metadata could not be saved.");
}

export async function syncFinanceDrive(access: FinanceAccess) {
  const [{ data: invoices, error: invoiceError }, { data: receipts, error: receiptError }] = await Promise.all([
    access.supabase.from("invoices")
      .select("id, invoice_number, recipient_name, description, amount, due_date, issued_at, status, created_by, updated_at")
      .eq("company_id", access.companyId)
      .order("issued_at", { ascending: false }),
    access.supabase.from("financial_receipts")
      .select("id, receipt_number, received_from, category, amount, payment_method, external_reference, notes, received_at, created_by, created_at")
      .eq("company_id", access.companyId)
      .order("received_at", { ascending: false }),
  ]);
  if (invoiceError || receiptError) throw invoiceError ?? receiptError;

  for (const value of (invoices ?? []) as InvoiceSource[]) {
    await storeFinancePdf(access, {
      id: value.id,
      name: `${value.invoice_number}.pdf`,
      sourceType: "invoice",
      createdBy: value.created_by,
      updatedAt: value.updated_at,
      fields: [
        ["Invoice number", value.invoice_number],
        ["Issued", value.issued_at],
        ["Due date", value.due_date],
        ["Recipient", value.recipient_name],
        ["Description", value.description],
        ["Amount", `UGX ${Number(value.amount).toLocaleString("en-UG", { minimumFractionDigits: 2 })}`],
        ["Status", value.status],
      ],
    });
  }

  for (const value of (receipts ?? []) as ReceiptSource[]) {
    await storeFinancePdf(access, {
      id: value.id,
      name: `${value.receipt_number}.pdf`,
      sourceType: "receipt",
      createdBy: value.created_by,
      updatedAt: value.created_at,
      fields: [
        ["Receipt number", value.receipt_number],
        ["Received", new Date(value.received_at).toLocaleDateString("en-GB")],
        ["Received from", value.received_from],
        ["Category", value.category],
        ["Payment method", value.payment_method],
        ["External reference", value.external_reference || "-"],
        ["Amount", `UGX ${Number(value.amount).toLocaleString("en-UG", { minimumFractionDigits: 2 })}`],
        ["Notes", value.notes || "-"],
      ],
    });
  }
}
