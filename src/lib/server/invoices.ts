import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InvoiceAccess =
  | { supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; companyId: string; userId: string }
  | { error: string; status: 401 | 403 };

export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue";

export type InvoiceRecord = {
  id: string;
  company_id: string;
  invoice_number: string;
  recipient_type: "contractor" | "supplier" | "candidate";
  recipient_id: string;
  recipient_name: string;
  description: string;
  amount: number;
  due_date: string;
  issued_at: string;
  status: string;
  created_at: string;
};

export type InvoicePayment = {
  id: string;
  amount: number;
  paid_at: string;
};

export type InvoiceWithBalance = InvoiceRecord & {
  deposit_amount: number;
  paid_amount: number;
  balance_due: number;
  display_status: InvoiceStatus;
  payments: InvoicePayment[];
};

export async function getInvoiceAccess(permission: "finance.view" | "finance.create"): Promise<InvoiceAccess> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 };

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 };

  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: permission,
  });
  if (permissionError || !allowed) return { error: "You do not have permission to access invoices.", status: 403 };

  return { supabase, companyId: membership.company_id, userId: user.id };
}

export function getInvoiceStatus(invoice: InvoiceRecord, paidAmount: number, today = new Date().toISOString().slice(0, 10)): InvoiceStatus {
  const balance = Math.max(0, Number(invoice.amount) - paidAmount);
  if (balance <= 0) return "paid";
  if (invoice.status === "draft") return "draft";
  if (invoice.due_date < today) return "overdue";
  if (paidAmount > 0) return "partially_paid";
  return "sent";
}

export function toInvoiceWithBalance(invoice: InvoiceRecord, payments: InvoicePayment[], depositAmount = 0, today?: string): InvoiceWithBalance {
  const paidAmount = payments.reduce((total, payment) => total + Number(payment.amount), 0) + depositAmount;
  return {
    ...invoice,
    amount: Number(invoice.amount),
    deposit_amount: depositAmount,
    paid_amount: paidAmount,
    balance_due: Math.max(0, Number(invoice.amount) - paidAmount),
    display_status: getInvoiceStatus(invoice, paidAmount, today),
    payments,
  };
}

export async function loadInvoiceWithBalance(access: Extract<InvoiceAccess, { supabase: unknown }>, invoiceId: string) {
  const { data: invoice, error: invoiceError } = await access.supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("company_id", access.companyId)
    .maybeSingle();
  if (invoiceError || !invoice) return null;

  const [{ data: paymentRows, error: paymentError }, { data: depositRows, error: depositError }] = await Promise.all([
    access.supabase.from("invoice_payments")
      .select("id, amount, paid_at")
      .eq("invoice_id", invoiceId)
      .eq("company_id", access.companyId)
      .order("paid_at", { ascending: true }),
    access.supabase.from("invoice_deposit_allocations")
      .select("amount")
      .eq("invoice_id", invoiceId)
      .eq("company_id", access.companyId),
  ]);
  if (paymentError || depositError) return null;

  const depositAmount = (depositRows ?? []).reduce((total, allocation) => total + Number(allocation.amount), 0);
  return toInvoiceWithBalance(invoice as InvoiceRecord, (paymentRows ?? []) as InvoicePayment[], depositAmount);
}

export async function loadAllInvoices(access: Extract<InvoiceAccess, { supabase: unknown }>) {
  const { data: rows, error } = await access.supabase
    .from("invoices")
    .select("*")
    .eq("company_id", access.companyId)
    .order("issued_at", { ascending: false });
  if (error) throw error;
  const invoices = (rows ?? []) as InvoiceRecord[];
  if (!invoices.length) return [];

  const [
    { data: paymentRows, error: paymentError },
    { data: depositRows, error: depositError },
  ] = await Promise.all([
    access.supabase.from("invoice_payments")
      .select("id, invoice_id, amount, paid_at")
      .eq("company_id", access.companyId)
      .in("invoice_id", invoices.map((invoice) => invoice.id))
      .order("paid_at", { ascending: true }),
    access.supabase.from("invoice_deposit_allocations")
      .select("invoice_id, amount")
      .eq("company_id", access.companyId)
      .in("invoice_id", invoices.map((invoice) => invoice.id)),
  ]);
  if (paymentError || depositError) throw paymentError ?? depositError;

  const paymentMap = new Map<string, InvoicePayment[]>();
  for (const payment of paymentRows ?? []) {
    const current = paymentMap.get(payment.invoice_id) ?? [];
    current.push({ id: payment.id, amount: Number(payment.amount), paid_at: payment.paid_at });
    paymentMap.set(payment.invoice_id, current);
  }
  const depositMap = new Map<string, number>();
  for (const allocation of depositRows ?? []) {
    depositMap.set(allocation.invoice_id, (depositMap.get(allocation.invoice_id) ?? 0) + Number(allocation.amount));
  }
  return invoices.map((invoice) => toInvoiceWithBalance(invoice, paymentMap.get(invoice.id) ?? [], depositMap.get(invoice.id) ?? 0));
}