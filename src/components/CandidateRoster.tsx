import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"

import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageSquareText,
  Paperclip,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  UserPlus,
  X,
} from "lucide-react"

import { matchesSearch } from "@/lib/search"
import { getSmsSegmentInfo } from "@/lib/sms-segments"

import { clearClientApiCache, fetchClientCached } from "@/lib/client-api-cache"

import { SearchableSelect } from "./SearchableSelect"

import AttachmentDrawer from "./AttachmentDrawer"

import CandidateDetail from "./CandidateDetail"

import CandidateReadOnlyDetails from "./CandidateReadOnlyDetails"

import type { Candidate, CandidateAgentOption } from "./Candidates"

interface CandidateRecord {
  id: string

  source_row_number: number | null

  inquiry_number: string

  branch_id?: string | null

  file_number: string

  first_name: string

  last_name: string

  phone: string

  date_of_birth: string | null

  place_of_birth: string

  agent_name: string

  agent_id?: string | null

  agent_user_id?: string | null

  created_at?: string | null

  created_by?: string | null

  created_by_name?: string | null

  updated_at?: string | null

  updated_by?: string | null

  updated_by_name?: string | null

  case_handler_user_id?: string | null

  case_handler_name?: string | null

  religion: string

  position: string

  nationality: string

  father_name: string

  mother_name: string

  details: Record<string, unknown> | null

  visa_locked?: boolean
}

type InquirySource = "radio" | "television" | "friend_referral" | "walk_in" | "sign_post" | "agent"

type CaseHandlerOption = {
  userId: string

  displayName: string

  description?: string
}

type CandidateImportOutcome = {
  rowNumber: number
  candidateName: string
  error?: string
}

const candidateImportHeaders = [
  "First Name",
  "Last Name",
  "Other Names",
  "Phone",
  "Secondary Phone",
  "Other Phone",
  "Date of Birth",
  "Gender",
  "Marital Status",
  "Religion",
  "Nationality",
  "Branch",
  "Branch ID (optional)",
  "Abroad Status",
  "Abroad Experience",
  "Candidate Source",
  "Agent",
  "Agent ID (optional)",
  "Partner",
  "Partner ID (optional)",
  "Media Channels",
  "NIN",
  "Passport Number",
  "Passport Issue Date",
  "Passport Expiry Date",
  "Passport Status",
  "Passport Storage Branch",
  "Passport Storage Location",
  "Place of Birth",
  "Physical Address",
  "Residence Country",
  "Residence State/Province",
  "District/City",
  "County",
  "Sub-County",
  "Parish",
  "Father Name",
  "Father Phone",
  "Father Status",
  "Mother Name",
  "Mother Phone",
  "Mother Status",
  "Next of Kin First Name",
  "Next of Kin Last Name",
  "Next of Kin Phone",
  "Next of Kin Relationship",
  "Emergency Contact First Name",
  "Emergency Contact Last Name",
  "Emergency Contact Phone",
  "Emergency Contact Relationship",
  "Job(s) of Interest",
  "Preferred Countries",
  "Preferred Cities",
  "Highest Qualification",
  "Education Institution",
  "Year Completed",
  "Field of Study",
  "Last Employer",
  "Previous Job Title",
  "Employment From",
  "Employment To",
  "Employment Duties",
  "Key Skills",
  "Languages Spoken",
  "Certifications",
  "Recruiter Notes",
] as const

type InquiryPerson = {
  user_id: string

  display_name: string

  role_name: string

  linked_user_id?: string | null
}

interface InquiryRecord {
  id: string

  inquiry_number: string

  first_name: string

  last_name: string

  phone: string

  passport_number: string

  discovery_source: InquirySource

  agent_id?: string | null

  agent_user_id: string | null

  agent_name: string

  desired_countries: string[]

  job_of_interest: string[]

  has_experience: boolean

  experience_description: string

  communication_method: "call" | "text" | "both"

  handled_by_user_id: string

  handled_by_name: string

  remarks: string

  created_at: string
}

interface InquiryDraft {
  firstName: string

  lastName: string

  phone: string

  passportNumber: string

  discoverySource: InquirySource | ""

  agentUserId: string

  desiredCountries: string[]

  jobOfInterest: string[]

  hasExperience: "yes" | "no"

  experienceDescription: string

  communicationMethod: "call" | "text" | "both"

  handledByUserId: string

  remarks: string
}

interface ProjectOption {
  id: string

  project_name: string

  country: string

  age_bracket: string

  status: string
}

interface CandidateFilterOption {
  value: string

  label: string
}

function CandidateFilterInput({
  label,

  value,

  query,

  options,

  onChange,

  onChoose,
}: {
  label: string

  value: string

  query: string

  options: CandidateFilterOption[]

  onChange: (value: string) => void

  onChoose: (value: string) => void
}) {
  const [focused, setFocused] = useState(false)

  const matches =
    query.length >= 3
      ? options.filter((option) => matchesSearch(query, option.label))
      : []

  return (
    <div className="relative min-w-40 flex-1 sm:flex-none">
      <input
        type="search"
        aria-label={`Filter by ${label.toLocaleLowerCase()}`}
        aria-autocomplete="list"
        aria-expanded={focused && query.length >= 3}
        placeholder={label}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--secondary)",

          borderColor: "var(--border)",

          color: "var(--foreground)",
        }}
      />
      {focused && query.length >= 3 && (
        <div
          role="listbox"
          aria-label={`${label} filter suggestions`}
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-40 overflow-y-auto border shadow-lg"
          style={{
            background: "var(--card)",

            borderColor: "var(--border)",
          }}
        >
          {matches.length ? (
            matches.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChoose(option.label)

                  setFocused(false)
                }}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-[var(--secondary)]"
                style={{ color: "var(--foreground)" }}
              >
                {option.label}
              </button>
            ))
          ) : (
            <p
              className="px-3 py-2 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              No matching {label.toLocaleLowerCase()}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function candidateFromRecord(record: CandidateRecord): Candidate {
  const details = record.details ?? {}

  const detail = (key: string) => details[key]

  const text = (key: string) =>
    typeof detail(key) === "string" ? detail(key) as string : ""

  const list = (key: string) =>
    Array.isArray(detail(key)) ? detail(key) as string[] : []

  const passportNumber = text("passportNumber")

  const storedPassportStatus = text("passportStatus")
  const isPartnerSource =
    text("source").trim().toLocaleLowerCase() === "partner"

  return {
    id: record.id,

    inquiryNumber: record.inquiry_number,

    fileNumber: record.file_number,

    firstName: record.first_name,

    lastName: record.last_name,

    otherNames: text("otherNames"),

    phone: record.phone,

    secondaryPhone: text("secondaryPhone"),

    otherPhone: text("otherPhone"),

    dob: record.date_of_birth ?? "",

    age: typeof detail("age") === "number" ? detail("age") as number : 0,

    gender: text("gender"),

    maritalStatus: text("maritalStatus"),

    religion: record.religion,

    nationality: record.nationality,

    abroadStatus: text("abroadStatus"),

    abroadExperience: text("abroadExperience"),

    source: text("source"),

    referralPartnerId: text("referralPartnerId"),

    referralPartnerName: text("referralPartnerName"),

    agent: isPartnerSource
      ? text("referralPartnerName") || record.agent_name
      : record.agent_name,

    agentUserId: record.agent_id ?? record.agent_user_id ?? undefined,

    createdByName: record.created_by_name ?? undefined,

    createdAt: record.created_at ?? undefined,

    updatedByName: record.updated_by_name ?? undefined,

    updatedAt: record.updated_at ?? undefined,

    mediaChannel: list("mediaChannel"),

    nin: text("nin"),

    passportNumber,

    passportIssue: text("passportIssue"),

    passportExpiry: text("passportExpiry"),

    passportStatus:
      storedPassportStatus === "Available" ||
      storedPassportStatus === "With Agent"
        ? storedPassportStatus
        : record.agent_name
          ? "With Agent"
          : "Available",

    passportBranch: text("passportBranch"),

    passportStorageLocation: text("passportStorageLocation"),

    preferredCities: text("preferredCities"),

    placeOfBirth: record.place_of_birth,

    physicalAddress: text("physicalAddress"),

    residenceCountry: text("residenceCountry"),

    residenceState: text("residenceState"),

    district: text("district"),

    county: text("county"),

    subCounty: text("subCounty"),

    parish: text("parish"),

    fatherName: record.father_name,

    fatherPhone: text("fatherPhone"),

    fatherStatus: text("fatherStatus"),

    motherName: record.mother_name,

    motherPhone: text("motherPhone"),

    motherStatus: text("motherStatus"),

    kinFirstName: text("kinFirstName"),

    kinLastName: text("kinLastName"),

    kinPhone: text("kinPhone"),

    kinRelationship: text("kinRelationship"),

    emergencyFirstName: text("emergencyFirstName"),

    emergencyLastName: text("emergencyLastName"),

    emergencyPhone: text("emergencyPhone"),

    emergencyRelationship: text("emergencyRelationship"),

    jobOfInterest: list("jobOfInterest").length
      ? list("jobOfInterest")
      : record.position.split(", ").filter(Boolean),

    preferredCountries: list("preferredCountries"),

    assignedContracts: text("assignedContracts"),

    stage: text("stage") || "Registration",

    travelStatus: text("travelStatus") || "Pending Travel",

    visaStatus: text("visaStatus") || "Pending",

    acceptance: text("acceptance"),

    contracts: text("contracts"),

    contractManager: text("contractManager"),

    branch: text("branch"),

    branchId: record.branch_id ?? "",

    verification: text("verification") || "Pending",

    photo: text("photo"),

    educationQualification: text("educationQualification"),

    educationInstitution: text("educationInstitution"),

    educationYearCompleted: text("educationYearCompleted"),

    educationField: text("educationField"),

    lastEmployer: text("lastEmployer"),

    previousJobTitle: text("previousJobTitle"),

    employmentFrom: text("employmentFrom"),

    employmentTo: text("employmentTo"),

    employmentDuties: text("employmentDuties"),

    keySkills: text("keySkills"),

    languagesSpoken: text("languagesSpoken"),

    certifications: text("certifications"),

    recruiterNotes: text("recruiterNotes"),
  }
}

function newCandidate(): Candidate {
  return candidateFromRecord({
    id: crypto.randomUUID(),

    inquiry_number: "",

    source_row_number: null,

    file_number: "",

    first_name: "",

    last_name: "",

    phone: "",

    date_of_birth: null,

    place_of_birth: "",

    agent_name: "",

    agent_user_id: null,

    religion: "",

    position: "",

    nationality: "",

    father_name: "",

    mother_name: "",

    details: {},
  })
}

const inquirySources: { value: InquirySource; label: string }[] = [
  { value: "radio", label: "Radio" },

  { value: "television", label: "Television advert" },

  { value: "friend_referral", label: "Referred by a friend" },

  { value: "walk_in", label: "Walk-in" },

  { value: "sign_post", label: "Sign post" },

  { value: "agent", label: "Agent" },
]

const emptyInquiryDraft = (): InquiryDraft => ({
  firstName: "",

  lastName: "",

  phone: "",

  passportNumber: "",

  discoverySource: "",

  agentUserId: "",

  desiredCountries: [],

  jobOfInterest: [],

  hasExperience: "no",

  experienceDescription: "",

  communicationMethod: "call",

  handledByUserId: "",

  remarks: "",
})

function inquirySourceLabel(source: InquirySource) {
  return inquirySources.find((item) => item.value === source)?.label ?? source
}

function candidateFromInquiry(inquiry: InquiryRecord): Candidate {
  const source =
    inquiry.discovery_source === "friend_referral"
      ? "Referred By Friend"
      : inquiry.discovery_source === "walk_in"
        ? "Walk-in"
        : inquiry.discovery_source === "sign_post"
          ? "Sign Post"
          : inquiry.discovery_source === "television"
            ? "Television Advert"
            : inquiry.discovery_source === "radio"
              ? "Radio"
              : "Recruitment Agent"

  return candidateFromRecord({
    id: crypto.randomUUID(),

    inquiry_number: inquiry.inquiry_number,

    source_row_number: null,

    file_number: "",

    first_name: inquiry.first_name,

    last_name: inquiry.last_name,

    phone: inquiry.phone,

    date_of_birth: null,

    place_of_birth: "",

    agent_name: inquiry.agent_name,

    agent_id: inquiry.agent_id ?? null,

    agent_user_id: inquiry.agent_user_id,

    religion: "",

    position: inquiry.job_of_interest.join(", "),

    nationality: "",

    father_name: "",

    mother_name: "",

    details: {
      passportNumber: inquiry.passport_number,

      jobOfInterest: inquiry.job_of_interest,

      preferredCountries: inquiry.desired_countries,

      stage: "Registration",

      source,

      agent: inquiry.agent_name,

      abroadExperience: inquiry.has_experience ? "" : "None",

      employmentDuties: inquiry.experience_description,

      recruiterNotes: [
        `Inquiry handled by ${inquiry.handled_by_name}`,

        `Preferred communication: ${inquiry.communication_method}`,

        inquiry.remarks,
      ]

        .filter(Boolean)

        .join("\n"),
    },
  })
}

export default function CandidateRoster({
  page,

  companyName,

  currentUserName,

  companyDetails,

  onNavigate,
}: {
  page: "inquiries" | "pipeline"

  companyName: string

  currentUserName: string

  companyDetails?: {
    registrationNumber?: string
    country?: string
    city?: string
    officeAddress?: string
    phone?: string
    email?: string
    website?: string
  }

  onNavigate: (view: "candidates" | "candidate-inquiries") => void
}) {
  const [candidates, setCandidates] = useState<CandidateRecord[]>([])

  const [canViewFinance, setCanViewFinance] = useState(false)

  const [canViewActivityLogs, setCanViewActivityLogs] = useState(false)

  const [permissions, setPermissions] = useState<{
    canViewFinance?: boolean

    canViewAgentFinance?: boolean

    canViewActivityLogs?: boolean

    canEditCandidates?: boolean

    canDeleteCandidates?: boolean

    canUpdateCandidateStages?: boolean

    canSubmitCandidatesToProjects?: boolean

    canRegisterCandidates?: boolean

    canCreateInquiries?: boolean

    canManageCandidateSources?: boolean

    canManagePassportStatus?: boolean

    canSendBulkSms?: boolean

    canAssignCaseHandler?: boolean

    caseHandlersEnabled?: boolean

    isAgent?: boolean

    canViewActivityByRole?: boolean
  }>({})

  const [caseHandlerOptions, setCaseHandlerOptions] =
    useState<CaseHandlerOption[]>([])

  const searchableCaseHandlerOptions = useMemo(
    () =>
      caseHandlerOptions.map((option) => ({
        value: option.userId,
        label: option.displayName,
        description: option.description,
      })),
    [caseHandlerOptions],
  )

  const [candidateAgentOptions, setCandidateAgentOptions] = useState<
    CandidateAgentOption[]
  >([])

  const [caseHandlerError, setCaseHandlerError] = useState("")

  const [copiedFileNumberId, setCopiedFileNumberId] = useState<string | null>(
    null,
  )

  const [fileNumberCopyError, setFileNumberCopyError] = useState("")

  const [savingCaseHandlerId, setSavingCaseHandlerId] = useState<string | null>(
    null,
  )

  const copyFileNumber = async (candidate: CandidateRecord) => {
    try {
      await navigator.clipboard.writeText(candidate.file_number)
      setCopiedFileNumberId(candidate.id)
      setFileNumberCopyError("")
    } catch (error) {
      console.error("Candidate file number copy failed", error)
      setFileNumberCopyError(
        "Unable to copy the file number. You can select and copy it manually.",
      )
    }
  }

  const activePage = page

  const financeReadOnly = canViewFinance && !permissions.canEditCandidates

  const canUpdateCandidateStages = Boolean(permissions.canUpdateCandidateStages)

  const canSubmitCandidatesToProjects = Boolean(
    permissions.canSubmitCandidatesToProjects,
  )

  const canManageCandidateWorkflow =
    canUpdateCandidateStages || canSubmitCandidatesToProjects

  const [inquiries, setInquiries] = useState<InquiryRecord[]>([])

  const [inquiryPeople, setInquiryPeople] = useState<InquiryPerson[]>([])

  const [inquiryAgents, setInquiryAgents] = useState<InquiryPerson[]>([])

  const [inquiriesLoading, setInquiriesLoading] = useState(false)

  const [inquiryError, setInquiryError] = useState("")

  const [inquiryNotice, setInquiryNotice] = useState("")

  const [recordActionError, setRecordActionError] = useState("")

  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)

  const [registrationNotice, setRegistrationNotice] = useState("")

  const [inquiryReloadKey, setInquiryReloadKey] = useState(0)

  const [showInquiryForm, setShowInquiryForm] = useState(false)

  const [inquiryDraft, setInquiryDraft] =
    useState<InquiryDraft>(emptyInquiryDraft)

  const [countryDraft, setCountryDraft] = useState("")

  const [jobDraft, setJobDraft] = useState("")

  const [savingInquiry, setSavingInquiry] = useState(false)

  const [registrationInquiryId, setRegistrationInquiryId] =
    useState<string | null>(null)

  const [search, setSearch] = useState("")

  const [filterInputs, setFilterInputs] = useState({
    agent: "",

    project: "",

    stage: "",

    createdBy: "",
  })

  const [filterQueries, setFilterQueries] = useState({
    agent: "",

    project: "",

    stage: "",

    createdBy: "",
  })

  const [inquiryFilterInputs, setInquiryFilterInputs] = useState({
    agent: "",
    source: "",
    country: "",
    job: "",
    handledBy: "",
  })

  const [inquiryFilterQueries, setInquiryFilterQueries] = useState({
    agent: "",
    source: "",
    country: "",
    job: "",
    handledBy: "",
  })

  const [filterResultsNotice, setFilterResultsNotice] = useState("")

  const filterNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterQueries({
        agent:
          filterInputs.agent.trim().length >= 3
            ? filterInputs.agent.trim()
            : "",

        project:
          filterInputs.project.trim().length >= 3
            ? filterInputs.project.trim()
            : "",

        stage:
          filterInputs.stage.trim().length >= 3
            ? filterInputs.stage.trim()
            : "",

        createdBy:
          filterInputs.createdBy.trim().length >= 3
            ? filterInputs.createdBy.trim()
            : "",
      })
    }, 250)

    return () => clearTimeout(timer)
  }, [filterInputs])

  useEffect(() => {
    const timer = setTimeout(() => {
      setInquiryFilterQueries({
        agent: inquiryFilterInputs.agent.trim(),
        source: inquiryFilterInputs.source.trim(),
        country: inquiryFilterInputs.country.trim(),
        job: inquiryFilterInputs.job.trim(),
        handledBy: inquiryFilterInputs.handledBy.trim(),
      })
    }, 250)

    return () => clearTimeout(timer)
  }, [inquiryFilterInputs])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  const [exportingCandidates, setExportingCandidates] =
    useState<"excel" | "pdf" | null>(null)

  const [exportError, setExportError] = useState("")

  const importFileRef = useRef<HTMLInputElement>(null)

  const [importingCandidates, setImportingCandidates] = useState(false)

  const [candidateImportError, setCandidateImportError] = useState("")

  const [candidateImportOutcomes, setCandidateImportOutcomes] = useState<
    CandidateImportOutcome[]
  >([])

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [showBulkSms, setShowBulkSms] = useState(false)

  const [bulkSmsMessage, setBulkSmsMessage] = useState("")

  const [bulkSmsRequestId, setBulkSmsRequestId] = useState("")

  const [bulkSmsSending, setBulkSmsSending] = useState(false)

  const [bulkSmsAlreadySent, setBulkSmsAlreadySent] = useState(false)

  const [bulkSmsCanRetryNotes, setBulkSmsCanRetryNotes] = useState(false)

  const [bulkSmsError, setBulkSmsError] = useState("")

  const [bulkSmsNotice, setBulkSmsNotice] = useState("")
  const [bulkSmsCurrency, setBulkSmsCurrency] = useState<string | null>(null)
  const [bulkSmsUnitPrice, setBulkSmsUnitPrice] = useState<number | null>(null)
  const [bulkSmsPricingError, setBulkSmsPricingError] = useState("")

  useEffect(() => {
    if (!showBulkSms) return
    let active = true
    void fetch("/api/communications/sms/credit", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { currency?: string | null; unitPrice?: number | null; pricingError?: string | null; error?: string }
        if (!response.ok) throw new Error(payload.error ?? "SMS pricing is unavailable.")
        if (!active) return
        setBulkSmsCurrency(payload.currency ?? null)
        setBulkSmsUnitPrice(payload.unitPrice ?? null)
        setBulkSmsPricingError(payload.pricingError ?? "")
      })
      .catch((error: unknown) => {
        if (active) setBulkSmsPricingError(error instanceof Error ? error.message : "SMS pricing is unavailable.")
      })
    return () => { active = false }
  }, [showBulkSms])

  const [drawerCandidate, setDrawerCandidate] =
    useState<CandidateRecord | null>(null)

  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(
    null,
  )

  const [viewingCandidate, setViewingCandidate] = useState<Candidate | null>(
    null,
  )

  const [isNewCandidate, setIsNewCandidate] = useState(false)

  const [transitionIds, setTransitionIds] = useState<string[]>([])

  const [transitionStep, setTransitionStep] =
    useState<"project" | "details" | "visa" | "ticket" | "complete">("project")

  const [transitionProjectId, setTransitionProjectId] = useState("")

  const [projectSearch, setProjectSearch] = useState("")

  const [stageAnswers, setStageAnswers] = useState({
    offerLetter: "",

    wakalaReceived: "",

    molReceived: "",

    enjaz: "",
  })

  const [projects, setProjects] = useState<ProjectOption[]>([])

  const [projectLoadError, setProjectLoadError] = useState("")

  const [transitionSaving, setTransitionSaving] = useState(false)

  const [transitionNotice, setTransitionNotice] = useState("")

  const [transitionError, setTransitionError] = useState("")

  const [stageDocQueue, setStageDocQueue] = useState<CandidateRecord[]>([])

  const [stageDocUploaded, setStageDocUploaded] = useState(false)

  // Visa step

  type VisaInvoice = {
    candidateId: string

    candidateName: string

    invoiceNumber: string

    amount: number

    depositPaid: number

    balanceDue: number

    status: string
  }

  const [visaInvoices, setVisaInvoices] = useState<VisaInvoice[]>([])

  // Ticket step

  const [ticketForm, setTicketForm] = useState({
    ticketNumber: "",

    bookingReference: "",

    travelDate: "",

    travelTime: "",
  })

  type ConnFlight = {
    from: string

    to: string

    flightNo: string

    depTime: string
  }

  const [connectingFlights, setConnectingFlights] = useState<ConnFlight[]>([])

  useEffect(() => {
    let cancelled = false

    fetchClientCached(
      "/api/candidates",

      { cache: "no-store" },

      { scopeKey: `candidates:${companyName}`, ttlMs: 5_000 },
    )

      .then(async (response) => {
        const payload = (await response.json()) as {
          candidates: CandidateRecord[]

          permissions?: Record<string, boolean>

          agentOptions?: CandidateAgentOption[]

          caseHandlerOptions?: CaseHandlerOption[]

          caseHandlersEnabled?: boolean

          error?: string
        }

        if (!response.ok)
          throw new Error(payload.error || "Unable to load candidates.")

        if (!cancelled) {
          setCandidates(payload.candidates)

          setPermissions({
            ...payload.permissions,

            caseHandlersEnabled: Boolean(payload.caseHandlersEnabled),
          })

          setCaseHandlerOptions(payload.caseHandlerOptions ?? [])

          setCandidateAgentOptions(payload.agentOptions ?? [])

          setCanViewFinance(Boolean(payload.permissions?.canViewFinance))

          setCanViewActivityLogs(
            Boolean(payload.permissions?.canViewActivityLogs),
          )
        }
      })

      .catch((requestError: unknown) => {
        if (!cancelled)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load candidates.",
          )
      })

      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [companyName])

  useEffect(() => {
    let cancelled = false

    const loadInquiries = async () => {
      setInquiriesLoading(true)

      setInquiryError("")

      try {
        const response = await fetchClientCached(
          "/api/candidate-inquiries",

          { cache: "no-store" },

          { scopeKey: `inquiries:${companyName}`, ttlMs: 5_000 },
        )

        const payload = (await response.json()) as {
          inquiries?: InquiryRecord[]

          agents?: InquiryPerson[]

          handlers?: InquiryPerson[]

          error?: string
        }

        if (!response.ok)
          throw new Error(
            payload.error ?? "Unable to load candidate inquiries.",
          )

        if (cancelled) return

        setInquiries(payload.inquiries ?? [])

        setInquiryPeople(payload.handlers ?? [])

        setInquiryAgents(payload.agents ?? [])
      } catch (loadError) {
        if (!cancelled)
          setInquiryError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load candidate inquiries.",
          )
      } finally {
        if (!cancelled) setInquiriesLoading(false)
      }
    }

    void loadInquiries()

    return () => {
      cancelled = true
    }
  }, [companyName, inquiryReloadKey])

  useEffect(() => {
    let cancelled = false

    if (!canManageCandidateWorkflow || activePage !== "pipeline") return

    fetchClientCached(
      "/api/projects",

      { cache: "no-store" },

      { scopeKey: `projects:${companyName}`, ttlMs: 5_000 },
    )

      .then(async (response) => {
        const payload = (await response.json()) as {
          projects?: ProjectOption[]

          error?: string
        }

        if (!response.ok) {
          if (!cancelled)
            setProjectLoadError(
              payload.error ??
                "Unable to load projects. Check your project access.",
            )

          return
        }

        if (!cancelled)
          setProjects(
            (payload.projects ?? []).filter(
              (project) => project.status === "active",
            ),
          )
      })

      .catch(() => {
        if (!cancelled) setProjectLoadError("Unable to load active projects.")
      })

    return () => {
      cancelled = true
    }
  }, [activePage, canManageCandidateWorkflow, companyName])

  const candidateProject = (candidate: CandidateRecord) => {
    const details = candidate.details ?? {}

    return typeof details.contracts === "string" && details.contracts
      ? details.contracts
      : typeof details.assignedContracts === "string"
        ? details.assignedContracts
        : ""
  }

  const candidateStage = (candidate: CandidateRecord) => {
    const stage = candidate.details?.stage

    if (typeof stage !== "string" || !stage) return "Registration"

    return stage === "Project Submission" ? "Submitted to Project" : stage
  }

  const candidateAgentName = (candidate: CandidateRecord) => {
    const details = candidate.details ?? {}
    const source =
      typeof details.source === "string" ? details.source.trim() : ""
    const partnerName =
      typeof details.referralPartnerName === "string"
        ? details.referralPartnerName.trim()
        : ""

    return source.toLocaleLowerCase() === "partner" && partnerName
      ? partnerName
      : candidate.agent_name
  }

  const candidatePassportNumber = (candidate: CandidateRecord) =>
    typeof candidate.details?.passportNumber === "string"
      ? candidate.details.passportNumber
      : ""

  const candidateCreatorName = (candidate: CandidateRecord) =>
    candidate.created_by_name ||
    (candidate.created_by
      ? inquiryPeople.find((person) => person.user_id === candidate.created_by)
          ?.display_name || "Former team member"
      : "Unassigned")

  const filterOptions = (values: string[]): CandidateFilterOption[] =>
    Array.from(new Set(values))

      .sort((a, b) => a.localeCompare(b))

      .map((label) => ({ value: label, label }))

  const agentOptions = filterOptions(
    candidates.map(
      (candidate) => candidateAgentName(candidate) || "Unassigned",
    ),
  )

  const projectOptions = filterOptions(
    candidates.map((candidate) => candidateProject(candidate) || "No project"),
  )

  const stageOptions = filterOptions(candidates.map(candidateStage))

  const createdByOptions = filterOptions(candidates.map(candidateCreatorName))

  const candidateMatchesFilters = (
    candidate: CandidateRecord,

    query = search,
  ) =>
    matchesSearch(
      query,

      candidate.first_name,

      candidate.last_name,

      candidate.file_number,

      candidatePassportNumber(candidate),

      candidate.phone,
    ) &&
    matchesSearch(
      filterQueries.agent,
      candidateAgentName(candidate) || "Unassigned",
    ) &&
    matchesSearch(
      filterQueries.project,

      candidateProject(candidate) || "No project",
    ) &&
    matchesSearch(filterQueries.stage, candidateStage(candidate)) &&
    matchesSearch(filterQueries.createdBy, candidateCreatorName(candidate))

  const filtered = candidates.filter((candidate) =>
    candidateMatchesFilters(candidate),
  )

  const companyExportDetails = [
    companyName,
    companyDetails?.registrationNumber
      ? `Registration: ${companyDetails.registrationNumber}`
      : "",
    [companyDetails?.city, companyDetails?.country].filter(Boolean).join(", "),
    companyDetails?.officeAddress,
    companyDetails?.phone ? `Phone: ${companyDetails.phone}` : "",
    companyDetails?.email ? `Email: ${companyDetails.email}` : "",
    companyDetails?.website ? `Website: ${companyDetails.website}` : "",
  ]
    .filter(Boolean)
    .join(" | ")

  const pipelineFilterSummary =
    [
      search.trim() ? `Search: ${search.trim()}` : "",
      filterQueries.agent ? `Agent: ${filterQueries.agent}` : "",
      filterQueries.project ? `Project: ${filterQueries.project}` : "",
      filterQueries.stage ? `Stage: ${filterQueries.stage}` : "",
      filterQueries.createdBy ? `Created by: ${filterQueries.createdBy}` : "",
    ]
      .filter(Boolean)
      .join(" | ") || "No filters"

  const inquiryFilterSummary =
    [
      search.trim() ? `Search: ${search.trim()}` : "",
      inquiryFilterQueries.agent ? `Agent: ${inquiryFilterQueries.agent}` : "",
      inquiryFilterQueries.source
        ? `Source: ${inquiryFilterQueries.source}`
        : "",
      inquiryFilterQueries.country
        ? `Country: ${inquiryFilterQueries.country}`
        : "",
      inquiryFilterQueries.job ? `Job: ${inquiryFilterQueries.job}` : "",
      inquiryFilterQueries.handledBy
        ? `Handled by: ${inquiryFilterQueries.handledBy}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ") || "No filters"

  const exportTimestamp = () => new Date().toLocaleString()

  const exportPipeline = async (format: "excel" | "pdf") => {
    setExportingCandidates(format)
    setExportError("")

    try {
      const hasCaseHandlers = Boolean(permissions.caseHandlersEnabled)
      const headers = [
        "File No.",
        "Candidate Name",
        "Passport No",
        "Agent",
        "Mobile",
        ...(hasCaseHandlers ? ["Case Handler"] : []),
        "Passport",
        "Project",
        "Stage",
        "Created by",
        "Last edited by",
      ]
      const rows = filtered.map((candidate) => {
        const passport =
          typeof candidate.details?.passportStatus === "string" &&
          candidate.details.passportStatus
            ? candidate.details.passportStatus
            : candidate.details?.passportNumber
              ? "On file"
              : "—"
        const createdBy = [
          candidateCreatorName(candidate),
          candidate.created_at
            ? new Date(candidate.created_at).toLocaleString()
            : "",
        ]
          .filter(Boolean)
          .join("\n")
        const updatedBy = [
          candidate.updated_by_name ||
            (candidate.updated_by
              ? candidatePeople.get(candidate.updated_by) ||
                "Former team member"
              : "—"),
          candidate.updated_at
            ? new Date(candidate.updated_at).toLocaleString()
            : "",
        ]
          .filter(Boolean)
          .join("\n")

        return [
          candidate.file_number || "—",
          `${candidate.first_name} ${candidate.last_name}`.trim(),
          candidatePassportNumber(candidate) || "—",
          candidateAgentName(candidate) || "—",
          candidate.phone || "—",
          ...(hasCaseHandlers ? [candidate.case_handler_name || "—"] : []),
          passport,
          candidateProject(candidate),
          candidateStage(candidate),
          createdBy,
          updatedBy,
        ]
      })
      const fileDate = new Date().toISOString().slice(0, 10)
      const exportedAt = exportTimestamp()
      const exportActorName = currentUserName.trim() || "Workspace user"
      const footerText = `Exported by: ${exportActorName} | Exported: ${exportedAt}`

      if (format === "excel") {
        const { default: ExcelJS } = await import("exceljs")
        const workbook = new ExcelJS.Workbook()
        workbook.creator = exportActorName
        workbook.created = new Date()
        const worksheet = workbook.addWorksheet("Pipeline")
        worksheet.headerFooter.oddFooter = `&L${footerText.replace(/&/g, "&&")}&C${companyName.replace(/&/g, "&&")}&RPage &P of &N`

        worksheet.addRow(["Candidate Pipeline"])
        worksheet.addRow([companyExportDetails])
        worksheet.addRow([`Filters: ${pipelineFilterSummary}`])
        worksheet.addRow(headers)
        worksheet.getRow(1).font = { bold: true, size: 16 }
        worksheet.getRow(4).font = { bold: true }
        worksheet.columns = headers.map((_, index) => ({
          width: hasCaseHandlers
            ? ([18, 26, 24, 22, 18, 22, 16, 24, 22, 28, 28][index] ?? 20)
            : ([18, 26, 24, 22, 18, 16, 24, 22, 28, 28][index] ?? 20),
        }))
        worksheet.getRow(4).eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE9EEF5" },
          }
        })
        worksheet.autoFilter = {
          from: { row: 4, column: 1 },
          to: { row: 4, column: headers.length },
        }
        worksheet.views = [{ state: "frozen", ySplit: 4 }]
        rows.forEach((row) => worksheet.addRow(row))
        worksheet.addRow([])
        worksheet.addRow([footerText])
        worksheet.addRow([companyExportDetails])

        const bytes = new Uint8Array(await workbook.xlsx.writeBuffer())
        const blob = new Blob([bytes.buffer as ArrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = `candidate-pipeline-${fileDate}.xlsx`
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
        return
      }

      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib")
      const pdf = await PDFDocument.create()
      pdf.setTitle("Candidate pipeline")
      pdf.setAuthor(exportActorName)
      const regular = await pdf.embedFont(StandardFonts.Helvetica)
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const pdfSafeText = (value: string) =>
        value.replace(/\s+/g, " ").replace(/[^\x20-\x7e]/g, "?")
      const wrapPdfText = (value: string, maxWidth: number, size: number) => {
        const lines: string[] = []
        let line = ""
        for (const word of pdfSafeText(value).split(" ")) {
          const nextLine = line ? `${line} ${word}` : word
          if (line && regular.widthOfTextAtSize(nextLine, size) > maxWidth) {
            lines.push(line)
            line = word
          } else {
            line = nextLine
          }
        }
        if (line) lines.push(line)
        return lines
      }
      const widths = hasCaseHandlers
        ? [58, 72, 62, 70, 55, 62, 48, 70, 60, 74, 78]
        : [62, 82, 66, 72, 58, 54, 82, 70, 88, 92]
      const columns = headers.map((title, index) => ({
        title,
        x: 24 + widths.slice(0, index).reduce((sum, width) => sum + width, 0),
        width: widths[index],
      }))
      const pageWidth = 842
      const pageHeight = 595
      const companyLines = wrapPdfText(companyExportDetails, 790, 7)
      const filterLines = wrapPdfText(
        `Filters: ${pipelineFilterSummary}`,
        790,
        7,
      )
      const companyStartY = 540
      const filterStartY = companyStartY - companyLines.length * 9 - 5
      const headerY = filterStartY - filterLines.length * 9 - 12
      const firstRowY = headerY - 20
      const rowsPerPage = Math.max(1, Math.floor((firstRowY - 52) / 20))
      const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage))
      const footerCompanyLines = wrapPdfText(companyExportDetails, 790, 6)

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const page = pdf.addPage([pageWidth, pageHeight])
        page.drawText("Candidate Pipeline", {
          x: 24,
          y: 558,
          size: 16,
          font: bold,
          color: rgb(0.12, 0.16, 0.19),
        })
        companyLines.forEach((line, lineIndex) => {
          page.drawText(line, {
            x: 24,
            y: companyStartY - lineIndex * 9,
            size: 7,
            font: regular,
            color: rgb(0.38, 0.43, 0.47),
          })
        })
        filterLines.forEach((line, lineIndex) => {
          page.drawText(line, {
            x: 24,
            y: filterStartY - lineIndex * 9,
            size: 7,
            font: regular,
            color: rgb(0.38, 0.43, 0.47),
          })
        })
        page.drawLine({
          start: { x: 24, y: headerY - 12 },
          end: { x: 818, y: headerY - 12 },
          thickness: 0.8,
          color: rgb(0.82, 0.85, 0.87),
        })

        columns.forEach((column) => {
          page.drawText(column.title.toLocaleUpperCase(), {
            x: column.x + 2,
            y: headerY,
            size: 6,
            font: bold,
            color: rgb(0.38, 0.43, 0.47),
          })
        })

        rows
          .slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage)
          .forEach((row, rowIndex) => {
            const y = firstRowY - rowIndex * 20
            row.forEach((value, columnIndex) => {
              const column = columns[columnIndex]
              let text = pdfSafeText(String(value))

              while (
                text.length > 3 &&
                regular.widthOfTextAtSize(text, 6) > column.width - 4
              ) {
                text = `${text.slice(0, -4)}...`
              }

              page.drawText(text, {
                x: column.x + 2,
                y,
                size: 6,
                font: regular,
                color: rgb(0.12, 0.16, 0.19),
              })
            })
            page.drawLine({
              start: { x: 24, y: y - 6 },
              end: { x: 818, y: y - 6 },
              thickness: 0.35,
              color: rgb(0.9, 0.91, 0.92),
            })
          })

        page.drawLine({
          start: { x: 24, y: 42 },
          end: { x: 818, y: 42 },
          thickness: 0.6,
          color: rgb(0.82, 0.85, 0.87),
        })
        page.drawText(pdfSafeText(footerText), {
          x: 24,
          y: 30,
          size: 6,
          font: regular,
          color: rgb(0.38, 0.43, 0.47),
        })
        footerCompanyLines.slice(0, 3).forEach((line, lineIndex) => {
          page.drawText(line, {
            x: 24,
            y: 20 - lineIndex * 6,
            size: 5.5,
            font: regular,
            color: rgb(0.38, 0.43, 0.47),
          })
        })
        page.drawText(`Page ${pageIndex + 1} of ${pageCount}`, {
          x: 752,
          y: 558,
          size: 8,
          font: regular,
          color: rgb(0.38, 0.43, 0.47),
        })
      }

      const bytes = new Uint8Array(await pdf.save())
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/pdf",
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `candidate-pipeline-${fileDate}.pdf`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (exportError) {
      console.error("Candidate pipeline export failed", exportError)
      setExportError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to export the current candidate view.",
      )
    } finally {
      setExportingCandidates(null)
    }
  }

  const inquiryMatchesFilters = (inquiry: InquiryRecord, query = search) =>
    matchesSearch(
      query,
      inquiry.inquiry_number,
      inquiry.first_name,
      inquiry.last_name,
      inquiry.phone,
      inquiry.agent_name,
      inquiry.job_of_interest.join(" "),
      inquiry.desired_countries.join(" "),
    ) &&
    matchesSearch(
      inquiryFilterQueries.agent,
      inquiry.agent_name || "Unassigned",
    ) &&
    matchesSearch(
      inquiryFilterQueries.source,
      inquirySourceLabel(inquiry.discovery_source),
    ) &&
    matchesSearch(
      inquiryFilterQueries.country,
      inquiry.desired_countries.join(" "),
    ) &&
    matchesSearch(
      inquiryFilterQueries.job,
      inquiry.job_of_interest.join(" "),
    ) &&
    matchesSearch(inquiryFilterQueries.handledBy, inquiry.handled_by_name)

  const filteredInquiries = inquiries.filter((inquiry) =>
    inquiryMatchesFilters(inquiry),
  )

  const inquiryFilterOptions = {
    agent: [
      ...new Set(
        inquiries.map((inquiry) => inquiry.agent_name).filter(Boolean),
      ),
    ],
    source: [
      ...new Set(
        inquiries.map((inquiry) =>
          inquirySourceLabel(inquiry.discovery_source),
        ),
      ),
    ],
    country: [
      ...new Set(inquiries.flatMap((inquiry) => inquiry.desired_countries)),
    ],
    job: [...new Set(inquiries.flatMap((inquiry) => inquiry.job_of_interest))],
    handledBy: [
      ...new Set(
        inquiries.map((inquiry) => inquiry.handled_by_name).filter(Boolean),
      ),
    ],
  }

  const toFilterOptions = (values: string[]): CandidateFilterOption[] =>
    values
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
      .map((value) => ({ value, label: value }))

  const exportInquiries = async (format: "excel" | "pdf") => {
    setExportingCandidates(format)
    setExportError("")

    try {
      const headers = [
        "Inq No.",
        "Candidate",
        "Phone",
        "Source",
        "Agent",
        "Countries",
        "Job of interest",
        "Experience",
        "Contact",
        "Handled by",
        "Inquiry date",
      ]
      const rows = filteredInquiries.map((inquiry) => [
        inquiry.inquiry_number || "—",
        `${inquiry.first_name} ${inquiry.last_name}`.trim(),
        inquiry.phone || "—",
        inquirySourceLabel(inquiry.discovery_source),
        inquiry.agent_name || "—",
        inquiry.desired_countries.join(", ") || "—",
        inquiry.job_of_interest.join(", ") || "—",
        inquiry.has_experience ? inquiry.experience_description || "Yes" : "No",
        inquiry.communication_method,
        inquiry.handled_by_name || "—",
        inquiry.created_at
          ? new Date(inquiry.created_at).toLocaleString()
          : "—",
      ])
      const fileDate = new Date().toISOString().slice(0, 10)
      const exportedAt = exportTimestamp()
      const exportActorName = currentUserName.trim() || "Workspace user"
      const footerText = `Exported by: ${exportActorName} | Exported: ${exportedAt}`

      if (format === "excel") {
        const { default: ExcelJS } = await import("exceljs")
        const workbook = new ExcelJS.Workbook()
        workbook.creator = exportActorName
        workbook.created = new Date()
        const worksheet = workbook.addWorksheet("Inquiries")
        worksheet.headerFooter.oddFooter = `&L${footerText.replace(/&/g, "&&")}&C${companyName.replace(/&/g, "&&")}&RPage &P of &N`
        worksheet.addRow(["Candidate Inquiries"])
        worksheet.addRow([companyExportDetails])
        worksheet.addRow([`Filters: ${inquiryFilterSummary}`])
        worksheet.addRow(headers)
        worksheet.getRow(1).font = { bold: true, size: 16 }
        worksheet.getRow(4).font = { bold: true }
        worksheet.columns = [16, 24, 20, 20, 22, 30, 30, 18, 18, 24, 24].map(
          (width) => ({ width }),
        )
        worksheet.getRow(4).eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE9EEF5" },
          }
        })
        worksheet.autoFilter = {
          from: { row: 4, column: 1 },
          to: { row: 4, column: headers.length },
        }
        worksheet.views = [{ state: "frozen", ySplit: 4 }]
        rows.forEach((row) => worksheet.addRow(row))
        worksheet.addRow([])
        worksheet.addRow([footerText])
        worksheet.addRow([companyExportDetails])

        const bytes = new Uint8Array(await workbook.xlsx.writeBuffer())
        const blob = new Blob([bytes.buffer as ArrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = `candidate-inquiries-${fileDate}.xlsx`
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
        return
      }

      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib")
      const pdf = await PDFDocument.create()
      pdf.setTitle("Candidate Inquiries")
      pdf.setAuthor(exportActorName)
      const regular = await pdf.embedFont(StandardFonts.Helvetica)
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const pdfSafeText = (value: string) =>
        value.replace(/\s+/g, " ").replace(/[^\x20-\x7e]/g, "?")
      const wrapPdfText = (value: string, maxWidth: number, size: number) => {
        const lines: string[] = []
        let line = ""
        for (const word of pdfSafeText(value).split(" ")) {
          const nextLine = line ? `${line} ${word}` : word
          if (line && regular.widthOfTextAtSize(nextLine, size) > maxWidth) {
            lines.push(line)
            line = word
          } else {
            line = nextLine
          }
        }
        if (line) lines.push(line)
        return lines
      }
      const widths = [54, 78, 58, 66, 68, 95, 95, 52, 58, 78, 84]
      const columns = headers.map((title, index) => ({
        title,
        x: 24 + widths.slice(0, index).reduce((sum, width) => sum + width, 0),
        width: widths[index],
      }))
      const companyLines = wrapPdfText(companyExportDetails, 790, 7)
      const filterLines = wrapPdfText(
        `Filters: ${inquiryFilterSummary}`,
        790,
        7,
      )
      const companyStartY = 540
      const filterStartY = companyStartY - companyLines.length * 9 - 5
      const headerY = filterStartY - filterLines.length * 9 - 12
      const firstRowY = headerY - 20
      const rowsPerPage = Math.max(1, Math.floor((firstRowY - 52) / 18))
      const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage))
      const footerCompanyLines = wrapPdfText(companyExportDetails, 790, 6)

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const page = pdf.addPage([842, 595])
        page.drawText("Candidate Inquiries", {
          x: 24,
          y: 558,
          size: 16,
          font: bold,
          color: rgb(0.12, 0.16, 0.19),
        })
        companyLines.forEach((line, lineIndex) => {
          page.drawText(line, {
            x: 24,
            y: companyStartY - lineIndex * 9,
            size: 7,
            font: regular,
            color: rgb(0.38, 0.43, 0.47),
          })
        })
        filterLines.forEach((line, lineIndex) => {
          page.drawText(line, {
            x: 24,
            y: filterStartY - lineIndex * 9,
            size: 7,
            font: regular,
            color: rgb(0.38, 0.43, 0.47),
          })
        })
        page.drawLine({
          start: { x: 24, y: headerY - 12 },
          end: { x: 818, y: headerY - 12 },
          thickness: 0.8,
          color: rgb(0.82, 0.85, 0.87),
        })
        columns.forEach((column) => {
          page.drawText(column.title.toLocaleUpperCase(), {
            x: column.x + 2,
            y: headerY,
            size: 6,
            font: bold,
            color: rgb(0.38, 0.43, 0.47),
          })
        })
        rows
          .slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage)
          .forEach((row, rowIndex) => {
            const y = firstRowY - rowIndex * 18
            row.forEach((value, columnIndex) => {
              const column = columns[columnIndex]
              let text = pdfSafeText(String(value))
              while (
                text.length > 3 &&
                regular.widthOfTextAtSize(text, 6) > column.width - 4
              ) {
                text = `${text.slice(0, -4)}...`
              }
              page.drawText(text, {
                x: column.x + 2,
                y,
                size: 6,
                font: regular,
                color: rgb(0.12, 0.16, 0.19),
              })
            })
            page.drawLine({
              start: { x: 24, y: y - 5 },
              end: { x: 818, y: y - 5 },
              thickness: 0.35,
              color: rgb(0.9, 0.91, 0.92),
            })
          })
        page.drawLine({
          start: { x: 24, y: 42 },
          end: { x: 818, y: 42 },
          thickness: 0.6,
          color: rgb(0.82, 0.85, 0.87),
        })
        page.drawText(pdfSafeText(footerText), {
          x: 24,
          y: 30,
          size: 6,
          font: regular,
          color: rgb(0.38, 0.43, 0.47),
        })
        footerCompanyLines.slice(0, 3).forEach((line, lineIndex) => {
          page.drawText(line, {
            x: 24,
            y: 20 - lineIndex * 6,
            size: 5.5,
            font: regular,
            color: rgb(0.38, 0.43, 0.47),
          })
        })
        page.drawText(`Page ${pageIndex + 1} of ${pageCount}`, {
          x: 752,
          y: 558,
          size: 8,
          font: regular,
          color: rgb(0.38, 0.43, 0.47),
        })
      }

      const bytes = new Uint8Array(await pdf.save())
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/pdf",
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `candidate-inquiries-${fileDate}.pdf`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (exportError) {
      console.error("Candidate inquiry export failed", exportError)
      setExportError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to export the current inquiry view.",
      )
    } finally {
      setExportingCandidates(null)
    }
  }

  const downloadCandidateImportTemplate = async () => {
    setCandidateImportError("")

    try {
      const [branchResponse, sourceResponse, partnerResponse] =
        await Promise.all([
          fetch("/api/branches?purpose=candidate-registration", {
            cache: "no-store",
          }),
          fetch("/api/candidates/sources", { cache: "no-store" }),
          fetch("/api/candidates/referral-options", { cache: "no-store" }),
        ])

      const branchPayload = (await branchResponse.json()) as {
        branches?: { id: string; name: string }[]
        error?: string
      }
      const sourcePayload = (await sourceResponse.json()) as {
        sources?: { id: string; source: string }[]
        error?: string
      }
      const partnerPayload = (await partnerResponse.json()) as {
        partners?: { id: string; name: string }[]
        error?: string
      }

      if (!branchResponse.ok)
        throw new Error(
          branchPayload.error ?? "Unable to load candidate branches.",
        )
      if (!sourceResponse.ok)
        throw new Error(
          sourcePayload.error ?? "Unable to load candidate sources.",
        )
      if (!partnerResponse.ok)
        throw new Error(
          partnerPayload.error ?? "Unable to load referral partners.",
        )

      const { default: ExcelJS } = await import("exceljs")
      const workbook = new ExcelJS.Workbook()
      workbook.creator = currentUserName.trim() || "Workspace user"

      const candidateSheet = workbook.addWorksheet("Candidates")
      candidateSheet.columns = candidateImportHeaders.map((header) => ({
        width: Math.min(Math.max(header.length + 3, 18), 32),
      }))
      candidateSheet.addRow([...candidateImportHeaders])
      candidateSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
      candidateSheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF334155" },
      }
      candidateSheet.views = [{ state: "frozen", ySplit: 1 }]
      candidateSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: candidateImportHeaders.length },
      }
      for (const header of [
        "Date of Birth",
        "Passport Issue Date",
        "Passport Expiry Date",
        "Employment From",
        "Employment To",
      ]) {
        const index = candidateImportHeaders.indexOf(
          header as (typeof candidateImportHeaders)[number],
        )
        if (index >= 0) candidateSheet.getColumn(index + 1).numFmt = "yyyy-mm-dd"
      }

      const optionSheet = workbook.addWorksheet("Options")
      optionSheet.addRow([
        "Branch",
        "Branch ID",
        "Candidate Source",
        "Agent",
        "Agent ID",
        "Partner",
        "Partner ID",
      ])
      const optionCount = Math.max(
        branchPayload.branches?.length ?? 0,
        sourcePayload.sources?.length ?? 0,
        candidateAgentOptions.length,
        partnerPayload.partners?.length ?? 0,
      )
      for (let index = 0; index < optionCount; index += 1) {
        optionSheet.addRow([
          branchPayload.branches?.[index]?.name ?? "",
          branchPayload.branches?.[index]?.id ?? "",
          sourcePayload.sources?.[index]?.source ?? "",
          candidateAgentOptions[index]?.displayName ?? "",
          candidateAgentOptions[index]?.userId ?? "",
          partnerPayload.partners?.[index]?.name ?? "",
          partnerPayload.partners?.[index]?.id ?? "",
        ])
      }
      optionSheet.getRow(1).font = { bold: true }
      optionSheet.columns = [
        { width: 28 },
        { width: 38 },
        { width: 30 },
        { width: 30 },
        { width: 38 },
        { width: 30 },
        { width: 38 },
      ]

      const instructionsSheet = workbook.addWorksheet("Instructions")
      const instructions = [
        ["Candidate Excel Import"],
        [
          "Enter one candidate per row in the Candidates sheet. Keep the header row unchanged.",
        ],
        [
          "Use the exact Branch, Candidate Source, Agent, and Partner values listed on the Options sheet.",
        ],
        [
          "Use the optional IDs when names are duplicated; an ID must match the name on the same row.",
        ],
        [
          "Use YYYY-MM-DD for dates. Separate multiple jobs, countries, cities, and media channels with semicolons.",
        ],
        [
          "Passport Status must be Available or With Agent. Available passports require a storage location; the storage branch must match the candidate branch.",
        ],
        [
          "For Partner source, fill Partner (not Agent). Other sources may use Agent. Recruitment Agent source requires an active agent.",
        ],
        [
          "First name, last name, phone, nationality, branch, passport number and status, next-of-kin details, and at least one job are required.",
        ],
        [
          "Staff registrations also require gender, religion, abroad status, abroad experience, candidate source, and an agent or partner as applicable.",
        ],
        [
          "File No. is generated by the system. Case Handler is not imported; a user with assignment permission can assign it from Pipeline after import.",
        ],
      ]
      instructions.forEach((row) => instructionsSheet.addRow(row))
      instructionsSheet.getColumn(1).width = 125
      instructionsSheet.getRow(1).font = { bold: true, size: 16 }
      instructionsSheet.eachRow((row) => {
        row.height = 30
        row.alignment = { vertical: "middle", wrapText: true }
      })

      const bytes = new Uint8Array(await workbook.xlsx.writeBuffer())
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "candidate-registration-template.xlsx"
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      console.error("Candidate import template generation failed", error)
      setCandidateImportError(
        error instanceof Error
          ? error.message
          : "Unable to download the candidate import template.",
      )
    }
  }

  const importCandidateWorkbook = async (file: File) => {
    setCandidateImportError("")
    setCandidateImportOutcomes([])
    setImportingCandidates(true)

    try {
      if (!file.name.toLocaleLowerCase().endsWith(".xlsx"))
        throw new Error("Choose an Excel .xlsx workbook.")

      const { default: ExcelJS } = await import("exceljs")
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const worksheet =
        workbook.getWorksheet("Candidates") ?? workbook.worksheets[0]
      if (!worksheet)
        throw new Error("The workbook does not contain a Candidates sheet.")

      const normalizeHeader = (value: string) =>
        value.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, "")
      let headerRowNumber = 0
      worksheet.eachRow((row, rowNumber) => {
        const values = new Set<string>()
        row.eachCell((cell) => values.add(normalizeHeader(cell.text)))
        if (
          !headerRowNumber &&
          values.has(normalizeHeader("First Name")) &&
          values.has(normalizeHeader("Last Name"))
        )
          headerRowNumber = rowNumber
      })
      if (!headerRowNumber)
        throw new Error(
          "Could not find the First Name and Last Name header row. Use the downloaded template.",
        )

      const headerMap = new Map<string, number>()
      const headerNames = new Set<string>()
      worksheet.getRow(headerRowNumber).eachCell((cell, columnNumber) => {
        const key = normalizeHeader(cell.text)
        if (!key) return
        if (headerNames.has(key))
          throw new Error(`The workbook contains a duplicate "${cell.text}" column.`)
        headerNames.add(key)
        headerMap.set(key, columnNumber)
      })

      const requiredHeaders = [
        "First Name",
        "Last Name",
        "Phone",
        "Nationality",
        "Branch",
        "Passport Number",
        "Passport Status",
        "Next of Kin First Name",
        "Next of Kin Last Name",
        "Next of Kin Phone",
        "Next of Kin Relationship",
        "Job(s) of Interest",
      ]
      const missingHeaders = requiredHeaders.filter(
        (header) => !headerMap.has(normalizeHeader(header)),
      )
      if (missingHeaders.length)
        throw new Error(
          `The workbook is missing required columns: ${missingHeaders.join(", ")}.`,
        )

      const [branchResponse, sourceResponse, partnerResponse] =
        await Promise.all([
          fetch("/api/branches?purpose=candidate-registration", {
            cache: "no-store",
          }),
          fetch("/api/candidates/sources", { cache: "no-store" }),
          fetch("/api/candidates/referral-options", { cache: "no-store" }),
        ])
      const branchPayload = (await branchResponse.json()) as {
        branches?: { id: string; name: string }[]
        error?: string
      }
      const sourcePayload = (await sourceResponse.json()) as {
        sources?: { id: string; source: string }[]
        error?: string
      }
      const partnerPayload = (await partnerResponse.json()) as {
        partners?: { id: string; name: string }[]
        error?: string
      }
      if (!branchResponse.ok)
        throw new Error(
          branchPayload.error ?? "Unable to load candidate branches.",
        )
      if (!sourceResponse.ok)
        throw new Error(
          sourcePayload.error ?? "Unable to load candidate sources.",
        )
      if (!partnerResponse.ok)
        throw new Error(
          partnerPayload.error ?? "Unable to load referral partners.",
        )

      const branches = branchPayload.branches ?? []
      const sources = sourcePayload.sources ?? []
      const partners = partnerPayload.partners ?? []
      const agents = candidateAgentOptions.map((agent) => ({
        id: agent.userId,
        name: agent.displayName,
      }))
      const normalizeName = (value: string) =>
        value.trim().replace(/\s+/g, " ").toLocaleLowerCase()

      const findOption = (
        options: { id: string; name: string }[],
        name: string,
        id: string,
        label: string,
      ) => {
        if (id) {
          const option = options.find((item) => item.id === id)
          if (!option)
            throw new Error(`${label} ID is not active in this company.`)
          if (name && normalizeName(name) !== normalizeName(option.name))
            throw new Error(`${label} name does not match the selected ID.`)
          return option
        }
        if (!name) return null
        const matchingOptions = options.filter(
          (item) => normalizeName(item.name) === normalizeName(name),
        )
        if (matchingOptions.length > 1)
          throw new Error(
            `${label} name is duplicated. Enter its ID from the Options sheet.`,
          )
        if (!matchingOptions.length)
          throw new Error(`${label} "${name}" is not active in this company.`)
        return matchingOptions[0]
      }

      const getCell = (
        row: ReturnType<typeof worksheet.getRow>,
        header: string,
      ) => {
        const columnNumber = headerMap.get(normalizeHeader(header))
        return columnNumber ? row.getCell(columnNumber) : null
      }
      const cellText = (
        row: Parameters<typeof getCell>[0],
        header: string,
      ) => getCell(row, header)?.text.trim() ?? ""
      const parseDate = (
        row: Parameters<typeof getCell>[0],
        header: string,
      ) => {
        const cell = getCell(row, header)
        if (!cell || cell.value === null || cell.value === undefined) return ""
        let value: Date | null = null
        if (cell.value instanceof Date) {
          value = cell.value
        } else if (typeof cell.value === "number") {
          const epoch = workbook.properties.date1904
            ? Date.UTC(1904, 0, 1)
            : Date.UTC(1899, 11, 30)
          value = new Date(epoch + cell.value * 24 * 60 * 60 * 1000)
        } else {
          const text = cell.text.trim()
          if (!text) return ""
          const parsed = new Date(text)
          if (!Number.isNaN(parsed.getTime())) value = parsed
        }
        if (!value || Number.isNaN(value.getTime()))
          throw new Error(`${header} must be a valid date (YYYY-MM-DD).`)
        return [
          value.getUTCFullYear().toString().padStart(4, "0"),
          (value.getUTCMonth() + 1).toString().padStart(2, "0"),
          value.getUTCDate().toString().padStart(2, "0"),
        ].join("-")
      }
      const splitList = (value: string) =>
        value
          .split(";")
          .map((item) => item.trim())
          .filter(Boolean)

      const outcomes: CandidateImportOutcome[] = []
      let rowsWithData = 0
      for (
        let rowNumber = headerRowNumber + 1;
        rowNumber <= worksheet.rowCount;
        rowNumber += 1
      ) {
        const row = worksheet.getRow(rowNumber)
        const values = candidateImportHeaders.map((header) =>
          cellText(row, header),
        )
        if (values.every((value) => !value)) continue
        rowsWithData += 1
        const firstName = cellText(row, "First Name")
        const lastName = cellText(row, "Last Name")
        const candidateName = `${firstName} ${lastName}`.trim() || "Unnamed candidate"

        try {
          const value = (header: string) => cellText(row, header)
          const requiredValues: [string, string][] = [
            ["First Name", firstName],
            ["Last Name", lastName],
            ["Phone", value("Phone")],
            ["Nationality", value("Nationality")],
            ["Branch", value("Branch")],
            ["Passport Number", value("Passport Number")],
            ["Passport Status", value("Passport Status")],
            ["Next of Kin First Name", value("Next of Kin First Name")],
            ["Next of Kin Last Name", value("Next of Kin Last Name")],
            ["Next of Kin Phone", value("Next of Kin Phone")],
            [
              "Next of Kin Relationship",
              value("Next of Kin Relationship"),
            ],
            ["Job(s) of Interest", value("Job(s) of Interest")],
          ]
          const missingValue = requiredValues.find(([, fieldValue]) => !fieldValue)
          if (missingValue)
            throw new Error(`${missingValue[0]} is required.`)

          if (!permissions.isAgent) {
            const staffRequiredValues: [string, string][] = [
              ["Gender", value("Gender")],
              ["Religion", value("Religion")],
              ["Abroad Status", value("Abroad Status")],
              ["Abroad Experience", value("Abroad Experience")],
              ["Candidate Source", value("Candidate Source")],
            ]
            const missingStaffValue = staffRequiredValues.find(
              ([, fieldValue]) => !fieldValue,
            )
            if (missingStaffValue)
              throw new Error(`${missingStaffValue[0]} is required.`)
          }

          const branch = findOption(
            branches,
            value("Branch"),
            value("Branch ID (optional)"),
            "Branch",
          )
          if (!branch) throw new Error("Select an active company branch.")

          const sourceValue = value("Candidate Source")
          const source = sourceValue
            ? sources.find(
                (item) =>
                  normalizeName(item.source) === normalizeName(sourceValue),
              )
            : undefined
          if (sourceValue && !source)
            throw new Error(
              `Candidate source "${sourceValue}" is not configured for this company.`,
            )

          const sourceName = source?.source ?? ""
          const isPartnerSource =
            sourceName.trim().toLocaleLowerCase() === "partner"
          const agent = isPartnerSource
            ? null
            : findOption(
                agents,
                value("Agent"),
                value("Agent ID (optional)"),
                "Agent",
              )
          const partner = findOption(
            partners,
            value("Partner"),
            value("Partner ID (optional)"),
            "Partner",
          )
          if (isPartnerSource && !partner)
            throw new Error("Partner source requires a registered Partner.")
          if (!isPartnerSource && partner)
            throw new Error("Partner must only be filled for Partner source.")
          if (!isPartnerSource && !permissions.isAgent && !agent)
            throw new Error("Select an active Agent.")
          if (
            sourceName.trim().toLocaleLowerCase() === "recruitment agent" &&
            !agent &&
            !permissions.isAgent
          )
            throw new Error(
              "Recruitment Agent source requires an active Agent.",
            )

          const passportStatusInput = value("Passport Status")
          const passportStatus =
            passportStatusInput.toLocaleLowerCase() === "available"
              ? "Available"
              : passportStatusInput.toLocaleLowerCase() === "with agent"
                ? "With Agent"
                : ""
          if (!passportStatus)
            throw new Error(
              'Passport Status must be "Available" or "With Agent".',
            )
          const passportStorageBranch =
            value("Passport Storage Branch") || branch.name
          if (
            passportStatus === "Available" &&
            normalizeName(passportStorageBranch) !== normalizeName(branch.name)
          )
            throw new Error(
              "Passport Storage Branch must match the candidate Branch.",
            )
          if (
            passportStatus === "Available" &&
            !value("Passport Storage Location")
          )
            throw new Error(
              "Passport Storage Location is required for an available passport.",
            )
          if (
            passportStatus === "With Agent" &&
            !agent &&
            !partner &&
            !permissions.isAgent
          )
            throw new Error(
              "With Agent passport status requires an assigned Agent or Partner.",
            )

          const gender = value("Gender")
          if (
            gender &&
            !["male", "female"].includes(gender.toLocaleLowerCase())
          )
            throw new Error('Gender must be "Male" or "Female".')
          const religion = value("Religion")
          if (
            religion &&
            !["christian", "muslim", "hindu", "other"].includes(
              religion.toLocaleLowerCase(),
            )
          )
            throw new Error(
              "Religion must be Christian, Muslim, Hindu, or Other.",
            )
          const abroadStatus = value("Abroad Status")
          if (
            abroadStatus &&
            !["yes", "no"].includes(abroadStatus.toLocaleLowerCase())
          )
            throw new Error('Abroad Status must be "Yes" or "No".')
          const abroadExperience = value("Abroad Experience")
          const allowedAbroadExperience = [
            "none",
            "certificate",
            "1 year",
            "2 years",
            "3 years",
            "5+ years",
          ]
          if (
            abroadExperience &&
            !allowedAbroadExperience.includes(
              abroadExperience.toLocaleLowerCase(),
            )
          )
            throw new Error(
              "Abroad Experience must be None, Certificate, 1 Year, 2 Years, 3 Years, or 5+ Years.",
            )

          const jobOfInterest = splitList(value("Job(s) of Interest"))
          if (!jobOfInterest.length)
            throw new Error("Enter at least one Job of Interest.")
          const details = {
            otherNames: value("Other Names"),
            secondaryPhone: value("Secondary Phone"),
            otherPhone: value("Other Phone"),
            gender,
            maritalStatus: value("Marital Status"),
            abroadStatus,
            abroadExperience,
            source: sourceName,
            mediaChannel: splitList(value("Media Channels")),
            nationality: value("Nationality"),
            referralPartnerId: partner?.id ?? "",
            referralPartnerName: partner?.name ?? "",
            nin: value("NIN"),
            passportNumber: value("Passport Number"),
            passportIssue: parseDate(row, "Passport Issue Date"),
            passportExpiry: parseDate(row, "Passport Expiry Date"),
            passportStatus,
            passportBranch: passportStorageBranch,
            passportStorageLocation: value("Passport Storage Location"),
            physicalAddress: value("Physical Address"),
            residenceCountry: value("Residence Country"),
            residenceState: value("Residence State/Province"),
            district: value("District/City"),
            county: value("County"),
            subCounty: value("Sub-County"),
            parish: value("Parish"),
            fatherPhone: value("Father Phone"),
            fatherStatus: value("Father Status"),
            motherPhone: value("Mother Phone"),
            motherStatus: value("Mother Status"),
            kinFirstName: value("Next of Kin First Name"),
            kinLastName: value("Next of Kin Last Name"),
            kinPhone: value("Next of Kin Phone"),
            kinRelationship: value("Next of Kin Relationship"),
            emergencyFirstName: value("Emergency Contact First Name"),
            emergencyLastName: value("Emergency Contact Last Name"),
            emergencyPhone: value("Emergency Contact Phone"),
            emergencyRelationship: value("Emergency Contact Relationship"),
            jobOfInterest,
            preferredCountries: splitList(value("Preferred Countries")),
            preferredCities: value("Preferred Cities"),
            branch: branch.name,
            educationQualification: value("Highest Qualification"),
            educationInstitution: value("Education Institution"),
            educationYearCompleted: value("Year Completed"),
            educationField: value("Field of Study"),
            lastEmployer: value("Last Employer"),
            previousJobTitle: value("Previous Job Title"),
            employmentFrom: parseDate(row, "Employment From"),
            employmentTo: parseDate(row, "Employment To"),
            employmentDuties: value("Employment Duties"),
            keySkills: value("Key Skills"),
            languagesSpoken: value("Languages Spoken"),
            certifications: value("Certifications"),
            recruiterNotes: value("Recruiter Notes"),
          }
          const dateOfBirth = parseDate(row, "Date of Birth")
          const response = await fetch("/api/candidates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              firstName,
              lastName,
              phone: value("Phone"),
              dob: dateOfBirth,
              placeOfBirth: value("Place of Birth"),
              nationality: value("Nationality"),
              religion,
              branchId: branch.id,
              agent: agent?.name ?? "",
              agentId: agent?.id,
              fatherName: value("Father Name"),
              motherName: value("Mother Name"),
              jobOfInterest,
              details,
            }),
          })
          const payload = (await response.json()) as {
            error?: string
            warning?: string
          }
          if (!response.ok)
            throw new Error(
              payload.error ?? `Candidate registration failed (${response.status}).`,
            )
          outcomes.push({ rowNumber, candidateName })
        } catch (error) {
          console.error(`Candidate import failed on row ${rowNumber}`, error)
          outcomes.push({
            rowNumber,
            candidateName,
            error:
              error instanceof Error
                ? error.message
                : "Unable to validate or import this row.",
          })
        }
        setCandidateImportOutcomes([...outcomes])
      }

      if (!rowsWithData)
        throw new Error("The Candidates sheet contains no data rows.")

      const importedCount = outcomes.filter((outcome) => !outcome.error).length
      if (importedCount) {
        clearClientApiCache()
        try {
          const response = await fetch("/api/candidates", {
            cache: "no-store",
          })
          const payload = (await response.json()) as {
            candidates?: CandidateRecord[]
            agentOptions?: CandidateAgentOption[]
            error?: string
          }
          if (!response.ok || !payload.candidates)
            throw new Error(
              payload.error ?? "Unable to refresh the candidate list.",
            )
          setCandidates(payload.candidates)
          setCandidateAgentOptions(payload.agentOptions ?? [])
        } catch (error) {
          console.error("Candidate list refresh after import failed", error)
          setCandidateImportError(
            `Imported ${importedCount} candidate${importedCount === 1 ? "" : "s"}, but the Pipeline could not refresh. Reload the page to see them.`,
          )
        }
      }
    } catch (error) {
      console.error("Candidate workbook import failed", error)
      setCandidateImportError(
        error instanceof Error
          ? error.message
          : "Unable to import this workbook.",
      )
    } finally {
      setImportingCandidates(false)
    }
  }

  const applySearch = (value: string) => {
    setSearch(value)

    const resultCount =
      activePage === "pipeline"
        ? candidates.filter((candidate) =>
            candidateMatchesFilters(candidate, value),
          ).length
        : inquiries.filter((inquiry) => inquiryMatchesFilters(inquiry, value))
            .length

    setFilterResultsNotice(`${resultCount.toLocaleString()} results were found`)

    if (filterNoticeTimer.current) clearTimeout(filterNoticeTimer.current)

    filterNoticeTimer.current = setTimeout(
      () => setFilterResultsNotice(""),

      2600,
    )
  }

  useEffect(
    () => () => {
      if (filterNoticeTimer.current) clearTimeout(filterNoticeTimer.current)
    },

    [],
  )

  const candidatePeople = new Map(
    inquiryPeople.map((person) => [person.user_id, person.display_name]),
  )

  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((candidate) => selectedIds.includes(candidate.id))

  const toggleCandidate = (candidateId: string) => {
    setSelectedIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId],
    )
  }

  const toggleFiltered = () => {
    setSelectedIds((current) =>
      allFilteredSelected
        ? current.filter(
            (id) => !filtered.some((candidate) => candidate.id === id),
          )
        : [
            ...new Set([
              ...current,

              ...filtered.map((candidate) => candidate.id),
            ]),
          ],
    )
  }

  const canSelectCandidates =
    canManageCandidateWorkflow || Boolean(permissions.canSendBulkSms)

  const bulkSmsSegmentInfo = getSmsSegmentInfo(bulkSmsMessage)
  const bulkSmsEstimatedCharge =
    bulkSmsUnitPrice === null
      ? null
      : bulkSmsUnitPrice * bulkSmsSegmentInfo.segments * selectedIds.length

  const sendBulkSms = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!permissions.canSendBulkSms || !selectedIds.length || bulkSmsSending)
      return

    setBulkSmsSending(true)

    setBulkSmsError("")

    try {
      const response = await fetch("/api/candidates/bulk-sms", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          requestId: bulkSmsRequestId,

          candidateIds: selectedIds,

          message: bulkSmsMessage,
        }),
      })

      const payload = (await response.json()) as {
        error?: string

        recipients?: number

        agentsNotified?: number

        smsSent?: boolean

        retryable?: boolean

        status?: string

        billing?: { amount: number; currency: string; segments: number; recipients: number; settled: boolean }
      }

      if (!response.ok) {
        if (payload.smsSent) {
          setBulkSmsAlreadySent(true)

          setBulkSmsCanRetryNotes(payload.retryable === true)

          setBulkSmsError(
            payload.error ??
              "SMS sent, but agent notes could not be delivered.",
          )
        } else {
          if (payload.status !== "unknown" && payload.status !== "sending")
            setBulkSmsRequestId(crypto.randomUUID())

          throw new Error(payload.error ?? "Unable to send candidate SMS.")
        }

        return
      }

      setShowBulkSms(false)

      setSelectedIds([])

      setBulkSmsMessage("")

      setBulkSmsAlreadySent(false)

      setBulkSmsCanRetryNotes(false)

      setBulkSmsNotice(
        `SMS sent to ${payload.recipients ?? 0} number${
          payload.recipients === 1 ? "" : "s"
        }. ${payload.agentsNotified ?? 0} agent${
          payload.agentsNotified === 1 ? " received" : "s received"
        } a note.${payload.billing ? ` Candidate SMS charge: ${new Intl.NumberFormat(undefined, { style: "currency", currency: payload.billing.currency }).format(payload.billing.amount)}.` : ""} Accountless agent update SMS, if sent, is charged separately.`,
      )

      window.setTimeout(() => setBulkSmsNotice(""), 6000)
    } catch (sendError) {
      setBulkSmsError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send candidate SMS.",
      )
    } finally {
      setBulkSmsSending(false)
    }
  }

  const canStartWorkflowUpdate = (candidate: CandidateRecord) => {
    const stage = (candidate.details as Record<string, unknown> | null)?.stage

    return candidate.visa_locked || stage === "Submitted to Project"
      ? canUpdateCandidateStages
      : canSubmitCandidatesToProjects
  }

  const openStageUpdate = (candidateId: string) => {
    const clickedCandidate = candidates.find(
      (candidate) => candidate.id === candidateId,
    )

    if (!clickedCandidate || !canStartWorkflowUpdate(clickedCandidate)) return

    const ids = selectedIds.includes(candidateId) ? selectedIds : [candidateId]

    setTransitionIds(ids)

    // Route to the correct starting step based on candidate state

    const allVisaLocked = ids.every((id) => {
      const c = candidates.find((r) => r.id === id)

      return c?.visa_locked === true
    })

    const allSubmitted =
      !allVisaLocked &&
      ids.every((id) => {
        const c = candidates.find((r) => r.id === id)

        return (
          (c?.details as Record<string, unknown> | null)?.stage ===
          "Submitted to Project"
        )
      })

    setTransitionStep(
      allVisaLocked ? "ticket" : allSubmitted ? "details" : "project",
    )

    setTransitionProjectId("")

    setProjectSearch("")

    setStageAnswers({
      offerLetter: "",

      wakalaReceived: "",

      molReceived: "",

      enjaz: "",
    })

    setVisaInvoices([])

    setTicketForm({
      ticketNumber: "",

      bookingReference: "",

      travelDate: "",

      travelTime: "",
    })

    setConnectingFlights([])

    setTransitionNotice("")

    setTransitionError("")
  }

  const projectMatches = projects

    .filter((project) =>
      matchesSearch(projectSearch, project.project_name, project.country),
    )

    .slice(0, 3)

  const advanceCandidates = async () => {
    setTransitionSaving(true)

    setTransitionError("")

    setTransitionNotice("")

    try {
      type StagePayload = {
        updated?: CandidateRecord[]

        rejected?: {
          candidateId: string

          name: string

          reasons: string[]

          kind: "qualification" | "transition"
        }[]

        invoices?: {
          candidateId: string

          candidateName: string

          invoiceNumber: string

          amount: number

          depositPaid: number

          balanceDue: number

          status: string
        }[]

        error?: string
      }

      let body: Record<string, unknown>

      if (transitionStep === "project") {
        body = {
          action: "submit-to-project",

          candidateIds: transitionIds,

          projectId: transitionProjectId,
        }
      } else if (transitionStep === "details") {
        body = {
          action: "save-additional-stages",

          candidateIds: transitionIds,

          ...stageAnswers,
        }
      } else if (transitionStep === "visa") {
        body = {
          action: "record-visa-received",

          candidateIds: transitionIds,

          projectId: transitionProjectId,
        }
      } else {
        // ticket

        body = {
          action: "record-ticketing",

          candidateIds: transitionIds,

          ...ticketForm,

          connectingFlights,
        }
      }

      const response = await fetch("/api/candidates/stage", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(body),
      })

      const payload = (await response.json()) as StagePayload

      if (!response.ok && !payload.updated?.length)
        throw new Error(payload.error ?? "Unable to update candidate stages.")

      if (payload.updated?.length) {
        clearClientApiCache()

        const updatedById = new Map(payload.updated.map((r) => [r.id, r]))

        setCandidates((current) =>
          current.map((c) => updatedById.get(c.id) ?? c),
        )
      }

      if (payload.rejected?.length) {
        const warnings = payload.rejected

          .map(({ name, reasons, kind }) =>
            kind === "qualification"
              ? `${name} was not submitted due to qualifications: ${reasons.join("; ")}.`
              : `${name} could not be advanced: ${reasons.join("; ")}.`,
          )

          .join(" ")

        setTransitionError(warnings)
      }

      // ── routing after each step ──────────────────────────────────────────

      if (transitionStep === "project" && payload.updated?.length) {
        setTransitionIds(payload.updated.map((c) => c.id))

        setTransitionStep(canUpdateCandidateStages ? "details" : "complete")

        setTransitionNotice(
          `${
            payload.updated.length === 1
              ? `${payload.updated[0].first_name} ${payload.updated[0].last_name} submitted`
              : "Candidates submitted"
          } successfully.`,
        )
      } else if (
        transitionStep === "details" &&
        payload.updated?.length &&
        !payload.rejected?.length
      ) {
        const anyYes = Object.values(stageAnswers).some((v) => v === "Yes")

        if (anyYes) {
          setTransitionIds([])

          setSelectedIds([])

          setStageDocUploaded(false)

          setStageDocQueue(payload.updated)
        } else {
          setTransitionNotice(
            "Stages updated. You can now record Visa Received when ready.",
          )

          setTransitionStep("visa")

          setTransitionIds(payload.updated.map((c) => c.id))
        }
      } else if (transitionStep === "visa" && payload.updated?.length) {
        // Show invoices, then open visa doc queue

        if (payload.invoices?.length) setVisaInvoices(payload.invoices)

        setTransitionNotice(
          `Visa recorded. SMS sent to candidate${
            payload.updated.length > 1 ? "s" : ""
          }. Invoice${payload.invoices?.length ? "s" : ""} created.`,
        )

        // Move to ticket step after showing the invoice summary

        setTransitionIds(payload.updated.map((c) => c.id))

        setTransitionStep("ticket")

        // trigger visa doc queue

        setStageDocUploaded(false)

        setStageDocQueue(payload.updated)
      } else if (
        transitionStep === "ticket" &&
        payload.updated?.length &&
        !payload.rejected?.length
      ) {
        setTransitionNotice(
          "Travel details saved. Reminder SMS messages scheduled automatically.",
        )

        setTransitionStep("complete")
      } else if (payload.rejected?.length) {
        setTransitionIds(payload.rejected.map((item) => item.candidateId))
      }
    } catch (requestError) {
      setTransitionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update candidate stages.",
      )
    } finally {
      setTransitionSaving(false)
    }
  }

  const addInquiryCountry = () => {
    const country = countryDraft.trim()

    if (
      !country ||
      inquiryDraft.desiredCountries.some(
        (item) => item.toLocaleLowerCase() === country.toLocaleLowerCase(),
      )
    )
      return

    setInquiryDraft((current) => ({
      ...current,

      desiredCountries: [...current.desiredCountries, country],
    }))

    setCountryDraft("")
  }

  const addInquiryJob = () => {
    const job = jobDraft.trim()

    if (
      !job ||
      inquiryDraft.jobOfInterest.some(
        (item) => item.toLocaleLowerCase() === job.toLocaleLowerCase(),
      )
    )
      return

    setInquiryDraft((current) => ({
      ...current,

      jobOfInterest: [...current.jobOfInterest, job],
    }))

    setJobDraft("")
  }

  const closeInquiryForm = () => {
    setShowInquiryForm(false)

    setInquiryDraft(emptyInquiryDraft())

    setCountryDraft("")

    setJobDraft("")

    setInquiryError("")
  }

  const saveInquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (inquiryDraft.desiredCountries.length === 0) {
      setInquiryError("Add at least one desired travel country.")

      return
    }

    if (inquiryDraft.jobOfInterest.length === 0) {
      setInquiryError("Add at least one job of interest.")

      return
    }

    setSavingInquiry(true)

    setInquiryError("")

    setInquiryNotice("")

    try {
      const response = await fetch("/api/candidate-inquiries", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          ...inquiryDraft,

          hasExperience: inquiryDraft.hasExperience === "yes",

          ...(inquiryDraft.discoverySource === "agent"
            ? {}
            : { agentUserId: "" }),
        }),
      })

      const payload = (await response.json()) as {
        inquiry?: InquiryRecord

        error?: string

        warning?: string
      }

      if (!response.ok || !payload.inquiry)
        throw new Error(
          payload.error ?? "Unable to save this candidate inquiry.",
        )

      clearClientApiCache()

      setInquiryNotice(
        [
          `Inquiry saved for ${payload.inquiry.first_name} ${payload.inquiry.last_name}.`,

          payload.warning,
        ]
          .filter(Boolean)
          .join(" "),
      )

      closeInquiryForm()

      setInquiryReloadKey((key) => key + 1)
    } catch (saveError) {
      setInquiryError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save this candidate inquiry.",
      )
    } finally {
      setSavingInquiry(false)
    }
  }

  const registerFromInquiry = (inquiry: InquiryRecord) => {
    setRegistrationInquiryId(inquiry.id)

    setRegistrationNotice("")

    setEditingCandidate(candidateFromInquiry(inquiry))

    setIsNewCandidate(true)

    onNavigate("candidates")
  }

  const deleteRecord = async (
    recordType: "candidate" | "inquiry",

    recordId: string,

    recordName: string,
  ) => {
    const recordLabel = recordType === "candidate" ? "candidate" : "inquiry"

    if (
      !window.confirm(
        `Permanently delete ${recordLabel} ${recordName}? This cannot be undone.`,
      )
    ) {
      return
    }

    setDeletingRecordId(recordId)

    setRecordActionError("")

    try {
      const response = await fetch(
        recordType === "candidate"
          ? `/api/candidates/${encodeURIComponent(recordId)}`
          : `/api/candidate-inquiries/${encodeURIComponent(recordId)}`,

        { method: "DELETE" },
      )

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? `Unable to delete this ${recordLabel}.`,
        )
      }

      clearClientApiCache()

      if (recordType === "candidate") {
        setCandidates((current) =>
          current.filter((candidate) => candidate.id !== recordId),
        )

        setSelectedIds((current) =>
          current.filter((candidateId) => candidateId !== recordId),
        )

        setRegistrationNotice(`${recordName} was deleted.`)
      } else {
        setInquiries((current) =>
          current.filter((inquiry) => inquiry.id !== recordId),
        )

        setInquiryNotice(`${recordName} was deleted.`)
      }
    } catch (deleteError) {
      setRecordActionError(
        deleteError instanceof Error
          ? deleteError.message
          : `Unable to delete this ${recordLabel}.`,
      )
    } finally {
      setDeletingRecordId(null)
    }
  }

  const assignCaseHandler = async (
    candidateId: string,

    userId: string | null,
  ) => {
    setSavingCaseHandlerId(candidateId)

    setCaseHandlerError("")

    try {
      const response = await fetch(
        `/api/candidates/${encodeURIComponent(candidateId)}/case-handler`,

        {
          method: "PATCH",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ userId }),
        },
      )

      const payload = (await response.json()) as {
        caseHandlerUserId?: string | null

        caseHandlerName?: string | null

        error?: string
      }

      if (!response.ok)
        throw new Error(payload.error ?? "Unable to assign this case handler.")

      setCandidates((current) =>
        current.map((candidate) =>
          candidate.id === candidateId
            ? {
                ...candidate,

                case_handler_user_id: payload.caseHandlerUserId ?? null,

                case_handler_name: payload.caseHandlerName ?? null,
              }
            : candidate,
        ),
      )

      clearClientApiCache()
    } catch (assignmentError: unknown) {
      setCaseHandlerError(
        assignmentError instanceof Error
          ? assignmentError.message
          : "Unable to assign this case handler.",
      )
    } finally {
      setSavingCaseHandlerId(null)
    }
  }

  const saveCandidate = async (form: Candidate) => {
    const {
      id,

      inquiryNumber,

      fileNumber,

      firstName,

      lastName,

      phone,

      dob,

      placeOfBirth,

      agent,

      religion,

      branchId,

      agentUserId,

      nationality,

      fatherName,

      motherName,

      jobOfInterest,

      ...details
    } = form

    void inquiryNumber

    void fileNumber

    const selectedAgentUserId =
      agentUserId ||
      (inquiryAgents.find(
        (person) =>
          person.display_name.trim().toLocaleLowerCase() ===
          agent.trim().toLocaleLowerCase(),
      )?.user_id ??
        "")

    const requestBody = {
      firstName,

      lastName,

      phone,

      dob: dob || null,

      placeOfBirth,

      agent,

      agentId: selectedAgentUserId,

      religion,

      nationality: nationality ?? "",

      fatherName,

      motherName,

      jobOfInterest,

      branchId,

      position: jobOfInterest.join(", "),

      details: { ...details, nationality: nationality ?? "", jobOfInterest },

      ...(registrationInquiryId ? { inquiryId: registrationInquiryId } : {}),

      ...(isNewCandidate
        ? {}
        : {
            first_name: firstName,

            last_name: lastName,

            date_of_birth: dob || null,

            place_of_birth: placeOfBirth,

            agent_name: agent,

            father_name: fatherName,

            mother_name: motherName,
          }),
    }

    const response = await fetch(
      isNewCandidate
        ? "/api/candidates"
        : `/api/candidates/${encodeURIComponent(id)}`,

      {
        method: isNewCandidate ? "POST" : "PATCH",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(requestBody),
      },
    )

    const payload = (await response.json()) as {
      candidate?: CandidateRecord

      error?: string

      warning?: string
    }

    if (!response.ok || !payload.candidate)
      throw new Error(payload.error ?? "Unable to save candidate.")

    clearClientApiCache()

    setRegistrationNotice(payload.warning ?? "")

    if (isNewCandidate)
      setCandidates((current) => [payload.candidate!, ...current])
    else
      setCandidates((current) =>
        current.map((candidate) =>
          candidate.id === payload.candidate?.id
            ? payload.candidate!
            : candidate,
        ),
      )

    setEditingCandidate(null)

    setIsNewCandidate(false)

    if (registrationInquiryId) setInquiryReloadKey((key) => key + 1)

    setRegistrationInquiryId(null)
  }

  if (editingCandidate) {
    return (
      <CandidateDetail
        candidate={editingCandidate}
        isNew={isNewCandidate}
        inquiryId={registrationInquiryId}
        isAgent={permissions?.isAgent}
        onSave={saveCandidate}
        agentOptions={inquiryAgents.map(
          (person): CandidateAgentOption => ({
            userId: person.user_id,

            displayName: person.display_name,
          }),
        )}
        canViewFinance={canViewFinance}
        canManagePassportStatus={permissions?.canManagePassportStatus}
        canViewActivityLogs={canViewActivityLogs}
        canViewActivityByRole={permissions?.canViewActivityByRole || false}
        onBack={() => {
          setEditingCandidate(null)

          setIsNewCandidate(false)

          setRegistrationInquiryId(null)
        }}
      />
    )
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-labelledby="candidate-title"
    >
      <header
        className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex min-w-0 items-center gap-5">
          <div>
            <h1
              id="candidate-title"
              className="text-xl font-700"
              style={{ color: "var(--foreground)" }}
            >
              {activePage === "pipeline" ? "Pipeline" : "Inquiries"}
            </h1>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {activePage === "pipeline"
                ? loading
                  ? "Loading records"
                  : `${candidates.length} registered candidates`
                : inquiriesLoading
                  ? "Loading inquiries"
                  : `${inquiries.length} open inquiries`}
            </p>
            {activePage === "pipeline" && selectedIds.length > 0 && (
              <p
                className="mt-1 text-xs font-600"
                style={{ color: "var(--primary)" }}
              >
                {selectedIds.length} selected
              </p>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <input
            aria-label={
              activePage === "pipeline"
                ? "Search candidates"
                : "Search inquiries"
            }
            value={search}
            onChange={(event) => applySearch(event.target.value)}
            placeholder={
              activePage === "pipeline"
                ? "Search name, file, passport, or mobile"
                : "Search name, inquiry number, agent, or mobile"
            }
            className="w-full max-w-sm border px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--secondary)",

              borderColor: "var(--border)",

              color: "var(--foreground)",
            }}
          />
          {(activePage === "pipeline" || activePage === "inquiries") && (
            <>
              <button
                type="button"
                onClick={() =>
                  void (activePage === "pipeline"
                    ? exportPipeline("excel")
                    : exportInquiries("excel"))
                }
                disabled={
                  (activePage === "pipeline"
                    ? loading || filtered.length === 0
                    : inquiriesLoading || filteredInquiries.length === 0) ||
                  Boolean(exportingCandidates)
                }
                className="inline-flex shrink-0 items-center gap-2 border px-3 py-2 text-sm font-600 disabled:opacity-50"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                {exportingCandidates === "excel" ? (
                  <Loader2
                    className="animate-spin"
                    size={15}
                    aria-hidden="true"
                  />
                ) : (
                  <FileSpreadsheet size={15} aria-hidden="true" />
                )}
                {exportingCandidates === "excel"
                  ? "Preparing Excel…"
                  : "Export Excel"}
              </button>
              <button
                type="button"
                onClick={() =>
                  void (activePage === "pipeline"
                    ? exportPipeline("pdf")
                    : exportInquiries("pdf"))
                }
                disabled={
                  (activePage === "pipeline"
                    ? loading || filtered.length === 0
                    : inquiriesLoading || filteredInquiries.length === 0) ||
                  Boolean(exportingCandidates)
                }
                className="inline-flex shrink-0 items-center gap-2 border px-3 py-2 text-sm font-600 disabled:opacity-50"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                {exportingCandidates === "pdf" ? (
                  <Loader2
                    className="animate-spin"
                    size={15}
                    aria-hidden="true"
                  />
                ) : (
                  <FileText size={15} aria-hidden="true" />
                )}
                {exportingCandidates === "pdf"
                  ? "Preparing PDF…"
                  : "Export PDF"}
              </button>
            </>
          )}
          {activePage === "pipeline" &&
            permissions.canRegisterCandidates && (
              <>
                <button
                  type="button"
                  onClick={() => void downloadCandidateImportTemplate()}
                  disabled={importingCandidates}
                  className="inline-flex shrink-0 items-center gap-2 border px-3 py-2 text-sm font-600 disabled:opacity-50"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  Download template
                </button>
                <button
                  type="button"
                  onClick={() => importFileRef.current?.click()}
                  disabled={importingCandidates || loading}
                  className="inline-flex shrink-0 items-center gap-2 border px-3 py-2 text-sm font-600 disabled:opacity-50"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  {importingCandidates ? (
                    <Loader2
                      className="animate-spin"
                      size={15}
                      aria-hidden="true"
                    />
                  ) : (
                    <FileSpreadsheet size={15} aria-hidden="true" />
                  )}
                  {importingCandidates ? "Importing…" : "Import Excel"}
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  aria-label="Select candidate import workbook"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    event.currentTarget.value = ""
                    if (file) void importCandidateWorkbook(file)
                  }}
                />
              </>
            )}
          {activePage === "pipeline" &&
            permissions.canSendBulkSms &&
            selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (!bulkSmsAlreadySent) {
                    setBulkSmsMessage("")

                    setBulkSmsError("")

                    setBulkSmsCanRetryNotes(false)

                    setBulkSmsRequestId(crypto.randomUUID())
                  }

                  setShowBulkSms(true)
                }}
                className="inline-flex shrink-0 items-center gap-2 rounded px-3 py-2 text-sm font-600"
                style={{
                  background: "var(--primary)",

                  color: "var(--primary-foreground)",
                }}
              >
                <MessageSquareText size={15} aria-hidden="true" />
                Send SMS
              </button>
            )}
          {activePage === "pipeline"
            ? permissions.canRegisterCandidates && (
                <button
                  type="button"
                  onClick={() => {
                    setRegistrationNotice("")

                    setRegistrationInquiryId(null)

                    setEditingCandidate(newCandidate())

                    setIsNewCandidate(true)
                  }}
                  className="inline-flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-600"
                  style={{
                    background: "var(--primary)",

                    color: "var(--primary-foreground)",
                  }}
                >
                  <UserPlus size={16} aria-hidden="true" /> Register Candidate
                </button>
              )
            : permissions.canCreateInquiries && (
                <button
                  type="button"
                  onClick={() => {
                    setInquiryError("")

                    setInquiryNotice("")

                    setInquiryDraft(emptyInquiryDraft())

                    setShowInquiryForm(true)
                  }}
                  className="inline-flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-600"
                  style={{
                    background: "var(--primary)",

                    color: "var(--primary-foreground)",
                  }}
                >
                  <UserPlus size={16} aria-hidden="true" /> Register Candidate
                  Inquiry
                </button>
              )}
        </div>
      </header>
      {activePage === "pipeline" && registrationNotice && (
        <p
          role="status"
          className="border-b border-amber-600/30 bg-amber-600/10 px-6 py-3 text-sm text-amber-800"
        >
          {registrationNotice}
        </p>
      )}
      {recordActionError && (
        <p
          role="alert"
          className="border-b border-red-500/30 bg-red-500/10 px-6 py-3 text-sm text-red-600"
        >
          {recordActionError}
        </p>
      )}
      {exportError && (
        <p
          role="alert"
          className="border-b border-red-500/30 bg-red-500/10 px-6 py-3 text-sm text-red-600"
        >
          {exportError}
        </p>
      )}
      {candidateImportError && activePage === "pipeline" && (
        <p
          role="alert"
          className="border-b border-red-500/30 bg-red-500/10 px-6 py-3 text-sm text-red-600"
        >
          {candidateImportError}
        </p>
      )}
      {candidateImportOutcomes.length > 0 && activePage === "pipeline" && (
        <section
          aria-label="Candidate import results"
          className="border-b px-6 py-4"
          style={{
            borderColor: "var(--border)",
            background: "var(--card)",
            color: "var(--foreground)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-600">
              Import complete:{" "}
              {candidateImportOutcomes.filter((outcome) => !outcome.error).length}{" "}
              imported,{" "}
              {candidateImportOutcomes.filter((outcome) => outcome.error).length}{" "}
              failed.
            </p>
            <button
              type="button"
              onClick={() => setCandidateImportOutcomes([])}
              className="text-xs font-600"
              style={{ color: "var(--primary)" }}
            >
              Dismiss report
            </button>
          </div>
          {candidateImportOutcomes.some((outcome) => outcome.error) ? (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {candidateImportOutcomes
                .filter(
                  (
                    outcome,
                  ): outcome is CandidateImportOutcome & { error: string } =>
                    Boolean(outcome.error),
                )
                .map((outcome) => (
                  <li key={outcome.rowNumber} role="listitem">
                    Row {outcome.rowNumber} ({outcome.candidateName}):{" "}
                    {outcome.error}
                  </li>
                ))}
            </ul>
          ) : null}
        </section>
      )}
      {bulkSmsNotice && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-[80] max-w-sm rounded-lg border px-4 py-3 text-sm shadow-xl"
          style={{
            background: "var(--card)",

            borderColor: "var(--border)",

            color: "var(--foreground)",
          }}
        >
          {bulkSmsNotice}
        </div>
      )}
      {activePage === "pipeline" && (
        <div
          className="flex flex-wrap items-center gap-2 border-b px-6 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <CandidateFilterInput
            label="Agent"
            value={filterInputs.agent}
            query={filterQueries.agent}
            options={agentOptions}
            onChange={(value) =>
              setFilterInputs((current) => ({ ...current, agent: value }))
            }
            onChoose={(value) =>
              setFilterInputs((current) => ({ ...current, agent: value }))
            }
          />
          <CandidateFilterInput
            label="Project"
            value={filterInputs.project}
            query={filterQueries.project}
            options={projectOptions}
            onChange={(value) =>
              setFilterInputs((current) => ({ ...current, project: value }))
            }
            onChoose={(value) =>
              setFilterInputs((current) => ({ ...current, project: value }))
            }
          />
          <CandidateFilterInput
            label="Stage"
            value={filterInputs.stage}
            query={filterQueries.stage}
            options={stageOptions}
            onChange={(value) =>
              setFilterInputs((current) => ({ ...current, stage: value }))
            }
            onChoose={(value) =>
              setFilterInputs((current) => ({ ...current, stage: value }))
            }
          />
          <CandidateFilterInput
            label="Created by"
            value={filterInputs.createdBy}
            query={filterQueries.createdBy}
            options={createdByOptions}
            onChange={(value) =>
              setFilterInputs((current) => ({ ...current, createdBy: value }))
            }
            onChoose={(value) =>
              setFilterInputs((current) => ({ ...current, createdBy: value }))
            }
          />
          {Object.values(filterInputs).some(Boolean) && (
            <button
              type="button"
              onClick={() =>
                setFilterInputs({
                  agent: "",

                  project: "",

                  stage: "",

                  createdBy: "",
                })
              }
              className="px-2 py-2 text-sm font-600"
              style={{ color: "var(--primary)" }}
            >
              Clear filters
            </button>
          )}
          <span
            className="ml-auto text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            {filtered.length.toLocaleString()} of{" "}
            {candidates.length.toLocaleString()} candidates
          </span>
        </div>
      )}
      {activePage === "inquiries" && (
        <div
          className="flex flex-wrap items-center gap-2 border-b px-6 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <CandidateFilterInput
            label="Agent"
            value={inquiryFilterInputs.agent}
            query={inquiryFilterQueries.agent}
            options={toFilterOptions(inquiryFilterOptions.agent)}
            onChange={(value) =>
              setInquiryFilterInputs((current) => ({
                ...current,
                agent: value,
              }))
            }
            onChoose={(value) =>
              setInquiryFilterInputs((current) => ({
                ...current,
                agent: value,
              }))
            }
          />
          <CandidateFilterInput
            label="Source"
            value={inquiryFilterInputs.source}
            query={inquiryFilterQueries.source}
            options={toFilterOptions(inquiryFilterOptions.source)}
            onChange={(value) =>
              setInquiryFilterInputs((current) => ({
                ...current,
                source: value,
              }))
            }
            onChoose={(value) =>
              setInquiryFilterInputs((current) => ({
                ...current,
                source: value,
              }))
            }
          />
          <CandidateFilterInput
            label="Country"
            value={inquiryFilterInputs.country}
            query={inquiryFilterQueries.country}
            options={toFilterOptions(inquiryFilterOptions.country)}
            onChange={(value) =>
              setInquiryFilterInputs((current) => ({
                ...current,
                country: value,
              }))
            }
            onChoose={(value) =>
              setInquiryFilterInputs((current) => ({
                ...current,
                country: value,
              }))
            }
          />
          <CandidateFilterInput
            label="Job"
            value={inquiryFilterInputs.job}
            query={inquiryFilterQueries.job}
            options={toFilterOptions(inquiryFilterOptions.job)}
            onChange={(value) =>
              setInquiryFilterInputs((current) => ({ ...current, job: value }))
            }
            onChoose={(value) =>
              setInquiryFilterInputs((current) => ({ ...current, job: value }))
            }
          />
          <CandidateFilterInput
            label="Handled by"
            value={inquiryFilterInputs.handledBy}
            query={inquiryFilterQueries.handledBy}
            options={toFilterOptions(inquiryFilterOptions.handledBy)}
            onChange={(value) =>
              setInquiryFilterInputs((current) => ({
                ...current,
                handledBy: value,
              }))
            }
            onChoose={(value) =>
              setInquiryFilterInputs((current) => ({
                ...current,
                handledBy: value,
              }))
            }
          />
          {Object.values(inquiryFilterInputs).some(Boolean) && (
            <button
              type="button"
              onClick={() =>
                setInquiryFilterInputs({
                  agent: "",
                  source: "",
                  country: "",
                  job: "",
                  handledBy: "",
                })
              }
              className="px-2 py-2 text-sm font-600"
              style={{ color: "var(--primary)" }}
            >
              Clear filters
            </button>
          )}
          <span
            className="ml-auto text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            {filteredInquiries.length.toLocaleString()} of{" "}
            {inquiries.length.toLocaleString()} inquiries
          </span>
        </div>
      )}
      {filterResultsNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-[70] rounded-lg border px-4 py-2.5 text-sm font-600 shadow-xl"
          style={{
            borderColor: "var(--border)",

            color: "var(--foreground)",

            background: "var(--card)",
          }}
        >
          {filterResultsNotice}
        </div>
      )}

      {caseHandlerError && activePage === "pipeline" && (
        <p
          role="alert"
          className="border-b border-red-500/30 bg-red-500/10 px-6 py-3 text-sm text-red-600"
        >
          {caseHandlerError}
        </p>
      )}

      {fileNumberCopyError && activePage === "pipeline" && (
        <p
          role="alert"
          className="border-b border-red-500/30 bg-red-500/10 px-6 py-3 text-sm text-red-600"
        >
          {fileNumberCopyError}
        </p>
      )}

      {activePage === "pipeline" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="app-table-scroll">
            <table className="candidate-pipeline-table w-full min-w-260 text-sm">
              <thead
                className="sticky top-0"
                style={{ background: "var(--card)" }}
              >
                <tr
                  className="border-b text-left"
                  style={{ borderColor: "var(--border)" }}
                >
                  <th
                    className="whitespace-nowrap px-3 py-3 text-left text-xs font-700 uppercase"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <div className="flex items-center gap-2">
                      {canSelectCandidates && (
                        <input
                          type="checkbox"
                          aria-label="Select all visible candidates"
                          checked={allFilteredSelected}
                          onChange={toggleFiltered}
                          disabled={bulkSmsAlreadySent}
                          className="h-4 w-4 accent-amber-700"
                        />
                      )}
                      Actions
                    </div>
                  </th>
                  {[
                    "File No.",

                    "Candidate Name",

                    "Passport No",

                    "Agent",

                    "Mobile",

                    ...(permissions.caseHandlersEnabled
                      ? ["Case Handler"]
                      : []),

                    "Passport",

                    "Project",

                    "Stage",

                    "Created by",

                    "Last edited by",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={permissions.caseHandlersEnabled ? 12 : 11}
                      className="px-4 py-10 text-center"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Loading company records...
                    </td>
                  </tr>
                )}
                {error && (
                  <tr>
                    <td
                      colSpan={permissions.caseHandlersEnabled ? 12 : 11}
                      role="alert"
                      className="px-4 py-10 text-center"
                      style={{ color: "#ef4444" }}
                    >
                      {error}
                    </td>
                  </tr>
                )}
                {!loading && !error && filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={permissions.caseHandlersEnabled ? 12 : 11}
                      className="px-4 py-10 text-center"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {candidates.length ? (
                        "No matching candidates."
                      ) : permissions.isAgent ? (
                        <div className="mx-auto max-w-xl">
                          <p>
                            Sorry, you currently have no candidates at{" "}
                            {companyName || "your company"}. Kindly register
                            your candidates at our office under Inquiries.
                          </p>
                          <button
                            type="button"
                            onClick={() => onNavigate("candidate-inquiries")}
                            className="mt-3 rounded px-4 py-2 text-sm font-600"
                            style={{
                              background: "var(--primary)",

                              color: "var(--primary-foreground)",
                            }}
                          >
                            Open Inquiries
                          </button>
                        </div>
                      ) : (
                        "No candidate records found for this company."
                      )}
                    </td>
                  </tr>
                )}
                {filtered.map((candidate) => (
                  <tr
                    key={candidate.id}
                    className="border-b"
                    style={{
                      borderColor: "var(--border)",

                      background: selectedIds.includes(candidate.id)
                        ? "color-mix(in srgb, var(--primary) 8%, var(--card))"
                        : "transparent",

                      color: "var(--foreground)",
                    }}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-0.5">
                        {canSelectCandidates && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${candidate.first_name} ${candidate.last_name}`}
                            checked={selectedIds.includes(candidate.id)}
                            onChange={() => toggleCandidate(candidate.id)}
                            disabled={bulkSmsAlreadySent}
                            className="h-4 w-4 accent-amber-700"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setViewingCandidate(candidateFromRecord(candidate))
                          }
                          aria-label={`View details for ${candidate.first_name} ${candidate.last_name}`}
                          title={
                            canViewFinance
                              ? "View candidate and finance details"
                              : "View candidate details"
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--secondary)]"
                          style={{ color: "var(--foreground)" }}
                        >
                          <Eye size={15} aria-hidden="true" />
                        </button>
                        {!financeReadOnly && (
                          <button
                            type="button"
                            onClick={() => setDrawerCandidate(candidate)}
                            aria-label={`View attachments for ${candidate.first_name} ${candidate.last_name}`}
                            title="View attachments"
                            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--secondary)]"
                            style={{ color: "var(--primary)" }}
                          >
                            <Paperclip size={15} aria-hidden="true" />
                          </button>
                        )}
                        {canStartWorkflowUpdate(candidate) && (
                          <button
                            type="button"
                            onClick={() => openStageUpdate(candidate.id)}
                            aria-label={`Advance stage for ${candidate.first_name} ${candidate.last_name}`}
                            title="Update candidate stage"
                            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--secondary)]"
                            style={{ color: "var(--foreground)" }}
                          >
                            <RefreshCw size={14} aria-hidden="true" />
                          </button>
                        )}
                        {permissions.canEditCandidates && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCandidate(
                                  candidateFromRecord(candidate),
                                )

                                setIsNewCandidate(false)
                              }}
                              aria-label={`Edit ${candidate.first_name} ${candidate.last_name}`}
                              title="Edit candidate"
                              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--secondary)]"
                              style={{ color: "var(--foreground)" }}
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                          </>
                        )}
                        {permissions.canDeleteCandidates && (
                          <button
                            type="button"
                            onClick={() =>
                              void deleteRecord(
                                "candidate",

                                candidate.id,

                                `${candidate.first_name} ${candidate.last_name}`,
                              )
                            }
                            disabled={deletingRecordId === candidate.id}
                            aria-label={`Delete ${candidate.first_name} ${candidate.last_name}`}
                            title="Delete candidate"
                            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-red-500/10 disabled:opacity-50"
                            style={{ color: "#b43c45" }}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td
                      className="px-3 py-2 mono text-xs"
                      title={candidate.file_number}
                    >
                      {candidate.file_number ? (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span>
                            {candidate.file_number.length > 8
                              ? `${candidate.file_number.slice(0, 2)}...${candidate.file_number.slice(-4)}`
                              : candidate.file_number}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copyFileNumber(candidate)}
                            aria-label={
                              copiedFileNumberId === candidate.id
                                ? `Copied file number ${candidate.file_number}`
                                : `Copy file number ${candidate.file_number}`
                            }
                            title={
                              copiedFileNumberId === candidate.id
                                ? "File number copied"
                                : "Copy file number"
                            }
                            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--secondary)]"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {copiedFileNumberId === candidate.id ? (
                              <Check size={13} aria-hidden="true" />
                            ) : (
                              <Copy size={13} aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-600">
                      {candidate.first_name} {candidate.last_name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {candidatePassportNumber(candidate) || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {candidateAgentName(candidate) || "—"}
                    </td>
                    <td className="px-3 py-2 mono">{candidate.phone || "—"}</td>
                    {permissions.caseHandlersEnabled && (
                      <td className="px-3 py-2">
                        {permissions.canAssignCaseHandler ? (
                          <SearchableSelect
                            aria-label={`Case handler for ${candidate.first_name} ${candidate.last_name}`}
                            value={candidate.case_handler_user_id ?? ""}
                            options={[
                              ...searchableCaseHandlerOptions,
                              ...(candidate.case_handler_user_id &&
                              !caseHandlerOptions.some(
                                (option) =>
                                  option.userId ===
                                  candidate.case_handler_user_id,
                              )
                                ? [
                                    {
                                      value: candidate.case_handler_user_id,
                                      label:
                                        candidate.case_handler_name ||
                                        "Former team member",
                                      description: "Current assignment",
                                    },
                                  ]
                                : []),
                            ]}
                            placeholder="Search members or staff"
                            minQueryLength={1}
                            preserveValueOnInput
                            disabled={savingCaseHandlerId !== null}
                            onChange={(userId) => {
                              void assignCaseHandler(
                                candidate.id,
                                userId || null,
                              )
                            }}
                            className="min-w-36 text-xs"
                          />
                        ) : (
                          <span className="whitespace-nowrap">
                            {candidate.case_handler_name || "—"}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      {typeof candidate.details?.passportStatus === "string" &&
                      candidate.details.passportStatus
                        ? candidate.details.passportStatus
                        : candidate.details?.passportNumber
                          ? "On file"
                          : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {typeof candidate.details?.contracts === "string" &&
                      candidate.details.contracts
                        ? candidate.details.contracts
                        : typeof candidate.details?.assignedContracts ===
                              "string" && candidate.details.assignedContracts
                          ? candidate.details.assignedContracts
                          : "—"}
                    </td>
                    <td className="px-3 py-2">{candidateStage(candidate)}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="block whitespace-nowrap">
                        {candidate.created_by_name ||
                          (candidate.created_by
                            ? candidatePeople.get(candidate.created_by) ||
                              "Former team member"
                            : "—")}
                      </span>
                      {candidate.created_at && (
                        <time
                          className="mt-1 block whitespace-nowrap"
                          dateTime={candidate.created_at}
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {new Date(candidate.created_at).toLocaleString()}
                        </time>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="block whitespace-nowrap">
                        {candidate.updated_by_name ||
                          (candidate.updated_by
                            ? candidatePeople.get(candidate.updated_by) ||
                              "Former team member"
                            : "—")}
                      </span>
                      {candidate.updated_at && (
                        <time
                          className="mt-1 block whitespace-nowrap"
                          dateTime={candidate.updated_at}
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {new Date(candidate.updated_at).toLocaleString()}
                        </time>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {inquiryNotice && (
            <p
              role="status"
              className="mb-4 border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-700"
            >
              {inquiryNotice}
            </p>
          )}
          {inquiryError && (
            <p
              role="alert"
              className="mb-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
            >
              {inquiryError}
            </p>
          )}
          <div
            className="overflow-x-auto border"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div className="app-table-scroll">
              <table className="w-full min-w-300 text-sm">
                <thead
                  className="sticky top-0"
                  style={{ background: "var(--card)" }}
                >
                  <tr
                    className="border-b text-left"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {[
                      "Inq No.",

                      "Candidate",

                      "Phone",

                      "Source",

                      "Agent",

                      "Countries",

                      "Job of interest",

                      "Experience",

                      "Contact",

                      "Handled by",

                      "Inquiry date",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {heading}
                      </th>
                    ))}
                    <th
                      className="px-3 py-3 text-right text-xs font-700 uppercase"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inquiriesLoading && (
                    <tr>
                      <td
                        colSpan={12}
                        className="px-4 py-10 text-center"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Loading inquiries…
                      </td>
                    </tr>
                  )}
                  {!inquiriesLoading &&
                    !inquiryError &&
                    filteredInquiries.length === 0 && (
                      <tr>
                        <td
                          colSpan={12}
                          className="px-4 py-10 text-center"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {inquiries.length
                            ? "No inquiries match these filters."
                            : "No open inquiries yet."}
                        </td>
                      </tr>
                    )}
                  {!inquiriesLoading &&
                    filteredInquiries.map((inquiry) => (
                      <tr
                        key={inquiry.id}
                        className="border-b"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td
                          className="whitespace-nowrap px-3 py-3 font-mono text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {inquiry.inquiry_number}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-3 font-600"
                          style={{ color: "var(--foreground)" }}
                        >
                          {inquiry.first_name} {inquiry.last_name}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-3"
                          style={{ color: "var(--foreground)" }}
                        >
                          {inquiry.phone}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-3"
                          style={{ color: "var(--foreground)" }}
                        >
                          {inquirySourceLabel(inquiry.discovery_source)}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-3"
                          style={{ color: "var(--foreground)" }}
                        >
                          {inquiry.agent_name || "—"}
                        </td>
                        <td
                          className="px-3 py-3"
                          style={{ color: "var(--foreground)" }}
                        >
                          {inquiry.desired_countries.join(", ")}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-3"
                          style={{ color: "var(--foreground)" }}
                        >
                          {inquiry.job_of_interest.join(", ")}
                        </td>
                        <td
                          className="px-3 py-3"
                          style={{ color: "var(--foreground)" }}
                        >
                          {inquiry.has_experience ? "Yes" : "No"}
                        </td>
                        <td
                          className="px-3 py-3 capitalize"
                          style={{ color: "var(--foreground)" }}
                        >
                          {inquiry.communication_method}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-3"
                          style={{ color: "var(--foreground)" }}
                        >
                          {inquiry.handled_by_name}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-3 text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {new Date(inquiry.created_at).toLocaleDateString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            {permissions.canRegisterCandidates && (
                              <button
                                type="button"
                                onClick={() => registerFromInquiry(inquiry)}
                                className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600"
                                style={{
                                  borderColor: "var(--border)",

                                  color: "var(--foreground)",
                                }}
                              >
                                <ArrowRight size={14} aria-hidden="true" />
                                Complete Registration
                              </button>
                            )}
                            {permissions.canDeleteCandidates && (
                              <button
                                type="button"
                                onClick={() =>
                                  void deleteRecord(
                                    "inquiry",

                                    inquiry.id,

                                    `${inquiry.inquiry_number} (${inquiry.first_name} ${inquiry.last_name})`,
                                  )
                                }
                                disabled={deletingRecordId === inquiry.id}
                                aria-label={`Delete inquiry ${inquiry.inquiry_number} for ${inquiry.first_name} ${inquiry.last_name}`}
                                title="Delete inquiry"
                                className="inline-flex h-8 w-8 items-center justify-center border border-red-500/30 text-red-700 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {showInquiryForm && activePage === "inquiries" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeInquiryForm()
          }}
        >
          <form
            onSubmit={(event) => void saveInquiry(event)}
            className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <header
              className="mb-5 flex items-center justify-between gap-4 border-b pb-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h2
                  className="text-lg font-700"
                  style={{ color: "var(--foreground)" }}
                >
                  Register candidate inquiry
                </h2>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Record the candidate here. Company staff will complete
                  registration at the office.
                </p>
              </div>
              <button
                type="button"
                onClick={closeInquiryForm}
                aria-label="Close inquiry form"
                className="flex h-8 w-8 items-center justify-center"
                style={{ color: "var(--muted-foreground)" }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label
                className="text-xs font-700"
                style={{ color: "var(--muted-foreground)" }}
              >
                First name
                <input
                  required
                  maxLength={200}
                  value={inquiryDraft.firstName}
                  onChange={(event) =>
                    setInquiryDraft((current) => ({
                      ...current,

                      firstName: event.target.value,
                    }))
                  }
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                  style={{
                    background: "var(--secondary)",

                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                />
              </label>
              <label
                className="text-xs font-700"
                style={{ color: "var(--muted-foreground)" }}
              >
                Last name
                <input
                  required
                  maxLength={200}
                  value={inquiryDraft.lastName}
                  onChange={(event) =>
                    setInquiryDraft((current) => ({
                      ...current,

                      lastName: event.target.value,
                    }))
                  }
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                  style={{
                    background: "var(--secondary)",

                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                />
              </label>
              <label
                className="text-xs font-700"
                style={{ color: "var(--muted-foreground)" }}
              >
                Phone number
                <input
                  required
                  type="tel"
                  maxLength={100}
                  value={inquiryDraft.phone}
                  onChange={(event) =>
                    setInquiryDraft((current) => ({
                      ...current,

                      phone: event.target.value,
                    }))
                  }
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                  style={{
                    background: "var(--secondary)",

                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                />
              </label>
              <label
                className="text-xs font-700"
                style={{ color: "var(--muted-foreground)" }}
              >
                Passport number
                <input
                  required
                  maxLength={100}
                  value={inquiryDraft.passportNumber}
                  onChange={(event) =>
                    setInquiryDraft((current) => ({
                      ...current,

                      passportNumber: event.target.value,
                    }))
                  }
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                  style={{
                    background: "var(--secondary)",

                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                />
              </label>
              <fieldset className="sm:col-span-2">
                <legend
                  className="mb-2 text-xs font-700"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Jobs of interest
                </legend>
                <div className="flex gap-2">
                  <input
                    value={jobDraft}
                    onChange={(event) => setJobDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()

                        addInquiryJob()
                      }
                    }}
                    placeholder="Type a job, e.g. Housekeeper"
                    className="min-w-0 flex-1 border px-3 py-2 text-sm"
                    style={{
                      background: "var(--secondary)",

                      borderColor: "var(--border)",

                      color: "var(--foreground)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={addInquiryJob}
                    className="border px-3 py-2 text-sm font-600"
                    style={{
                      borderColor: "var(--border)",

                      color: "var(--foreground)",
                    }}
                  >
                    Add job
                  </button>
                </div>
                {inquiryDraft.jobOfInterest.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {inquiryDraft.jobOfInterest.map((job) => (
                      <span
                        key={job}
                        className="inline-flex items-center gap-1 border px-2 py-1 text-xs"
                        style={{
                          borderColor: "var(--border)",

                          color: "var(--foreground)",
                        }}
                      >
                        {job}
                        <button
                          type="button"
                          aria-label={`Remove ${job}`}
                          onClick={() =>
                            setInquiryDraft((current) => ({
                              ...current,

                              jobOfInterest: current.jobOfInterest.filter(
                                (item) => item !== job,
                              ),
                            }))
                          }
                          className="ml-1"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </fieldset>
              <fieldset className="sm:col-span-2">
                <legend
                  className="mb-2 text-xs font-700"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  How did they hear about the company?
                </legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {inquirySources.map((source) => (
                    <label
                      key={source.value}
                      className="inline-flex items-center gap-2 text-sm"
                      style={{ color: "var(--foreground)" }}
                    >
                      <input
                        required
                        name="inquiry-source"
                        type="radio"
                        value={source.value}
                        checked={inquiryDraft.discoverySource === source.value}
                        onChange={() =>
                          setInquiryDraft((current) => ({
                            ...current,

                            discoverySource: source.value,

                            agentUserId:
                              source.value === "agent"
                                ? current.agentUserId
                                : "",
                          }))
                        }
                      />
                      {source.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {inquiryDraft.discoverySource === "agent" &&
                !permissions.isAgent && (
                  <label
                    className="text-xs font-700 sm:col-span-2"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Registered agent
                    <select
                      required
                      value={inquiryDraft.agentUserId}
                      onChange={(event) =>
                        setInquiryDraft((current) => ({
                          ...current,

                          agentUserId: event.target.value,
                        }))
                      }
                      className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                      style={{
                        background: "var(--secondary)",

                        borderColor: "var(--border)",

                        color: "var(--foreground)",
                      }}
                    >
                      <option value="">Select a registered agent</option>
                      {inquiryAgents.map((person) => (
                        <option key={person.user_id} value={person.user_id}>
                          {person.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              <fieldset className="sm:col-span-2">
                <legend
                  className="mb-2 text-xs font-700"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Countries they want to travel to
                </legend>
                <div className="flex gap-2">
                  <input
                    value={countryDraft}
                    onChange={(event) => setCountryDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()

                        addInquiryCountry()
                      }
                    }}
                    placeholder="Type a country"
                    className="min-w-0 flex-1 border px-3 py-2 text-sm"
                    style={{
                      background: "var(--secondary)",

                      borderColor: "var(--border)",

                      color: "var(--foreground)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={addInquiryCountry}
                    className="border px-3 py-2 text-sm font-600"
                    style={{
                      borderColor: "var(--border)",

                      color: "var(--foreground)",
                    }}
                  >
                    Add country
                  </button>
                </div>
                {inquiryDraft.desiredCountries.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {inquiryDraft.desiredCountries.map((country) => (
                      <span
                        key={country}
                        className="inline-flex items-center gap-1 border px-2 py-1 text-xs"
                        style={{
                          borderColor: "var(--border)",

                          color: "var(--foreground)",
                        }}
                      >
                        {country}
                        <button
                          type="button"
                          aria-label={`Remove ${country}`}
                          onClick={() =>
                            setInquiryDraft((current) => ({
                              ...current,

                              desiredCountries: current.desiredCountries.filter(
                                (item) => item !== country,
                              ),
                            }))
                          }
                          className="ml-1"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </fieldset>
              <fieldset>
                <legend
                  className="mb-2 text-xs font-700"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Does the candidate have experience?
                </legend>
                <div className="flex gap-4">
                  {(["yes", "no"] as const).map((answer) => (
                    <label
                      key={answer}
                      className="inline-flex items-center gap-2 text-sm capitalize"
                      style={{ color: "var(--foreground)" }}
                    >
                      <input
                        type="radio"
                        name="inquiry-experience"
                        checked={inquiryDraft.hasExperience === answer}
                        onChange={() =>
                          setInquiryDraft((current) => ({
                            ...current,

                            hasExperience: answer,
                          }))
                        }
                      />
                      {answer}
                    </label>
                  ))}
                </div>
              </fieldset>
              {inquiryDraft.hasExperience === "yes" && (
                <label
                  className="text-xs font-700 sm:col-span-2"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Experience description
                  <textarea
                    required
                    maxLength={2000}
                    rows={3}
                    value={inquiryDraft.experienceDescription}
                    onChange={(event) =>
                      setInquiryDraft((current) => ({
                        ...current,

                        experienceDescription: event.target.value,
                      }))
                    }
                    className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal"
                    style={{
                      background: "var(--secondary)",

                      borderColor: "var(--border)",

                      color: "var(--foreground)",
                    }}
                  />
                </label>
              )}
              <fieldset>
                <legend
                  className="mb-2 text-xs font-700"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Preferred communication
                </legend>
                <div className="flex gap-4">
                  {([
                    ["call", "Call"],

                    ["text", "Text"],

                    ["both", "Both"],
                  ] as const).map(([value, label]) => (
                    <label
                      key={value}
                      className="inline-flex items-center gap-2 text-sm"
                      style={{ color: "var(--foreground)" }}
                    >
                      <input
                        type="radio"
                        name="inquiry-contact-method"
                        checked={inquiryDraft.communicationMethod === value}
                        onChange={() =>
                          setInquiryDraft((current) => ({
                            ...current,

                            communicationMethod: value,
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {!permissions.isAgent && (
                <label
                  className="text-xs font-700"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Handled by
                  <select
                    required
                    value={inquiryDraft.handledByUserId}
                    onChange={(event) =>
                      setInquiryDraft((current) => ({
                        ...current,

                        handledByUserId: event.target.value,
                      }))
                    }
                    className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                    style={{
                      background: "var(--secondary)",

                      borderColor: "var(--border)",

                      color: "var(--foreground)",
                    }}
                  >
                    <option value="">Select team member</option>
                    {inquiryPeople.map((person) => (
                      <option key={person.user_id} value={person.user_id}>
                        {person.display_name} · {person.role_name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label
                className="text-xs font-700 sm:col-span-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                Remarks
                <textarea
                  maxLength={4000}
                  rows={3}
                  value={inquiryDraft.remarks}
                  onChange={(event) =>
                    setInquiryDraft((current) => ({
                      ...current,

                      remarks: event.target.value,
                    }))
                  }
                  className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal"
                  style={{
                    background: "var(--secondary)",

                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                />
              </label>
            </div>
            {inquiryError && (
              <p role="alert" className="mt-4 text-sm text-red-500">
                {inquiryError}
              </p>
            )}
            <footer
              className="mt-5 flex justify-end gap-2 border-t pt-4"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                onClick={closeInquiryForm}
                className="border px-4 py-2 text-sm"
                style={{
                  borderColor: "var(--border)",

                  color: "var(--foreground)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingInquiry || inquiryPeople.length === 0}
                className="px-4 py-2 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",

                  color: "var(--primary-foreground)",
                }}
              >
                {savingInquiry ? "Saving…" : "Save inquiry"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {drawerCandidate && (
        <AttachmentDrawer
          candidate={{
            id: drawerCandidate.id,

            firstName: drawerCandidate.first_name,

            lastName: drawerCandidate.last_name,

            fileNumber: drawerCandidate.file_number,
          }}
          onClose={() => setDrawerCandidate(null)}
        />
      )}
      {showBulkSms && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !bulkSmsSending &&
              !(bulkSmsAlreadySent && bulkSmsCanRetryNotes)
            )
              setShowBulkSms(false)
          }}
        >
          <form
            onSubmit={(event) => void sendBulkSms(event)}
            className="w-full max-w-lg rounded-xl border p-5 shadow-2xl sm:p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2
              className="text-lg font-700"
              style={{ color: "var(--foreground)" }}
            >
              Send SMS to selected candidates
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              This sends immediately to the selected candidates’ registered
              phone numbers. Their assigned Recruitment Agents will also receive
              an in-app notification and a note in Communications.
            </p>
            <div
              className="mt-4 rounded border px-3 py-2 text-xs"
              style={{
                background: "var(--secondary)",

                borderColor: "var(--border)",

                color: "var(--foreground)",
              }}
            >
              {selectedIds.length} candidate
              {selectedIds.length === 1 ? "" : "s"} selected. SMSUG charges the
              company SMS credit per segment. SMSUG delivery is Uganda-only.
              Maximum 3,000 candidates per send.
            </div>
            <label
              className="mt-4 block text-xs font-700"
              style={{ color: "var(--muted-foreground)" }}
            >
              Message
              <textarea
                autoFocus
                required
                maxLength={480}
                rows={6}
                disabled={bulkSmsAlreadySent || bulkSmsSending}
                value={bulkSmsMessage}
                onChange={(event) => setBulkSmsMessage(event.target.value)}
                placeholder="Type the message to send…"
                className="mt-1 w-full resize-y rounded border px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--secondary)",

                  borderColor: "var(--border)",

                  color: "var(--foreground)",
                }}
              />
              <span className="mt-1 flex justify-between font-normal">
                <span>
                  {bulkSmsSegmentInfo.segments} segment
                  {bulkSmsSegmentInfo.segments === 1 ? "" : "s"} per recipient
                  {" · "}
                  {bulkSmsSegmentInfo.encoding}
                  {" · "}
                  {bulkSmsSegmentInfo.remainingCharacters} characters remaining
                </span>
                <span>{bulkSmsMessage.length}/480</span>
              </span>
            </label>
            {bulkSmsSegmentInfo.segments > 1 && (
              <p className="mt-2 text-xs text-amber-600">
                This message consumes multiple billable SMS segments per recipient.
              </p>
            )}
            {bulkSmsEstimatedCharge !== null && bulkSmsCurrency && (
              <p className="mt-2 text-xs" style={{ color: "var(--foreground)" }}>
                Estimated candidate-message charge:{" "}
                {new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: bulkSmsCurrency,
                }).format(bulkSmsEstimatedCharge)}
                . Accountless agent update SMS, if sent, is charged separately.
              </p>
            )}
            {bulkSmsPricingError && (
              <p role="status" className="mt-2 text-xs text-amber-600">
                SMS pricing could not be loaded: {bulkSmsPricingError}
              </p>
            )}
            {bulkSmsError && (
              <p role="alert" className="mt-3 text-sm text-red-500">
                {bulkSmsError}
              </p>
            )}
            <footer className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={
                  bulkSmsSending || (bulkSmsAlreadySent && bulkSmsCanRetryNotes)
                }
                onClick={() => setShowBulkSms(false)}
                className="rounded border px-4 py-2 text-sm disabled:opacity-50"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  bulkSmsSending ||
                  (bulkSmsAlreadySent && !bulkSmsCanRetryNotes) ||
                  selectedIds.length > 3000 ||
                  !bulkSmsMessage.trim() ||
                  bulkSmsMessage.length > 480
                }
                className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",

                  color: "var(--primary-foreground)",
                }}
              >
                <Send size={14} aria-hidden="true" />
                {bulkSmsSending
                  ? "Sending…"
                  : bulkSmsAlreadySent
                    ? bulkSmsCanRetryNotes
                      ? "Retry agent note delivery"
                      : "SMS sent — check Sent Messages"
                    : "Send SMS"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {viewingCandidate && (
        <CandidateReadOnlyDetails
          candidate={viewingCandidate}
          canViewFinance={canViewFinance}
          onClose={() => setViewingCandidate(null)}
        />
      )}

      {stageDocQueue.length > 0 &&
        (() => {
          const current = stageDocQueue[0]

          const remaining = stageDocQueue.length

          const advanceQueue = () => {
            setStageDocUploaded(false)

            setStageDocQueue((q) => q.slice(1))
          }

          return (
            <>
              {/* Mandatory-upload overlay — sits above the drawer backdrop */}
              <div className="fixed inset-0 z-[55] flex flex-col items-end justify-start pointer-events-none">
                <div
                  className="pointer-events-auto mr-[calc(min(100vw,480px)+1px)] mt-4 ml-4 max-w-sm rounded border px-4 py-3 shadow-lg text-sm"
                  style={{
                    background: "var(--card)",

                    borderColor: "var(--primary)",

                    color: "var(--foreground)",
                  }}
                >
                  <p className="font-700" style={{ color: "var(--primary)" }}>
                    Upload required — {remaining} candidate
                    {remaining !== 1 ? "s" : ""} remaining
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Upload the document for{" "}
                    <span
                      className="font-600"
                      style={{ color: "var(--foreground)" }}
                    >
                      {current.first_name} {current.last_name}
                    </span>{" "}
                    using the drawer, then click Done.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={!stageDocUploaded}
                      onClick={advanceQueue}
                      className="rounded px-3 py-1.5 text-xs font-600 disabled:opacity-40"
                      style={{
                        background: "var(--primary)",

                        color: "var(--primary-foreground)",
                      }}
                    >
                      {remaining > 1 ? "Done — next candidate" : "Done — close"}
                    </button>
                    <button
                      type="button"
                      onClick={advanceQueue}
                      className="rounded border px-3 py-1.5 text-xs"
                      style={{
                        borderColor: "var(--border)",

                        color: "var(--muted-foreground)",
                      }}
                    >
                      Skip
                    </button>
                  </div>
                  {!stageDocUploaded && (
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Use "Add attachment" in the drawer to upload, then Done
                      will enable.
                    </p>
                  )}
                </div>
              </div>
              <AttachmentDrawer
                candidate={{
                  id: current.id,

                  firstName: current.first_name,

                  lastName: current.last_name,

                  fileNumber: current.file_number,
                }}
                onClose={advanceQueue}
                onUpload={() => setStageDocUploaded(true)}
              />
            </>
          )
        })()}
      {transitionIds.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-stage-title"
            className="w-full max-w-lg border p-5 shadow-2xl"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="candidate-stage-title"
                  className="text-base font-700"
                  style={{ color: "var(--foreground)" }}
                >
                  {transitionStep === "project"
                    ? "Project Submission"
                    : transitionStep === "details"
                      ? "Additional Stage Details"
                      : transitionStep === "visa"
                        ? "Visa Received"
                        : transitionStep === "ticket"
                          ? "Travel & Ticketing"
                          : "Stage update complete"}
                </h2>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {transitionIds.length} selected
                </p>
              </div>
              <button
                type="button"
                aria-label="Close stage update"
                onClick={() => setTransitionIds([])}
                className="flex h-8 w-8 items-center justify-center rounded"
                style={{ color: "var(--muted-foreground)" }}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </header>
            <div className="mt-4 max-h-40 space-y-2 overflow-auto">
              {transitionIds.map((id) => {
                const candidate = candidates.find((record) => record.id === id)

                if (!candidate) return null

                return (
                  <div
                    key={id}
                    className="border-b pb-2 text-xs"
                    style={{
                      borderColor: "var(--border)",

                      color: "var(--foreground)",
                    }}
                  >
                    {candidate.first_name} {candidate.last_name}
                  </div>
                )
              })}
            </div>
            {transitionStep === "project" && (
              <div className="mt-4">
                <label
                  htmlFor="candidate-project-search"
                  className="block text-xs font-600"
                  style={{ color: "var(--foreground)" }}
                >
                  Search active projects
                </label>
                <input
                  id="candidate-project-search"
                  type="search"
                  value={projectSearch}
                  onChange={(event) => {
                    setProjectSearch(event.target.value)

                    if (event.target.value.trim()) setTransitionProjectId("")
                  }}
                  placeholder="Type project name, country, or code…"
                  className="mt-1 w-full border px-3 py-2 text-sm"
                  style={{
                    background: "var(--secondary)",

                    borderColor:
                      projectSearch && !transitionProjectId
                        ? "var(--primary)"
                        : "var(--border)",

                    color: "var(--foreground)",
                  }}
                  autoComplete="off"
                />
                {transitionProjectId &&
                projects.find((p) => p.id === transitionProjectId) ? (
                  <p className="mt-2 text-xs font-600 text-emerald-600">
                    ✓ Selected:{" "}
                    {
                      projects.find(
                        (project) => project.id === transitionProjectId,
                      )?.project_name
                    }
                  </p>
                ) : projectSearch.trim() ? (
                  <div
                    className="mt-1 max-h-48 overflow-y-auto divide-y border"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {projectMatches.length > 0 ? (
                      projectMatches.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => {
                            setTransitionProjectId(project.id)

                            setProjectSearch(
                              `${project.project_name} · ${project.country}`,
                            )
                          }}
                          className="block min-h-10 w-full px-3 py-2 text-left text-xs transition-colors hover:opacity-80"
                          style={{
                            color: "var(--foreground)",

                            background: "var(--card)",

                            borderColor: "var(--border)",
                          }}
                        >
                          <div className="font-600">{project.project_name}</div>
                          <div
                            style={{ color: "var(--muted-foreground)" }}
                            className="text-xs mt-0.5"
                          >
                            {project.country}
                          </div>
                        </button>
                      ))
                    ) : (
                      <p
                        className="px-3 py-3 text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        No matching projects found
                      </p>
                    )}
                  </div>
                ) : (
                  <p
                    className="mt-2 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Start typing to search {projects.length} active project
                    {projects.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}
            {transitionStep === "details" && (
              <div className="mt-4 space-y-3">
                {([
                  ["offerLetter", "Offer Letter"],

                  ["wakalaReceived", "Wakala Received"],

                  ["molReceived", "MOL Received"],

                  ["enjaz", "Enjaz"],
                ] as const).map(([key, label]) => (
                  <fieldset
                    key={key}
                    className="flex items-center justify-between gap-3 border-b pb-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <legend
                      className="text-sm font-600"
                      style={{ color: "var(--foreground)" }}
                    >
                      {label}
                    </legend>
                    <div className="flex gap-2">
                      {(["Yes", "No"] as const).map((answer) => (
                        <button
                          key={answer}
                          type="button"
                          aria-pressed={stageAnswers[key] === answer}
                          onClick={() =>
                            setStageAnswers((current) => ({
                              ...current,

                              [key]: answer,
                            }))
                          }
                          className="min-w-14 border px-3 py-1.5 text-xs font-600"
                          style={{
                            borderColor:
                              stageAnswers[key] === answer
                                ? "var(--primary)"
                                : "var(--border)",

                            background:
                              stageAnswers[key] === answer
                                ? "var(--primary)"
                                : "var(--card)",

                            color:
                              stageAnswers[key] === answer
                                ? "var(--primary-foreground)"
                                : "var(--foreground)",
                          }}
                        >
                          {answer}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
                <p
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Mark Yes for any stage document the candidate has received.
                  You will be prompted to upload the document after saving.
                </p>
              </div>
            )}

            {/* ── Visa Received step ─────────────────────────────────────── */}
            {transitionStep === "visa" && (
              <div className="mt-4 space-y-4">
                <p
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Select the project the visa was issued under. The candidate
                  will be marked visa-received, an SMS will be sent, and a
                  service charge invoice will be created automatically.
                </p>
                <div>
                  <label
                    htmlFor="visa-project-search"
                    className="block text-xs font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    Project
                  </label>
                  <input
                    id="visa-project-search"
                    type="search"
                    value={projectSearch}
                    onChange={(e) => {
                      setProjectSearch(e.target.value)

                      if (e.target.value.trim()) setTransitionProjectId("")
                    }}
                    placeholder="Type project name, country, or code…"
                    className="mt-1 w-full border px-3 py-2 text-sm"
                    style={{
                      background: "var(--secondary)",

                      borderColor:
                        projectSearch && !transitionProjectId
                          ? "var(--primary)"
                          : "var(--border)",

                      color: "var(--foreground)",
                    }}
                    autoComplete="off"
                  />
                  {transitionProjectId &&
                  projects.find((p) => p.id === transitionProjectId) ? (
                    <p className="mt-2 text-xs font-600 text-emerald-600">
                      ✓ Selected:{" "}
                      {
                        projects.find((p) => p.id === transitionProjectId)
                          ?.project_name
                      }
                    </p>
                  ) : projectSearch.trim() ? (
                    <div
                      className="mt-1 max-h-48 overflow-y-auto divide-y border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {projectMatches.length > 0 ? (
                        projectMatches.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setTransitionProjectId(p.id)

                              setProjectSearch(
                                `${p.project_name} · ${p.country}`,
                              )
                            }}
                            className="block min-h-10 w-full px-3 py-2 text-left text-xs transition-colors hover:opacity-80"
                            style={{
                              color: "var(--foreground)",

                              background: "var(--card)",

                              borderColor: "var(--border)",
                            }}
                          >
                            <div className="font-600">{p.project_name}</div>
                            <div
                              style={{ color: "var(--muted-foreground)" }}
                              className="text-xs mt-0.5"
                            >
                              {p.country}
                            </div>
                          </button>
                        ))
                      ) : (
                        <p
                          className="px-3 py-3 text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          No matching projects found
                        </p>
                      )}
                    </div>
                  ) : (
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Start typing to search {projects.length} active project
                      {projects.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                {visaInvoices.length > 0 && (
                  <div className="space-y-2">
                    <p
                      className="text-xs font-700 uppercase tracking-wide"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Invoices raised
                    </p>
                    {visaInvoices.map((inv) => (
                      <div
                        key={inv.candidateId}
                        className="rounded border px-3 py-2 text-xs"
                        style={{
                          borderColor: "var(--border)",

                          background: "var(--secondary)",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="font-600"
                            style={{ color: "var(--foreground)" }}
                          >
                            {inv.candidateName}
                          </span>
                          <span
                            className="font-700"
                            style={{ color: "var(--primary)" }}
                          >
                            {inv.invoiceNumber}
                          </span>
                        </div>
                        <div
                          className="mt-1 flex gap-4"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          <span>
                            Total: UGX {inv.amount.toLocaleString("en-UG")}
                          </span>
                          {inv.depositPaid > 0 && (
                            <span className="text-emerald-500">
                              Deposit: −UGX{" "}
                              {inv.depositPaid.toLocaleString("en-UG")}
                            </span>
                          )}
                          <span
                            className={
                              inv.balanceDue > 0
                                ? "text-orange-500 font-600"
                                : "text-emerald-500"
                            }
                          >
                            Balance: UGX{" "}
                            {inv.balanceDue.toLocaleString("en-UG")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  After saving you will be prompted to upload the visa copy for
                  each candidate.
                </p>
              </div>
            )}

            {/* ── Ticketing step ──────────────────────────────────────────── */}
            {transitionStep === "ticket" && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className="col-span-2 block text-xs font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    Ticket number <span className="text-red-400">*</span>
                    <input
                      required
                      maxLength={100}
                      value={ticketForm.ticketNumber}
                      onChange={(e) =>
                        setTicketForm((f) => ({
                          ...f,

                          ticketNumber: e.target.value,
                        }))
                      }
                      className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                      style={{
                        background: "var(--secondary)",

                        borderColor: "var(--border)",

                        color: "var(--foreground)",
                      }}
                      placeholder="e.g. EK7834521"
                    />
                  </label>
                  <label
                    className="col-span-2 block text-xs font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    Booking reference <span className="text-red-400">*</span>
                    <input
                      required
                      maxLength={100}
                      value={ticketForm.bookingReference}
                      onChange={(e) =>
                        setTicketForm((f) => ({
                          ...f,

                          bookingReference: e.target.value,
                        }))
                      }
                      className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                      style={{
                        background: "var(--secondary)",

                        borderColor: "var(--border)",

                        color: "var(--foreground)",
                      }}
                      placeholder="e.g. XYZ123"
                    />
                  </label>
                  <label
                    className="block text-xs font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    Date of travel <span className="text-red-400">*</span>
                    <input
                      required
                      type="date"
                      value={ticketForm.travelDate}
                      onChange={(e) =>
                        setTicketForm((f) => ({
                          ...f,

                          travelDate: e.target.value,
                        }))
                      }
                      className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                      style={{
                        background: "var(--secondary)",

                        borderColor: "var(--border)",

                        color: "var(--foreground)",
                      }}
                    />
                  </label>
                  <label
                    className="block text-xs font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    Departure time (24h) <span className="text-red-400">*</span>
                    <input
                      required
                      type="time"
                      value={ticketForm.travelTime}
                      onChange={(e) =>
                        setTicketForm((f) => ({
                          ...f,

                          travelTime: e.target.value,
                        }))
                      }
                      className="mt-1 w-full border px-3 py-2 text-sm font-normal"
                      style={{
                        background: "var(--secondary)",

                        borderColor: "var(--border)",

                        color: "var(--foreground)",
                      }}
                    />
                  </label>
                </div>

                {/* Connecting flights */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className="text-xs font-600"
                      style={{ color: "var(--foreground)" }}
                    >
                      Connecting flights
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setConnectingFlights((f) => [
                          ...f,

                          { from: "", to: "", flightNo: "", depTime: "" },
                        ])
                      }
                      className="text-xs"
                      style={{ color: "var(--primary)" }}
                    >
                      + Add leg
                    </button>
                  </div>
                  {connectingFlights.length === 0 && (
                    <p
                      className="text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Direct flight — no connecting legs.
                    </p>
                  )}
                  {connectingFlights.map((leg, i) => (
                    <div
                      key={i}
                      className="mb-2 grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end"
                    >
                      <label
                        className="text-xs font-600"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        From
                        <input
                          value={leg.from}
                          onChange={(e) =>
                            setConnectingFlights((f) =>
                              f.map((l, j) =>
                                j === i ? { ...l, from: e.target.value } : l,
                              ),
                            )
                          }
                          className="mt-1 w-full border px-2 py-1.5 text-xs"
                          style={{
                            background: "var(--secondary)",

                            borderColor: "var(--border)",

                            color: "var(--foreground)",
                          }}
                          placeholder="KLA"
                        />
                      </label>
                      <label
                        className="text-xs font-600"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        To
                        <input
                          value={leg.to}
                          onChange={(e) =>
                            setConnectingFlights((f) =>
                              f.map((l, j) =>
                                j === i ? { ...l, to: e.target.value } : l,
                              ),
                            )
                          }
                          className="mt-1 w-full border px-2 py-1.5 text-xs"
                          style={{
                            background: "var(--secondary)",

                            borderColor: "var(--border)",

                            color: "var(--foreground)",
                          }}
                          placeholder="DXB"
                        />
                      </label>
                      <label
                        className="text-xs font-600"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Flight no.
                        <input
                          value={leg.flightNo}
                          onChange={(e) =>
                            setConnectingFlights((f) =>
                              f.map((l, j) =>
                                j === i
                                  ? { ...l, flightNo: e.target.value }
                                  : l,
                              ),
                            )
                          }
                          className="mt-1 w-full border px-2 py-1.5 text-xs"
                          style={{
                            background: "var(--secondary)",

                            borderColor: "var(--border)",

                            color: "var(--foreground)",
                          }}
                          placeholder="EK701"
                        />
                      </label>
                      <label
                        className="text-xs font-600"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Dep. time
                        <input
                          type="time"
                          value={leg.depTime}
                          onChange={(e) =>
                            setConnectingFlights((f) =>
                              f.map((l, j) =>
                                j === i ? { ...l, depTime: e.target.value } : l,
                              ),
                            )
                          }
                          className="mt-1 w-full border px-2 py-1.5 text-xs"
                          style={{
                            background: "var(--secondary)",

                            borderColor: "var(--border)",

                            color: "var(--foreground)",
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setConnectingFlights((f) =>
                            f.filter((_, j) => j !== i),
                          )
                        }
                        className="mb-0.5 self-end text-xs"
                        style={{ color: "#ef4444" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <p
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Reminder SMS messages will be scheduled automatically:
                  confirmation now, check-in reminder 24h before, departure
                  reminder 3h before, and a thank-you 5 minutes after departure.
                </p>
              </div>
            )}
            {transitionNotice && (
              <p
                role="status"
                className="mt-4 text-sm font-600 text-emerald-600"
              >
                {transitionNotice}
              </p>
            )}
            {transitionError && (
              <p
                role="alert"
                className="mt-3 whitespace-pre-wrap text-sm text-red-500"
              >
                {transitionError}
              </p>
            )}
            <footer className="mt-5 flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                {canUpdateCandidateStages &&
                  (transitionStep !== "details" ||
                    canSubmitCandidatesToProjects) &&
                  transitionStep !== "project" &&
                  transitionStep !== "complete" && (
                    <button
                      type="button"
                      onClick={() => {
                        // Go to previous stage

                        if (transitionStep === "details")
                          setTransitionStep("project")
                        else if (transitionStep === "visa")
                          setTransitionStep("details")
                        else if (transitionStep === "ticket")
                          setTransitionStep("visa")

                        setTransitionError("")

                        setTransitionNotice("")
                      }}
                      className="border px-3 py-2 text-sm font-600"
                      style={{
                        borderColor: "var(--border)",

                        color: "var(--foreground)",
                      }}
                    >
                      ← Previous Stage
                    </button>
                  )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTransitionIds([])

                    setSelectedIds([])
                  }}
                  className="border px-3 py-2 text-sm"
                  style={{
                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                >
                  {transitionStep === "complete" ? "Close" : "Cancel"}
                </button>
                {transitionStep === "details" && (
                  <button
                    type="button"
                    onClick={() => {
                      // Skip to next stage without requiring document selection

                      // User can upload documents later via the drawer

                      setTransitionStep("visa")

                      setTransitionNotice(
                        "You can upload documents later. Moving to next stage.",
                      )

                      setTransitionError("")
                    }}
                    className="border px-3 py-2 text-sm font-600"
                    style={{
                      borderColor: "var(--primary)",

                      color: "var(--primary)",

                      background: "transparent",
                    }}
                  >
                    Skip & Next Stage →
                  </button>
                )}
                {transitionStep === "complete" && canUpdateCandidateStages && (
                  <button
                    type="button"
                    onClick={() => {
                      const ids = transitionIds.length
                        ? transitionIds
                        : candidates

                            .filter((c) => c.visa_locked)

                            .map((c) => c.id)

                      if (!ids.length) return

                      setTransitionIds(ids)

                      setTransitionStep("ticket")

                      setTransitionNotice("")

                      setTransitionError("")

                      setTicketForm({
                        ticketNumber: "",

                        bookingReference: "",

                        travelDate: "",

                        travelTime: "",
                      })

                      setConnectingFlights([])
                    }}
                    className="border px-3 py-2 text-sm font-600"
                    style={{
                      borderColor: "var(--border)",

                      color: "var(--foreground)",
                    }}
                  >
                    Add ticket details
                  </button>
                )}
                {((transitionStep === "project" &&
                  canSubmitCandidatesToProjects) ||
                  (transitionStep === "details" &&
                    canUpdateCandidateStages &&
                    Object.values(stageAnswers).some((v) => v !== "")) ||
                  ((transitionStep === "visa" || transitionStep === "ticket") &&
                    canUpdateCandidateStages)) && (
                  <button
                    type="button"
                    disabled={
                      transitionSaving ||
                      (transitionStep === "project"
                        ? !transitionProjectId
                        : transitionStep === "details"
                          ? !Object.values(stageAnswers).some(Boolean)
                          : transitionStep === "visa"
                            ? !transitionProjectId
                            : /* ticket */ !ticketForm.ticketNumber ||
                              !ticketForm.bookingReference ||
                              !ticketForm.travelDate ||
                              !ticketForm.travelTime)
                    }
                    onClick={() => void advanceCandidates()}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:opacity-50"
                    style={{
                      background: "var(--primary)",

                      color: "var(--primary-foreground)",
                    }}
                  >
                    <ArrowRight size={15} aria-hidden="true" />
                    {transitionSaving
                      ? "Saving…"
                      : transitionStep === "visa"
                        ? "Record visa received"
                        : transitionStep === "ticket"
                          ? "Save travel details"
                          : "Advance stage"}
                  </button>
                )}
                {transitionStep === "ticket" && (
                  <button
                    type="button"
                    disabled={
                      transitionSaving ||
                      !ticketForm.ticketNumber ||
                      !ticketForm.bookingReference ||
                      !ticketForm.travelDate ||
                      !ticketForm.travelTime
                    }
                    onClick={() => void advanceCandidates()}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:opacity-50"
                    style={{
                      background: "var(--primary)",

                      color: "var(--primary-foreground)",
                    }}
                  >
                    <ArrowRight size={15} aria-hidden="true" />
                    {transitionSaving ? "Saving…" : "Save travel details"}
                  </button>
                )}
              </div>
            </footer>
          </section>
        </div>
      )}
    </section>
  )
}
