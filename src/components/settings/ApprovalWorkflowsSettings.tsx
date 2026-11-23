"use client"

import { useEffect, useState } from "react"

import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react"

type WorkflowKey = "expense_request" | "linked_requisition" | "standalone_requisition" | "leave"

type ActionType = "approval" | "line_manager_review" | "initiate_requisition" | "verify" | "authorize" | "cashout"

type WorkflowStage = {
  stageKey: string

  label: string

  actionType: ActionType

  permissionCode: string

  roleIds: string[]

  instructions: string
}

type Workflow = {
  id: string

  workflow_key: WorkflowKey

  name: string

  stages: WorkflowStage[]
}

type CompanyRole = {
  id: string

  name: string

  permissionCodes: string[]
}

const workflowOrder: WorkflowKey[] = [
  "expense_request",

  "linked_requisition",

  "standalone_requisition",

  "leave",
]

const workflowLabels: Record<WorkflowKey, string> = {
  expense_request: "Expense Request (before requisition initiation)",

  linked_requisition: "Requisition created from an Expense Request",

  standalone_requisition: "Standalone Requisition",

  leave: "Leave Application",
}

const actionLabels: Record<ActionType, string> = {
  approval: "Review and approve or reject",

  line_manager_review: "Line-manager review",

  initiate_requisition: "Initiate linked requisition",

  verify: "Verify",

  authorize: "Authorize",

  cashout: "Record cash-out",
}

const actionOptions: Record<WorkflowKey, ActionType[]> = {
  expense_request: [
    "approval",

    "line_manager_review",

    "initiate_requisition",

    "verify",

    "authorize",
  ],

  linked_requisition: ["approval", "verify", "authorize", "cashout"],

  standalone_requisition: ["approval", "verify", "authorize"],

  leave: ["approval"],
}

const defaultPermission: Record<WorkflowKey, string> = {
  expense_request: "expense_requests.review",

  linked_requisition: "expense_requests.review",

  standalone_requisition: "requisitions.review",

  leave: "leave.manage",
}

const fieldStyle = {
  background: "var(--secondary)",

  borderColor: "var(--border)",

  color: "var(--foreground)",
}

function createStage(workflowKey: WorkflowKey): WorkflowStage {
  return {
    stageKey: crypto.randomUUID(),

    label: "New approval stage",

    actionType: "approval",

    permissionCode: defaultPermission[workflowKey],

    roleIds: [],

    instructions: "",
  }
}

export default function ApprovalWorkflowsSettings() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])

  const [roles, setRoles] = useState<CompanyRole[]>([])

  const [selectedKey, setSelectedKey] = useState<WorkflowKey>("expense_request")

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")

  const [notice, setNotice] = useState("")

  const selectedWorkflow = workflows.find(
    (workflow) => workflow.workflow_key === selectedKey,
  )

  const load = async () => {
    setLoading(true)

    setError("")

    try {
      const response = await fetch("/api/settings/approval-workflows", {
        cache: "no-store",
      })

      const payload = (await response.json()) as {
        workflows?: Workflow[]

        roles?: CompanyRole[]

        error?: string
      }

      if (!response.ok)
        throw new Error(payload.error ?? "Unable to load approval workflows.")

      setWorkflows(
        (payload.workflows ?? []).sort(
          (left, right) =>
            workflowOrder.indexOf(left.workflow_key) -
            workflowOrder.indexOf(right.workflow_key),
        ),
      )

      setRoles(payload.roles ?? [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load approval workflows.",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const updateWorkflow = (update: (workflow: Workflow) => Workflow) => {
    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.workflow_key === selectedKey ? update(workflow) : workflow,
      ),
    )
  }

  const updateStage = (
    stageKey: string,

    update: (stage: WorkflowStage) => WorkflowStage,
  ) => {
    updateWorkflow((workflow) => ({
      ...workflow,

      stages: workflow.stages.map((stage) =>
        stage.stageKey === stageKey ? update(stage) : stage,
      ),
    }))
  }

  const moveStage = (index: number, direction: -1 | 1) => {
    updateWorkflow((workflow) => {
      const nextIndex = index + direction

      if (nextIndex < 0 || nextIndex >= workflow.stages.length) return workflow
      if (workflow.stages[index].actionType === "cashout") return workflow
      if (
        direction === 1 &&
        workflow.stages[nextIndex].actionType === "cashout"
      )
        return workflow

      const stages = [...workflow.stages]
      ;[stages[index], stages[nextIndex]] = [stages[nextIndex], stages[index]]

      return { ...workflow, stages }
    })
  }

  const save = async () => {
    if (!selectedWorkflow) return

    setSaving(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/settings/approval-workflows", {
        method: "PUT",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          workflowKey: selectedWorkflow.workflow_key,

          name: selectedWorkflow.name,

          stages: selectedWorkflow.stages,
        }),
      })

      const payload = (await response.json()) as {
        error?: string

        updatedPendingRuns?: number
      }

      if (!response.ok)
        throw new Error(payload.error ?? "Unable to save workflow.")

      setNotice(
        `Workflow saved. ${payload.updatedPendingRuns ?? 0} pending request(s) were updated.`,
      )

      await load()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save workflow.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <header>
        <h2 className="text-xl font-700" style={{ color: "var(--foreground)" }}>
          Approval Workflows
        </h2>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Choose who handles each step, what action is required, and the
          instructions they see. Saving changes updates pending requests while
          retaining completed approvals. Expense requesters enter unit rates;
          line totals and request totals are calculated automatically. Removing
          initiation leaves the request uninitiated, and removing cash-out
          leaves an authorized request unpaid.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500"
        >
          {notice}
        </p>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Loading approval workflows…
        </p>
      ) : selectedWorkflow ? (
        <>
          <div className="flex flex-wrap gap-2 border-b pb-3">
            {workflowOrder.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className="rounded border px-3 py-2 text-sm font-600"
                style={{
                  borderColor:
                    selectedKey === key ? "var(--primary)" : "var(--border)",

                  color:
                    selectedKey === key
                      ? "var(--primary)"
                      : "var(--muted-foreground)",
                }}
              >
                {workflowLabels[key]}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <label className="block max-w-xl">
              <span className="mb-1 block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                Workflow name
              </span>
              <input
                value={selectedWorkflow.name}
                onChange={(event) => {
                  const name = event.target.value

                  updateWorkflow((workflow) => ({
                    ...workflow,

                    name,
                  }))
                }}
                maxLength={120}
                className="w-full rounded border px-3 py-2.5"
                style={fieldStyle}
              />
            </label>

            {selectedWorkflow.stages.map((stage, index) => {
              const stagePermissions =
                stage.actionType === "approval" && selectedKey === "leave"
                  ? ["leave.manage", "leave.finalize"]
                  : stage.actionType === "approval"
                    ? [defaultPermission[selectedKey]]
                    : [stage.permissionCode]

              const stageRoles = roles.filter((role) =>
                role.permissionCodes.some((code) =>
                  stagePermissions.includes(code),
                ),
              )

              return (
                <article
                  key={stage.stageKey}
                  className="rounded border p-4"
                  style={{
                    background: "var(--card)",

                    borderColor: "var(--border)",
                  }}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3
                      className="text-sm font-700"
                      style={{ color: "var(--foreground)" }}
                    >
                      Step {index + 1}
                    </h3>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Move step ${index + 1} up`}
                        disabled={index === 0 || stage.actionType === "cashout"}
                        onClick={() => moveStage(index, -1)}
                        className="rounded border p-2 disabled:opacity-40"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <ArrowUp size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move step ${index + 1} down`}
                        disabled={
                          index === selectedWorkflow.stages.length - 1 ||
                          stage.actionType === "cashout" ||
                          selectedWorkflow.stages[index + 1]?.actionType ===
                            "cashout"
                        }
                        onClick={() => moveStage(index, 1)}
                        className="rounded border p-2 disabled:opacity-40"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <ArrowDown size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove step ${index + 1}`}
                        onClick={() =>
                          updateWorkflow((workflow) => ({
                            ...workflow,

                            stages: workflow.stages.filter(
                              (item) => item.stageKey !== stage.stageKey,
                            ),
                          }))
                        }
                        className="rounded border border-red-500/30 p-2 text-red-400"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-xs font-600 text-muted-foreground">
                        Step name
                      </span>
                      <input
                        value={stage.label}
                        maxLength={100}
                        onChange={(event) => {
                          const label = event.target.value

                          updateStage(stage.stageKey, (item) => ({
                            ...item,

                            label,
                          }))
                        }}
                        className="w-full rounded border px-3 py-2"
                        style={fieldStyle}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-600 text-muted-foreground">
                        Required action
                      </span>
                      <select
                        value={stage.actionType}
                        onChange={(event) => {
                          const actionType = event.target.value as ActionType

                          updateStage(stage.stageKey, (item) => ({
                            ...item,

                            actionType,

                            permissionCode:
                              actionType === "approval"
                                ? defaultPermission[selectedKey]
                                : actionType === "line_manager_review"
                                  ? "expense_requests.review"
                                  : actionType === "initiate_requisition"
                                    ? "expense_requests.initiate"
                                    : actionType === "verify"
                                      ? selectedKey === "standalone_requisition"
                                        ? "requisitions.verify"
                                        : "expense_requests.verify"
                                      : actionType === "authorize"
                                        ? selectedKey ===
                                          "standalone_requisition"
                                          ? "requisitions.authorize"
                                          : "expense_requests.authorize"
                                        : "expense_requests.cashout",
                          }))
                        }}
                        className="w-full rounded border px-3 py-2"
                        style={fieldStyle}
                      >
                        {actionOptions[selectedKey].map((action) => (
                          <option
                            key={action}
                            value={action}
                            disabled={
                              action === "cashout" &&
                              index !== selectedWorkflow.stages.length - 1
                            }
                          >
                            {actionLabels[action]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {stage.actionType === "approval" &&
                      selectedKey === "leave" && (
                        <label>
                          <span className="mb-1 block text-xs font-600 text-muted-foreground">
                            Required permission
                          </span>
                          <select
                            value={stage.permissionCode}
                            onChange={(event) => {
                              const permissionCode = event.target.value

                              updateStage(stage.stageKey, (item) => ({
                                ...item,

                                permissionCode,

                                roleIds: [],
                              }))
                            }}
                            className="w-full rounded border px-3 py-2"
                            style={fieldStyle}
                          >
                            {stagePermissions.map((permission) => (
                              <option key={permission} value={permission}>
                                {permission}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-xs font-600 text-muted-foreground">
                        Assigned roles
                      </span>
                      <select
                        multiple
                        value={stage.roleIds}
                        onChange={(event) => {
                          const roleIds = Array.from(
                            event.currentTarget.selectedOptions,
                            (option) => option.value,
                          )

                          updateStage(stage.stageKey, (item) => ({
                            ...item,

                            roleIds,
                          }))
                        }}
                        className="min-h-24 w-full rounded border px-3 py-2"
                        style={fieldStyle}
                      >
                        {stageRoles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Leave empty to allow any active role with the selected
                        permission.
                      </span>
                    </label>
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-xs font-600 text-muted-foreground">
                        Instructions for the approver
                      </span>
                      <textarea
                        value={stage.instructions}
                        maxLength={1000}
                        rows={3}
                        onChange={(event) => {
                          const instructions = event.target.value

                          updateStage(stage.stageKey, (item) => ({
                            ...item,

                            instructions,
                          }))
                        }}
                        className="w-full rounded border px-3 py-2"
                        style={fieldStyle}
                      />
                    </label>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                updateWorkflow((workflow) => {
                  const stages = [...workflow.stages]
                  const cashoutIndex = stages.findIndex(
                    (stage) => stage.actionType === "cashout",
                  )

                  stages.splice(
                    cashoutIndex === -1 ? stages.length : cashoutIndex,
                    0,
                    createStage(selectedKey),
                  )

                  return { ...workflow, stages }
                })
              }
              disabled={selectedWorkflow.stages.length >= 20}
              className="inline-flex items-center gap-2 rounded border px-4 py-2.5 text-sm font-600 disabled:opacity-40"
              style={{ borderColor: "var(--border)" }}
            >
              <Plus size={16} aria-hidden="true" />
              Add step
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || selectedWorkflow.stages.length === 0}
              className="inline-flex items-center gap-2 rounded px-5 py-2.5 text-sm font-700 text-white disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              <Save size={16} aria-hidden="true" />
              {saving ? "Saving…" : "Save workflow"}
            </button>
          </div>
        </>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No approval workflow configuration was returned.
        </p>
      )}
    </section>
  )
}
