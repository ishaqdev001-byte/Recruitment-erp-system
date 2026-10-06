import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getInvoiceAccess, loadInvoiceWithBalance } from "@/lib/server/invoices";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };
const pageWidth = 595.28;
const pageHeight = 841.89;

function wrapText(value: string, font: PDFFont, size: number, maxWidth: number) {
  const words = value.replace(/[^\x20-\x7E]/g, " ").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, size: number, color = rgb(0.13, 0.16, 0.19)) {
  const lines = wrapText(text, font, size, width);
  lines.forEach((line, index) => page.drawText(line, { x, y: y - index * (size + 4), size, font, color }));
  return y - lines.length * (size + 4);
}

async function embedLogo(pdf: PDFDocument, value: string) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  try {
    let mimeType: "image/png" | "image/jpeg";
    let bytes: Buffer;
    if (match) {
      mimeType = match[1] === "png" ? "image/png" : "image/jpeg";
      bytes = Buffer.from(match[2], "base64");
    } else {
      const logoUrl = new URL(value);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl || logoUrl.origin !== new URL(supabaseUrl).origin) return null;
      const response = await fetch(logoUrl, { redirect: "error", signal: AbortSignal.timeout(3000) });
      const contentType = response.headers.get("content-type")?.split(";")[0];
      if (!response.ok || (contentType !== "image/png" && contentType !== "image/jpeg")) return null;
      const data = await response.arrayBuffer();
      if (data.byteLength > 2_000_000) return null;
      mimeType = contentType;
      bytes = Buffer.from(data);
    }
    if (bytes.byteLength > 2_000_000) return null;
    return mimeType === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  try {
    const access = await getInvoiceAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
    const { invoiceId } = await context.params;
    const [invoice, companyResult] = await Promise.all([
      loadInvoiceWithBalance(access, invoiceId),
      access.supabase.from("companies")
        .select("name, logo_url, registration_number, country, city, office_address, phone, email, website")
        .eq("id", access.companyId)
        .maybeSingle(),
    ]);
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    if (companyResult.error || !companyResult.data) return NextResponse.json({ error: "Company invoice details are unavailable." }, { status: 500 });

    const company = companyResult.data;
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Invoice ${invoice.invoice_number}`);
    pdf.setSubject(invoice.description);
    pdf.setAuthor(company.name);
    const page = pdf.addPage([pageWidth, pageHeight]);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const dark = rgb(0.12, 0.16, 0.19);
    const muted = rgb(0.38, 0.43, 0.47);
    const accent = rgb(0.05, 0.43, 0.48);
    const rightX = 365;
    const logo = await embedLogo(pdf, company.logo_url ?? "");
    if (logo) {
      const dimensions = logo.scale(Math.min(1, 80 / logo.width, 64 / logo.height));
      page.drawImage(logo, { x: 48, y: 752, width: dimensions.width, height: dimensions.height });
    }

    page.drawText(company.name || "Company", { x: 48, y: 734, size: 16, font: bold, color: dark });
    const companyLines = [
      company.registration_number ? `Registration: ${company.registration_number}` : "",
      [company.office_address, company.city, company.country].filter(Boolean).join(", "),
      company.phone,
      company.email,
      company.website,
    ].filter(Boolean);
    let companyY = 716;
    for (const line of companyLines) {
      companyY = drawWrapped(page, line, 48, companyY, 280, regular, 9, muted) - 2;
    }

    page.drawText("INVOICE", { x: rightX, y: 752, size: 22, font: bold, color: accent });
    page.drawText(invoice.invoice_number, { x: rightX, y: 730, size: 11, font: bold, color: dark });
    page.drawText(`Issued: ${invoice.issued_at}`, { x: rightX, y: 711, size: 9, font: regular, color: muted });
    page.drawText(`Due: ${invoice.due_date}`, { x: rightX, y: 696, size: 9, font: regular, color: muted });

    page.drawLine({ start: { x: 48, y: 674 }, end: { x: pageWidth - 48, y: 674 }, thickness: 1, color: rgb(0.85, 0.88, 0.89) });
    page.drawText("BILL TO", { x: 48, y: 650, size: 9, font: bold, color: muted });
    page.drawText(invoice.recipient_name, { x: 48, y: 630, size: 12, font: bold, color: dark });
    page.drawText(invoice.recipient_type === "contractor" ? "Employer / contractor" : invoice.recipient_type[0].toUpperCase() + invoice.recipient_type.slice(1), { x: 48, y: 613, size: 9, font: regular, color: muted });

    page.drawText("DESCRIPTION", { x: 48, y: 568, size: 9, font: bold, color: muted });
    page.drawText("AMOUNT", { x: 435, y: 568, size: 9, font: bold, color: muted });
    page.drawLine({ start: { x: 48, y: 555 }, end: { x: pageWidth - 48, y: 555 }, thickness: 0.75, color: rgb(0.85, 0.88, 0.89) });
    const descriptionEnd = drawWrapped(page, invoice.description, 48, 535, 340, regular, 10, dark);
    page.drawText(`UGX ${Number(invoice.amount).toLocaleString("en-UG", { minimumFractionDigits: 2 })}`, { x: 435, y: 535, size: 10, font: bold, color: dark });

    const totalsY = Math.min(490, descriptionEnd - 25);
    page.drawLine({ start: { x: 340, y: totalsY + 15 }, end: { x: pageWidth - 48, y: totalsY + 15 }, thickness: 0.75, color: rgb(0.85, 0.88, 0.89) });
    page.drawText("Invoice total", { x: 350, y: totalsY, size: 10, font: regular, color: muted });
    page.drawText(`UGX ${Number(invoice.amount).toLocaleString("en-UG", { minimumFractionDigits: 2 })}`, { x: 435, y: totalsY, size: 10, font: bold, color: dark });
    page.drawText("Paid to date", { x: 350, y: totalsY - 20, size: 10, font: regular, color: muted });
    page.drawText(`UGX ${Number(invoice.paid_amount).toLocaleString("en-UG", { minimumFractionDigits: 2 })}`, { x: 435, y: totalsY - 20, size: 10, font: regular, color: dark });
    page.drawText("Balance due", { x: 350, y: totalsY - 40, size: 10, font: bold, color: dark });
    page.drawText(`UGX ${Number(invoice.balance_due).toLocaleString("en-UG", { minimumFractionDigits: 2 })}`, { x: 435, y: totalsY - 40, size: 10, font: bold, color: accent });

    const installmentHeadingY = totalsY - 90;
    page.drawText("PAYMENT INSTALMENTS", { x: 48, y: installmentHeadingY, size: 9, font: bold, color: muted });
    if (!invoice.payments.length) {
      page.drawText("No payments recorded.", { x: 48, y: installmentHeadingY - 20, size: 9, font: regular, color: muted });
    } else {
      invoice.payments.forEach((payment, index) => {
        const y = installmentHeadingY - 22 - index * 17;
        if (y > 70) {
          page.drawText(new Date(payment.paid_at).toLocaleDateString("en-GB"), { x: 48, y, size: 9, font: regular, color: dark });
          page.drawText(`UGX ${Number(payment.amount).toLocaleString("en-UG", { minimumFractionDigits: 2 })}`, { x: 435, y, size: 9, font: regular, color: dark });
        }
      });
    }

    const bytes = await pdf.save();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Invoice PDF request failed", error);
    return NextResponse.json({ error: "Unable to generate invoice PDF." }, { status: 503 });
  }
}