import { NextResponse } from "next/server"
import { loadCandidateFinance } from "@/lib/server/candidate-finance"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params
    const result = await loadCandidateFinance(candidateId)
    if ("error" in result)
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: responseHeaders },
      )
    return NextResponse.json(result.data, { headers: responseHeaders })
  } catch (error) {
    console.error("Candidate finance request failed", error)
    return NextResponse.json(
      { error: "Unable to load candidate finance data." },
      { status: 503, headers: responseHeaders },
    )
  }
}
