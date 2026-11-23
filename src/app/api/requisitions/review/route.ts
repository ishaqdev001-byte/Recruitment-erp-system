import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

export async function POST() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },

    error,
  } = await supabase.auth.getUser()

  if (error || !user)
    return NextResponse.json(
      { error: "Authentication required." },

      { status: 401, headers: responseHeaders },
    )

  return NextResponse.json(
    {
      error:
        "Requisition approvals must use the company-configured approval workflow.",
    },

    { status: 409, headers: responseHeaders },
  )
}
