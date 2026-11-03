"use client"

import { useEffect, useState } from "react"

type HolidayCountry = { countryCode: string; name: string }
type PublicHoliday = { date: string; localName: string; name: string }
type ScheduleDay = {
  weekday: number
  is_open: boolean
  opens_at: string | null
  closes_at: string | null
}
type Closure = {
  closed_date: string
  name: string
  closure_type: "public_holiday" | "custom"
}

const days = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
]

const defaultSchedule: ScheduleDay[] = days.map(({ weekday }) => ({
  weekday,
  is_open: weekday >= 1 && weekday <= 5,
  opens_at: weekday >= 1 && weekday <= 5 ? "09:00" : null,
  closes_at: weekday >= 1 && weekday <= 5 ? "17:00" : null,
}))

const fieldStyle = {
  background: "var(--secondary)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
}

export default function AttendanceSettings({
  companyId,
  companyCountry,
}: {
  companyId: string
  companyCountry: string
}) {
  const [countries, setCountries] = useState<HolidayCountry[]>([])
  const [countryCode, setCountryCode] = useState("")
  const [schedule, setSchedule] = useState<ScheduleDay[]>(defaultSchedule)
  const [closures, setClosures] = useState<Closure[]>([])
  const [holidays, setHolidays] = useState<PublicHoliday[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [customDate, setCustomDate] = useState("")
  const [customName, setCustomName] = useState("")
  const [loading, setLoading] = useState(true)
  const [holidaysLoading, setHolidaysLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const [settingsResponse, countriesResponse] = await Promise.all([
          fetch(
            `/api/attendance/settings?companyId=${encodeURIComponent(companyId)}`,
            { cache: "no-store" },
          ),
          fetch("/api/attendance/holidays?list=countries"),
        ])
        const [settings, countryResult] = await Promise.all([
          settingsResponse.json(),
          countriesResponse.json(),
        ]) as [
          {
            countryName?: string
            countryCode?: string
            schedule?: ScheduleDay[]
            closures?: Closure[]
            error?: string
          },
          { countries?: HolidayCountry[]; error?: string },
        ]
        if (!settingsResponse.ok)
          throw new Error(settings.error ?? "Unable to load attendance settings.")
        if (!countriesResponse.ok)
          throw new Error(countryResult.error ?? "Unable to load holiday countries.")
        if (cancelled) return

        const availableCountries = countryResult.countries ?? []
        setCountries(availableCountries)
        const companyCountryMatch = availableCountries.find(
          (country) =>
            country.name.toLocaleLowerCase() ===
            (settings.countryName || companyCountry).trim().toLocaleLowerCase(),
        )
        setCountryCode(
          settings.countryCode || companyCountryMatch?.countryCode || "UG",
        )
        if (settings.schedule?.length === 7)
          setSchedule(
            settings.schedule.map((item) => ({
              ...item,
              opens_at: item.opens_at?.slice(0, 5) ?? null,
              closes_at: item.closes_at?.slice(0, 5) ?? null,
            })),
          )
        setClosures(settings.closures ?? [])
      } catch (loadError) {
        if (!cancelled)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load attendance settings.",
          )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [companyCountry, companyId])

  useEffect(() => {
    if (!countryCode || year < 2000 || year > 2100) return
    let cancelled = false
    const loadHolidays = async () => {
      setHolidaysLoading(true)
      try {
        const response = await fetch(
          `/api/attendance/holidays?countryCode=${encodeURIComponent(countryCode)}&year=${year}`,
        )
        const result = (await response.json()) as {
          holidays?: PublicHoliday[]
          error?: string
        }
        if (!response.ok)
          throw new Error(result.error ?? "Unable to load public holidays.")
        if (!cancelled) setHolidays(result.holidays ?? [])
      } catch (loadError) {
        if (!cancelled)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load public holidays.",
          )
      } finally {
        if (!cancelled) setHolidaysLoading(false)
      }
    }
    void loadHolidays()
    return () => {
      cancelled = true
    }
  }, [countryCode, year])

  const updateDay = (weekday: number, patch: Partial<ScheduleDay>) => {
    setSchedule((current) =>
      current.map((item) =>
        item.weekday === weekday ? { ...item, ...patch } : item,
      ),
    )
  }

  const toggleHoliday = (holiday: PublicHoliday, checked: boolean) => {
    setClosures((current) => {
      const withoutDate = current.filter(
        (closure) => closure.closed_date !== holiday.date,
      )
      return checked
        ? [
            ...withoutDate,
            {
              closed_date: holiday.date,
              name: holiday.localName || holiday.name,
              closure_type: "public_holiday" as const,
            },
          ]
        : withoutDate
    })
  }

  const addCustomClosure = () => {
    if (!customDate || !customName.trim()) {
      setError("Choose a date and enter a closure name.")
      return
    }
    if (closures.some((closure) => closure.closed_date === customDate)) {
      setError("A closure is already set for that date.")
      return
    }
    setClosures((current) => [
      ...current,
      {
        closed_date: customDate,
        name: customName.trim(),
        closure_type: "custom" as const,
      },
    ].sort((first, second) => first.closed_date.localeCompare(second.closed_date)))
    setCustomDate("")
    setCustomName("")
    setError("")
  }

  const removeClosure = (date: string) => {
    setClosures((current) =>
      current.filter((closure) => closure.closed_date !== date),
    )
  }

  const save = async () => {
    if (!countryCode) {
      setError("Choose the country used for public holidays.")
      return
    }
    setSaving(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/attendance/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          countryCode,
          schedule,
          closures,
        }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(result.error ?? "Unable to save attendance settings.")
      setNotice("Office schedule and closures saved.")
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save attendance settings.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header>
        <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>
          Office hours and holidays
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Closed weekdays and selected closure dates are excluded from absence
          records and attendance check-in.
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
        >
          {notice}
        </div>
      )}
      {loading ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          Loading office schedule…
        </p>
      ) : (
        <>
          <section
            className="rounded border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h3 className="mb-4 text-sm font-700" style={{ color: "var(--foreground)" }}>
              Weekly working days and hours
            </h3>
            <div className="space-y-3">
              {days.map(({ weekday, label }) => {
                const day = schedule.find((item) => item.weekday === weekday)
                if (!day) return null
                return (
                  <div
                    key={weekday}
                    className="grid items-center gap-3 border-b pb-3 last:border-0 sm:grid-cols-[1fr_auto_1fr_1fr]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="text-sm font-600" style={{ color: "var(--foreground)" }}>
                      {label}
                    </span>
                    <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                      <input
                        type="checkbox"
                        checked={day.is_open}
                        onChange={(event) =>
                          updateDay(weekday, {
                            is_open: event.target.checked,
                            opens_at: event.target.checked ? day.opens_at ?? "09:00" : null,
                            closes_at: event.target.checked ? day.closes_at ?? "17:00" : null,
                          })
                        }
                      />
                      Office open
                    </label>
                    {day.is_open ? (
                      <>
                        <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          Opens
                          <input
                            type="time"
                            value={day.opens_at ?? "09:00"}
                            onChange={(event) => updateDay(weekday, { opens_at: event.target.value })}
                            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                            style={fieldStyle}
                          />
                        </label>
                        <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          Closes
                          <input
                            type="time"
                            value={day.closes_at ?? "17:00"}
                            onChange={(event) => updateDay(weekday, { closes_at: event.target.value })}
                            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                            style={fieldStyle}
                          />
                        </label>
                      </>
                    ) : (
                      <p className="text-xs sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>
                        Office closed
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section
            className="rounded border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 className="text-sm font-700" style={{ color: "var(--foreground)" }}>
                  Public holidays
                </h3>
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Select country holidays that close your office.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Country
                  <select
                    value={countryCode}
                    onChange={(event) => {
                      setCountryCode(event.target.value)
                      setClosures((current) =>
                        current.filter((closure) => closure.closure_type === "custom"),
                      )
                    }}
                    className="mt-1 block min-w-48 rounded border px-3 py-2 text-sm"
                    style={fieldStyle}
                  >
                    <option value="">Select country</option>
                    {countries.map((country) => (
                      <option key={country.countryCode} value={country.countryCode}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Year
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={year}
                    onChange={(event) => setYear(Number(event.target.value))}
                    className="mt-1 block w-28 rounded border px-3 py-2 text-sm"
                    style={fieldStyle}
                  />
                </label>
              </div>
            </div>
            {holidaysLoading ? (
              <p className="py-5 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Loading public holidays…
              </p>
            ) : holidays.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {holidays.map((holiday) => {
                  const selected = closures.some(
                    (closure) =>
                      closure.closed_date === holiday.date &&
                      closure.closure_type === "public_holiday",
                  )
                  return (
                    <label
                      key={holiday.date}
                      className="flex items-start gap-3 rounded border p-3 text-sm"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => toggleHoliday(holiday, event.target.checked)}
                      />
                      <span>
                        <span className="block font-600">{holiday.localName || holiday.name}</span>
                        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          {holiday.date}{holiday.localName && holiday.localName !== holiday.name ? ` · ${holiday.name}` : ""}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <p className="py-5 text-sm" style={{ color: "var(--muted-foreground)" }}>
                No holidays found for this country and year.
              </p>
            )}
          </section>

          <section
            className="rounded border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h3 className="mb-4 text-sm font-700" style={{ color: "var(--foreground)" }}>
              Additional office closures
            </h3>
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
              <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Date
                <input
                  type="date"
                  value={customDate}
                  onChange={(event) => setCustomDate(event.target.value)}
                  className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                  style={fieldStyle}
                />
              </label>
              <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Reason
                <input
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  maxLength={200}
                  className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                  style={fieldStyle}
                  placeholder="Company closure"
                />
              </label>
              <button
                type="button"
                onClick={addCustomClosure}
                className="self-end rounded border px-4 py-2 text-sm font-600"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                Add closure
              </button>
            </div>
            {closures.length > 0 && (
              <ul className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>
                {closures.map((closure) => (
                  <li
                    key={closure.closed_date}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span style={{ color: "var(--foreground)" }}>
                      {closure.closed_date} · {closure.name}
                      <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {closure.closure_type === "public_holiday" ? "Public holiday" : "Company closure"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeClosure(closure.closed_date)}
                      className="text-xs font-600"
                      style={{ color: "var(--primary)" }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded px-5 py-2.5 text-sm font-600 disabled:opacity-50"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              {saving ? "Saving…" : "Save office settings"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
