import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type InvoiceData = {
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

const formatCurrency = (amount: number, currency: string) => {
  return `${currency} ${Number(amount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

export async function generateInvoicePDF(invoiceData: InvoiceData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([612, 792]); // 8.5" x 11"
  const { width, height } = page.getSize();

  // Draw watermark if logo exists
  if (invoiceData.company.logo) {
    try {
      const logoBytes = await fetch(invoiceData.company.logo).then((res) => res.arrayBuffer());
      const logoImage = await pdfDoc.embedPng(new Uint8Array(logoBytes)).catch(() =>
        pdfDoc.embedJpg(new Uint8Array(logoBytes))
      );

      // Draw watermark - centered, semi-transparent
      page.drawImage(logoImage, {
        x: width / 2 - 80,
        y: height / 2 - 80,
        width: 160,
        height: 160,
        opacity: 0.1,
      });
    } catch (err) {
      console.warn("Failed to embed logo watermark", err);
    }
  }

  let yPosition = height - 40;
  const marginLeft = 40;
  const marginRight = width - 40;
  const pageWidth = marginRight - marginLeft;

  // Helper function to draw text
  const drawText = (text: string, y: number, size: number, bold = false, color = rgb(0, 0, 0)) => {
    page.drawText(text, {
      x: marginLeft,
      y,
      size,
      font: bold ? boldFont : regularFont,
      color,
    });
    return y - size - 4;
  };

  const drawRightAlignedText = (text: string, y: number, size: number, bold = false, color = rgb(0, 0, 0)) => {
    const textWidth = text.length * (size * 0.5); // Rough estimate
    page.drawText(text, {
      x: marginRight - textWidth,
      y,
      size,
      font: bold ? boldFont : regularFont,
      color,
    });
    return y - size - 4;
  };

  // Header
  yPosition = drawText("INVOICE", yPosition, 24, true, rgb(0, 0, 0));
  yPosition -= 8;

  // Company info
  yPosition = drawText(invoiceData.company.name, yPosition, 10, true);

  // Invoice number and dates on right
  const headerY = yPosition + 24;
  drawRightAlignedText(`Invoice No: ${invoiceData.invoiceNumber}`, headerY, 9);
  drawRightAlignedText(`Issued: ${formatDate(invoiceData.issuedDate)}`, headerY - 12, 9);
  drawRightAlignedText(`Due: ${formatDate(invoiceData.dueDate)}`, headerY - 24, 9);

  yPosition -= 40;

  // Company details section
  yPosition = drawText("FROM", yPosition, 8, true, rgb(100, 100, 100));
  yPosition = drawText(invoiceData.company.name, yPosition, 9, true);

  if (invoiceData.company.address) yPosition = drawText(invoiceData.company.address, yPosition, 8);
  if (invoiceData.company.city) yPosition = drawText(invoiceData.company.city, yPosition, 8);
  if (invoiceData.company.country) yPosition = drawText(invoiceData.company.country, yPosition, 8);
  if (invoiceData.company.phone) yPosition = drawText(invoiceData.company.phone, yPosition, 8);
  if (invoiceData.company.email) yPosition = drawText(invoiceData.company.email, yPosition, 8);

  yPosition -= 16;

  // Bill to section
  const billToX = marginLeft + pageWidth / 2 + 10;
  page.drawText("BILL TO", {
    x: billToX,
    y: yPosition + 8,
    size: 8,
    font: regularFont,
    color: rgb(100, 100, 100),
  });
  page.drawText(invoiceData.billTo.name, {
    x: billToX,
    y: yPosition - 4,
    size: 9,
    font: regularFont,
    color: rgb(0, 0, 0),
  });

  yPosition -= 36;

  // Items table header
  const colPositions = [marginLeft, marginLeft + pageWidth * 0.65, marginLeft + pageWidth * 0.8, marginRight];
  const rowHeight = 14;

  // Header row
  page.drawRectangle({
    x: marginLeft,
    y: yPosition - rowHeight,
    width: pageWidth,
    height: rowHeight,
    color: rgb(240, 240, 240),
  });

  page.drawText("Description", { x: colPositions[0] + 4, y: yPosition - 10, size: 8, font: regularFont });
  page.drawText("Qty", {
    x: colPositions[1] + 4,
    y: yPosition - 10,
    size: 8,
    font: regularFont,
  });
  page.drawText("Unit Amount", {
    x: colPositions[2] + 4,
    y: yPosition - 10,
    size: 8,
    font: regularFont,
  });
  page.drawText("Total", {
    x: colPositions[3] - 40,
    y: yPosition - 10,
    size: 8,
    font: regularFont,
  });

  yPosition -= rowHeight + 4;

  // Items
  invoiceData.items.forEach((item) => {
    page.drawText(item.description.substring(0, 40), {
      x: colPositions[0] + 4,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    page.drawText(String(item.quantity), {
      x: colPositions[1] + 4,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    page.drawText(formatCurrency(item.unitAmount, invoiceData.currency).substring(0, 20), {
      x: colPositions[2] + 4,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    page.drawText(formatCurrency(item.total, invoiceData.currency).substring(0, 20), {
      x: colPositions[3] - 100,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    yPosition -= rowHeight;
  });

  yPosition -= 12;

  // Totals section
  const totalsX = marginRight - 200;

  // Subtotal
  page.drawText("Subtotal:", {
    x: totalsX,
    y: yPosition,
    size: 8,
    font: regularFont,
  });
  page.drawText(formatCurrency(invoiceData.subtotal, invoiceData.currency), {
    x: totalsX + 100,
    y: yPosition,
    size: 8,
    font: regularFont,
  });
  yPosition -= 12;

  // Other charges
  if (invoiceData.otherCharges > 0) {
    page.drawText("Other charges:", {
      x: totalsX,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    page.drawText(formatCurrency(invoiceData.otherCharges, invoiceData.currency), {
      x: totalsX + 100,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    yPosition -= 12;
  }

  // Total
  page.drawLine({
    start: { x: totalsX, y: yPosition + 4 },
    end: { x: marginRight - 10, y: yPosition + 4 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  page.drawText("TOTAL DUE:", {
    x: totalsX,
    y: yPosition - 8,
    size: 10,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  page.drawText(formatCurrency(invoiceData.totalAmount, invoiceData.currency), {
    x: totalsX + 100,
    y: yPosition - 8,
    size: 10,
    font: regularFont,
    color: rgb(0, 0, 0),
  });

  yPosition -= 32;

  // Payment information
  page.drawText("PAYMENT INFORMATION", {
    x: marginLeft,
    y: yPosition,
    size: 9,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  yPosition -= 12;

  const paymentInfo = invoiceData.paymentInfo;
  if (paymentInfo.payment_method) {
    page.drawText(`Payment method: ${paymentInfo.payment_method}`, {
      x: marginLeft,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    yPosition -= 10;
  }

  if (paymentInfo.bank_name) {
    page.drawText(`Bank: ${paymentInfo.bank_name}`, {
      x: marginLeft,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    yPosition -= 10;
  }

  if (paymentInfo.account_name) {
    page.drawText(`Account name: ${paymentInfo.account_name}`, {
      x: marginLeft,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    yPosition -= 10;
  }

  if (paymentInfo.account_number) {
    page.drawText(`Account number: ${paymentInfo.account_number}`, {
      x: marginLeft,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    yPosition -= 10;
  }

  if (paymentInfo.swift_code) {
    page.drawText(`SWIFT code: ${paymentInfo.swift_code}`, {
      x: marginLeft,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    yPosition -= 10;
  }

  if (paymentInfo.payment_reference) {
    page.drawText(`Payment reference: ${paymentInfo.payment_reference}`, {
      x: marginLeft,
      y: yPosition,
      size: 8,
      font: regularFont,
    });
    yPosition -= 10;
  }

  // Footer
  page.drawText(`Thank you for choosing ${invoiceData.company.name}`, {
    x: marginLeft,
    y: 20,
    size: 8,
    font: regularFont,
    color: rgb(150, 150, 150),
  });

  // Save and return
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Download invoice PDF to client
 */
export function downloadInvoicePDF(pdfBytes: Uint8Array, invoiceNumber: string) {
  const buffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(buffer).set(pdfBytes);
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${invoiceNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
