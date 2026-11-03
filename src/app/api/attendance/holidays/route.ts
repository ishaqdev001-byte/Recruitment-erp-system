import { NextResponse } from "next/server"

export const runtime = "nodejs"

const headers = {
  "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
}

type HolidayCountry = { countryCode: string; name: string }
type PublicHoliday = {
  date: string
  localName: string
  name: string
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  if (params.get("list") === "countries") {
    try {
      const response = await fetch(
        "https://date.nager.at/api/v3/AvailableCountries",
        { next: { revalidate: 86400 } },
      )
      if (!response.ok)
        throw new Error(`Holiday calendar returned HTTP ${response.status}.`)
      const countries = (await response.json()) as HolidayCountry[]
      return NextResponse.json({ countries }, { headers })
    } catch (error) {
      console.error("Public holiday country list request failed:", error)
      return NextResponse.json(
        { error: "Unable to load countries from the public holiday calendar." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      )
    }
  }

  const countryCode = params.get("countryCode") ?? ""
  const yearValue = params.get("year") ?? ""
  const year = Number(yearValue)
  if (
    !/^[A-Z]{2}$/.test(countryCode) ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  )
    return NextResponse.json(
      { error: "Choose a valid country and holiday year." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )

  try {
    const response = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`,
      { next: { revalidate: 86400 } },
    )
    if (!response.ok)
      throw new Error(`Holiday calendar returned HTTP ${response.status}.`)
    const holidays = (await response.json()) as PublicHoliday[]
    return NextResponse.json({ holidays }, { headers })
  } catch (error) {
    console.error("Public holiday calendar request failed:", error)
    return NextResponse.json(
      { error: "Unable to load public holidays for this country and year." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
