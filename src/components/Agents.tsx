import { useEffect, useState, type FormEvent } from "react"
import {
  ArrowLeft,
  Edit2,
  Eye,
  Search,
  Trash2,
  UserRound,
  Users,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react"
import { matchesSearch } from "@/lib/search"

type AgentRecord = {
  id: string
  agentCode: string
  name: string
  username: string
  email: string
  phone: string
  branch: string
  branchId: string | null
  linkedUserId: string | null
  hasAccount: boolean
  status: string
}

type BranchRecord = {
  id: string
  name: string
  code: string
  isMainBranch: boolean
}
type CandidateRecord = {
  id: string
  first_name: string
  last_name: string
  agent_id?: string | null
  agent_name: string
  agent_user_id: string | null
  details: Record<string, unknown> | null
}
type AgentCandidateRecord = {
  id: string
  firstName: string
  lastName: string
  fullName: string
  phone: string
  fileNumber: string
  position: string
  visaStatus: string
  passportNumber: string
  visaReceivedDate: string | null
  createdAt: string
}
type AgentPayload = {
  agents: AgentRecord[]
  branches?: BranchRecord[]
  canManageAgents?: boolean
  canViewCandidates?: boolean
  canResetPasswords?: boolean
  error?: string
}

const fieldStyle = {
  background: "var(--secondary)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
}
const normalized = (value: string) => value.trim().toLocaleLowerCase()

function candidateMetrics(
  agent: AgentRecord,
  candidates: CandidateRecord[],
  agents: AgentRecord[],
) {
  const nameIsUnique =
    agents.filter((entry) => normalized(entry.name) === normalized(agent.name))
      .length === 1
  const assigned = candidates.filter((candidate) =>
    candidate.agent_id
      ? candidate.agent_id === agent.id
      : candidate.agent_user_id
        ? candidate.agent_user_id === agent.linkedUserId
        : nameIsUnique &&
          normalized(candidate.agent_name) === normalized(agent.name),
  )
  const lifecycle = assigned.map((candidate) => candidate.details ?? {})
  const deployed = lifecycle.filter(
    (details) =>
      details.travelStatus === "Travelled" || details.stage === "Travelled",
  ).length
  const withdrawn = lifecycle.filter(
    (details) =>
      details.travelStatus === "Withdrawn" || details.stage === "Withdrawn",
  ).length
  const cancelled = lifecycle.filter(
    (details) =>
      details.visaStatus === "Cancelled" ||
      details.stage === "Cancelled" ||
      details.stage === "Canceled",
  ).length
  const stages = [
    "Registration",
    "Visa Processing",
    "Final Round",
    "Travelled",
    "Withdrawn",
  ].map((stage) => ({
    name: stage,
    count: lifecycle.filter(
      (details) =>
        details.stage === stage ||
        (stage === "Travelled" && details.travelStatus === stage) ||
        (stage === "Withdrawn" && details.travelStatus === stage),
    ).length,
  }))
  return { assigned, deployed, withdrawn, cancelled, stages }
}

export default function Agents() {
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [branches, setBranches] = useState<BranchRecord[]>([])
  const [candidates, setCandidates] = useState<CandidateRecord[]>([])
  const [agentCandidates, setAgentCandidates] =
    useState<AgentCandidateRecord[]>([])
  const [search, setSearch] = useState("")
  const [editingAgent, setEditingAgent] = useState<AgentRecord | null>(null)
  const [creatingAgent, setCreatingAgent] = useState(false)
  const [linkingAgent, setLinkingAgent] = useState<AgentRecord | null>(null)
  const [resettingAgent, setResettingAgent] = useState<AgentRecord | null>(null)
  const [canManageAgents, setCanManageAgents] = useState(false)
  const [canViewCandidates, setCanViewCandidates] = useState(false)
  const [canResetPasswords, setCanResetPasswords] = useState(false)
  const [createLogin, setCreateLogin] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [agentCandidatesLoading, setAgentCandidatesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const agentsResponse = await fetch("/api/workspace/agents", {
          cache: "no-store",
        })
        const agentsPayload = (await agentsResponse.json()) as AgentPayload
        if (!agentsResponse.ok)
          throw new Error(
            agentsPayload.error ?? "Unable to load company agents.",
          )
        let candidateRows: CandidateRecord[] = []
        if (agentsPayload.canViewCandidates) {
          const candidatesResponse = await fetch("/api/candidates", {
            cache: "no-store",
          })
          const candidatesPayload = (await candidatesResponse.json()) as {
            candidates?: CandidateRecord[]
            error?: string
          }
          if (!candidatesResponse.ok)
            throw new Error(
              candidatesPayload.error ??
                "Unable to load candidate assignments.",
            )
          candidateRows = candidatesPayload.candidates ?? []
        }
        if (cancelled) return
        setAgents(agentsPayload.agents ?? [])
        setBranches(agentsPayload.branches ?? [])
        setCanManageAgents(agentsPayload.canManageAgents === true)
        setCanViewCandidates(agentsPayload.canViewCandidates === true)
        setCanResetPasswords(agentsPayload.canResetPasswords === true)
        setCandidates(candidateRows)
      } catch (loadError) {
        if (!cancelled)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load company agents.",
          )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Load agent candidates when agent is selected
  useEffect(() => {
    if (!selectedAgentId) {
      setAgentCandidates([])
      return
    }
    let cancelled = false
    const load = async () => {
      setAgentCandidatesLoading(true)
      try {
        const response = await fetch(
          `/api/agents/${encodeURIComponent(selectedAgentId)}/candidates`,
          { cache: "no-store" },
        )
        const payload = (await response.json()) as {
          candidates?: AgentCandidateRecord[]
          error?: string
        }
        if (!response.ok)
          throw new Error(payload.error ?? "Unable to load agent candidates.")
        if (!cancelled) setAgentCandidates(payload.candidates ?? [])
      } catch (loadError) {
        if (!cancelled)
          console.error("Agent candidates load failed:", loadError)
      } finally {
        if (!cancelled) setAgentCandidatesLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedAgentId])

  const activeCount = agents.filter((agent) => agent.status === "active").length
  const inactiveCount = agents.filter(
    (agent) => agent.status === "disabled",
  ).length
  const filtered = agents.filter((agent) =>
    matchesSearch(
      search,
      agent.agentCode,
      agent.name,
      agent.username,
      agent.phone,
      agent.email,
      agent.branch,
    ),
  )
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId)
  const selectedMetrics = selectedAgent
    ? candidateMetrics(selectedAgent, candidates, agents)
    : null

  const saveAgentDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingAgent) return
    const formData = new FormData(event.currentTarget)
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/workspace/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          agentId: editingAgent.id,
          name: String(formData.get("name") ?? "").trim(),
          username: String(formData.get("username") ?? "").trim(),
          phone: String(formData.get("phone") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim(),
          branchId: String(formData.get("branchId") ?? ""),
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to update agent details.")
      setEditingAgent(null)
      setReloadKey((key) => key + 1)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update agent details.",
      )
    } finally {
      setSaving(false)
    }
  }

  const createAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/workspace/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: String(formData.get("name") ?? "").trim(),
          username: String(formData.get("username") ?? "").trim(),
          phone: String(formData.get("phone") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim(),
          branchId: String(formData.get("branchId") ?? ""),
          createLogin,
          password: String(formData.get("password") ?? ""),
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to add this agent.")
      setCreatingAgent(false)
      setCreateLogin(false)
      setStatusMessage(
        createLogin
          ? "Agent login created. Share the username and initial password with the agent; they must change the password at first sign-in."
          : "",
      )
      setReloadKey((key) => key + 1)
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to add this agent.",
      )
    } finally {
      setSaving(false)
    }
  }

  const linkAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!linkingAgent) return
    const formData = new FormData(event.currentTarget)
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/workspace/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link-account",
          agentId: linkingAgent.id,
          email: String(formData.get("email") ?? "").trim(),
          password: String(formData.get("password") ?? ""),
        }),
      })
      const payload = (await response.json()) as {
        error?: string
      }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to link this agent.")
      setLinkingAgent(null)
      setStatusMessage(
        "Agent login created. Share the username and initial password with the agent; they must change the password at first sign-in.",
      )
      setReloadKey((key) => key + 1)
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "Unable to link this agent.",
      )
    } finally {
      setSaving(false)
    }
  }

  const setAgentStatus = async (agent: AgentRecord) => {
    setError("")
    try {
      const response = await fetch("/api/workspace/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          agentId: agent.id,
          status: agent.status === "active" ? "disabled" : "active",
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to change agent status.")
      setReloadKey((key) => key + 1)
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to change agent status.",
      )
    }
  }

  const resetAgentPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!resettingAgent) return
    const formData = new FormData(event.currentTarget)
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/workspace/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-password",
          agentId: resettingAgent.id,
          password: String(formData.get("password") ?? ""),
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to reset agent password.")
      setResettingAgent(null)
      setError("Password reset. The agent must change it at the next sign-in.")
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Unable to reset agent password.",
      )
    } finally {
      setSaving(false)
    }
  }

  const deleteAgent = async (agent: AgentRecord) => {
    if (!window.confirm(`Delete agent "${agent.name}"?`)) return
    setError("")
    try {
      const response = await fetch("/api/workspace/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", agentId: agent.id }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to delete agent.")
      setAgents((current) => current.filter((item) => item.id !== agent.id))
      if (selectedAgentId === agent.id) setSelectedAgentId(null)
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete agent.",
      )
    }
  }

  if (selectedAgent && selectedMetrics) {
    const maxStageCount = Math.max(
      1,
      ...selectedMetrics.stages.map((stage) => stage.count),
    )
    return (
      <section
        className="flex h-full min-h-0 flex-col overflow-auto"
        aria-labelledby="agent-detail-title"
      >
        <header
          className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedAgentId(null)}
              aria-label="Back to agents"
              title="Back to agents"
              className="flex h-9 w-9 items-center justify-center border"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
            <div>
              <p
                className="text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Agent profile
              </p>
              <h1
                id="agent-detail-title"
                className="text-xl font-700"
                style={{ color: "var(--foreground)" }}
              >
                {selectedAgent.name}
              </h1>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                Code {selectedAgent.agentCode} · @{selectedAgent.username} ·{" "}
                {selectedAgent.hasAccount
                  ? "Linked account"
                  : "No login account"}
              </p>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-600"
            style={{
              color:
                selectedAgent.status === "active"
                  ? "#10b981"
                  : selectedAgent.status === "disabled"
                    ? "#ef4444"
                    : "#f59e0b",
            }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background:
                  selectedAgent.status === "active"
                    ? "#10b981"
                    : selectedAgent.status === "disabled"
                      ? "#ef4444"
                      : "#f59e0b",
              }}
            />
            {selectedAgent.status === "active"
              ? "Active"
              : selectedAgent.status === "disabled"
                ? "Inactive"
                : "Invitation pending"}
          </span>
        </header>

        <div className="space-y-6 p-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
            <section
              className="border p-5"
              style={{
                borderColor: "var(--border)",
                background: "var(--card)",
              }}
            >
              <h2
                className="text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Personal information
              </h2>
              <dl
                className="mt-4 divide-y"
                style={{ borderColor: "var(--border)" }}
              >
                {[
                  ["Full name", selectedAgent.name],
                  ["Agent code", selectedAgent.agentCode],
                  ["Username", selectedAgent.username],
                  [
                    "Account",
                    selectedAgent.hasAccount ? "Linked" : "No login account",
                  ],
                  ["Phone number", selectedAgent.phone || "Not provided"],
                  ["Email address", selectedAgent.email || "Not provided"],
                  ["Registered branch", selectedAgent.branch || "Not provided"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <dt
                      className="text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {label}
                    </dt>
                    <dd
                      className="break-all text-right text-sm font-600"
                      style={{ color: "var(--foreground)" }}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <section aria-labelledby="productivity-title">
              <h2
                id="productivity-title"
                className="mb-3 text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Agent productivity
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  {
                    label: "Total candidates",
                    value: selectedMetrics.assigned.length,
                    color: "var(--primary)",
                  },
                  {
                    label: "Deployed",
                    value: selectedMetrics.deployed,
                    color: "#10b981",
                  },
                  {
                    label: "Withdrawn",
                    value: selectedMetrics.withdrawn,
                    color: "#ef4444",
                  },
                  {
                    label: "Cancelled",
                    value: selectedMetrics.cancelled,
                    color: "#f59e0b",
                  },
                  {
                    label: "Collected income",
                    value: "Not tracked",
                    color: "var(--muted-foreground)",
                  },
                  {
                    label: "Unpaid / lost invoices",
                    value: "Not tracked",
                    color: "var(--muted-foreground)",
                  },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="min-h-24 border p-4"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--card)",
                    }}
                  >
                    <div
                      className="text-xl font-700"
                      style={{ color: metric.color }}
                    >
                      {metric.value}
                    </div>
                    <div
                      className="mt-2 text-xs font-600"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
              <p
                className="mt-3 text-xs leading-5"
                style={{ color: "var(--muted-foreground)" }}
              >
                Income and invoice totals will appear when candidate
                service-charge payments and invoices are stored in the finance
                records.
              </p>
            </section>
          </div>

          <section
            className="border"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div
              className="border-b px-5 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <h2
                className="text-sm font-700"
                style={{ color: "var(--foreground)" }}
              >
                Candidate pipeline
              </h2>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                Assigned candidate counts by current stage
              </p>
            </div>
            <div className="grid gap-x-10 gap-y-5 p-5 sm:grid-cols-2">
              {selectedMetrics.stages.map((stage) => (
                <div key={stage.name}>
                  <div className="mb-2 flex justify-between text-xs">
                    <span style={{ color: "var(--foreground)" }}>
                      {stage.name}
                    </span>
                    <span
                      className="mono font-700"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {stage.count}
                    </span>
                  </div>
                  <div
                    className="h-2"
                    style={{ background: "var(--secondary)" }}
                  >
                    <div
                      className="h-2"
                      style={{
                        width: `${(stage.count / maxStageCount) * 100}%`,
                        background:
                          stage.name === "Travelled"
                            ? "#10b981"
                            : stage.name === "Withdrawn"
                              ? "#ef4444"
                              : "var(--primary)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div
              className="border-t px-5 py-3 text-xs"
              style={{
                borderColor: "var(--border)",
                color: "var(--muted-foreground)",
              }}
            >
              {selectedMetrics.assigned.length} candidates linked to this agent.
              Older records without an agent ID are matched by name only when
              that name is unique.
            </div>
          </section>

          <section
            className="border"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div
              className="border-b px-5 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <h2
                className="text-sm font-700"
                style={{ color: "var(--foreground)" }}
              >
                Assigned candidates
              </h2>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                Detailed list of all candidates assigned to this agent with visa
                status
              </p>
            </div>
            {agentCandidatesLoading && (
              <div
                className="px-5 py-8 text-center text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                Loading candidates…
              </div>
            )}
            {!agentCandidatesLoading && agentCandidates.length === 0 && (
              <div
                className="px-5 py-8 text-center text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                No candidates assigned to this agent.
              </div>
            )}
            {!agentCandidatesLoading && agentCandidates.length > 0 && (
              <div className="overflow-x-auto">
                <div className="app-table-scroll">
                  <table className="w-full min-w-600 text-sm">
                    <thead>
                      <tr
                        className="border-b"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {[
                          "Candidate Name",
                          "File Number",
                          "Phone",
                          "Position",
                          "Passport Number",
                          "Visa Status",
                          "Visa Received Date",
                        ].map((heading) => (
                          <th
                            key={heading}
                            className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide text-left"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agentCandidates.map((candidate) => (
                        <tr
                          key={candidate.id}
                          className="border-b last:border-0"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <td
                            className="px-4 py-3 font-600"
                            style={{ color: "var(--foreground)" }}
                          >
                            {candidate.fullName}
                          </td>
                          <td
                            className="whitespace-nowrap px-4 py-3 text-xs"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {candidate.fileNumber}
                          </td>
                          <td
                            className="whitespace-nowrap px-4 py-3 text-xs"
                            style={{ color: "var(--foreground)" }}
                          >
                            {candidate.phone || "—"}
                          </td>
                          <td
                            className="px-4 py-3 text-xs"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {candidate.position || "—"}
                          </td>
                          <td
                            className="whitespace-nowrap px-4 py-3 font-700 mono"
                            style={{ color: "var(--primary)" }}
                          >
                            {candidate.passportNumber || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span
                              className="whitespace-nowrap px-2 py-1 rounded text-xs font-600"
                              style={{
                                color:
                                  candidate.visaStatus === "Received"
                                    ? "#10b981"
                                    : candidate.visaStatus === "Rejected"
                                      ? "#ef4444"
                                      : "#f59e0b",
                                background:
                                  candidate.visaStatus === "Received"
                                    ? "#10b98120"
                                    : candidate.visaStatus === "Rejected"
                                      ? "#ef444420"
                                      : "#f59e0b20",
                              }}
                            >
                              {candidate.visaStatus || "—"}
                            </span>
                          </td>
                          <td
                            className="whitespace-nowrap px-4 py-3 text-xs"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {candidate.visaReceivedDate
                              ? new Date(
                                  candidate.visaReceivedDate,
                                ).toLocaleDateString()
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    )
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-labelledby="agents-title"
    >
      <header
        className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <h1
            id="agents-title"
            className="text-xl font-700"
            style={{ color: "var(--foreground)" }}
          >
            Agents
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            {loading
              ? "Loading company agents"
              : `${agents.length} agents in this company`}
          </p>
        </div>
        {canManageAgents && (
          <button
            type="button"
            onClick={() => {
              setError("")
              setCreatingAgent(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-600"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <UserPlus size={16} aria-hidden="true" />
            Add agent
          </button>
        )}
      </header>

      <div
        className="grid grid-cols-1 border-b sm:grid-cols-3"
        style={{ borderColor: "var(--border)" }}
      >
        {[
          {
            label: "Total agents",
            value: agents.length,
            icon: Users,
            color: "var(--primary)",
          },
          {
            label: "Active",
            value: activeCount,
            icon: UserCheck,
            color: "#10b981",
          },
          {
            label: "Inactive",
            value: inactiveCount,
            icon: UserX,
            color: "#ef4444",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="flex items-center gap-3 border-b px-6 py-4 last:border-0 sm:border-b-0 sm:border-r"
            style={{ borderColor: "var(--border)" }}
          >
            <Icon size={17} aria-hidden="true" style={{ color }} />
            <div>
              <div
                className="mono text-xl font-700"
                style={{ color: "var(--foreground)" }}
              >
                {value}
              </div>
              <div
                className="text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <label
          className="flex w-full max-w-md items-center gap-2 border px-3"
          style={{
            background: "var(--secondary)",
            borderColor: "var(--border)",
          }}
        >
          <Search
            size={15}
            aria-hidden="true"
            style={{ color: "var(--muted-foreground)" }}
          />
          <input
            aria-label="Search agents"
            placeholder="Search code, name, username, phone, email, or branch"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
            style={{ color: "var(--foreground)" }}
          />
        </label>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {filtered.length} shown
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </div>
      )}
      {statusMessage && (
        <div
          role="status"
          className="mx-6 mt-4 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
        >
          {statusMessage}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div
          className="overflow-x-auto border"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <div className="app-table-scroll">
            <table className="w-full min-w-225 text-sm">
              <thead>
                <tr
                  className="border-b text-left"
                  style={{ borderColor: "var(--border)" }}
                >
                  {[
                    "Actions",
                    "Agent",
                    "Agent code",
                    "Phone",
                    "Email address",
                    "Registered branch",
                    "Candidates",
                    "Status",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide"
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
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Loading agent records…
                    </td>
                  </tr>
                )}
                {!loading && !error && filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {agents.length
                        ? "No agents match this search."
                        : "No Recruitment Agents found for this company."}
                    </td>
                  </tr>
                )}
                {!loading &&
                  filtered.map((agent) => {
                    const metrics = candidateMetrics(agent, candidates, agents)
                    const isActive = agent.status === "active"
                    return (
                      <tr
                        key={agent.id}
                        className="border-b last:border-0"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td className="px-4 py-3">
                          <div className="inline-flex gap-2">
                            {canManageAgents && (
                              <button
                                type="button"
                                onClick={() => {
                                  setError("")
                                  setEditingAgent(agent)
                                }}
                                className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600"
                                style={{
                                  borderColor: "var(--border)",
                                  color: "var(--foreground)",
                                }}
                              >
                                <Edit2 size={14} aria-hidden="true" />
                                Edit
                              </button>
                            )}
                            {canManageAgents && !agent.hasAccount && (
                              <button
                                type="button"
                                onClick={() => {
                                  setError("")
                                  setLinkingAgent(agent)
                                }}
                                className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600"
                                style={{
                                  borderColor: "var(--border)",
                                  color: "var(--foreground)",
                                }}
                              >
                                <UserPlus size={14} aria-hidden="true" />
                                Set up login
                              </button>
                            )}
                            {canResetPasswords && agent.hasAccount && (
                              <button
                                type="button"
                                onClick={() => {
                                  setError("")
                                  setResettingAgent(agent)
                                }}
                                className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600"
                                style={{
                                  borderColor: "var(--border)",
                                  color: "var(--foreground)",
                                }}
                              >
                                Reset password
                              </button>
                            )}
                            {canManageAgents && (
                              <button
                                type="button"
                                onClick={() => void setAgentStatus(agent)}
                                className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600"
                                style={{
                                  borderColor: "var(--border)",
                                  color: isActive ? "#ef4444" : "#10b981",
                                }}
                              >
                                {isActive ? "Deactivate" : "Activate"}
                              </button>
                            )}
                            {canViewCandidates && (
                              <button
                                type="button"
                                onClick={() => setSelectedAgentId(agent.id)}
                                className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600"
                                style={{
                                  borderColor: "var(--border)",
                                  color: "var(--foreground)",
                                }}
                              >
                                <Eye size={14} aria-hidden="true" />
                                View
                              </button>
                            )}
                            {canManageAgents && (
                              <button
                                type="button"
                                onClick={() => void deleteAgent(agent)}
                                className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600"
                                style={{
                                  borderColor: "var(--border)",
                                  color: "#ef4444",
                                }}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-700"
                              style={{
                                background:
                                  "color-mix(in srgb, var(--primary) 14%, transparent)",
                                color: "var(--primary)",
                              }}
                            >
                              {agent.name
                                .split(/\s+/)
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0]?.toUpperCase())
                                .join("") || (
                                <UserRound size={15} aria-hidden="true" />
                              )}
                            </span>
                            <span
                              className="font-600"
                              style={{ color: "var(--foreground)" }}
                            >
                              <span className="block">{agent.name}</span>
                              <span
                                className="mt-0.5 block text-xs font-normal"
                                style={{ color: "var(--muted-foreground)" }}
                              >
                                @{agent.username} ·{" "}
                                {agent.hasAccount ? "Login linked" : "No login"}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-700 tracking-wide">
                          {agent.agentCode}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3 text-xs"
                          style={{ color: "var(--foreground)" }}
                        >
                          {agent.phone || "—"}
                        </td>
                        <td
                          className="px-4 py-3 text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {agent.email || "—"}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3 text-xs"
                          style={{ color: "var(--foreground)" }}
                        >
                          {agent.branch || "—"}
                        </td>
                        <td
                          className="px-4 py-3 mono font-700"
                          style={{ color: "var(--primary)" }}
                        >
                          {canViewCandidates ? metrics.assigned.length : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="whitespace-nowrap px-2 py-1 text-xs font-600"
                            style={{
                              color: isActive
                                ? "#10b981"
                                : agent.status === "disabled"
                                  ? "#ef4444"
                                  : "#f59e0b",
                              background: isActive
                                ? "#10b98120"
                                : agent.status === "disabled"
                                  ? "#ef444420"
                                  : "#f59e0b20",
                            }}
                          >
                            {isActive
                              ? "Active"
                              : agent.status === "disabled"
                                ? "Inactive"
                                : "Invited"}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={saveAgentDetails}
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2
              className="mb-5 text-lg font-700"
              style={{ color: "var(--foreground)" }}
            >
              Edit agent details
            </h2>
            <div className="space-y-4">
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Full name
                <input
                  required
                  maxLength={200}
                  name="name"
                  defaultValue={editingAgent.name}
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Username
                <input
                  required
                  minLength={3}
                  maxLength={80}
                  name="username"
                  defaultValue={editingAgent.username}
                  pattern="[A-Za-z0-9._-]{3,80}"
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Phone number
                <input
                  required
                  maxLength={30}
                  name="phone"
                  type="tel"
                  defaultValue={editingAgent.phone}
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Email address
                <input
                  maxLength={200}
                  name="email"
                  type="email"
                  defaultValue={editingAgent.email}
                  disabled={editingAgent.hasAccount}
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Registered branch
                <select
                  required
                  name="branchId"
                  defaultValue={editingAgent.branchId ?? ""}
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                >
                  <option value="">Select a branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p
              className="mt-4 text-xs leading-5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Accountless agents have no login until you link an email and set
              an initial password. Linked account email changes are managed from
              Users & Roles.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={saving || !branches.length}
                className="flex-1 py-2 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                {saving ? "Saving changes…" : "Save changes"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingAgent(null)}
                className="flex-1 border py-2 text-sm disabled:opacity-50"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {creatingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={createAgent}
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2
              className="mb-2 text-lg font-700"
              style={{ color: "var(--foreground)" }}
            >
              Add Recruitment Agent
            </h2>
            <p
              className="mb-5 text-xs leading-5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Create an accountless roster entry or set up username/password
              sign-in now. No invitation email is sent.
            </p>
            <div className="space-y-4">
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Full name
                <input
                  required
                  maxLength={200}
                  name="name"
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Username
                <input
                  required
                  minLength={3}
                  maxLength={80}
                  name="username"
                  pattern="[A-Za-z0-9._-]{3,80}"
                  autoComplete="off"
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Phone number for agent messages
                <input
                  required
                  maxLength={30}
                  name="phone"
                  type="tel"
                  placeholder="07XXXXXXXX or 2567XXXXXXXX"
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Email address{" "}
                {createLogin ? "(required for account setup)" : "(optional)"}
                <input
                  required={createLogin}
                  maxLength={200}
                  name="email"
                  type="email"
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="flex items-start gap-2 text-xs"
                style={{ color: "var(--foreground)" }}
              >
                <input
                  type="checkbox"
                  checked={createLogin}
                  onChange={(event) => setCreateLogin(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-700">Create login now</span>
                  <span
                    className="mt-1 block leading-5"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    The agent signs in with the username and password below. The
                    email is used for the account only; no invite is sent.
                  </span>
                </span>
              </label>
              {createLogin && (
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Default password
                  <input
                    required
                    minLength={8}
                    maxLength={72}
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                    style={fieldStyle}
                  />
                  <span className="mt-1 block font-normal normal-case tracking-normal">
                    Minimum 8 characters. The agent must change it at first
                    sign-in.
                  </span>
                </label>
              )}
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Registered branch
                <select
                  required
                  name="branchId"
                  defaultValue=""
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                >
                  <option value="">Select a branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={saving || !branches.length}
                className="flex-1 py-2 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                {saving ? "Adding agent…" : "Add agent"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setCreatingAgent(false)}
                className="flex-1 border py-2 text-sm disabled:opacity-50"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {linkingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={linkAgent}
            className="w-full max-w-md border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2
              className="mb-2 text-lg font-700"
              style={{ color: "var(--foreground)" }}
            >
              Link {linkingAgent.name}
            </h2>
            <p
              className="mb-5 text-xs leading-5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Set the agent’s login email and initial password. No invitation
              email is sent; share these credentials directly. They sign in with
              username <strong>{linkingAgent.username}</strong> and must change
              the password at first sign-in.
            </p>
            <label
              className="block text-xs font-700 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Login email
              <input
                required
                maxLength={200}
                name="email"
                type="email"
                defaultValue={linkingAgent.email}
                className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                style={fieldStyle}
              />
            </label>
            <label
              className="mt-4 block text-xs font-700 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Default password
              <input
                required
                minLength={8}
                maxLength={72}
                name="password"
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                style={fieldStyle}
              />
            </label>
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                {saving ? "Creating login…" : "Create login"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setLinkingAgent(null)}
                className="flex-1 border py-2 text-sm disabled:opacity-50"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {resettingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={resetAgentPassword}
            className="w-full max-w-md border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2
              className="mb-2 text-lg font-700"
              style={{ color: "var(--foreground)" }}
            >
              Reset {resettingAgent.name}’s password
            </h2>
            <p
              className="mb-5 text-xs leading-5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Only the Chairman can reset agent passwords. The agent will be
              required to change this temporary password after signing in.
            </p>
            <label
              className="block text-xs font-700 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Temporary password
              <input
                required
                minLength={8}
                maxLength={72}
                name="password"
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                style={fieldStyle}
              />
            </label>
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                {saving ? "Resetting…" : "Reset password"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setResettingAgent(null)}
                className="flex-1 border py-2 text-sm disabled:opacity-50"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
