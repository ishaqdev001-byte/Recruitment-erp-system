import { PDFDocument, PDFPage, rgb, PDFFont } from "pdf-lib";

export interface AppointmentSlipData {
  appointmentId: string;
  companyName: string;
  companyLogo?: string;
  agencyName: string;
  
  // Candidate details
  candidateFirstName: string;
  candidateLastName: string;
  candidateDateOfBirth: string;
  candidateAge: number;
  candidatePassport: string;
  candidatePhone: string;
  
  // Medical details
  medicalServiceType: string;
  appointmentDateTime: string;
  remarks?: string;
  
  // Hospital/Doctor details
  hospitalName: string;
  hospitalPhone?: string;
  hospitalEmail?: string;
  hospitalAddress?: string;
  
  doctorName: string;
  doctorSpecialty?: string;
  
  // Fee breakdown
  totalFee: number;
  doctorFee: number;
  candidateAmount: number;
  
  // Booking details
  bookedBy: string;
  receivedBy?: string;
  bookingDate: string;
  paymentReference: string;
}

export async function generateAppointmentSlipPDF(data: AppointmentSlipData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { height, width } = page.getSize();
  
  const fontSize = {
    title: 18,
    heading: 14,
    subheading: 12,
    body: 10,
    small: 9,
  };

  const colors = {
    primary: rgb(0.1, 0.4, 0.8),
    secondary: rgb(0.3, 0.5, 0.9),
    text: rgb(0.1, 0.1, 0.1),
    lightGray: rgb(0.95, 0.95, 0.95),
    borderGray: rgb(0.8, 0.8, 0.8),
  };

  let y = height - 40;

  // Header with company name and logo
  page.drawText(data.companyName, {
    x: 40,
    y,
    size: fontSize.title,
    color: colors.primary,
    font: await pdfDoc.embedFont("Helvetica-Bold"),
  });

  page.drawText("MEDICAL APPOINTMENT SLIP", {
    x: 40,
    y: y - 25,
    size: fontSize.heading,
    color: colors.text,
    font: await pdfDoc.embedFont("Helvetica-Bold"),
  });

  // Appointment reference
  page.drawText(`Appointment ID: ${data.appointmentId.slice(0, 8).toUpperCase()}`, {
    x: width - 200,
    y: y - 10,
    size: fontSize.small,
    color: colors.secondary,
    font: await pdfDoc.embedFont("Helvetica"),
  });

  page.drawText(`Reference: ${data.paymentReference}`, {
    x: width - 200,
    y: y - 22,
    size: fontSize.small,
    color: colors.secondary,
    font: await pdfDoc.embedFont("Helvetica"),
  });

  // Horizontal line
  page.drawLine({
    start: { x: 40, y: y - 35 },
    end: { x: width - 40, y: y - 35 },
    thickness: 1,
    color: colors.borderGray,
  });

  y -= 50;

  // Section: Candidate Information
  page.drawText("CANDIDATE INFORMATION", {
    x: 40,
    y,
    size: fontSize.subheading,
    color: colors.primary,
    font: await pdfDoc.embedFont("Helvetica-Bold"),
  });

  y -= 20;

  const candidateInfo = [
    { label: "Name:", value: `${data.candidateFirstName} ${data.candidateLastName}` },
    { label: "Date of Birth:", value: formatDate(data.candidateDateOfBirth) },
    { label: "Age:", value: `${data.candidateAge} years` },
    { label: "Passport Number:", value: data.candidatePassport },
    { label: "Phone:", value: data.candidatePhone },
  ];

  for (const item of candidateInfo) {
    page.drawText(`${item.label}`, {
      x: 40,
      y,
      size: fontSize.body,
      color: colors.text,
      font: await pdfDoc.embedFont("Helvetica-Bold"),
      maxWidth: 100,
    });

    page.drawText(item.value, {
      x: 150,
      y,
      size: fontSize.body,
      color: colors.text,
      font: await pdfDoc.embedFont("Helvetica"),
      maxWidth: 400,
    });

    y -= 15;
  }

  y -= 10;

  // Section: Appointment Details
  page.drawText("APPOINTMENT DETAILS", {
    x: 40,
    y,
    size: fontSize.subheading,
    color: colors.primary,
    font: await pdfDoc.embedFont("Helvetica-Bold"),
  });

  y -= 20;

  const appointmentInfo = [
    { label: "Medical Service:", value: data.medicalServiceType },
    { label: "Appointment Date & Time:", value: formatDateTime(data.appointmentDateTime) },
    ...(data.remarks ? [{ label: "Remarks:", value: data.remarks }] : []),
  ];

  for (const item of appointmentInfo) {
    page.drawText(`${item.label}`, {
      x: 40,
      y,
      size: fontSize.body,
      color: colors.text,
      font: await pdfDoc.embedFont("Helvetica-Bold"),
      maxWidth: 100,
    });

    const wrappedValue = wrapText(item.value, 70);
    for (let idx = 0; idx < wrappedValue.length; idx++) {
      const line = wrappedValue[idx];
      page.drawText(line, {
        x: 150,
        y: y - (idx * 12),
        size: fontSize.body,
        color: colors.text,
        font: await pdfDoc.embedFont("Helvetica"),
        maxWidth: 400,
      });
    }

    y -= (wrappedValue.length * 12) + 5;
  }

  y -= 10;

  // Section: Hospital & Doctor Information
  page.drawText("HOSPITAL & DOCTOR INFORMATION", {
    x: 40,
    y,
    size: fontSize.subheading,
    color: colors.primary,
    font: await pdfDoc.embedFont("Helvetica-Bold"),
  });

  y -= 20;

  const hospitalInfo = [
    { label: "Hospital/Clinic Name:", value: data.hospitalName },
    ...(data.hospitalAddress ? [{ label: "Address:", value: data.hospitalAddress }] : []),
    ...(data.hospitalPhone ? [{ label: "Phone:", value: data.hospitalPhone }] : []),
    ...(data.hospitalEmail ? [{ label: "Email:", value: data.hospitalEmail }] : []),
    { label: "Doctor Name:", value: data.doctorName },
    ...(data.doctorSpecialty ? [{ label: "Specialty:", value: data.doctorSpecialty }] : []),
  ];

  for (const item of hospitalInfo) {
    page.drawText(`${item.label}`, {
      x: 40,
      y,
      size: fontSize.body,
      color: colors.text,
      font: await pdfDoc.embedFont("Helvetica-Bold"),
      maxWidth: 100,
    });

    page.drawText(item.value, {
      x: 150,
      y,
      size: fontSize.body,
      color: colors.text,
      font: await pdfDoc.embedFont("Helvetica"),
      maxWidth: 400,
    });

    y -= 15;
  }

  y -= 10;

  // Section: Fee Breakdown
  page.drawText("FEE BREAKDOWN", {
    x: 40,
    y,
    size: fontSize.subheading,
    color: colors.primary,
    font: await pdfDoc.embedFont("Helvetica-Bold"),
  });

  y -= 20;

  // Create fee table
  const tableWidth = 300;
  const col1Width = 150;
  const col2Width = 150;

  // Header
  page.drawRectangle({
    x: 40,
    y: y - 20,
    width: tableWidth,
    height: 20,
    color: colors.lightGray,
    borderColor: colors.borderGray,
    borderWidth: 1,
  });

  page.drawText("Description", {
    x: 50,
    y: y - 15,
    size: fontSize.body,
    color: colors.text,
    font: await pdfDoc.embedFont("Helvetica-Bold"),
  });

  page.drawText("Amount", {
    x: 200,
    y: y - 15,
    size: fontSize.body,
    color: colors.text,
    font: await pdfDoc.embedFont("Helvetica-Bold"),
  });

  y -= 25;

  // Rows
  const feeRows = [
    { label: "Total Medical Fee", amount: data.totalFee },
    { label: "Doctor/Hospital Fee", amount: data.doctorFee },
    { label: "Candidate Amount Due", amount: data.candidateAmount },
  ];

  for (let idx = 0; idx < feeRows.length; idx++) {
    const row = feeRows[idx];
    const isLast = idx === feeRows.length - 1;
    
    page.drawRectangle({
      x: 40,
      y: y - 15,
      width: tableWidth,
      height: 15,
      color: isLast ? colors.lightGray : undefined,
      borderColor: colors.borderGray,
      borderWidth: 1,
    });

    page.drawText(row.label, {
      x: 50,
      y: y - 10,
      size: fontSize.body,
      color: colors.text,
      font: await pdfDoc.embedFont(isLast ? "Helvetica-Bold" : "Helvetica"),
    });

    page.drawText(formatCurrency(row.amount), {
      x: 200,
      y: y - 10,
      size: fontSize.body,
      color: colors.text,
      font: await pdfDoc.embedFont(isLast ? "Helvetica-Bold" : "Helvetica"),
    });

    y -= 18;
  }

  y -= 15;

  // Section: Booking Information
  page.drawText("BOOKING INFORMATION", {
    x: 40,
    y,
    size: fontSize.subheading,
    color: colors.primary,
    font: await pdfDoc.embedFont("Helvetica-Bold"),
  });

  y -= 20;

  const bookingInfo = [
    { label: "Booking Date:", value: formatDate(data.bookingDate) },
    { label: "Agency Name:", value: data.agencyName },
    { label: "Booked By:", value: data.bookedBy },
    ...(data.receivedBy ? [{ label: "Received By:", value: data.receivedBy }] : []),
  ];

  for (const item of bookingInfo) {
    page.drawText(`${item.label}`, {
      x: 40,
      y,
      size: fontSize.body,
      color: colors.text,
      font: await pdfDoc.embedFont("Helvetica-Bold"),
      maxWidth: 100,
    });

    page.drawText(item.value, {
      x: 150,
      y,
      size: fontSize.body,
      color: colors.text,
      font: await pdfDoc.embedFont("Helvetica"),
      maxWidth: 400,
    });

    y -= 15;
  }

  y -= 20;

  // Footer
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1,
    color: colors.borderGray,
  });

  y -= 15;

  page.drawText("This appointment slip is a confirmation of booking. Please present it at the hospital on the appointment date.", {
    x: 40,
    y,
    size: fontSize.small,
    color: colors.secondary,
    font: await pdfDoc.embedFont("Helvetica-Oblique"),
    maxWidth: width - 80,
  });

  page.drawText(`Generated on ${new Date().toLocaleString()}`, {
    x: 40,
    y: 30,
    size: fontSize.small,
    color: colors.secondary,
    font: await pdfDoc.embedFont("Helvetica"),
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    });
  } catch {
    return dateString;
  }
}

function formatDateTime(dateTimeString: string): string {
  try {
    const date = new Date(dateTimeString);
    return date.toLocaleString("en-US", { 
      year: "numeric", 
      month: "long", 
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateTimeString;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    if ((currentLine + word).length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? " " : "") + word;
    }
  });

  if (currentLine) lines.push(currentLine.trim());
  return lines;
}
