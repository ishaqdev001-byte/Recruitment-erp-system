import { NextResponse } from "next/server"

import { getInvoiceAccess } from "@/lib/server/invoices"

import {
  loadPayableInvoices,
  loadPayableVendors,
} from "@/lib/server/payment-ledger"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

export async function GET() {
  try {
    const access = await getInvoiceAccess("finance.view")

    if ("error" in access) {
      return NextResponse.json(
        { error: access.error },

        { status: access.status, headers: responseHeaders },
      )
    }

    const { data: canCreate, error: permissionError } =
      await access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,

        requested_permission: "finance.create",
      })

    if (permissionError) throw permissionError

    const [payableInvoices, payableVendors] = await Promise.all([
      loadPayableInvoices(access),

      canCreate ? loadPayableVendors(access) : Promise.resolve([]),
    ])

    return NextResponse.json(
      {
        payableInvoices,

        payableVendors,

        permissions: { canCreate: Boolean(canCreate) },
      },

      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Payable invoice list request failed", error)

    return NextResponse.json(
      { error: "Unable to load payable invoices." },

      { status: 503, headers: responseHeaders },
    )
  }
}
