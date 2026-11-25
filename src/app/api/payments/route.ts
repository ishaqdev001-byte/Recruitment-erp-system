import { NextResponse } from "next/server";
import { getInvoiceAccess } from "@/lib/server/invoices";
import {
  loadPayableVendors,
  loadPaymentLedger,
} from "@/lib/server/payment-ledger";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };
const paymentMethods = new Set(["Cash", "Bank transfer", "Mobile money", "Cheque", "Other"]);

export async function GET() {
  try {
    const access = await getInvoiceAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const [
      { transactions, projects, payableInvoices },
      { data: canRecord, error: recordPermissionError },
      { data: canDelete, error: deletePermissionError },
    ] = await Promise.all([
      loadPaymentLedger(access),
      access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,
        requested_permission: "finance.create",
      }),
      access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,
        requested_permission: "finance.delete",
      }),
    ]);
    if (recordPermissionError || deletePermissionError) {
      throw recordPermissionError ?? deletePermissionError;
    }

    const payableVendors = canRecord ? await loadPayableVendors(access) : [];

    let candidates: { candidate_id: string; file_number: string; candidate_name: string }[] = [];
    if (canRecord) {
      const { data, error } = await access.supabase.rpc("list_finance_candidates", { requested_company_id: access.companyId });
      if (error) {
        console.error("Payment candidate lookup failed", error);
        return NextResponse.json({ error: "Unable to load candidates for deposits." }, { status: 500, headers: responseHeaders });
      }
      candidates = data ?? [];
    }

    const candidateDeposits = transactions.filter((transaction) => transaction.entryType === "candidate_deposit");
    return NextResponse.json({
      transactions,
      projects,
      candidates,
      payableInvoices,
      payableVendors,
      permissions: { canRecord: Boolean(canRecord), canDelete: Boolean(canDelete) },
      totals: {
        totalReceived: transactions.filter((transaction) => transaction.direction === "credit").reduce((sum, transaction) => sum + transaction.amount, 0),
        totalCashOut: transactions.filter((transaction) => transaction.direction === "debit").reduce((sum, transaction) => sum + transaction.amount, 0),
        candidateDeposits: candidateDeposits.reduce((sum, transaction) => sum + transaction.amount, 0),
        invoicePayments: transactions.filter((transaction) => transaction.entryType === "invoice_payment").reduce((sum, transaction) => sum + transaction.amount, 0),
        otherIncome: transactions.filter((transaction) => transaction.entryType === "other_income").reduce((sum, transaction) => sum + transaction.amount, 0),
      },
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("Payments list request failed", error);
    return NextResponse.json({ error: "Payments and deposits are unavailable." }, { status: 503, headers: responseHeaders });
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getInvoiceAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as { recordId?: unknown; recordType?: unknown } | null;
    const recordId = typeof body?.recordId === "string" ? body.recordId : "";
    const recordType = body?.recordType;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId)
      || (recordType !== "receipt" && recordType !== "invoice_payment" && recordType !== "company_expense")) {
      return NextResponse.json({ error: "Select a valid finance transaction to delete." }, { status: 400, headers: responseHeaders });
    }

    const { error } = await access.supabase.rpc("delete_finance_transaction", {
      requested_company_id: access.companyId,
      requested_record_type: recordType,
      requested_record_id: recordId,
    });
    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403, headers: responseHeaders });
      if (error.code === "P0002") return NextResponse.json({ error: error.message }, { status: 404, headers: responseHeaders });
      if (error.code === "23503") return NextResponse.json({ error: error.message }, { status: 409, headers: responseHeaders });
      if (error.code === "22023") return NextResponse.json({ error: error.message }, { status: 400, headers: responseHeaders });
      console.error("Finance transaction deletion failed", error);
      return NextResponse.json({ error: "Unable to delete this finance transaction." }, { status: 500, headers: responseHeaders });
    }

    return NextResponse.json({ success: true }, { headers: responseHeaders });
  } catch (error) {
    console.error("Finance transaction DELETE request failed", error);
    return NextResponse.json({ error: "Unable to delete this finance transaction." }, { status: 503, headers: responseHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getInvoiceAccess("finance.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = body?.action;

    if (action === "record-payable-invoice") {
      const vendorType = body?.vendorType;
      const vendorId = typeof body?.vendorId === "string" ? body.vendorId : "";
      const vendorInvoiceNumber = typeof body?.vendorInvoiceNumber === "string" ? body.vendorInvoiceNumber.trim() : "";
      const description = typeof body?.description === "string" ? body.description.trim() : "";
      const amount = Number(body?.amount);
      const invoiceDate = typeof body?.invoiceDate === "string" ? body.invoiceDate : "";
      const dueDate = typeof body?.dueDate === "string" && body.dueDate ? body.dueDate : null;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (
        !body ||
        (vendorType !== "contractor" && vendorType !== "partner") ||
        !uuidPattern.test(vendorId) ||
        vendorInvoiceNumber.length > 100 ||
        !description ||
        description.length > 500 ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 999999999999.99 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) ||
        Number.isNaN(Date.parse(`${invoiceDate}T00:00:00Z`)) ||
        (dueDate !== null &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
            Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))))
      ) {
        return NextResponse.json({ error: "Enter a valid partner or contractor invoice." }, { status: 400, headers: responseHeaders });
      }

      const { data, error } = await access.supabase.rpc("record_company_payable_invoice", {
        requested_company_id: access.companyId,
        requested_vendor_type: vendorType,
        requested_vendor_id: vendorId,
        requested_vendor_invoice_number: vendorInvoiceNumber || null,
        requested_description: description,
        requested_amount: amount,
        requested_invoice_date: invoiceDate,
        requested_due_date: dueDate,
      });

      if (error) {
        if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403, headers: responseHeaders });
        if (error.code === "23505") return NextResponse.json({ error: "This supplier invoice has already been recorded." }, { status: 409, headers: responseHeaders });
        if (error.code === "22023") return NextResponse.json({ error: error.message }, { status: 400, headers: responseHeaders });
        console.error("Payable invoice creation failed", error);
        return NextResponse.json({ error: "Unable to record this payable invoice." }, { status: 500, headers: responseHeaders });
      }

      return NextResponse.json({ payableInvoice: data }, { status: 201, headers: responseHeaders });
    }

    if (action === "record-expense") {
      const accountId = typeof body?.accountId === "string" ? body.accountId : "";
      const expenseCategoryId = typeof body?.expenseCategoryId === "string" ? body.expenseCategoryId : "";
      const normalizedCategoryId = expenseCategoryId || null;
      const itemName = typeof body?.itemName === "string" ? body.itemName.trim() : "";
      const paidTo = typeof body?.paidTo === "string" ? body.paidTo.trim() : "";
      const description = typeof body?.description === "string" ? body.description.trim() : "";
      const amount = Number(body?.amount);
      const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod : "";
      const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
      const paidAt = typeof body?.paidAt === "string" ? body.paidAt : "";
      const payableInvoiceId = typeof body?.payableInvoiceId === "string" ? body.payableInvoiceId : "";
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (
        !body ||
        !uuidPattern.test(accountId) ||
        (normalizedCategoryId !== null && !uuidPattern.test(normalizedCategoryId)) ||
        !itemName ||
        itemName.length > 500 ||
        !paidTo ||
        paidTo.length > 200 ||
        !description ||
        description.length > 500 ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 999999999999.99 ||
        !paymentMethods.has(paymentMethod) ||
        !reference ||
        reference.length > 100 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(paidAt) ||
        Number.isNaN(Date.parse(`${paidAt}T00:00:00Z`)) ||
        (payableInvoiceId && !uuidPattern.test(payableInvoiceId))
      ) {
        return NextResponse.json({ error: "Enter valid expense details and select an active company account." }, { status: 400, headers: responseHeaders });
      }

      if (payableInvoiceId) {
        const { data, error } = await access.supabase.rpc(
          "record_company_payable_invoice_payment",
          {
            requested_company_id: access.companyId,
            requested_invoice_id: payableInvoiceId,
            requested_account_id: accountId,
            requested_expense_category_id: normalizedCategoryId,
            requested_item_name: itemName,
            requested_description: description,
            requested_amount: amount,
            requested_payment_method: paymentMethod,
            requested_reference: reference,
            requested_paid_at: paidAt,
          },
        );

        if (error) {
          if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403, headers: responseHeaders });
          if (error.code === "P0002") return NextResponse.json({ error: error.message }, { status: 404, headers: responseHeaders });
          if (error.code === "22023") return NextResponse.json({ error: error.message }, { status: 400, headers: responseHeaders });
          console.error("Payable invoice payment failed", error);
          return NextResponse.json({ error: "Unable to record this invoice payment." }, { status: 500, headers: responseHeaders });
        }

        return NextResponse.json({ expense: data }, { status: 201, headers: responseHeaders });
      }

      const { data: membership, error: membershipError } = await access.supabase
        .from("company_memberships")
        .select("branch_id")
        .eq("company_id", access.companyId)
        .eq("user_id", access.userId)
        .eq("status", "active")
        .maybeSingle();

      if (membershipError || !membership) {
        throw membershipError ?? new Error("Active company membership not found.");
      }

      const { data, error } = await access.supabase.rpc("record_company_expense", {
        p_company_id: access.companyId,
        p_branch_id: membership.branch_id,
        p_account_id: accountId,
        p_expense_category_id: normalizedCategoryId,
        p_description: description,
        p_paid_to: paidTo,
        p_payment_method: paymentMethod,
        p_reference: reference,
        p_paid_at: paidAt,
        p_items: [{ description: itemName, quantity: 1, rate: amount }],
      });

      if (error) {
        if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403, headers: responseHeaders });
        if (["22023", "23503", "P0002"].includes(error.code ?? "")) return NextResponse.json({ error: error.message }, { status: 400, headers: responseHeaders });
        console.error("Company expense creation failed", error);
        return NextResponse.json({ error: "Unable to record this expense." }, { status: 500, headers: responseHeaders });
      }

      return NextResponse.json({ expense: data }, { status: 201, headers: responseHeaders });
    }

    const entryType = body?.entryType;
    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const amount = Number(body?.amount);
    const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod : "";
    const externalReference = typeof body?.externalReference === "string" ? body.externalReference.trim() : "";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
    const receivedAt = typeof body?.receivedAt === "string" ? body.receivedAt : "";
    const candidateId = typeof body?.candidateId === "string" ? body.candidateId : "";
    const accountId = typeof body?.accountId === "string" ? body.accountId : "";
    const otherSource = typeof body?.otherSource === "string" ? body.otherSource.trim() : "";
    if (!body || (entryType !== "candidate_deposit" && entryType !== "other_income")
      || !category || category.length > 100 || !Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99
      || !paymentMethods.has(paymentMethod) || externalReference.length > 200 || notes.length > 2000
      || !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt) || Number.isNaN(Date.parse(`${receivedAt}T00:00:00Z`))) {
      return NextResponse.json({ error: "Enter a valid receipt type, category, amount, payment method, and date." }, { status: 400, headers: responseHeaders });
    }
    if (entryType === "candidate_deposit" && !/^[0-9a-f-]{36}$/i.test(candidateId)) {
      return NextResponse.json({ error: "Select a registered candidate for this deposit." }, { status: 400, headers: responseHeaders });
    }
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) {
      return NextResponse.json({ error: "Select the company account receiving this money." }, { status: 400, headers: responseHeaders });
    }
    if (entryType === "other_income" && (!otherSource || otherSource.length > 200)) {
      return NextResponse.json({ error: "Enter the source of this income." }, { status: 400, headers: responseHeaders });
    }

    const { data, error } = await access.supabase.from("financial_receipts").insert({
      company_id: access.companyId,
      account_id: accountId,
      created_by: access.userId,
      entry_type: entryType,
      candidate_id: entryType === "candidate_deposit" ? candidateId : null,
      received_from: entryType === "candidate_deposit" ? "Candidate" : otherSource,
      category,
      amount,
      payment_method: paymentMethod,
      external_reference: externalReference,
      notes,
      received_at: `${receivedAt}T12:00:00.000Z`,
    }).select("id, receipt_number").single();
    if (error || !data) {
      console.error("Financial receipt creation failed", error);
      return NextResponse.json({ error: "Unable to record this receipt. Verify the candidate and company permissions." }, { status: 403, headers: responseHeaders });
    }
    return NextResponse.json({ receipt: data }, { status: 201, headers: responseHeaders });
  } catch (error) {
    console.error("Financial receipt creation request failed", error);
    return NextResponse.json({ error: "Receipt recording is unavailable." }, { status: 503, headers: responseHeaders });
  }
}