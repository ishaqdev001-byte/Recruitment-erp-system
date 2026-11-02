"use client"

import { useEffect, useState } from "react"

import Link from "next/link"

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  Globe2,
  ShieldCheck,
  UsersRound,
} from "lucide-react"

const previews = [
  {
    eyebrow: "One clear view of recruitment",

    title: "Keep every candidate moving forward.",

    description:
      "Bring candidate records, follow-ups, placement stages, and team activity into one organized workspace.",

    icon: UsersRound,

    nav: ["Dashboard", "Candidates", "Follow-ups", "Documents"],

    metrics: [
      { label: "Active candidates", value: "1,284", change: "+12%" },

      { label: "Follow-ups due", value: "36", change: "Today" },

      { label: "Placements", value: "48", change: "This month" },
    ],

    rows: [
      ["Candidate", "Stage", "Next follow-up"],

      ["Candidate profile", "Interview", "Today, 2:30 PM"],

      ["Candidate profile", "Documents", "Tomorrow"],

      ["Candidate profile", "Travel ready", "Nov 04"],
    ],
  },

  {
    eyebrow: "Access that fits each role",

    title: "Give every teammate the right tools.",

    description:
      "Company workspaces are separate, and role-based permissions help administrators control access to sensitive modules.",

    icon: ShieldCheck,

    nav: ["Users & Roles", "Staff", "Permissions", "Branches"],

    metrics: [
      { label: "Workspace", value: "Private", change: "Company scoped" },

      { label: "Team roles", value: "Custom", change: "Permission based" },

      { label: "Access", value: "Managed", change: "By administrators" },
    ],

    rows: [
      ["Role", "Access scope", "Status"],

      ["Recruitment staff", "Candidates, follow-ups", "Active"],

      ["Finance manager", "Finance, paychecks", "Active"],

      ["Workspace admin", "Users, roles, settings", "Active"],
    ],
  },

  {
    eyebrow: "See the whole operation",

    title: "Turn everyday activity into useful reports.",

    description:
      "Review staff, agent, partner, contractor, recruitment, and finance activity with date filters and period comparisons.",

    icon: BarChart3,

    nav: ["Reports", "Staff", "Agents", "Finance"],

    metrics: [
      { label: "Registrations", value: "128", change: "+18.4%" },

      { label: "Team follow-ups", value: "342", change: "This period" },

      { label: "Income", value: "UGX 24.8M", change: "This period" },
    ],

    rows: [
      ["Report area", "Current period", "Trend"],

      ["Candidate registrations", "128", "Growing"],

      ["Staff follow-ups", "342", "Activity tracked"],

      ["Finance overview", "UGX 24.8M", "Period comparison"],
    ],
  },
]

export default function MarketingLanding() {
  const [activePreview, setActivePreview] = useState(0)
  const [previewPaused, setPreviewPaused] = useState(false)

  const preview = previews[activePreview]

  const PreviewIcon = preview.icon

  useEffect(() => {
    if (
      previewPaused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return
    }

    const timer = window.setInterval(() => {
      setActivePreview((index) => (index + 1) % previews.length)
    }, 7000)

    return () => window.clearInterval(timer)
  }, [previewPaused])

  const showPrevious = () => {
    setActivePreview((index) => (index + previews.length - 1) % previews.length)
  }

  const showNext = () => {
    setActivePreview((index) => (index + 1) % previews.length)
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#080d18] text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(ellipse_at_68%_18%,rgba(245,158,11,0.12),transparent_48%)]" />
      <header className="landing-enter relative mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/"
          aria-label="Kilax Smart Recruit home"
          className="landing-brand flex items-center gap-3"
        >
          <img src="/branding/kilax-icon.svg" alt="" className="h-10 w-10" />
          <span className="text-sm font-700 tracking-wide sm:text-base">
            Kilax Smart Recruit
          </span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="landing-button rounded-lg px-4 py-2.5 text-sm font-600 text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="landing-button rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-700 text-slate-950 transition hover:bg-amber-300"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16 lg:pb-28 lg:pt-16">
        <div className="landing-hero max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1.5 text-xs font-600 text-amber-200">
            <Globe2 size={14} aria-hidden="true" />A dedicated workspace for
            every company
          </div>
          <h1 className="text-4xl font-700 leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
            Recruitment operations,{" "}
            <span className="text-amber-300">working together.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-400 sm:text-lg">
            Organize candidates, coordinate your team, manage company workflows,
            and understand performance from one recruitment workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="landing-button inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-3.5 text-sm font-700 text-slate-950 transition hover:bg-amber-300"
            >
              Register to get started{" "}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className="landing-button inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-5 py-3.5 text-sm font-600 text-slate-100 transition hover:border-slate-500"
            >
              Log in to your workspace
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
            {[
              "Company-specific workspaces",
              "Role-based access",
              "Connected recruitment tools",
            ].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check
                  size={14}
                  className="text-emerald-400"
                  aria-hidden="true"
                />{" "}
                {item}
              </span>
            ))}
          </div>
        </div>

        <section
          id="features"
          aria-label="Product previews"
          className="landing-preview relative min-w-0"
          onMouseEnter={() => setPreviewPaused(true)}
          onMouseLeave={() => setPreviewPaused(false)}
          onFocusCapture={() => setPreviewPaused(true)}
          onBlurCapture={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              setPreviewPaused(false)
            }
          }}
        >
          <div className="absolute -inset-5 rounded-[2rem] bg-amber-300/5 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0e1524] shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-2 border-b border-slate-700/70 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              <div className="ml-3 flex-1 truncate rounded-md bg-slate-800/80 px-3 py-1.5 text-center text-[10px] text-slate-400">
                recruit.kilaxtech.com / company-workspace
              </div>
            </div>
            <div className="grid min-h-[365px] sm:grid-cols-[142px_1fr]">
              <aside className="hidden border-r border-slate-700/60 p-3 sm:block">
                <div className="mb-5 flex items-center gap-2 px-1">
                  <img
                    src="/branding/kilax-icon.svg"
                    alt=""
                    className="h-6 w-6"
                  />
                  <span className="text-[9px] font-700 text-slate-200">
                    RECRUIT
                  </span>
                </div>
                <div className="space-y-1">
                  {preview.nav.map((item, index) => (
                    <div
                      key={item}
                      className={`rounded-md px-2.5 py-2 text-[10px] ${
                        index === 0
                          ? "bg-amber-400/10 font-600 text-amber-200"
                          : "text-slate-500"
                      }`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-8 rounded-lg border border-slate-700/70 bg-slate-900/80 p-2.5">
                  <p className="text-[8px] uppercase tracking-wider text-slate-500">
                    Workspace
                  </p>
                  <p className="mt-1 truncate text-[10px] font-600 text-slate-300">
                    Your company
                  </p>
                  <p className="mt-1 truncate text-[8px] text-slate-500">
                    Private company URL
                  </p>
                </div>
              </aside>
              <div
                key={activePreview}
                className="landing-preview-content min-w-0 p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-600 text-amber-200">
                      <PreviewIcon size={14} aria-hidden="true" />{" "}
                      {preview.eyebrow}
                    </div>
                    <h2 className="mt-2 text-lg font-700 text-white sm:text-xl">
                      {preview.title}
                    </h2>
                    <p className="mt-1 max-w-lg text-[11px] leading-5 text-slate-400">
                      {preview.description}
                    </p>
                  </div>
                  <span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1 text-[9px] text-emerald-300 md:inline-flex">
                    Illustrative preview
                  </span>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {preview.metrics.map((metric) => (
                    <article
                      key={metric.label}
                      className="rounded-lg border border-slate-700/70 bg-slate-900/70 p-3"
                    >
                      <p className="text-[9px] text-slate-500">
                        {metric.label}
                      </p>
                      <p className="mt-1 truncate text-sm font-700 text-slate-100">
                        {metric.value}
                      </p>
                      <p className="mt-1 text-[9px] text-emerald-300">
                        {metric.change}
                      </p>
                    </article>
                  ))}
                </div>
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-700/70">
                  <div className="grid grid-cols-3 border-b border-slate-700/70 bg-slate-900/80 px-3 py-2 text-[8px] font-600 uppercase tracking-wider text-slate-500">
                    {preview.rows[0].map((cell) => (
                      <span key={cell} className="truncate">
                        {cell}
                      </span>
                    ))}
                  </div>
                  {preview.rows.slice(1).map((row, rowIndex) => (
                    <div
                      key={`${row[0]}-${rowIndex}`}
                      className="grid grid-cols-3 border-b border-slate-800 px-3 py-2.5 text-[9px] last:border-0"
                    >
                      {row.map((cell, cellIndex) => (
                        <span
                          key={`${cell}-${cellIndex}`}
                          className={`truncate ${
                            cellIndex === 0
                              ? "text-slate-200"
                              : "text-slate-400"
                          }`}
                        >
                          {cell}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div
                    className="flex gap-1.5"
                    aria-label="Choose a product preview"
                  >
                    {previews.map((item, index) => (
                      <button
                        key={item.eyebrow}
                        type="button"
                        aria-label={`Show preview ${index + 1}: ${item.eyebrow}`}
                        aria-current={index === activePreview}
                        onClick={() => setActivePreview(index)}
                        className={`landing-indicator h-1.5 rounded-full transition-all ${
                          index === activePreview
                            ? "w-7 bg-amber-300"
                            : "w-1.5 bg-slate-600 hover:bg-slate-400"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={showPrevious}
                      aria-label="Previous preview"
                      className="landing-control rounded-md border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800"
                    >
                      <ArrowLeft size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={showNext}
                      aria-label="Next preview"
                      className="landing-control rounded-md border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800"
                    >
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="relative border-y border-slate-800/80 bg-slate-950/40">
        <div className="mx-auto grid max-w-7xl gap-0 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          {[
            {
              icon: UsersRound,
              title: "Candidate management",
              text: "Profiles, stages, documents, and follow-ups.",
            },

            {
              icon: ShieldCheck,
              title: "Permission-based access",
              text: "Give each role appropriate workspace access.",
            },

            {
              icon: BriefcaseBusiness,
              title: "Connected operations",
              text: "Coordinate staff, agents, partners, and contractors.",
            },

            {
              icon: BarChart3,
              title: "Reports & analytics",
              text: "Track activity and compare business performance.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="landing-feature border-b border-slate-800/80 py-6 sm:px-5 sm:odd:border-r lg:border-b-0 lg:border-r lg:py-8 lg:first:pl-0 lg:last:border-r-0"
            >
              <Icon size={19} className="text-amber-300" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-700 text-slate-100">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="relative mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-7 text-xs text-slate-500 sm:flex-row sm:px-8">
        <p>© {new Date().getFullYear()} Kilax Smart Recruit</p>
        <p>Each company works from its own branded workspace URL.</p>
      </footer>
    </main>
  )
}
