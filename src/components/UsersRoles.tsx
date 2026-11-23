"use client"

// Reload staff list so the updated IDs are visible immediately

/* Role list */ /* Permission detail panel */

// Group permissions by prefix (e.g. "candidates", "finance")

/* Mode toggle */ /* Header */ /* Scrollable body */ /* Footer */ /* Role list */ /* Permission matrix */ /* New user modal */ /* New role modal */

import { useEffect, useState, type FormEvent } from "react"

import { SearchableSelect } from "./SearchableSelect"

import {
  calculateMonthlyTransportAllowance,
  DEFAULT_WORK_SCHEDULE,
  getCurrentPayPeriod,
  getWorkingDaysInMonth,
  type CompanyWorkCalendar,
} from "@/lib/payroll/transport-allowance"

import {
  DEFAULT_ROLE_ACCESS_SETTINGS,
  isPrimaryAdministratorRole,
  isRecruitmentAgentRestrictedPermission,
  isRecruitmentAgentRole,
  roleAccessSettings,
  type RoleAccessSettings,
} from "@/lib/role-access-settings"

import { clearClientApiCache } from "@/lib/client-api-cache"

type UserRecord = {
  id: string

  name: string

  email: string

  phone: string

  roleId: string

  role: string

  status: string

  isPrimaryAdmin: boolean

  hasLinkedStaffRecord: boolean

  accountUnlinked: boolean

  branchId: string | null

  branch: string

  userType: "staff" | "member"
}

type RoleRecord = {
  id: string

  name: string

  description: string

  is_system_default: boolean

  created_at: string

  access_settings?: RoleAccessSettings
}

type PermissionRecord = {
  code: string
  description: string
}

type RolePermissionRecord = {
  role_id: string
  permission_code: string
}

async function readRoleMutationResponse<T>(
  response: Response,

  action: string,
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "unknown"

  try {
    const payload: unknown = await response.json()

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid API response.")
    }

    return payload as T
  } catch {
    console.error("Role management returned an invalid response", {
      action,

      status: response.status,

      contentType,

      redirected: response.redirected,
    })

    if (response.redirected) {
      throw new Error(
        "Your session may have expired. Refresh the page, sign in again, and retry.",
      )
    }

    throw new Error(
      `Could not ${action}: the server returned ${contentType} instead of JSON (HTTP ${response.status}). Refresh the page and try again.`,
    )
  }
}

type StaffPayType = "payroll" | "project" | "no_payroll"

type TransportAccountMode = "fixed" | "random"

type StaffAccount = {
  id: string

  name: string

  account_type: string

  account_number: string
}

type StaffRecord = {
  id: string

  staffId: string

  name: string

  positionId: string

  position: string

  phone: string

  status: "Active" | "On Leave" | "Inactive"

  dateJoined: string

  branchId: string

  linkedUserId: string

  lineManagerStaffId: string

  payType: StaffPayType

  baseSalary: number

  weeklyTransportAllowance: number

  transportAccountMode: TransportAccountMode

  transportAccountId: string
}

function getNormalizedNameParts(value: string) {
  return value

    .normalize("NFD")

    .replace(/\p{M}/gu, "")

    .toLocaleLowerCase()

    .split(/[^\p{L}\p{N}]+/u)

    .filter(Boolean)
}

type UserEditForm = {
  name: string

  email: string

  phone: string

  roleId: string

  branchId: string

  status: "active" | "disabled" | "invited"

  userType: "staff" | "member"

  positionId: string

  staffStatus: StaffRecord["status"]

  dateJoined: string

  lineManagerStaffId: string

  payType: StaffPayType

  baseSalary: string

  weeklyTransportAllowance: string

  transportAccountMode: TransportAccountMode

  transportAccountId: string
}

type StaffIdSettings = {
  prefix: string

  nextSequence: number

  canChangeSequence: boolean
}

type WorkspaceData = {
  users: UserRecord[]

  roles: RoleRecord[]

  permissions: PermissionRecord[]

  rolePermissions: RolePermissionRecord[]

  canManageRoles: boolean

  branches?: BranchOption[]
}

type BranchOption = {
  id: string

  name: string

  code: string

  isMainBranch: boolean
}

type StaffPosition = {
  id: string

  name: string

  is_active: boolean
}

const fieldStyle = {
  background: "var(--secondary)",

  borderColor: "var(--border)",

  color: "var(--foreground)",
}

const permissionModuleLabels: Record<string, string> = {
  ai: "AI Tools",

  approvals: "Approvals",

  attendance: "Attendance",

  branches: "Branches",

  candidate_documents: "Candidate Attachments",

  candidate_inquiries: "Candidate Inquiries",

  candidate_profiles: "Candidate Profiles",

  candidates: "Candidate Pipeline",

  company_accounts: "Finance Accounts",

  communications: "Communications",

  documents: "Documents",

  drive: "Company Drive",

  expense_requests: "Expense Requests",

  expense_items: "Expense Items",

  employers: "Contractors",

  finance: "Finance",

  human_resources: "Human Resources",

  invoices: "Invoices",

  leave: "Leave",

  medical: "Medical Examinations",

  medical_documents: "Medical Documents",

  passport: "Passport Information",

  passport_custody: "Passport Custody",

  projects: "Projects",

  requisitions: "Requisitions",

  reports: "Reports & Analytics",

  roles: "Role Management",

  settings: "Settings",

  staff: "Staff Management",

  suppliers: "Partners",

  tasks: "Tasks",

  users: "Users",
}

const permissionActionLabels: Record<string, string> = {
  approve: "Approve",

  authorize: "Authorize",

  clock: "Record attendance",

  connect: "Connect",

  create: "Create",

  delete: "Delete",

  download: "Download",

  edit: "Edit",

  finalize: "Finalize",

  manage: "Manage",

  read: "Read",

  register: "Register",

  review: "Review",

  send: "Send",

  status: "Change status",

  types: "Manage types",

  update: "Update",

  verify: "Verify",

  cashout: "Cash out",

  view: "View",

  upload: "Upload",
}

const permissionCodeLabels: Record<string, string> = {
  "workflows.manage": "Manage approval workflows",

  "candidates.delete": "Delete candidates and inquiries",

  "finance.delete": "Delete finance transactions",

  "candidates.project_submit": "Submit candidates to projects",

  "candidates.stage": "Update candidate stages",

  "attendance.view_reports": "View weekly and monthly reports",

  "expense_requests.edit": "Edit Expense Requests before initiation",

  "expense_requests.delete": "Delete Expense Requests before initiation",

  "expense_items.manage": "Manage the company item catalog",

  "expense_items.custom": "Use unlisted catalog items",

  "requisitions.items.create": "Add items to linked Expense Requests",

  "requisitions.items.edit": "Edit linked Expense Request items",

  "requisitions.items.delete": "Delete linked Expense Request items",

  "staff.positions.manage": "Manage position settings",

  "projects.view_full": "View full project details",
}

const permissionModuleOrder = [
  "candidates",

  "candidate_inquiries",

  "candidate_profiles",

  "candidate_documents",

  "documents",

  "drive",

  "projects",

  "employers",

  "suppliers",

  "passport",

  "passport_custody",

  "medical",

  "medical_documents",

  "finance",

  "company_accounts",

  "invoices",

  "users",

  "staff",

  "roles",

  "branches",

  "approvals",

  "requisitions",

  "expense_requests",

  "expense_items",

  "tasks",

  "communications",

  "attendance",

  "leave",

  "human_resources",

  "reports",

  "settings",

  "ai",
]

function permissionActionLabel(permissionCode: string): string {
  const explicitLabel = permissionCodeLabels[permissionCode]

  if (explicitLabel) return explicitLabel

  const actionParts = permissionCode.split(".").slice(1)

  const action = actionParts.pop() ?? permissionCode

  const subject = actionParts

    .map((part) =>
      part.toLowerCase() === "whatsapp"
        ? "WhatsApp"
        : part.charAt(0).toUpperCase() + part.slice(1),
    )

    .join(" ")

  const label =
    permissionActionLabels[action] ??
    action.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

  return subject ? `${label} ${subject}` : label
}

function RolePermissionsEditor({
  permissions,

  selectedPermissions,

  onChange,
}: {
  permissions: PermissionRecord[]

  selectedPermissions: string[]

  onChange: (permissions: string[]) => void
}) {
  const groupedPermissions = new Map<string, PermissionRecord[]>()

  const selectedPermissionCodes = new Set(selectedPermissions)

  for (const permission of permissions) {
    const module = permission.code.split(".")[0] ?? "other"

    const group = groupedPermissions.get(module) ?? []

    group.push(permission)

    groupedPermissions.set(module, group)
  }

  const sortedModules = [...groupedPermissions.entries()].sort(
    ([left], [right]) => {
      const leftOrder = permissionModuleOrder.indexOf(left)

      const rightOrder = permissionModuleOrder.indexOf(right)

      if (leftOrder < 0 && rightOrder < 0) return left.localeCompare(right)

      if (leftOrder < 0) return 1

      if (rightOrder < 0) return -1

      return leftOrder - rightOrder
    },
  )

  return (
    <fieldset>
      <div className="mb-3 flex items-center justify-between gap-3">
        <legend
          className="text-xs font-700 uppercase tracking-wider"
          style={{ color: "var(--muted-foreground)" }}
        >
          Permissions{" "}
          <span className="ml-1 font-400 normal-case tracking-normal">
            ({selectedPermissionCodes.size} selected)
          </span>
        </legend>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() =>
              onChange(permissions.map((permission) => permission.code))
            }
            className="text-xs"
            style={{ color: "var(--primary)" }}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            Clear all
          </button>
        </div>
      </div>
      {sortedModules.map(([module, modulePermissions]) => {
        const moduleCodes = modulePermissions.map(
          (permission) => permission.code,
        )

        const allSelected = moduleCodes.every((code) =>
          selectedPermissionCodes.has(code),
        )

        return (
          <section
            key={module}
            className="mb-3 rounded border p-3 last:mb-0"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3
                  className="text-sm font-700"
                  style={{ color: "var(--foreground)" }}
                >
                  {permissionModuleLabels[module] ?? module.replace(/_/g, " ")}
                </h3>
                <p
                  className="mt-0.5 text-[11px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {
                    modulePermissions.filter((permission) =>
                      selectedPermissionCodes.has(permission.code),
                    ).length
                  }{" "}
                  of {modulePermissions.length} actions enabled
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded border px-2 py-1 text-[11px] font-600"
                style={{
                  color: "var(--primary)",

                  borderColor: "var(--border)",
                }}
                onClick={() =>
                  onChange(
                    allSelected
                      ? selectedPermissions.filter(
                          (code) => !moduleCodes.includes(code),
                        )
                      : [
                          ...new Set([
                            ...selectedPermissions,

                            ...moduleCodes,
                          ]),
                        ],
                  )
                }
              >
                {allSelected ? "Clear module" : "Select module"}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {modulePermissions.map((permission) => {
                const checked = selectedPermissionCodes.has(permission.code)

                return (
                  <label
                    key={permission.code}
                    className="flex cursor-pointer items-start gap-2.5 rounded border p-2.5 text-xs"
                    aria-label={`${permissionActionLabel(permission.code)}: ${permission.description}`}
                    style={{
                      borderColor: checked ? "var(--primary)" : "var(--border)",

                      color: "var(--foreground)",

                      background: checked
                        ? "color-mix(in srgb, var(--primary) 8%, transparent)"
                        : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        onChange(
                          event.target.checked
                            ? [
                                ...new Set([
                                  ...selectedPermissions,

                                  permission.code,
                                ]),
                              ]
                            : selectedPermissions.filter(
                                (code) => code !== permission.code,
                              ),
                        )
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <span>
                      <span className="block font-600">
                        {permissionActionLabel(permission.code)}
                      </span>
                      <span style={{ color: "var(--muted-foreground)" }}>
                        {permission.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </section>
        )
      })}
    </fieldset>
  )
}

function matchesSelectedPermissions(
  savedPermissions: string[] | undefined,

  selectedPermissions: string[],
): boolean {
  if (!Array.isArray(savedPermissions)) return false

  const saved = new Set(savedPermissions)

  const selected = new Set(selectedPermissions)

  return (
    saved.size === selected.size &&
    [...selected].every((permission) => saved.has(permission))
  )
}

const emptyStaffForm = {
  name: "",

  positionId: "",

  status: "Active" as StaffRecord["status"],

  dateJoined: "",

  branchId: "",

  linkedUserId: "",

  lineManagerStaffId: "",

  payType: "payroll" as StaffPayType,

  baseSalary: "",

  weeklyTransportAllowance: "0",

  transportAccountMode: "fixed" as TransportAccountMode,

  transportAccountId: "",
}

const emptyInvitedStaffForm = {
  positionId: "",

  dateJoined: new Date().toISOString().slice(0, 10),

  payType: "payroll" as StaffPayType,

  baseSalary: "",

  weeklyTransportAllowance: "0",

  transportAccountMode: "fixed" as TransportAccountMode,

  transportAccountId: "",

  lineManagerStaffId: "",
}

const emptyUserEditForm = (): UserEditForm => ({
  name: "",

  email: "",

  phone: "",

  roleId: "",

  branchId: "",

  status: "active",

  userType: "member",

  positionId: "",

  staffStatus: "Active",

  dateJoined: "",

  lineManagerStaffId: "",

  payType: "no_payroll",

  baseSalary: "0",

  weeklyTransportAllowance: "0",

  transportAccountMode: "fixed",

  transportAccountId: "",
})

export default function UsersRoles({
  companyId,

  currentUserId,
}: {
  companyId: string

  currentUserId: string
}) {
  const [tab, setTab] = useState<"users" | "roles" | "staff">("users")

  const [data, setData] = useState<WorkspaceData>({
    users: [],

    roles: [],

    permissions: [],

    rolePermissions: [],

    canManageRoles: false,
  })

  const [selectedRoleId, setSelectedRoleId] = useState("")

  const [showNewUser, setShowNewUser] = useState(false)

  const [showNewRole, setShowNewRole] = useState(false)

  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null)

  const [showEditRole, setShowEditRole] = useState(false)

  const [roleEditName, setRoleEditName] = useState("")

  const [roleEditDescription, setRoleEditDescription] = useState("")

  const [roleEditPermissions, setRoleEditPermissions] = useState<string[]>([])

  const [roleEditAccessSettings, setRoleEditAccessSettings] =
    useState<RoleAccessSettings>(DEFAULT_ROLE_ACCESS_SETTINGS)

  const [showStaffForm, setShowStaffForm] = useState(false)

  const [editingStaffId, setEditingStaffId] = useState("")

  const [staffMembers, setStaffMembers] = useState<StaffRecord[]>([])

  const [staffPositions, setStaffPositions] = useState<StaffPosition[]>([])

  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([])

  const [workCalendar, setWorkCalendar] = useState<CompanyWorkCalendar>({
    schedule: DEFAULT_WORK_SCHEDULE,

    closureDates: [],
  })

  const [staffBranches, setStaffBranches] = useState<BranchOption[]>([])

  const [staffBranchSelectionRequired, setStaffBranchSelectionRequired] =
    useState(false)

  const [canDeleteStaff, setCanDeleteStaff] = useState(false)

  const [staffLoading, setStaffLoading] = useState(false)

  const [staffLoadError, setStaffLoadError] = useState("")

  const [deletingStaffId, setDeletingStaffId] = useState("")

  const [staffForm, setStaffForm] = useState(emptyStaffForm)

  const [staffIdSettings, setStaffIdSettings] =
    useState<StaffIdSettings | null>(null)

  const [staffIdPrefix, setStaffIdPrefix] = useState("")

  const [staffNextSequence, setStaffNextSequence] = useState(1)

  const [editingStaffNumber, setEditingStaffNumber] =
    useState<StaffRecord | null>(null)

  const [staffIdNumber, setStaffIdNumber] = useState("")

  const [userName, setUserName] = useState("")

  const [userPhone, setUserPhone] = useState("")

  const [userEmail, setUserEmail] = useState("")

  const [selectedExistingStaffId, setSelectedExistingStaffId] = useState("")

  const [userRoleId, setUserRoleId] = useState("")

  const [userBranchId, setUserBranchId] = useState("")

  const [userInviteMode, setUserInviteMode] =
    useState<"email-link" | "default-password">("email-link")

  const [userType, setUserType] = useState<"member" | "staff">("member")

  const [inviteStep, setInviteStep] =
    useState<"account-type" | "staff-search" | "details">("account-type")

  const [userTypeFilter, setUserTypeFilter] =
    useState<"all" | "staff" | "member">("all")

  const [userBranchFilter, setUserBranchFilter] = useState("all")

  const [userSearch, setUserSearch] = useState("")

  const [relinkingUserId, setRelinkingUserId] = useState("")

  const [relinkEmail, setRelinkEmail] = useState("")

  const [editingUserType, setEditingUserType] = useState<UserRecord | null>(
    null,
  )

  const [editingUserStaff, setEditingUserStaff] = useState<StaffRecord | null>(
    null,
  )

  const [editUserForm, setEditUserForm] =
    useState<UserEditForm>(emptyUserEditForm)

  const [editUserLoading, setEditUserLoading] = useState(false)

  const [invitedStaffForm, setInvitedStaffForm] = useState(
    emptyInvitedStaffForm,
  )

  const [userDefaultPassword, setUserDefaultPassword] = useState("")

  const [userShowPassword, setUserShowPassword] = useState(false)

  const [roleName, setRoleName] = useState("")

  const [roleDescription, setRoleDescription] = useState("")

  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [userActionPending, setUserActionPending] = useState("")

  const [error, setError] = useState("")

  const [notice, setNotice] = useState("")

  const [reloadKey, setReloadKey] = useState(0)

  const [branches, setBranches] = useState<BranchOption[]>([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)

      setError("")

      console.log(
        "[useEffect] Loading workspace users and roles, reloadKey:",

        reloadKey,
      )

      try {
        const response = await fetch("/api/workspace/users", {
          cache: "no-store",
        })

        const result = (await response.json()) as WorkspaceData & {
          error?: string
        }

        if (!response.ok)
          throw new Error(result.error ?? "Unable to load users and roles.")

        if (!cancelled) {
          console.log("[useEffect] Received data from API:", {
            rolesCount: result.roles?.length,

            rolePermissionsCount: result.rolePermissions?.length,

            rolePermissions: result.rolePermissions,
          })

          setData({
            users: result.users ?? [],

            roles: result.roles ?? [],

            permissions: result.permissions ?? [],

            rolePermissions: result.rolePermissions ?? [],

            canManageRoles: Boolean(result.canManageRoles),
          })

          setSelectedRoleId((current) => current || result.roles[0]?.id || "")

          setUserRoleId((current) => {
            const currentRole = result.roles.find((role) => role.id === current)

            if (currentRole && !isPrimaryAdministratorRole(currentRole.name))
              return current

            return (
              result.roles.find(
                (role) => !isPrimaryAdministratorRole(role.name),
              )?.id || ""
            )
          })
        }

        if (!cancelled) {
          const availableBranches = result.branches ?? []

          setBranches(availableBranches)

          setUserBranchId(
            (current) =>
              current ||
              availableBranches.find((branch) => branch.isMainBranch)?.id ||
              availableBranches[0]?.id ||
              "",
          )
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error("[useEffect] Load error:", loadError)

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load users and roles.",
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [companyId, reloadKey])

  useEffect(() => {
    if (tab !== "staff" && !showNewUser) return

    let cancelled = false

    const loadStaff = async () => {
      setStaffLoading(true)

      setStaffLoadError("")

      try {
        const response = await fetch("/api/workspace/staff", {
          cache: "no-store",
        })

        const result = (await response.json()) as {
          staff?: StaffRecord[]

          positions?: StaffPosition[]

          accounts?: StaffAccount[]

          workCalendar?: CompanyWorkCalendar

          branches?: BranchOption[]

          branchSelectionRequired?: boolean

          settings?: StaffIdSettings

          canDeleteStaff?: boolean

          error?: string
        }

        if (!response.ok)
          throw new Error(result.error ?? "Unable to load staff records.")

        if (!cancelled) {
          setStaffMembers(result.staff ?? [])

          setStaffPositions(result.positions ?? [])

          setStaffAccounts(result.accounts ?? [])

          setWorkCalendar(
            result.workCalendar ?? {
              schedule: DEFAULT_WORK_SCHEDULE,

              closureDates: [],
            },
          )

          setStaffBranches(result.branches ?? [])

          setStaffBranchSelectionRequired(
            Boolean(result.branchSelectionRequired),
          )

          setCanDeleteStaff(result.canDeleteStaff === true)

          if (result.settings) {
            setStaffIdSettings(result.settings)

            setStaffIdPrefix(result.settings.prefix)

            setStaffNextSequence(result.settings.nextSequence)
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error
              ? loadError.message
              : "Unable to load staff records."

          setStaffLoadError(message)

          setError(message)
        }
      } finally {
        if (!cancelled) setStaffLoading(false)
      }
    }

    void loadStaff()

    return () => {
      cancelled = true
    }
  }, [companyId, reloadKey, showNewUser, tab])

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (userInviteMode === "email-link" && !userPhone.trim()) {
      setError("Enter a phone number before sending the invitation.")

      return
    }

    setSaving(true)

    setError("")

    setNotice("")

    try {
      const userDetails = {
        userType,

        phone: userPhone,

        existingStaffId: selectedExistingStaffId || undefined,

        ...(userType === "staff"
          ? {
              staff: {
                ...invitedStaffForm,

                branchId: userBranchId,
              },
            }
          : {}),
      }

      if (userInviteMode === "default-password") {
        if (userDefaultPassword.length < 8) {
          setError("The default password must be at least 8 characters.")

          setSaving(false)

          return
        }

        const response = await fetch("/api/workspace/users", {
          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({
            action: "create-user-with-password",

            name: userName,

            email: userEmail,

            roleId: userRoleId,

            branchId: userBranchId,

            password: userDefaultPassword,

            ...userDetails,
          }),
        })

        const result = (await response.json()) as { error?: string }

        if (!response.ok)
          throw new Error(result.error ?? "Unable to create user.")

        setShowNewUser(false)

        setUserName("")

        setUserPhone("")

        setUserEmail("")

        setSelectedExistingStaffId("")

        setUserDefaultPassword("")

        setUserInviteMode("email-link")

        setUserType("member")

        setInvitedStaffForm(emptyInvitedStaffForm)

        setNotice(
          "User created. They will be asked to set a new password when they first log in.",
        )
      } else {
        const response = await fetch("/api/workspace/users", {
          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({
            action: "invite-user",

            name: userName,

            email: userEmail,

            roleId: userRoleId,

            branchId: userBranchId,

            ...userDetails,
          }),
        })

        const result = (await response.json()) as {
          error?: string

          invitationEmailSent?: boolean

          invitationEmailWarning?: string
        }

        if (!response.ok)
          throw new Error(result.error ?? "Unable to invite user.")

        setShowNewUser(false)

        setUserName("")

        setUserPhone("")

        setUserEmail("")

        setSelectedExistingStaffId("")

        setUserType("member")

        setInvitedStaffForm(emptyInvitedStaffForm)

        if (result.invitationEmailSent === false) {
          setError(
            result.invitationEmailWarning ??
              "The account was created, but the invitation email could not be delivered. Use Resend invite after checking the server SMTP settings.",
          )
        } else {
          setNotice(
            "Invitation sent. The user can set their password from the email link.",
          )
        }
      }

      setReloadKey((key) => key + 1)
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save user.",
      )
    } finally {
      setSaving(false)
    }
  }

  const openEditUserType = async (user: UserRecord) => {
    setUserActionPending(user.id)

    setEditUserLoading(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/workspace/staff", {
        cache: "no-store",
      })

      const result = (await response.json()) as {
        staff?: StaffRecord[]

        positions?: StaffPosition[]

        accounts?: StaffAccount[]

        branches?: BranchOption[]

        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to load staff details.")

      const linkedRecords = (result.staff ?? []).filter(
        (staff) => staff.linkedUserId === user.id,
      )

      if (linkedRecords.length > 1)
        throw new Error(
          "This user has multiple linked staff records. Contact support.",
        )

      const staff = linkedRecords[0] ?? null

      setStaffMembers(result.staff ?? [])

      setStaffPositions(result.positions ?? [])

      setStaffAccounts(result.accounts ?? [])

      setStaffBranches(result.branches ?? [])

      setEditingUserStaff(staff)

      setEditUserForm({
        name: user.name,

        email: user.email,

        phone: staff?.phone ?? user.phone,

        roleId: user.roleId,

        branchId:
          user.branchId ??
          result.branches?.find((branch) => branch.isMainBranch)?.id ??
          "",

        status:
          user.status === "disabled"
            ? "disabled"
            : user.status === "invited"
              ? "invited"
              : "active",

        userType: user.userType,

        positionId: staff?.positionId ?? "",

        staffStatus: staff?.status ?? "Active",

        dateJoined: staff?.dateJoined ?? "",

        lineManagerStaffId: staff?.lineManagerStaffId ?? "",

        payType: staff?.payType ?? "no_payroll",

        baseSalary: String(staff?.baseSalary ?? 0),

        weeklyTransportAllowance: String(staff?.weeklyTransportAllowance ?? 0),

        transportAccountMode: staff?.transportAccountMode ?? "fixed",

        transportAccountId: staff?.transportAccountId ?? "",
      })

      setEditingUserType(user)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load user details.",
      )
    } finally {
      setEditUserLoading(false)

      setUserActionPending("")
    }
  }

  const submitUserType = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingUserType) return

    if (
      editingUserType.userType === "staff" &&
      editUserForm.userType === "member" &&
      !window.confirm(
        `Change ${editingUserType.name} to Member? Their staff record will be unlinked and marked inactive; historical HR and payroll records will be retained.`,
      )
    ) {
      return
    }

    setSaving(true)

    setUserActionPending(editingUserType.id)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          action: "edit-user-details",

          userId: editingUserType.id,

          name: editUserForm.name,

          email: editUserForm.email,

          phone: editUserForm.phone,

          roleId: editUserForm.roleId,

          branchId: editUserForm.branchId,

          status: editUserForm.status,

          userType: editUserForm.userType,

          ...(editUserForm.userType === "staff"
            ? {
                staff: {
                  positionId: editUserForm.positionId,

                  status: editUserForm.staffStatus,

                  dateJoined: editUserForm.dateJoined,

                  lineManagerStaffId: editUserForm.lineManagerStaffId,

                  payType: editUserForm.payType,

                  baseSalary: editUserForm.baseSalary,

                  weeklyTransportAllowance:
                    editUserForm.weeklyTransportAllowance,

                  transportAccountMode: editUserForm.transportAccountMode,

                  transportAccountId: editUserForm.transportAccountId,
                },
              }
            : {}),
        }),
      })

      const result = (await response.json()) as {
        error?: string

        emailChangePending?: boolean

        emailChangeWarning?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to update user details.")

      setEditingUserType(null)

      setNotice(
        result.emailChangeWarning ??
          (result.emailChangePending
            ? `${editUserForm.name} was updated. Confirm the email change using the links sent to the current and new addresses.`
            : `${editUserForm.name} was updated.`),
      )

      setReloadKey((key) => key + 1)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update the user type.",
      )
    } finally {
      setSaving(false)

      setUserActionPending("")
    }
  }

  const submitRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setSaving(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          action: "create-role",

          name: roleName,

          description: roleDescription,

          permissions: selectedPermissions,
        }),
      })

      const result = await readRoleMutationResponse<{
        permissions?: string[]

        error?: string
      }>(response, "create the role")

      if (!response.ok)
        throw new Error(result.error ?? "Unable to create role.")

      if (
        !matchesSelectedPermissions(result.permissions, selectedPermissions)
      ) {
        throw new Error(
          "The saved permissions did not match your selection. Reopen the role and verify its permissions.",
        )
      }

      setShowNewRole(false)

      clearClientApiCache()

      setRoleName("")

      setRoleDescription("")

      setSelectedPermissions([])

      setNotice("Role created with the selected permissions.")

      setReloadKey((key) => key + 1)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create role.",
      )
    } finally {
      setSaving(false)
    }
  }

  const openNewRole = () => {
    setRoleName("")

    setRoleDescription("")

    setSelectedPermissions([])

    setError("")

    setShowNewRole(true)
  }

  const openEditRole = (role: RoleRecord) => {
    const permsForRole = data.rolePermissions

      .filter((rp) => rp.role_id === role.id)

      .map((rp) => rp.permission_code)

      .filter(
        (permission) =>
          permission !== "agent_finance.view" ||
          isRecruitmentAgentRole(role.name),
      )

    setEditingRole(role)

    setRoleEditName(role.name)

    setRoleEditDescription(role.description)

    setRoleEditPermissions(permsForRole)

    setRoleEditAccessSettings(
      roleAccessSettings(role.access_settings, role.name),
    )

    setError("")

    setShowEditRole(true)
  }

  const submitEditRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingRole) return

    setSaving(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          action: "update-role",

          roleId: editingRole.id,

          name: roleEditName,

          description: roleEditDescription,

          permissions: roleEditPermissions,

          accessSettings: roleEditAccessSettings,
        }),
      })

      const result = await readRoleMutationResponse<{
        role?: RoleRecord

        permissions?: string[]

        error?: string
      }>(response, "save role permissions")

      if (!response.ok)
        throw new Error(result.error ?? "Unable to update role.")

      if (
        !matchesSelectedPermissions(result.permissions, roleEditPermissions)
      ) {
        throw new Error(
          "The saved permissions did not match your selection. Reopen the role and verify its permissions.",
        )
      }

      setShowEditRole(false)

      setEditingRole(null)

      clearClientApiCache()

      setNotice(
        `"${
          result.role?.name ?? roleEditName
        }" updated. Active workspaces will refresh their permissions automatically.`,
      )

      setReloadKey((key) => key + 1)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update role.",
      )
    } finally {
      setSaving(false)
    }
  }

  const deleteRole = async (role: RoleRecord) => {
    if (
      !window.confirm(
        `Delete the "${role.name}" role? This cannot be undone. Users assigned this role must be reassigned first.`,
      )
    )
      return

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ action: "delete-role", roleId: role.id }),
      })

      const result = (await response.json()) as {
        ok?: boolean

        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to delete role.")

      if (selectedRoleId === role.id) setSelectedRoleId("")

      clearClientApiCache()

      setNotice(`"${role.name}" deleted.`)

      setReloadKey((key) => key + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete role.")
    }
  }

  const manageUser = async (
    user: UserRecord,

    action: "change-role" | "set-status" | "unlink-account" | "relink-account" | "resend-invite" | "revoke-invite" | "delete-user",

    roleId?: string,

    email?: string,
  ) => {
    const prompts: Partial<Record<typeof action, string>> = {
      "set-status":
        user.status === "disabled"
          ? `Activate ${user.name}'s company access?`
          : `Deactivate ${user.name}'s company access?`,

      "unlink-account": `Unlink ${user.name}'s staff account from this company? Their company access will be disabled and their staff record marked inactive. Their access to other companies will not change.`,

      "relink-account": `Send a password setup invitation to ${email?.trim()}? This changes the login email for this account across all companies. Access to this company remains disabled until the invitation is accepted.`,

      "resend-invite": `Send a fresh invitation link to ${user.email}? The new link will be valid for one hour.`,

      "revoke-invite": `Revoke the pending invitation for ${user.name}? Their account will remain listed, and their Staff-page record will be kept for a future invitation.`,

      "delete-user": `Remove ${user.name} from this company? Their Staff-page record will be kept and unlinked. If they have no other company memberships, their account will be deactivated and removed while keeping historical finance records intact.`,
    }

    const prompt = prompts[action]

    if (prompt && !window.confirm(prompt)) return

    if (action === "relink-account" && !email?.trim()) {
      setError("Enter the new login email address.")

      return
    }

    setUserActionPending(user.id)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          action,

          userId: user.id,

          ...(action === "change-role" ? { roleId } : {}),

          ...(action === "set-status"
            ? {
                status: user.status === "disabled" ? "active" : "disabled",
              }
            : {}),

          ...(action === "relink-account" ? { email: email?.trim() } : {}),
        }),
      })

      const result = (await response.json()) as { error?: string }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to update this user.")

      setNotice(
        action === "change-role"
          ? `Role updated for ${user.name}.`
          : action === "unlink-account"
            ? `${user.name}'s staff account was unlinked and company access disabled.`
            : action === "relink-account"
              ? `A new password setup link was sent to ${email?.trim()}.`
              : action === "resend-invite"
                ? `A fresh invitation link was sent to ${user.email}.`
                : action === "set-status"
                  ? `Access updated for ${user.name}.`
                  : action === "revoke-invite"
                    ? `Invitation revoked for ${user.name}. Their account remains listed and their staff record is available for reassignment.`
                    : `${user.name} removed from this company.`,
      )

      if (action === "relink-account") {
        setRelinkingUserId("")

        setRelinkEmail("")
      }

      setReloadKey((key) => key + 1)
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update this user.",
      )
    } finally {
      setUserActionPending("")
    }
  }

  const openNewStaff = () => {
    setEditingStaffId("")

    setStaffForm(emptyStaffForm)

    setShowStaffForm(true)
  }

  const openEditStaff = (member: StaffRecord) => {
    setEditingStaffId(member.id)

    setStaffForm({
      name: member.name,

      positionId: member.positionId,

      status: member.status,

      dateJoined: member.dateJoined,

      branchId: member.branchId,

      linkedUserId: member.linkedUserId,

      lineManagerStaffId: member.lineManagerStaffId,

      payType: member.payType,

      baseSalary: String(member.baseSalary),

      weeklyTransportAllowance: String(member.weeklyTransportAllowance),

      transportAccountMode: member.transportAccountMode,

      transportAccountId: member.transportAccountId,
    })

    setShowStaffForm(true)
  }

  const submitStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setSaving(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/workspace/staff", {
        method: editingStaffId ? "PATCH" : "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          ...staffForm,

          id: editingStaffId || undefined,
        }),
      })

      const result = (await response.json()) as { error?: string }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to save staff record.")

      setShowStaffForm(false)

      setNotice(
        editingStaffId ? "Staff record updated." : "Staff member added.",
      )

      setReloadKey((key) => key + 1)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save staff record.",
      )
    } finally {
      setSaving(false)
    }
  }

  const deleteStaff = async (member: StaffRecord) => {
    const hasLinkedUser = Boolean(member.linkedUserId)

    const linkedUser = data.users.find(
      (user) => user.id === member.linkedUserId,
    )

    const accountDetails = hasLinkedUser
      ? ` Their membership in this company will also be removed${
          linkedUser?.email ? ` (${linkedUser.email})` : ""
        }. Their login remains, with access to other companies unchanged.`
      : ""

    if (
      !window.confirm(
        `Permanently delete ${member.name}'s staff record?${accountDetails} Staff documents and membership-linked data such as attendance and chat may also be removed. Deletion is blocked when payroll history or active direct reports must be preserved.`,
      )
    )
      return

    setDeletingStaffId(member.id)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/workspace/staff", {
        method: "DELETE",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ id: member.id }),
      })

      const result = (await response.json()) as {
        error?: string

        removedCompanyMembership?: boolean
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to delete staff record.")

      clearClientApiCache()

      setNotice(
        result.removedCompanyMembership
          ? `${member.name} and their company membership were deleted.`
          : `${member.name}'s staff record was deleted.`,
      )

      setReloadKey((key) => key + 1)
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete staff record.",
      )
    } finally {
      setDeletingStaffId("")
    }
  }

  const submitStaffIdSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setSaving(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/workspace/staff", {
        method: "PATCH",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          action: "configure-ids",

          prefix: staffIdPrefix,

          nextSequence: staffNextSequence,
        }),
      })

      const result = (await response.json()) as {
        settings?: StaffIdSettings

        message?: string

        restamped?: number

        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to update staff ID settings.")

      if (result.settings) {
        setStaffIdSettings(result.settings)

        setStaffIdPrefix(result.settings.prefix)

        setStaffNextSequence(result.settings.nextSequence)
      }

      setReloadKey((key) => key + 1)

      setNotice(result.message ?? "Staff ID settings updated.")
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update staff ID settings.",
      )
    } finally {
      setSaving(false)
    }
  }

  const openEditStaffId = (member: StaffRecord) => {
    const prefix = staffIdSettings?.prefix

    const number =
      prefix && member.staffId.startsWith(`${prefix}-`)
        ? member.staffId.slice(prefix.length + 1)
        : ""

    setEditingStaffNumber(member)

    setStaffIdNumber(number)

    setError("")

    setNotice("")
  }

  const submitIndividualStaffId = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingStaffNumber || !staffIdSettings) return

    setSaving(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/workspace/staff", {
        method: "PATCH",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          action: "update-individual-id",

          id: editingStaffNumber.id,

          prefix: staffIdSettings.prefix,

          sequence: Number(staffIdNumber),
        }),
      })

      const result = (await response.json()) as {
        staffId?: string

        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to update staff ID.")

      if (!result.staffId)
        throw new Error("The updated staff ID was not returned.")

      const updatedStaffId = result.staffId

      setStaffMembers((current) =>
        current.map((member) =>
          member.id === editingStaffNumber.id
            ? { ...member, staffId: updatedStaffId }
            : member,
        ),
      )

      setEditingStaffNumber(null)

      setReloadKey((key) => key + 1)

      setNotice(`Staff ID updated to ${updatedStaffId}.`)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update staff ID.",
      )
    } finally {
      setSaving(false)
    }
  }

  const selectedRole = data.roles.find((role) => role.id === selectedRoleId)

  const permissionsForRole = new Set(
    data.rolePermissions

      .filter((permission) => permission.role_id === selectedRoleId)

      .map((permission) => permission.permission_code),
  )

  const canManageStaff = data.users.some(
    (user) =>
      user.id === currentUserId &&
      (user.isPrimaryAdmin ||
        user.role === "Chairman" ||
        user.role === "CEO" ||
        user.role === "General Manager"),
  )

  const currentUser = data.users.find((user) => user.id === currentUserId)

  const canEditUserType = Boolean(currentUser?.isPrimaryAdmin)

  const canViewBranchMembers = Boolean(
    currentUser &&
      (currentUser.isPrimaryAdmin ||
        ["Chairman", "General Manager", "Supervisor"].includes(
          currentUser.role,
        )),
  )

  const canManageRoles =
    data.users.some(
      (user) =>
        user.id === currentUserId &&
        (user.isPrimaryAdmin ||
          user.role === "Chairman" ||
          user.role === "CEO"),
    ) || data.canManageRoles

  const searchTerm = userSearch.trim().toLocaleLowerCase()

  const visibleUsers = data.users.filter((user) => {
    const matchesType =
      userTypeFilter === "all" || user.userType === userTypeFilter

    const matchesBranch =
      userBranchFilter === "all" || user.branchId === userBranchFilter

    const matchesSearch =
      !searchTerm ||
      `${user.name} ${user.email} ${user.role} ${user.branch}`

        .toLocaleLowerCase()

        .includes(searchTerm)

    return matchesType && matchesBranch && matchesSearch
  })

  const selectedExistingStaff = staffMembers.find(
    (staff) => staff.id === selectedExistingStaffId,
  )

  const currentPayrollPeriod = getCurrentPayPeriod()

  const currentPayrollWorkingDays = getWorkingDaysInMonth(
    currentPayrollPeriod,

    workCalendar.schedule,

    workCalendar.closureDates,
  )

  const staffMonthlyTransportBenefit = calculateMonthlyTransportAllowance(
    Number(staffForm.weeklyTransportAllowance),

    currentPayrollPeriod,

    workCalendar.schedule,

    workCalendar.closureDates,
  )

  const invitedMonthlyTransportBenefit = calculateMonthlyTransportAllowance(
    Number(invitedStaffForm.weeklyTransportAllowance),

    currentPayrollPeriod,

    workCalendar.schedule,

    workCalendar.closureDates,
  )

  const companyUserIds = new Set(data.users.map((user) => user.id))

  const staffNameSearchParts = getNormalizedNameParts(userName)

  const staffNameCandidates =
    userType === "staff" &&
    !selectedExistingStaff &&
    staffNameSearchParts.length > 0 &&
    userName.trim().length >= 2
      ? staffMembers.filter((staff) => {
          const normalizedStaffName = getNormalizedNameParts(staff.name)

          return staffNameSearchParts.every((part) =>
            normalizedStaffName.some((namePart) => namePart.includes(part)),
          )
        })
      : []

  const staffNameMatches = staffNameCandidates

    .filter(
      (staff) =>
        staff.status.trim().toLocaleLowerCase() === "active" &&
        (!staff.linkedUserId || !companyUserIds.has(staff.linkedUserId)),
    )

    .slice(0, 8)

  const selectExistingStaff = (staff: StaffRecord) => {
    setSelectedExistingStaffId(staff.id)

    setUserName(staff.name)

    setUserPhone(staff.phone)

    setUserBranchId(staff.branchId)

    setInvitedStaffForm({
      positionId: staff.positionId,

      dateJoined: staff.dateJoined,

      payType: staff.payType,

      baseSalary: String(staff.baseSalary),

      weeklyTransportAllowance: String(staff.weeklyTransportAllowance),

      transportAccountMode: staff.transportAccountMode,

      transportAccountId: staff.transportAccountId,

      lineManagerStaffId: staff.lineManagerStaffId,
    })

    setInviteStep("details")
  }

  const openNewUser = () => {
    setError("")

    setUserName("")

    setUserPhone("")

    setUserEmail("")

    setSelectedExistingStaffId("")

    setUserDefaultPassword("")

    setUserInviteMode("email-link")

    setUserType("member")

    setInviteStep("account-type")

    setInvitedStaffForm(emptyInvitedStaffForm)

    setShowNewUser(true)
  }

  const closeNewUser = () => {
    setShowNewUser(false)

    setError("")

    setUserName("")

    setUserPhone("")

    setUserEmail("")

    setSelectedExistingStaffId("")

    setUserDefaultPassword("")

    setUserInviteMode("email-link")

    setUserType("member")

    setInviteStep("account-type")

    setInvitedStaffForm(emptyInvitedStaffForm)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className="flex shrink-0 items-center justify-between border-b px-6 py-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <h1
            className="text-xl font-700"
            style={{ color: "var(--foreground)" }}
          >
            Users &amp; Roles
          </h1>
          <p
            className="mt-0.5 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            Manage company access, permissions, and staff records
          </p>
        </div>
        {tab === "users" ? (
          <button
            type="button"
            onClick={openNewUser}
            disabled={!data.roles.length}
            className="rounded px-4 py-2 text-sm font-600 disabled:opacity-50"
            style={{
              background: "var(--primary)",

              color: "var(--primary-foreground)",
            }}
          >
            Invite user
          </button>
        ) : tab === "roles" ? (
          canManageRoles ? (
            <button
              type="button"
              onClick={openNewRole}
              className="rounded px-4 py-2 text-sm font-600"
              style={{
                background: "var(--primary)",

                color: "var(--primary-foreground)",
              }}
            >
              New role
            </button>
          ) : null
        ) : (
          <button
            type="button"
            onClick={openNewStaff}
            className="rounded px-4 py-2 text-sm font-600"
            style={{
              background: "var(--primary)",

              color: "var(--primary-foreground)",
            }}
          >
            Add staff
          </button>
        )}
      </div>

      <div
        className="flex shrink-0 border-b"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        {(["users", "roles", "staff"] as const)

          .filter((item) => item !== "staff" || canManageStaff)

          .map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className="px-5 py-3 text-sm font-600 capitalize"
              style={{
                color:
                  tab === item ? "var(--primary)" : "var(--muted-foreground)",

                borderBottom:
                  tab === item
                    ? "2px solid var(--primary)"
                    : "2px solid transparent",
              }}
            >
              {item}
            </button>
          ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
          >
            {notice}
          </div>
        )}
        {loading ? (
          <p
            className="py-10 text-center text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            Loading company users and roles…
          </p>
        ) : null}

        {!loading && tab === "users" && (
          <div className="flex flex-wrap gap-3 px-6 pt-4">
            <label
              className="min-w-52 flex-1 text-xs font-600"
              style={{ color: "var(--muted-foreground)" }}
            >
              Search users
              <input
                type="search"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Name, email, role, or branch"
                className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
                style={fieldStyle}
              />
            </label>
            <label
              className="w-44 text-xs font-600"
              style={{ color: "var(--muted-foreground)" }}
            >
              User type
              <select
                value={userTypeFilter}
                onChange={(event) =>
                  setUserTypeFilter(event.target.value as typeof userTypeFilter)
                }
                className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
                style={fieldStyle}
              >
                <option value="all">All users</option>
                <option value="staff">Staff</option>
                <option value="member">Members</option>
              </select>
            </label>
          </div>
        )}

        {!loading && tab === "users" && canViewBranchMembers && (
          <div className="flex flex-wrap items-center gap-2 px-6 pt-3">
            <span
              className="mr-1 text-xs font-600"
              style={{ color: "var(--muted-foreground)" }}
            >
              View members by branch
            </span>
            <button
              type="button"
              aria-pressed={userBranchFilter === "all"}
              onClick={() => setUserBranchFilter("all")}
              className="rounded border px-3 py-1.5 text-xs font-600"
              style={{
                borderColor:
                  userBranchFilter === "all"
                    ? "var(--primary)"
                    : "var(--border)",

                color:
                  userBranchFilter === "all"
                    ? "var(--primary)"
                    : "var(--muted-foreground)",
              }}
            >
              All visible ({data.users.length})
            </button>
            {branches.map((branch) => {
              const memberCount = data.users.filter(
                (user) => user.branchId === branch.id,
              ).length

              const selected = userBranchFilter === branch.id

              return (
                <button
                  key={branch.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setUserBranchFilter(branch.id)}
                  className="rounded border px-3 py-1.5 text-xs font-600"
                  style={{
                    borderColor: selected ? "var(--primary)" : "var(--border)",

                    color: selected
                      ? "var(--primary)"
                      : "var(--muted-foreground)",
                  }}
                >
                  {branch.name} ({memberCount})
                </button>
              )
            })}
          </div>
        )}

        {!loading && tab === "users" && (
          <div
            className="overflow-x-auto rounded border"
            style={{
              background: "var(--card)",

              borderColor: "var(--border)",
            }}
          >
            <div className="app-table-scroll">
              <table className="w-full min-w-155 text-sm">
                <thead>
                  <tr
                    className="border-b"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {[
                      "Name",

                      "Email",

                      "Role",

                      "Type",

                      "Branch",

                      "Status",

                      "Actions",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-left text-xs font-700 uppercase tracking-wide"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b last:border-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td
                        className="px-4 py-3 font-600"
                        style={{ color: "var(--foreground)" }}
                      >
                        {user.name}
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {user.email}
                      </td>
                      <td className="px-4 py-3">
                        {user.isPrimaryAdmin ? (
                          <span
                            className="text-xs"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {user.role}
                          </span>
                        ) : (
                          <select
                            aria-label={`Role for ${user.name}`}
                            value={user.roleId}
                            disabled={
                              user.id === currentUserId ||
                              userActionPending === user.id
                            }
                            onChange={(event) =>
                              void manageUser(
                                user,

                                "change-role",

                                event.target.value,
                              )
                            }
                            className="max-w-56 rounded border px-2 py-1 text-xs disabled:opacity-50"
                            style={fieldStyle}
                          >
                            {data.roles

                              .filter(
                                (role) =>
                                  !isPrimaryAdministratorRole(role.name),
                              )

                              .map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded px-2 py-1 text-xs font-600 capitalize"
                          style={{
                            color:
                              user.userType === "staff"
                                ? "var(--primary)"
                                : "var(--muted-foreground)",

                            background: "var(--secondary)",
                          }}
                        >
                          {user.userType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.isPrimaryAdmin ? (
                          <span
                            className="text-xs"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            Main Branch
                          </span>
                        ) : (
                          <select
                            aria-label={`Branch for ${user.name}`}
                            value={user.branchId ?? ""}
                            disabled={
                              user.id === currentUserId ||
                              userActionPending === user.id ||
                              branches.length === 0
                            }
                            onChange={async (event) => {
                              setUserActionPending(user.id)

                              setError("")

                              try {
                                const res = await fetch("/api/branches", {
                                  method: "POST",

                                  headers: {
                                    "Content-Type": "application/json",
                                  },

                                  body: JSON.stringify({
                                    action: "set-member-branch",

                                    userId: user.id,

                                    branchId: event.target.value || null,
                                  }),
                                })

                                const result = (await res.json()) as {
                                  error?: string
                                }

                                if (!res.ok)
                                  throw new Error(
                                    result.error ?? "Unable to assign branch.",
                                  )

                                setNotice(`Branch updated for ${user.name}.`)

                                setReloadKey((key) => key + 1)
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Unable to assign branch.",
                                )
                              } finally {
                                setUserActionPending("")
                              }
                            }}
                            className="max-w-44 rounded border px-2 py-1 text-xs disabled:opacity-50"
                            style={fieldStyle}
                          >
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                                {b.isMainBranch ? " (Main)" : ""}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded px-2 py-1 text-xs font-600"
                          style={{
                            color:
                              user.status === "active"
                                ? "#10b981"
                                : user.status === "disabled"
                                  ? "#ef4444"
                                  : "#f59e0b",

                            background:
                              user.status === "active"
                                ? "#10b98120"
                                : user.status === "disabled"
                                  ? "#ef444420"
                                  : "#f59e0b20",
                          }}
                        >
                          {user.status === "active"
                            ? "Active"
                            : user.status === "disabled"
                              ? "Deactivated"
                              : "Invited"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {canEditUserType &&
                            !user.isPrimaryAdmin &&
                            !user.accountUnlinked &&
                            user.id !== currentUserId && (
                              <button
                                type="button"
                                disabled={userActionPending === user.id}
                                onClick={() => openEditUserType(user)}
                                className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                                style={{
                                  borderColor: "var(--border)",

                                  color: "var(--primary)",
                                }}
                              >
                                Edit
                              </button>
                            )}
                          {user.isPrimaryAdmin ? (
                            <span
                              className="text-xs"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              Protected company user
                            </span>
                          ) : user.id === currentUserId ? (
                            <span
                              className="text-xs"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              Current user
                            </span>
                          ) : user.accountUnlinked ? (
                            relinkingUserId === user.id ? (
                              <form
                                onSubmit={(event) => {
                                  event.preventDefault()

                                  void manageUser(
                                    user,

                                    "relink-account",

                                    undefined,

                                    relinkEmail,
                                  )
                                }}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="email"
                                  required
                                  aria-label={`New login email for ${user.name}`}
                                  autoComplete="email"
                                  value={relinkEmail}
                                  onChange={(event) =>
                                    setRelinkEmail(event.target.value)
                                  }
                                  placeholder="New login email"
                                  className="w-48 rounded border px-2 py-1 text-xs"
                                  style={fieldStyle}
                                />
                                <button
                                  type="submit"
                                  disabled={userActionPending === user.id}
                                  className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                                  style={{
                                    borderColor: "var(--border)",

                                    color: "var(--primary)",
                                  }}
                                >
                                  Send invite
                                </button>
                                <button
                                  type="button"
                                  disabled={userActionPending === user.id}
                                  onClick={() => {
                                    setRelinkingUserId("")

                                    setRelinkEmail("")
                                  }}
                                  className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                                  style={{
                                    borderColor: "var(--border)",

                                    color: "var(--muted-foreground)",
                                  }}
                                >
                                  Cancel
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                disabled={userActionPending === user.id}
                                onClick={() => {
                                  setRelinkingUserId(user.id)

                                  setRelinkEmail(
                                    user.status === "invited" ? user.email : "",
                                  )
                                }}
                                className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                                style={{
                                  borderColor: "var(--border)",

                                  color: "var(--primary)",
                                }}
                              >
                                {user.status === "invited"
                                  ? "Resend relink invite"
                                  : "Relink account"}
                              </button>
                            )
                          ) : user.status === "invited" ? (
                            <>
                              <button
                                type="button"
                                disabled={userActionPending === user.id}
                                onClick={() =>
                                  void manageUser(user, "resend-invite")
                                }
                                className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                                style={{
                                  borderColor: "var(--border)",

                                  color: "var(--primary)",
                                }}
                              >
                                Resend invite
                              </button>
                              <button
                                type="button"
                                disabled={userActionPending === user.id}
                                onClick={() =>
                                  void manageUser(user, "revoke-invite")
                                }
                                className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                                style={{
                                  borderColor: "var(--border)",

                                  color: "var(--muted-foreground)",
                                }}
                              >
                                Revoke invite
                              </button>
                            </>
                          ) : user.userType === "staff" &&
                            user.hasLinkedStaffRecord &&
                            user.status === "active" ? (
                            <button
                              type="button"
                              disabled={userActionPending === user.id}
                              onClick={() =>
                                void manageUser(user, "unlink-account")
                              }
                              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                              style={{
                                borderColor: "var(--border)",

                                color: "#f59e0b",
                              }}
                            >
                              Unlink account
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={userActionPending === user.id}
                              onClick={() =>
                                void manageUser(user, "set-status")
                              }
                              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                              style={{
                                borderColor: "var(--border)",

                                color:
                                  user.status === "disabled"
                                    ? "#10b981"
                                    : "#f59e0b",
                              }}
                            >
                              {user.status === "disabled"
                                ? "Activate"
                                : "Deactivate"}
                            </button>
                          )}
                          {!user.isPrimaryAdmin && user.id !== currentUserId ? (
                            <button
                              type="button"
                              disabled={userActionPending === user.id}
                              onClick={() =>
                                void manageUser(user, "delete-user")
                              }
                              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                              style={{
                                borderColor: "#ef444440",

                                color: "#ef4444",
                              }}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!visibleUsers.length && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        No users match the selected type or search.
                      </td>
                    </tr>
                  )}
                  {!data.users.length && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-10 text-center text-sm"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        No company users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && tab === "roles" && (
          <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.25fr)]">
            {}
            <div className="space-y-2">
              <h2
                className="mb-3 text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Company roles
              </h2>
              {data.roles.map((role) => {
                const isPrimaryAdmin = isPrimaryAdministratorRole(role.name)

                const memberCount = data.users.filter(
                  (u) => u.roleId === role.id,
                ).length

                return (
                  <div
                    key={role.id}
                    className="rounded border"
                    style={{
                      background:
                        selectedRoleId === role.id
                          ? "var(--secondary)"
                          : "var(--card)",

                      borderColor:
                        selectedRoleId === role.id
                          ? "var(--primary)"
                          : "var(--border)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className="w-full px-3 py-3 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-sm font-600"
                          style={{ color: "var(--foreground)" }}
                        >
                          {role.name}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {role.is_system_default && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-600 uppercase tracking-wide"
                              style={{
                                background: "var(--border)",

                                color: "var(--muted-foreground)",
                              }}
                            >
                              Default
                            </span>
                          )}
                          {memberCount > 0 && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-600"
                              style={{
                                background: "var(--secondary)",

                                color: "var(--muted-foreground)",
                              }}
                            >
                              {memberCount} user
                              {memberCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      {role.description ? (
                        <span
                          className="mt-1 block text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {role.description}
                        </span>
                      ) : null}
                    </button>
                    {canManageRoles && (
                      <div
                        className="flex gap-1.5 border-t px-3 py-2"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <button
                          type="button"
                          onClick={() => openEditRole(role)}
                          className="rounded border px-2.5 py-1 text-xs font-600"
                          style={{
                            borderColor: "var(--border)",

                            color: "var(--foreground)",
                          }}
                        >
                          Edit
                        </button>
                        {!isPrimaryAdmin && (
                          <button
                            type="button"
                            onClick={() => void deleteRole(role)}
                            className="rounded border px-2.5 py-1 text-xs font-600"
                            style={{
                              borderColor: "#ef444440",

                              color: "#ef4444",
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {!data.roles.length && (
                <p
                  className="text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  No roles are configured.
                </p>
              )}
            </div>

            {}
            <div
              className="rounded border"
              style={{
                background: "var(--card)",

                borderColor: "var(--border)",
              }}
            >
              {selectedRole ? (
                <>
                  <div
                    className="border-b px-4 py-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2
                          className="text-sm font-700"
                          style={{ color: "var(--foreground)" }}
                        >
                          {selectedRole.name}
                        </h2>
                        <p
                          className="mt-0.5 text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {selectedRole.description || "No description."}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {permissionsForRole.size} permission
                        {permissionsForRole.size !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  {permissionsForRole.size === 0 ? (
                    <p
                      className="px-4 py-6 text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      No permissions assigned to this role.
                    </p>
                  ) : (
                    <div
                      className="divide-y"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {(() => {
                        const grouped = new Map<string, PermissionRecord[]>()

                        data.permissions

                          .filter((p) => permissionsForRole.has(p.code))

                          .forEach((p) => {
                            const group = p.code.split(".")[0] ?? "other"

                            if (!grouped.has(group)) grouped.set(group, [])

                            grouped.get(group)!.push(p)
                          })

                        return Array.from(grouped.entries()).map(
                          ([group, perms]) => (
                            <div key={group} className="px-4 py-3">
                              <div
                                className="mb-2 text-xs font-700 uppercase tracking-wider"
                                style={{ color: "var(--muted-foreground)" }}
                              >
                                {group.replace(/_/g, " ")}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {perms.map((p) => (
                                  <span
                                    key={p.code}
                                    title={p.description}
                                    className="rounded border px-2 py-0.5 text-xs font-600"
                                    style={{
                                      borderColor: "var(--border)",

                                      color: "var(--foreground)",
                                    }}
                                  >
                                    {p.code.split(".").slice(1).join(".")}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ),
                        )
                      })()}
                    </div>
                  )}
                </>
              ) : (
                <p
                  className="px-4 py-10 text-center text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Select a role to review its permissions.
                </p>
              )}
            </div>
          </div>
        )}

        {tab === "staff" && (
          <div className="space-y-4">
            <div
              className="rounded border"
              style={{
                background: "var(--card)",

                borderColor: "var(--border)",
              }}
            >
              <div
                className="border-b p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div>
                  <div
                    className="text-xs font-700 uppercase tracking-wider"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Staff records
                  </div>
                  <div
                    className="mt-1 text-xl font-700"
                    style={{ color: "var(--foreground)" }}
                  >
                    {staffMembers.length}
                  </div>
                </div>
              </div>

              {staffIdSettings?.canChangeSequence && (
                <form
                  onSubmit={submitStaffIdSettings}
                  className="border-b p-4 space-y-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div>
                    <p
                      className="text-xs font-700 uppercase tracking-wider mb-0.5"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Staff ID Settings
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Changing the prefix will{" "}
                      <strong style={{ color: "var(--foreground)" }}>
                        re-number all existing staff
                      </strong>{" "}
                      starting from the sequence you enter. New staff added
                      later will continue the sequence automatically.
                    </p>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Use Edit ID beside a staff member to change only that
                      person&apos;s number.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <label
                      className="block text-xs font-700 uppercase tracking-wider"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Staff ID Prefix
                      <input
                        required
                        maxLength={10}
                        pattern="[A-Za-z][A-Za-z0-9]{0,9}"
                        value={staffIdPrefix}
                        onChange={(event) =>
                          setStaffIdPrefix(event.target.value.toUpperCase())
                        }
                        className="mt-1 block w-36 rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                        style={fieldStyle}
                        placeholder="e.g. KDR"
                      />
                    </label>
                    <label
                      className="block text-xs font-700 uppercase tracking-wider"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Start From #
                      <input
                        required
                        type="number"
                        min={1}
                        max={999999}
                        value={staffNextSequence}
                        onChange={(event) =>
                          setStaffNextSequence(Number(event.target.value))
                        }
                        className="mt-1 block w-36 rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                        style={fieldStyle}
                      />
                    </label>
                    <div className="flex flex-col gap-1">
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded border px-4 py-2 text-sm font-600 disabled:opacity-50"
                        style={{
                          background: "var(--primary)",

                          color: "var(--primary-foreground)",

                          borderColor: "var(--primary)",
                        }}
                      >
                        {saving ? "Applying…" : "Apply to all staff"}
                      </button>
                      <span
                        className="text-xs text-center"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Preview:{" "}
                        <strong style={{ color: "var(--foreground)" }}>
                          {staffIdPrefix || "XX"}-
                          {String(staffNextSequence).padStart(4, "0")}
                        </strong>
                        {staffMembers.length > 0 && (
                          <span>
                            {" "}
                            → {staffIdPrefix || "XX"}-
                            {String(
                              staffNextSequence + staffMembers.length - 1,
                            ).padStart(4, "0")}{" "}
                            ({staffMembers.length} member
                            {staffMembers.length === 1 ? "" : "s"})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <div className="app-table-scroll">
                  <table className="w-full min-w-225 text-sm">
                    <thead>
                      <tr
                        className="border-b"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {[
                          "Staff ID",

                          "Name",

                          "Position",

                          "Line manager",

                          "Branch",

                          "Pay arrangement",

                          "Base salary",

                          "Weekly transport",

                          "Status",

                          "Linked user",

                          "Actions",
                        ].map((heading) => (
                          <th
                            key={heading}
                            className="px-4 py-3 text-left text-xs font-700 uppercase tracking-wide"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {staffMembers.map((member) => (
                        <tr
                          key={member.id}
                          className="border-b last:border-0"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <td
                            className="px-4 py-3 font-600"
                            style={{ color: "var(--foreground)" }}
                          >
                            <div className="flex items-center gap-2">
                              <span>{member.staffId}</span>
                              {staffIdSettings?.canChangeSequence && (
                                <button
                                  type="button"
                                  onClick={() => openEditStaffId(member)}
                                  className="rounded border px-2 py-1 text-xs font-500"
                                  style={{
                                    borderColor: "var(--border)",

                                    color: "var(--muted-foreground)",
                                  }}
                                  aria-label={`Edit staff ID for ${member.name}`}
                                >
                                  Edit ID
                                </button>
                              )}
                            </div>
                          </td>
                          <td
                            className="px-4 py-3"
                            style={{ color: "var(--foreground)" }}
                          >
                            {member.name}
                          </td>
                          <td
                            className="px-4 py-3"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {member.position}
                          </td>
                          <td
                            className="px-4 py-3"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {staffMembers.find(
                              (staff) => staff.id === member.lineManagerStaffId,
                            )?.name ?? "—"}
                          </td>
                          <td
                            className="px-4 py-3"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {staffBranches.find(
                              (branch) => branch.id === member.branchId,
                            )?.name ??
                              (member.branchId
                                ? "Unknown branch"
                                : "Main Branch")}
                          </td>
                          <td
                            className="px-4 py-3 text-xs capitalize"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {member.payType.replace(/_/g, " ")}
                          </td>
                          <td
                            className="px-4 py-3 mono text-xs"
                            style={{ color: "var(--foreground)" }}
                          >
                            {member.baseSalary
                              ? `UGX ${member.baseSalary.toLocaleString("en-UG")}`
                              : "—"}
                          </td>
                          <td
                            className="px-4 py-3 mono text-xs"
                            style={{ color: "var(--foreground)" }}
                          >
                            {member.weeklyTransportAllowance
                              ? `UGX ${member.weeklyTransportAllowance.toLocaleString("en-UG")}/wk`
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="rounded px-2 py-1 text-xs font-600"
                              style={{
                                color:
                                  member.status === "Active"
                                    ? "#10b981"
                                    : member.status === "On Leave"
                                      ? "#f59e0b"
                                      : "#ef4444",

                                background:
                                  member.status === "Active"
                                    ? "#10b98120"
                                    : member.status === "On Leave"
                                      ? "#f59e0b20"
                                      : "#ef444420",
                              }}
                            >
                              {member.status}
                            </span>
                          </td>
                          <td
                            className="px-4 py-3"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {data.users.find(
                              (user) => user.id === member.linkedUserId,
                            )?.email ?? "Not linked"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditStaff(member)}
                                className="rounded border px-3 py-1.5 text-xs font-600"
                                style={{
                                  borderColor: "var(--border)",

                                  color: "var(--foreground)",
                                }}
                              >
                                Edit
                              </button>
                              {canDeleteStaff && (
                                <button
                                  type="button"
                                  disabled={Boolean(deletingStaffId)}
                                  onClick={() => void deleteStaff(member)}
                                  className="rounded border px-3 py-1.5 text-xs font-600 disabled:opacity-50"
                                  style={{
                                    borderColor: "#ef444440",

                                    color: "#ef4444",
                                  }}
                                >
                                  {deletingStaffId === member.id
                                    ? "Deleting…"
                                    : "Delete"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {staffLoading && !staffMembers.length && (
                        <tr>
                          <td
                            colSpan={11}
                            className="px-4 py-10 text-center text-sm"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            Loading staff records…
                          </td>
                        </tr>
                      )}
                      {!staffLoading && !staffMembers.length && (
                        <tr>
                          <td
                            colSpan={11}
                            className="px-4 py-10 text-center text-sm"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            No staff members have been added yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showNewUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeNewUser()
          }}
        >
          <form
            onSubmit={(event) => {
              if (inviteStep !== "details") {
                event.preventDefault()

                return
              }

              void submitUser(event)
            }}
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="mb-5 flex items-start justify-between gap-2">
              <h2
                className="text-lg font-700"
                style={{ color: "var(--foreground)" }}
              >
                {inviteStep === "account-type"
                  ? "Invite company user"
                  : inviteStep === "staff-search"
                    ? "Find staff member"
                    : "Complete account details"}
              </h2>
              <button
                type="button"
                onClick={closeNewUser}
                className="rounded p-1 text-xs leading-none"
                style={{ color: "var(--muted-foreground)" }}
              >
                ✕
              </button>
            </div>

            {inviteStep === "account-type" && (
              <section
                className="space-y-4"
                aria-labelledby="invite-account-type-heading"
              >
                <div>
                  <h3
                    id="invite-account-type-heading"
                    className="text-sm font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    Choose the account type
                  </h3>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Staff accounts link to a registered staff profile. Member
                    accounts do not create or link a staff record.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUserType("staff")

                    setUserName("")

                    setUserPhone("")

                    setUserEmail("")

                    setSelectedExistingStaffId("")

                    setInvitedStaffForm(emptyInvitedStaffForm)

                    setInviteStep("staff-search")
                  }}
                  className="w-full rounded border p-4 text-left"
                  style={{
                    borderColor: "var(--border)",

                    background: "var(--secondary)",
                  }}
                >
                  <span
                    className="block text-sm font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    Staff
                  </span>
                  <span
                    className="mt-1 block text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Search the company staff roster and use the selected
                    person’s saved details.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserType("member")

                    setUserName("")

                    setUserPhone("")

                    setUserEmail("")

                    setSelectedExistingStaffId("")

                    setInvitedStaffForm(emptyInvitedStaffForm)

                    setInviteStep("details")
                  }}
                  className="w-full rounded border p-4 text-left"
                  style={{
                    borderColor: "var(--border)",

                    background: "var(--secondary)",
                  }}
                >
                  <span
                    className="block text-sm font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    Member
                  </span>
                  <span
                    className="mt-1 block text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Create a company user without a linked staff roster record.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={closeNewUser}
                  className="w-full rounded border py-2 text-sm"
                  style={{
                    borderColor: "var(--border)",

                    color: "var(--muted-foreground)",
                  }}
                >
                  Cancel
                </button>
              </section>
            )}

            {inviteStep === "staff-search" && (
              <section
                className="space-y-4"
                aria-labelledby="invite-staff-search-heading"
              >
                <div>
                  <h3
                    id="invite-staff-search-heading"
                    className="text-sm font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    Search for the registered staff member
                  </h3>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Enter at least two characters of their full name. Selecting
                    a result will fill in their staff details.
                  </p>
                </div>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Full name
                  <input
                    autoFocus
                    autoComplete="off"
                    maxLength={200}
                    value={userName}
                    onChange={(event) => setUserName(event.target.value)}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                    style={fieldStyle}
                    placeholder="Start typing a staff member’s name"
                  />
                </label>
                {staffLoadError && (
                  <div
                    role="alert"
                    className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                  >
                    <p>{staffLoadError}</p>
                    <button
                      type="button"
                      disabled={staffLoading}
                      onClick={() => setReloadKey((key) => key + 1)}
                      className="mt-2 underline disabled:opacity-50"
                    >
                      Retry loading staff
                    </button>
                  </div>
                )}
                {staffLoading && (
                  <p
                    className="text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Loading available staff…
                  </p>
                )}
                {staffNameMatches.length > 0 && (
                  <div
                    role="listbox"
                    aria-label="Matching unlinked staff"
                    className="max-h-56 overflow-y-auto rounded border py-1"
                    style={{
                      background: "var(--card)",

                      borderColor: "var(--border)",
                    }}
                  >
                    {staffNameMatches.map((staff) => (
                      <button
                        key={staff.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => selectExistingStaff(staff)}
                        className="block w-full px-3 py-2 text-left hover:bg-black/5"
                      >
                        <span
                          className="block text-sm font-600"
                          style={{ color: "var(--foreground)" }}
                        >
                          {staff.name}
                        </span>
                        <span
                          className="block text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {staff.staffId} · {staff.position} ·{" "}
                          {branches.find(
                            (branch) => branch.id === staff.branchId,
                          )?.name ?? "Company branch"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {userName.trim().length >= 2 &&
                  !staffLoading &&
                  !staffLoadError &&
                  !staffNameMatches.length && (
                    <p
                      className="text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {staffNameCandidates.length
                        ? "Matching staff records exist, but they are inactive or already linked to a company account."
                        : "No staff record matches those name parts. Check the spelling or use Add new staff profile."}
                    </p>
                  )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setInviteStep("account-type")}
                    className="flex-1 rounded border py-2 text-sm"
                    style={{
                      borderColor: "var(--border)",

                      color: "var(--muted-foreground)",
                    }}
                  >
                    Back
                  </button>
                  {!staffLoading &&
                    !staffLoadError &&
                    !staffNameCandidates.length &&
                    !staffNameMatches.length && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedExistingStaffId("")

                          setUserPhone("")

                          setInvitedStaffForm(emptyInvitedStaffForm)

                          setInviteStep("details")
                        }}
                        className="flex-1 rounded border py-2 text-sm"
                        style={{
                          borderColor: "var(--border)",

                          color: "var(--foreground)",
                        }}
                      >
                        Add new staff profile
                      </button>
                    )}
                </div>
              </section>
            )}

            {inviteStep === "details" && (
              <>
                <div
                  className="mb-5 flex rounded border overflow-hidden text-xs font-600"
                  style={{ borderColor: "var(--border)" }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setUserInviteMode("email-link")

                      setError("")
                    }}
                    className="flex-1 px-3 py-2 transition-colors"
                    style={{
                      background:
                        userInviteMode === "email-link"
                          ? "var(--primary)"
                          : "var(--secondary)",

                      color:
                        userInviteMode === "email-link"
                          ? "var(--primary-foreground)"
                          : "var(--muted-foreground)",
                    }}
                  >
                    Send invite link
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUserInviteMode("default-password")

                      setError("")
                    }}
                    className="flex-1 px-3 py-2 transition-colors"
                    style={{
                      background:
                        userInviteMode === "default-password"
                          ? "var(--primary)"
                          : "var(--secondary)",

                      color:
                        userInviteMode === "default-password"
                          ? "var(--primary-foreground)"
                          : "var(--muted-foreground)",
                    }}
                  >
                    Set default password
                  </button>
                </div>

                <div className="space-y-4">
                  {selectedExistingStaff ? (
                    <section
                      className="rounded border p-3"
                      style={{ borderColor: "var(--border)" }}
                      aria-label="Selected staff profile"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p
                            className="text-sm font-600"
                            style={{ color: "var(--foreground)" }}
                          >
                            {selectedExistingStaff.name}
                          </p>
                          <p
                            className="mt-1 text-xs"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {selectedExistingStaff.staffId} ·{" "}
                            {selectedExistingStaff.position ||
                              "Position not set"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedExistingStaffId("")

                            setUserPhone("")

                            setInvitedStaffForm(emptyInvitedStaffForm)

                            setInviteStep("staff-search")
                          }}
                          className="shrink-0 text-xs font-600"
                          style={{ color: "var(--primary)" }}
                        >
                          Change
                        </button>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        {[
                          ["Phone", userPhone.trim() || "Not provided"],

                          [
                            "Branch",

                            branches.find(
                              (branch) =>
                                branch.id === selectedExistingStaff.branchId,
                            )?.name ?? "Company branch",
                          ],

                          [
                            "Line manager",

                            staffMembers.find(
                              (staff) =>
                                staff.id ===
                                selectedExistingStaff.lineManagerStaffId,
                            )?.name ?? "None",
                          ],

                          [
                            "Joined",

                            selectedExistingStaff.dateJoined || "Not provided",
                          ],

                          [
                            "Pay arrangement",

                            selectedExistingStaff.payType.replace(/_/g, " "),
                          ],

                          [
                            "Monthly salary",

                            selectedExistingStaff.baseSalary
                              ? `${selectedExistingStaff.baseSalary}`
                              : "Not applicable",
                          ],

                          [
                            "Weekly transport",

                            selectedExistingStaff.weeklyTransportAllowance
                              ? `${selectedExistingStaff.weeklyTransportAllowance}`
                              : "0",
                          ],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt style={{ color: "var(--muted-foreground)" }}>
                              {label}
                            </dt>
                            <dd
                              className="mt-0.5 font-500"
                              style={{ color: "var(--foreground)" }}
                            >
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ) : (
                    <label
                      className="block text-xs font-700 uppercase tracking-wider"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Full name
                      <input
                        required
                        maxLength={200}
                        value={userName}
                        onChange={(event) => setUserName(event.target.value)}
                        className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                        style={fieldStyle}
                      />
                    </label>
                  )}
                  <label
                    className="block text-xs font-700 uppercase tracking-wider"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Email address
                    <input
                      required
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                      style={fieldStyle}
                    />
                  </label>
                  {(!selectedExistingStaff || !userPhone.trim()) && (
                    <label
                      className="block text-xs font-700 uppercase tracking-wider"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Phone number
                      <input
                        required={userInviteMode === "email-link"}
                        type="tel"
                        maxLength={100}
                        value={userPhone}
                        onChange={(event) => setUserPhone(event.target.value)}
                        className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                        style={fieldStyle}
                      />
                    </label>
                  )}
                  <label
                    className="block text-xs font-700 uppercase tracking-wider"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Role
                    <select
                      required
                      value={userRoleId}
                      onChange={(e) => setUserRoleId(e.target.value)}
                      className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                      style={fieldStyle}
                    >
                      {data.roles

                        .filter(
                          (role) => !isPrimaryAdministratorRole(role.name),
                        )

                        .map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {(!selectedExistingStaff || userType === "member") && (
                    <label
                      className="block text-xs font-700 uppercase tracking-wider"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Branch
                      <select
                        required
                        value={userBranchId}
                        onChange={(e) => {
                          setUserBranchId(e.target.value)

                          setInvitedStaffForm((current) => ({
                            ...current,

                            lineManagerStaffId: "",

                            transportAccountId: "",
                          }))
                        }}
                        className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                        style={fieldStyle}
                      >
                        <option value="" disabled>
                          Select a branch
                        </option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {userType === "staff" && !selectedExistingStaff && (
                    <>
                      <label
                        className="block text-xs font-700 uppercase tracking-wider"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Position
                        <select
                          required
                          value={invitedStaffForm.positionId}
                          onChange={(event) =>
                            setInvitedStaffForm((current) => ({
                              ...current,

                              positionId: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                          style={fieldStyle}
                        >
                          <option value="">Select position</option>
                          {staffPositions

                            .filter((position) => position.is_active)

                            .map((position) => (
                              <option key={position.id} value={position.id}>
                                {position.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label
                        className="block text-xs font-700 uppercase tracking-wider"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Line manager
                        <select
                          value={invitedStaffForm.lineManagerStaffId}
                          disabled={Boolean(selectedExistingStaff)}
                          onChange={(event) =>
                            setInvitedStaffForm((current) => ({
                              ...current,

                              lineManagerStaffId: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                          style={fieldStyle}
                        >
                          <option value="">No line manager</option>
                          {staffMembers

                            .filter(
                              (manager) =>
                                manager.status === "Active" ||
                                manager.id ===
                                  invitedStaffForm.lineManagerStaffId,
                            )

                            .map((manager) => (
                              <option key={manager.id} value={manager.id}>
                                {manager.staffId} — {manager.name} (
                                {manager.position})
                              </option>
                            ))}
                        </select>
                      </label>
                      <label
                        className="block text-xs font-700 uppercase tracking-wider"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Date joined
                        <input
                          required
                          type="date"
                          value={invitedStaffForm.dateJoined}
                          disabled={Boolean(selectedExistingStaff)}
                          onChange={(event) =>
                            setInvitedStaffForm((current) => ({
                              ...current,

                              dateJoined: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                          style={fieldStyle}
                        />
                      </label>
                      <label
                        className="block text-xs font-700 uppercase tracking-wider"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Pay arrangement
                        <select
                          value={invitedStaffForm.payType}
                          disabled={Boolean(selectedExistingStaff)}
                          onChange={(event) => {
                            const payType = event.target.value as StaffPayType

                            setInvitedStaffForm((current) => ({
                              ...current,

                              payType,

                              ...(payType === "payroll"
                                ? {
                                    baseSalary:
                                      current.baseSalary === "0"
                                        ? ""
                                        : current.baseSalary,
                                  }
                                : {
                                    baseSalary: "0",

                                    weeklyTransportAllowance: "0",

                                    transportAccountMode: "fixed",

                                    transportAccountId: "",
                                  }),
                            }))
                          }}
                          className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                          style={fieldStyle}
                        >
                          <option value="payroll">Payroll</option>
                          <option value="project">Project based</option>
                          <option value="no_payroll">No payroll</option>
                        </select>
                      </label>
                      {invitedStaffForm.payType === "payroll" && (
                        <>
                          <label
                            className="block text-xs font-700 uppercase tracking-wider"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            Basic salary per month
                            <input
                              required
                              min="0.01"
                              max="999999999999.99"
                              step="0.01"
                              type="number"
                              value={invitedStaffForm.baseSalary}
                              disabled={Boolean(selectedExistingStaff)}
                              onChange={(event) =>
                                setInvitedStaffForm((current) => ({
                                  ...current,

                                  baseSalary: event.target.value,
                                }))
                              }
                              className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                              style={fieldStyle}
                            />
                          </label>
                          <label
                            className="block text-xs font-700 uppercase tracking-wider"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            Transport allowance per week
                            <input
                              min="0"
                              max="999999999999.99"
                              step="0.01"
                              type="number"
                              value={invitedStaffForm.weeklyTransportAllowance}
                              disabled={Boolean(selectedExistingStaff)}
                              onChange={(event) =>
                                setInvitedStaffForm((current) => ({
                                  ...current,

                                  weeklyTransportAllowance: event.target.value,

                                  transportAccountMode:
                                    Number(event.target.value) > 0
                                      ? current.transportAccountMode
                                      : "fixed",

                                  transportAccountId:
                                    Number(event.target.value) > 0
                                      ? current.transportAccountId
                                      : "",
                                }))
                              }
                              className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                              style={fieldStyle}
                            />
                          </label>
                          {Number(invitedStaffForm.weeklyTransportAllowance) >
                            0 && (
                            <>
                              <label
                                className="block text-xs font-700 uppercase tracking-wider"
                                style={{ color: "var(--muted-foreground)" }}
                              >
                                Transport allowance account selection
                                <select
                                  value={invitedStaffForm.transportAccountMode}
                                  disabled={Boolean(selectedExistingStaff)}
                                  onChange={(event) =>
                                    setInvitedStaffForm((current) => ({
                                      ...current,

                                      transportAccountMode: event.target
                                        .value as TransportAccountMode,

                                      transportAccountId:
                                        event.target.value === "fixed"
                                          ? current.transportAccountId
                                          : "",
                                    }))
                                  }
                                  className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                                  style={fieldStyle}
                                >
                                  <option value="fixed">
                                    Fixed account (selected now)
                                  </option>
                                  <option value="random">
                                    Random account (Finance selects at payout)
                                  </option>
                                </select>
                              </label>
                              {invitedStaffForm.transportAccountMode ===
                              "fixed" ? (
                                staffAccounts.length ? (
                                  <label
                                    className="block text-xs font-700 uppercase tracking-wider"
                                    style={{
                                      color: "var(--muted-foreground)",
                                    }}
                                  >
                                    Fixed funding account
                                    <SearchableSelect
                                      required
                                      ariaLabel="Choose fixed account funding weekly transport allowance"
                                      inlineOptions
                                      value={
                                        invitedStaffForm.transportAccountId
                                      }
                                      disabled={Boolean(selectedExistingStaff)}
                                      onChange={(transportAccountId) =>
                                        setInvitedStaffForm((current) => ({
                                          ...current,

                                          transportAccountId,
                                        }))
                                      }
                                      options={staffAccounts.map((account) => ({
                                        value: account.id,

                                        label: account.name,

                                        description: `${account.account_type.replace(/_/g, " ")} · ${account.account_number}`,

                                        searchText: account.account_number,
                                      }))}
                                      placeholder="Select fixed funding account"
                                      className="mt-1 normal-case tracking-normal"
                                    />
                                  </label>
                                ) : (
                                  <p
                                    role="alert"
                                    className="text-sm text-red-500"
                                  >
                                    Add an active company account before setting
                                    a fixed transport allowance.
                                  </p>
                                )
                              ) : (
                                <p
                                  className="text-xs md:col-span-2"
                                  style={{
                                    color: "var(--muted-foreground)",
                                  }}
                                >
                                  Finance will select an active company account
                                  when this allowance is paid.
                                </p>
                              )}
                              <p
                                className="text-xs md:col-span-2"
                                style={{
                                  color: "var(--muted-foreground)",
                                }}
                              >
                                Estimated monthly benefit (
                                {currentPayrollWorkingDays} working days): UGX{" "}
                                {invitedMonthlyTransportBenefit.toLocaleString(
                                  "en-UG",

                                  {
                                    minimumFractionDigits: 2,

                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </p>
                            </>
                          )}
                        </>
                      )}
                      {staffLoading && (
                        <p
                          className="text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Loading staff and funding accounts…
                        </p>
                      )}
                    </>
                  )}

                  {userInviteMode === "default-password" && (
                    <label
                      className="block text-xs font-700 uppercase tracking-wider"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Default password
                      <div className="relative mt-1">
                        <input
                          required
                          minLength={8}
                          type={userShowPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={userDefaultPassword}
                          onChange={(e) =>
                            setUserDefaultPassword(e.target.value)
                          }
                          className="w-full rounded border px-3 py-2 pr-10 text-sm font-normal normal-case tracking-normal outline-none"
                          style={fieldStyle}
                          placeholder="Min. 8 characters"
                        />
                        <button
                          type="button"
                          aria-label={
                            userShowPassword ? "Hide password" : "Show password"
                          }
                          onClick={() => setUserShowPassword((v) => !v)}
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {userShowPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </label>
                  )}
                </div>

                <p
                  className="mt-4 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {userInviteMode === "email-link"
                    ? "An invitation email will be sent. The user sets their own password from the link."
                    : "The user is created immediately and must change this password when they first log in."}
                </p>

                {error && (
                  <div
                    role="alert"
                    className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                  >
                    {error}
                  </div>
                )}

                <div className="mt-5 flex gap-3">
                  <button
                    type="submit"
                    disabled={
                      saving ||
                      (userType === "staff" &&
                        !selectedExistingStaff &&
                        (staffLoading ||
                          (Number(invitedStaffForm.weeklyTransportAllowance) >
                            0 &&
                            invitedStaffForm.transportAccountMode === "fixed" &&
                            staffAccounts.length === 0)))
                    }
                    className="flex-1 rounded py-2 text-sm font-600 disabled:opacity-50"
                    style={{
                      background: "var(--primary)",

                      color: "var(--primary-foreground)",
                    }}
                  >
                    {saving
                      ? "Saving…"
                      : userInviteMode === "email-link"
                        ? "Send invitation"
                        : "Create user"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (userType === "staff") {
                        if (selectedExistingStaff) {
                          setSelectedExistingStaffId("")

                          setUserPhone("")

                          setInvitedStaffForm(emptyInvitedStaffForm)
                        }

                        setInviteStep("staff-search")
                      } else {
                        setInviteStep("account-type")
                      }
                    }}
                    className="flex-1 rounded border py-2 text-sm"
                    style={{
                      borderColor: "var(--border)",

                      color: "var(--muted-foreground)",
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={closeNewUser}
                    className="flex-1 rounded border py-2 text-sm"
                    style={{
                      borderColor: "var(--border)",

                      color: "var(--muted-foreground)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {(editingUserType || editUserLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setEditingUserType(null)
          }}
        >
          {editUserLoading || !editingUserType ? (
            <div
              className="rounded border p-6 text-sm"
              style={{
                background: "var(--card)",

                borderColor: "var(--border)",

                color: "var(--muted-foreground)",
              }}
            >
              Loading user and staff details…
            </div>
          ) : (
            <form
              onSubmit={submitUserType}
              className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded border p-6"
              style={{
                background: "var(--card)",

                borderColor: "var(--border)",
              }}
            >
              <h2
                className="mb-1 text-lg font-700"
                style={{ color: "var(--foreground)" }}
              >
                Edit user details
              </h2>
              <p
                className="mb-5 text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                Update account access and linked staff details. Private HR
                information and passwords are not changed here.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Full name
                  <input
                    required
                    maxLength={200}
                    value={editUserForm.name}
                    onChange={(event) =>
                      setEditUserForm((form) => ({
                        ...form,

                        name: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
                    style={fieldStyle}
                  />
                </label>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Phone
                  <input
                    maxLength={100}
                    value={editUserForm.phone}
                    onChange={(event) =>
                      setEditUserForm((form) => ({
                        ...form,

                        phone: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
                    style={fieldStyle}
                  />
                </label>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Login email
                  <input
                    required
                    type="email"
                    maxLength={200}
                    value={editUserForm.email}
                    onChange={(event) =>
                      setEditUserForm((form) => ({
                        ...form,

                        email: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
                    style={fieldStyle}
                  />
                </label>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Role
                  <select
                    required
                    value={editUserForm.roleId}
                    onChange={(event) =>
                      setEditUserForm((form) => ({
                        ...form,

                        roleId: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
                    style={fieldStyle}
                  >
                    <option value="">Select role</option>
                    {data.roles

                      .filter((role) => !isPrimaryAdministratorRole(role.name))

                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Branch
                  <select
                    required
                    value={editUserForm.branchId}
                    onChange={(event) =>
                      setEditUserForm((form) => ({
                        ...form,

                        branchId: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
                    style={fieldStyle}
                  >
                    <option value="">Select branch</option>
                    {staffBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Account status
                  <select
                    value={editUserForm.status}
                    onChange={(event) =>
                      setEditUserForm((form) => ({
                        ...form,

                        status: event.target.value as UserEditForm["status"],
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
                    style={fieldStyle}
                  >
                    {editUserForm.status === "invited" && (
                      <option value="invited" disabled>
                        Pending verification
                      </option>
                    )}
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  User type
                  <select
                    value={editUserForm.userType}
                    onChange={(event) =>
                      setEditUserForm((form) => ({
                        ...form,

                        userType: event.target
                          .value as UserEditForm["userType"],
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
                    style={fieldStyle}
                  >
                    <option value="member">Member — Users table only</option>
                    <option value="staff" disabled={!editingUserStaff}>
                      {editingUserStaff
                        ? "Staff — Staff roster and HR"
                        : "Staff — Add this user from the Staff tab"}
                    </option>
                  </select>
                </label>
              </div>

              {editUserForm.userType === "staff" && (
                <p
                  className="mt-4 rounded border p-3 text-xs"
                  style={{
                    borderColor: "var(--border)",

                    color: "var(--muted-foreground)",
                  }}
                >
                  Staff and compensation details are preserved. Edit them from
                  the Staff tab.
                </p>
              )}

              {editingUserType.userType === "staff" &&
                editUserForm.userType === "member" && (
                  <p
                    className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600"
                    role="status"
                  >
                    The staff record will be unlinked and marked inactive.
                    Historical HR and payroll records are retained.
                  </p>
                )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditingUserType(null)}
                  className="rounded border px-4 py-2 text-sm disabled:opacity-50"
                  style={{
                    borderColor: "var(--border)",

                    color: "var(--muted-foreground)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    saving ||
                    !editUserForm.name.trim() ||
                    !editUserForm.email.trim() ||
                    !editUserForm.roleId ||
                    !editUserForm.branchId ||
                    (editUserForm.userType === "staff" &&
                      (!editUserForm.positionId ||
                        !editUserForm.dateJoined ||
                        (editUserForm.payType === "payroll" &&
                          Number(editUserForm.baseSalary) <= 0) ||
                        (Number(editUserForm.weeklyTransportAllowance) > 0 &&
                          staffAccounts.length === 0)))
                  }
                  className="rounded px-4 py-2 text-sm font-600 disabled:opacity-50"
                  style={{
                    background: "var(--primary)",

                    color: "var(--primary-foreground)",
                  }}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {showNewRole && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowNewRole(false)

              setError("")
            }
          }}
        >
          <form
            onSubmit={submitRole}
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div
              className="flex shrink-0 items-center justify-between border-b px-6 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h2
                  className="text-base font-700"
                  style={{ color: "var(--foreground)" }}
                >
                  Create company role
                </h2>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Only the permissions you select below will be assigned.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setShowNewRole(false)

                  setError("")
                }}
                className="rounded p-1 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {error && (
                <div
                  role="alert"
                  className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                >
                  {error}
                </div>
              )}
              <div>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Role name
                </label>
                <input
                  required
                  maxLength={100}
                  value={roleName}
                  onChange={(event) => {
                    const nextName = event.target.value

                    setRoleName(nextName)

                    setSelectedPermissions((current) =>
                      current.filter(
                        (permission) =>
                          (permission !== "agent_finance.view" ||
                            isRecruitmentAgentRole(nextName)) &&
                          (!isRecruitmentAgentRole(nextName) ||
                            !isRecruitmentAgentRestrictedPermission(
                              permission,
                            )),
                      ),
                    )
                  }}
                  className="mt-1 w-full rounded border px-3 py-2.5 text-sm outline-none"
                  style={fieldStyle}
                  placeholder="e.g. Branch Supervisor"
                />
              </div>
              <div>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Duties and responsibilities
                </label>
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  value={roleDescription}
                  onChange={(event) => setRoleDescription(event.target.value)}
                  className="mt-1 w-full resize-y rounded border px-3 py-2.5 text-sm outline-none"
                  style={fieldStyle}
                  placeholder="Describe what this role is responsible for."
                />
              </div>
              <RolePermissionsEditor
                permissions={data.permissions.filter(
                  (permission) =>
                    (permission.code !== "agent_finance.view" ||
                      isRecruitmentAgentRole(roleName)) &&
                    (!isRecruitmentAgentRole(roleName) ||
                      !isRecruitmentAgentRestrictedPermission(permission.code)),
                )}
                selectedPermissions={selectedPermissions}
                onChange={setSelectedPermissions}
              />
            </div>

            <div
              className="flex shrink-0 gap-3 border-t px-6 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",

                  color: "var(--primary-foreground)",
                }}
              >
                {saving ? "Creating…" : "Create role"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewRole(false)

                  setError("")
                }}
                className="rounded border px-5 py-2.5 text-sm font-600"
                style={{
                  borderColor: "var(--border)",

                  color: "var(--foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showEditRole && editingRole && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowEditRole(false)

              setError("")
            }
          }}
        >
          <form
            onSubmit={submitEditRole}
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            {}
            <div
              className="flex shrink-0 items-center justify-between border-b px-6 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h2
                  className="text-base font-700"
                  style={{ color: "var(--foreground)" }}
                >
                  Edit role
                </h2>
                {editingRole.is_system_default && (
                  <p
                    className="mt-0.5 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    System default role — name changes are applied immediately
                    to all users with this role.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditRole(false)

                  setError("")
                }}
                className="rounded p-1 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                ✕
              </button>
            </div>

            {}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {error && (
                <div
                  role="alert"
                  className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Role name{" "}
                  {isPrimaryAdministratorRole(editingRole.name) && (
                    <span
                      className="ml-1 text-xs normal-case tracking-normal"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      (protected — cannot be renamed)
                    </span>
                  )}
                </label>
                <input
                  required
                  maxLength={100}
                  value={roleEditName}
                  onChange={(e) => setRoleEditName(e.target.value)}
                  disabled={isPrimaryAdministratorRole(editingRole.name)}
                  className="mt-1 w-full rounded border px-3 py-2.5 text-sm outline-none disabled:opacity-50"
                  style={fieldStyle}
                  placeholder="e.g. Branch Supervisor"
                />
              </div>

              <div>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Duties and responsibilities
                </label>
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  value={roleEditDescription}
                  onChange={(e) => setRoleEditDescription(e.target.value)}
                  className="mt-1 w-full resize-y rounded border px-3 py-2.5 text-sm outline-none"
                  style={fieldStyle}
                  placeholder="Describe what this role is responsible for."
                />
              </div>

              <p
                className="text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                Only the permissions you select below will be assigned.
              </p>
              <section
                className="space-y-3 rounded border p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div>
                  <h3
                    className="text-xs font-700 uppercase tracking-wider"
                    style={{ color: "var(--foreground)" }}
                  >
                    Access settings
                  </h3>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    These scope settings are enforced by the API and database
                    policies.
                  </p>
                </div>
                <label
                  className="block text-xs font-600"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Candidate pipeline
                  <select
                    value={roleEditAccessSettings.candidate_scope}
                    disabled={isRecruitmentAgentRole(editingRole.name)}
                    onChange={(event) =>
                      setRoleEditAccessSettings((current) => ({
                        ...current,

                        candidate_scope: event.target
                          .value as RoleAccessSettings["candidate_scope"],
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-70"
                    style={fieldStyle}
                  >
                    <option value="company">
                      All candidates in accessible branches
                    </option>
                    <option value="assigned">
                      Candidates assigned to this user only
                    </option>
                  </select>
                  {isRecruitmentAgentRole(editingRole.name) && (
                    <span className="mt-1 block font-normal">
                      Recruitment Agents can only see candidates assigned to
                      them.
                    </span>
                  )}
                </label>
                <label
                  className="block text-xs font-600"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Candidate inquiries
                  <select
                    value={roleEditAccessSettings.inquiry_scope}
                    onChange={(event) =>
                      setRoleEditAccessSettings((current) => ({
                        ...current,

                        inquiry_scope: event.target
                          .value as RoleAccessSettings["inquiry_scope"],
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
                    style={fieldStyle}
                  >
                    <option value="company">
                      All inquiries in accessible branches
                    </option>
                    <option value="created">
                      Inquiries created by this user only
                    </option>
                  </select>
                </label>
                {([
                  [
                    "candidate_registration",

                    "Allow registering candidates from inquiries",
                  ],

                  [
                    "agent_visa_finance",

                    "Allow agent-specific invoices and candidate receipts",
                  ],
                ] as const)

                  .filter(
                    ([key]) =>
                      key !== "agent_visa_finance" ||
                      isRecruitmentAgentRole(editingRole.name),
                  )

                  .map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-start gap-2 text-xs"
                      style={{ color: "var(--foreground)" }}
                    >
                      <input
                        type="checkbox"
                        checked={roleEditAccessSettings[key]}
                        onChange={(event) =>
                          setRoleEditAccessSettings((current) => ({
                            ...current,

                            [key]: event.target.checked,
                          }))
                        }
                        className="mt-0.5"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
              </section>
              <RolePermissionsEditor
                permissions={data.permissions.filter(
                  (permission) =>
                    (permission.code !== "agent_finance.view" ||
                      isRecruitmentAgentRole(editingRole.name)) &&
                    (!isRecruitmentAgentRole(editingRole.name) ||
                      !isRecruitmentAgentRestrictedPermission(permission.code)),
                )}
                selectedPermissions={roleEditPermissions}
                onChange={setRoleEditPermissions}
              />
            </div>

            {}
            <div
              className="flex shrink-0 gap-3 border-t px-6 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",

                  color: "var(--primary-foreground)",
                }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEditRole(false)

                  setError("")
                }}
                className="rounded border px-5 py-2.5 text-sm font-600"
                style={{
                  borderColor: "var(--border)",

                  color: "var(--foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {editingStaffNumber && staffIdSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setEditingStaffNumber(null)
          }}
        >
          <form
            onSubmit={submitIndividualStaffId}
            className="w-full max-w-md rounded border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2
              className="mb-2 text-lg font-700"
              style={{ color: "var(--foreground)" }}
            >
              Edit staff ID
            </h2>
            <p
              className="mb-5 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              Change the ID number for {editingStaffNumber.name}. The configured
              prefix remains {staffIdSettings.prefix}, and other staff IDs will
              not change.
            </p>
            <label
              className="block text-xs font-700 uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Staff ID number
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="rounded border px-3 py-2 text-sm"
                  style={{
                    background: "var(--secondary)",

                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                >
                  {staffIdSettings.prefix}-
                </span>
                <input
                  autoFocus
                  required
                  type="number"
                  min={1}
                  max={999998}
                  step={1}
                  value={staffIdNumber}
                  onChange={(event) => setStaffIdNumber(event.target.value)}
                  className="w-full rounded border px-3 py-2 text-sm outline-none"
                  style={fieldStyle}
                />
              </div>
            </label>
            <p
              className="mt-2 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              New ID preview:{" "}
              <strong style={{ color: "var(--foreground)" }}>
                {staffIdSettings.prefix}-
                {String(Number(staffIdNumber) || 0).padStart(4, "0")}
              </strong>
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingStaffNumber(null)}
                className="rounded border px-4 py-2 text-sm font-600 disabled:opacity-50"
                style={{
                  borderColor: "var(--border)",

                  color: "var(--foreground)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !staffIdNumber}
                className="rounded border px-4 py-2 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",

                  color: "var(--primary-foreground)",

                  borderColor: "var(--primary)",
                }}
              >
                {saving ? "Saving…" : "Save staff ID"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showStaffForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitStaff}
            className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2
              className="mb-5 text-lg font-700"
              style={{ color: "var(--foreground)" }}
            >
              {editingStaffId
                ? `Edit ${staffMembers.find((member) => member.id === editingStaffId)?.name ?? "staff member"}`
                : "Add staff member"}
            </h2>
            {editingStaffId ? (
              <div
                className="mb-4 text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                Staff ID:{" "}
                {
                  staffMembers.find((member) => member.id === editingStaffId)
                    ?.staffId
                }
              </div>
            ) : (
              <div
                className="mb-4 text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                Assigned staff ID: {staffIdSettings?.prefix ?? "STAFF"}-
                {String(staffIdSettings?.nextSequence ?? 1).padStart(4, "0")}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Full name
                <input
                  required
                  maxLength={200}
                  value={staffForm.name}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,

                      name: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                  style={fieldStyle}
                  placeholder="Name"
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Position
                <select
                  required
                  value={staffForm.positionId}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,

                      positionId: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                  style={fieldStyle}
                >
                  <option value="">Select position</option>
                  {staffPositions

                    .filter(
                      (position) =>
                        position.is_active ||
                        position.id === staffForm.positionId,
                    )

                    .map((position) => (
                      <option key={position.id} value={position.id}>
                        {position.name}
                        {position.is_active ? "" : " (Inactive — current)"}
                      </option>
                    ))}
                </select>
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Line manager
                <select
                  value={staffForm.lineManagerStaffId}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,

                      lineManagerStaffId: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                  style={fieldStyle}
                >
                  <option value="">No line manager</option>
                  {staffMembers

                    .filter(
                      (manager) =>
                        manager.id !== editingStaffId &&
                        manager.status === "Active",
                    )

                    .map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.staffId} — {manager.name} ({manager.position})
                      </option>
                    ))}
                </select>
              </label>
              {staffBranchSelectionRequired && (
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Working branch
                  <select
                    required
                    value={staffForm.branchId}
                    onChange={(event) =>
                      setStaffForm((current) => ({
                        ...current,

                        branchId: event.target.value,

                        lineManagerStaffId: "",
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                    style={fieldStyle}
                  >
                    <option value="">Select a branch</option>
                    {staffBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                        {branch.code ? ` (${branch.code})` : ""}
                      </option>
                    ))}
                  </select>
                  {staffBranches.length === 0 && (
                    <span className="mt-1 block normal-case tracking-normal">
                      Create an active branch before adding staff.
                    </span>
                  )}
                </label>
              )}
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Date joined
                <input
                  required
                  type="date"
                  value={staffForm.dateJoined}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,

                      dateJoined: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Pay arrangement
                <select
                  value={staffForm.payType}
                  onChange={(event) => {
                    const payType = event.target.value as StaffPayType

                    setStaffForm((current) => ({
                      ...current,

                      payType,

                      ...(payType === "payroll"
                        ? {
                            baseSalary:
                              current.baseSalary === "0"
                                ? ""
                                : current.baseSalary,
                          }
                        : {
                            baseSalary: "0",

                            weeklyTransportAllowance: "0",

                            transportAccountMode: "fixed",

                            transportAccountId: "",
                          }),
                    }))
                  }}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                  style={fieldStyle}
                >
                  <option value="payroll">Payroll</option>
                  <option value="project">Project based</option>
                  <option value="no_payroll">No payroll</option>
                </select>
              </label>
              {staffForm.payType === "payroll" && (
                <>
                  <label
                    className="block text-xs font-700 uppercase tracking-wider"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Basic salary per month
                    <input
                      required
                      min="0.01"
                      max="999999999999.99"
                      step="0.01"
                      type="number"
                      value={staffForm.baseSalary}
                      onChange={(event) =>
                        setStaffForm((current) => ({
                          ...current,

                          baseSalary: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                      style={fieldStyle}
                    />
                  </label>
                  <label
                    className="block text-xs font-700 uppercase tracking-wider"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Transport allowance per week
                    <input
                      min="0"
                      max="999999999999.99"
                      step="0.01"
                      type="number"
                      value={staffForm.weeklyTransportAllowance}
                      onChange={(event) =>
                        setStaffForm((current) => ({
                          ...current,

                          weeklyTransportAllowance: event.target.value,

                          transportAccountMode:
                            Number(event.target.value) > 0
                              ? current.transportAccountMode
                              : "fixed",

                          transportAccountId:
                            Number(event.target.value) > 0
                              ? current.transportAccountId
                              : "",
                        }))
                      }
                      className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                      style={fieldStyle}
                    />
                  </label>
                  {Number(staffForm.weeklyTransportAllowance) > 0 && (
                    <>
                      <p
                        className="text-xs md:col-span-2"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Estimated monthly payroll benefit (
                        {currentPayrollWorkingDays} working days): UGX{" "}
                        {staffMonthlyTransportBenefit.toLocaleString("en-UG", {
                          minimumFractionDigits: 2,

                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <label
                        className="block text-xs font-700 uppercase tracking-wider md:col-span-2"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Transport allowance account selection
                        <select
                          value={staffForm.transportAccountMode}
                          onChange={(event) =>
                            setStaffForm((current) => ({
                              ...current,

                              transportAccountMode: event.target
                                .value as TransportAccountMode,

                              transportAccountId:
                                event.target.value === "fixed"
                                  ? current.transportAccountId
                                  : "",
                            }))
                          }
                          className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                          style={fieldStyle}
                        >
                          <option value="fixed">
                            Fixed account (selected now)
                          </option>
                          <option value="random">
                            Random account (Finance selects at payout)
                          </option>
                        </select>
                      </label>
                      {staffForm.transportAccountMode === "fixed" ? (
                        staffAccounts.length ? (
                          <label
                            className="block text-xs font-700 uppercase tracking-wider md:col-span-2"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            Fixed funding account
                            <SearchableSelect
                              required
                              ariaLabel="Choose fixed account funding weekly transport allowance"
                              inlineOptions
                              value={staffForm.transportAccountId}
                              onChange={(transportAccountId) =>
                                setStaffForm((current) => ({
                                  ...current,

                                  transportAccountId,
                                }))
                              }
                              options={staffAccounts.map((account) => ({
                                value: account.id,

                                label: account.name,

                                description: `${account.account_type.replace(/_/g, " ")} · ${account.account_number}`,

                                searchText: account.account_number,
                              }))}
                              placeholder="Select fixed funding account"
                              className="mt-1 normal-case tracking-normal"
                            />
                          </label>
                        ) : (
                          <p role="alert" className="text-sm text-red-500">
                            Add an active company account before setting a fixed
                            transport allowance.
                          </p>
                        )
                      ) : (
                        <p
                          className="text-xs md:col-span-2"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Finance will select an active company account when
                          this allowance is paid.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Linked user
                <SearchableSelect
                  ariaLabel="Search active company user"
                  value={staffForm.linkedUserId}
                  onChange={(linkedUserId) =>
                    setStaffForm((current) => ({ ...current, linkedUserId }))
                  }
                  options={data.users

                    .filter(
                      (user) =>
                        user.status === "active" &&
                        (!staffMembers.some(
                          (member) => member.linkedUserId === user.id,
                        ) ||
                          user.id === staffForm.linkedUserId),
                    )

                    .map((user) => ({
                      value: user.id,

                      label: user.name,

                      description: user.email,

                      searchText: `${user.email} ${user.role}`,
                    }))}
                  placeholder="Type a name or email"
                  className="mt-1 normal-case tracking-normal"
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Status
                <select
                  value={staffForm.status}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,

                      status: event.target.value as StaffRecord["status"],
                    }))
                  }
                  className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                  style={fieldStyle}
                >
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={
                  saving ||
                  (!editingStaffId &&
                    staffBranchSelectionRequired &&
                    staffBranches.length === 0) ||
                  (Number(staffForm.weeklyTransportAllowance) > 0 &&
                    staffForm.transportAccountMode === "fixed" &&
                    staffAccounts.length === 0)
                }
                className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50"
                style={{
                  background: "var(--primary)",

                  color: "var(--primary-foreground)",
                }}
              >
                {saving
                  ? "Saving…"
                  : editingStaffId
                    ? "Save changes"
                    : "Save staff"}
              </button>
              <button
                type="button"
                onClick={() => setShowStaffForm(false)}
                className="flex-1 rounded border py-2.5 text-sm"
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
    </div>
  )
}

const MODULES = [
  "Candidates",

  "Candidate Profiles",

  "Attachments",

  "Finance",

  "Income",

  "Expenses",

  "Payments",

  "Paychecks",

  "Passport Custody",

  "AI Tools",

  "Reports",

  "Users",

  "Settings",
] as const

const PERMS = ["View", "Create", "Edit", "Delete", "Approve", "Export"] as const

const roles = [
  {
    id: 1,

    name: "Primary Administrator",

    color: "#f59e0b",

    users: 1,

    custom: false,
  },

  {
    id: 2,

    name: "Recruitment Manager",

    color: "#6366f1",

    users: 2,

    custom: false,
  },

  {
    id: 3,

    name: "Recruitment Agent",

    color: "#3b82f6",

    users: 4,

    custom: false,
  },

  { id: 4, name: "Finance Manager", color: "#10b981", users: 1, custom: false },

  { id: 5, name: "Finance Officer", color: "#8b5cf6", users: 2, custom: false },

  {
    id: 6,

    name: "Document Officer",

    color: "#14b8a6",

    users: 1,

    custom: false,
  },

  { id: 7, name: "Medical Officer", color: "#ec4899", users: 1, custom: false },

  { id: 8, name: "Viewer", color: "#6b7280", users: 3, custom: false },

  {
    id: 9,

    name: "Custom: Branch Lead",

    color: "#f97316",

    users: 2,

    custom: true,
  },
]

const users = [
  {
    id: 1,

    name: "Aisha Khan",

    email: "aisha@kilaxrecruit.com",

    role: "Primary Administrator",

    branch: "HQ",

    status: "Active",

    lastLogin: "Aug 26, 2026",
  },

  {
    id: 2,

    name: "Director Vicent",

    email: "vicent@kilaxrecruit.com",

    role: "Recruitment Manager",

    branch: "Kampala",

    status: "Active",

    lastLogin: "Aug 26, 2026",
  },

  {
    id: 3,

    name: "Asiimwe David",

    email: "david@kilaxrecruit.com",

    role: "Recruitment Agent",

    branch: "Masaka",

    status: "Active",

    lastLogin: "Aug 25, 2026",
  },

  {
    id: 4,

    name: "Fatuma Nakirya",

    email: "fatuma@kilaxrecruit.com",

    role: "Recruitment Agent",

    branch: "Mbarara",

    status: "Active",

    lastLogin: "Aug 24, 2026",
  },

  {
    id: 5,

    name: "Grace Acen",

    email: "grace@kilaxrecruit.com",

    role: "Finance Officer",

    branch: "HQ",

    status: "Active",

    lastLogin: "Aug 26, 2026",
  },

  {
    id: 6,

    name: "Peter Mukasa",

    email: "peter@kilaxrecruit.com",

    role: "Recruitment Agent",

    branch: "Gulu",

    status: "Inactive",

    lastLogin: "Aug 10, 2026",
  },

  {
    id: 7,

    name: "Sarah Nakigozi",

    email: "sarah@kilaxrecruit.com",

    role: "Document Officer",

    branch: "HQ",

    status: "Active",

    lastLogin: "Aug 23, 2026",
  },
]

const defaultPerms: Record<string, Record<string, boolean>> =
  Object.fromEntries(
    MODULES.map((m) => [
      m,

      Object.fromEntries(PERMS.map((p) => [p, p === "View"])),
    ]),
  )

const roleColor: Record<string, string> = {
  "Primary Administrator": "#f59e0b",

  "Recruitment Manager": "#6366f1",

  "Recruitment Agent": "#3b82f6",

  "Finance Manager": "#10b981",

  "Finance Officer": "#8b5cf6",

  "Document Officer": "#14b8a6",

  "Medical Officer": "#ec4899",

  Viewer: "#6b7280",

  "Custom: Branch Lead": "#f97316",
}

function LegacyUsersRoles() {
  const [tab, setTab] = useState<"users" | "roles">("users")

  const [selectedRole, setSelectedRole] = useState<typeof roles[0] | null>(null)

  const [perms, setPerms] = useState(defaultPerms)

  const [showNewUser, setShowNewUser] = useState(false)

  const [showNewRole, setShowNewRole] = useState(false)

  const togglePerm = (module: string, perm: string) => {
    setPerms((prev) => ({
      ...prev,

      [module]: { ...prev[module], [perm]: !prev[module]?.[perm] },
    }))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="px-6 py-4 border-b flex items-center justify-between shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <h1
            className="text-xl font-700"
            style={{ color: "var(--foreground)" }}
          >
            Users & Roles
          </h1>
          <p
            className="text-sm mono mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            Manage system access and permissions
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "users" && (
            <button
              onClick={() => setShowNewUser(true)}
              className="px-4 py-1.5 text-sm font-600 rounded"
              style={{
                background: "var(--primary)",

                color: "var(--primary-foreground)",
              }}
            >
              + New User
            </button>
          )}
          {tab === "roles" && (
            <button
              onClick={() => setShowNewRole(true)}
              className="px-4 py-1.5 text-sm font-600 rounded"
              style={{
                background: "var(--primary)",

                color: "var(--primary-foreground)",
              }}
            >
              + New Role
            </button>
          )}
        </div>
      </div>

      <div
        className="flex border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        {(["users", "roles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-3 text-sm font-600 capitalize"
            style={{
              color: tab === t ? "var(--primary)" : "var(--muted-foreground)",

              borderBottom:
                tab === t
                  ? "2px solid var(--primary)"
                  : "2px solid transparent",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === "users" && (
          <div
            className="rounded border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="app-table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {[
                      "Name",

                      "Email",

                      "Role",

                      "Branch",

                      "Status",

                      "Last Login",

                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700"
                            style={{
                              background:
                                (roleColor[u.role] || "#6b7280") + "22",

                              color: roleColor[u.role] || "#6b7280",
                            }}
                          >
                            {u.name

                              .split(" ")

                              .map((n) => n[0])

                              .join("")

                              .slice(0, 2)}
                          </div>
                          <span
                            className="font-600"
                            style={{ color: "var(--foreground)" }}
                          >
                            {u.name}
                          </span>
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {u.email}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-600 px-2 py-0.5 rounded"
                          style={{
                            color: roleColor[u.role] || "#6b7280",

                            background: (roleColor[u.role] || "#6b7280") + "20",
                          }}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--foreground)" }}
                      >
                        {u.branch}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="mono text-xs font-600 px-1.5 py-0.5 rounded"
                          style={{
                            color:
                              u.status === "Active" ? "#10b981" : "#ef4444",

                            background:
                              u.status === "Active" ? "#10b98120" : "#ef444420",
                          }}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 mono text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {u.lastLogin}
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        <button
                          className="text-xs px-2 py-1 rounded border"
                          style={{
                            borderColor: "var(--border)",

                            color: "var(--muted-foreground)",
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-xs px-2 py-1 rounded border"
                          style={{ borderColor: "#ef444430", color: "#ef4444" }}
                        >
                          {u.status === "Active" ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "roles" && (
          <div className="users-roles-layout grid gap-5">
            {}
            <div className="space-y-1.5">
              <div
                className="text-xs font-700 uppercase tracking-wider mb-3"
                style={{ color: "var(--muted-foreground)" }}
              >
                Roles
              </div>
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRole(r)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded border text-left"
                  style={{
                    background:
                      selectedRole?.id === r.id
                        ? "var(--secondary)"
                        : "var(--card)",

                    borderColor:
                      selectedRole?.id === r.id ? r.color : "var(--border)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: r.color }}
                    />
                    <span
                      className="text-sm font-600"
                      style={{ color: "var(--foreground)" }}
                    >
                      {r.name}
                    </span>
                    {r.custom && (
                      <span
                        className="mono text-xs px-1 py-0.5 rounded"
                        style={{
                          background: "#f97316" + "20",

                          color: "#f97316",
                        }}
                      >
                        CUSTOM
                      </span>
                    )}
                  </div>
                  <span
                    className="mono text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {r.users}u
                  </span>
                </button>
              ))}
            </div>

            {}
            {selectedRole ? (
              <div
                className="rounded border overflow-hidden"
                style={{
                  background: "var(--card)",

                  borderColor: "var(--border)",
                }}
              >
                <div
                  className="px-5 py-4 border-b flex items-center justify-between"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ background: selectedRole.color }}
                    />
                    <h3
                      className="font-700 text-sm"
                      style={{ color: "var(--foreground)" }}
                    >
                      {selectedRole.name}
                    </h3>
                    <span
                      className="mono text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {selectedRole.users} users
                    </span>
                  </div>
                  <button
                    className="text-xs px-2 py-1 rounded border"
                    style={{
                      borderColor: "var(--border)",

                      color: "var(--muted-foreground)",
                    }}
                  >
                    Save Permissions
                  </button>
                </div>
                <div className="overflow-auto">
                  <div className="app-table-scroll">
                    <table className="w-full text-xs">
                      <thead>
                        <tr
                          className="border-b"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <th
                            className="text-left px-4 py-2.5 font-700 uppercase tracking-wider w-48"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            Module
                          </th>
                          {PERMS.map((p) => (
                            <th
                              key={p}
                              className="px-3 py-2.5 font-700 uppercase tracking-wider text-center"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {p}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MODULES.map((m) => (
                          <tr
                            key={m}
                            className="border-b"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <td
                              className="px-4 py-2.5 font-600"
                              style={{ color: "var(--foreground)" }}
                            >
                              {m}
                            </td>
                            {PERMS.map((p) => (
                              <td key={p} className="px-3 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!perms[m]?.[p]}
                                  onChange={() => togglePerm(m, p)}
                                  style={{
                                    accentColor: selectedRole.color,

                                    width: "14px",

                                    height: "14px",
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="rounded border flex items-center justify-center"
                style={{
                  background: "var(--card)",

                  borderColor: "var(--border)",

                  minHeight: "300px",
                }}
              >
                <p
                  className="text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Select a role to configure permissions
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {}
      {showNewUser && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "#0009" }}
        >
          <div
            className="rounded border p-6 w-full max-w-md"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2
              className="text-lg font-700 mb-5"
              style={{ color: "var(--foreground)" }}
            >
              New User
            </h2>
            <div className="space-y-3">
              {[
                { label: "Full Name", ph: "User full name" },

                { label: "Email", ph: "user@yourcompany.com" },

                { label: "Password", ph: "Temporary password" },
              ].map(({ label, ph }) => (
                <div key={label}>
                  <label
                    className="text-xs font-700 uppercase tracking-wider mb-1 block"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {label}
                  </label>
                  <input
                    type={label === "Password" ? "password" : "text"}
                    placeholder={ph}
                    className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{
                      background: "var(--secondary)",

                      borderColor: "var(--border)",

                      color: "var(--foreground)",
                    }}
                  />
                </div>
              ))}
              <div>
                <label
                  className="text-xs font-700 uppercase tracking-wider mb-1 block"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Role
                </label>
                <select
                  className="w-full px-3 py-2 text-sm rounded border outline-none"
                  style={{
                    background: "var(--secondary)",

                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                >
                  {roles.map((r) => (
                    <option key={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="text-xs font-700 uppercase tracking-wider mb-1 block"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Branch
                </label>
                <select
                  className="w-full px-3 py-2 text-sm rounded border outline-none"
                  style={{
                    background: "var(--secondary)",

                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                >
                  {["HQ", "Kampala", "Masaka", "Gulu", "Mbarara"].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                className="flex-1 py-2 text-sm font-600 rounded"
                style={{
                  background: "var(--primary)",

                  color: "var(--primary-foreground)",
                }}
              >
                Create User
              </button>
              <button
                onClick={() => setShowNewUser(false)}
                className="flex-1 py-2 text-sm rounded border"
                style={{
                  borderColor: "var(--border)",

                  color: "var(--muted-foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {showNewRole && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "#0009" }}
        >
          <div
            className="rounded border p-6 w-full max-w-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2
              className="text-lg font-700 mb-5"
              style={{ color: "var(--foreground)" }}
            >
              New Custom Role
            </h2>
            <div className="space-y-3">
              <div>
                <label
                  className="text-xs font-700 uppercase tracking-wider mb-1 block"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Role Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Regional Manager"
                  className="w-full px-3 py-2 text-sm rounded border outline-none"
                  style={{
                    background: "var(--secondary)",

                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                />
              </div>
              <div>
                <label
                  className="text-xs font-700 uppercase tracking-wider mb-1 block"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Based On
                </label>
                <select
                  className="w-full px-3 py-2 text-sm rounded border outline-none"
                  style={{
                    background: "var(--secondary)",

                    borderColor: "var(--border)",

                    color: "var(--foreground)",
                  }}
                >
                  <option>Start from scratch</option>
                  {roles.map((r) => (
                    <option key={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                className="flex-1 py-2 text-sm font-600 rounded"
                style={{
                  background: "var(--primary)",

                  color: "var(--primary-foreground)",
                }}
              >
                Create Role
              </button>
              <button
                onClick={() => setShowNewRole(false)}
                className="flex-1 py-2 text-sm rounded border"
                style={{
                  borderColor: "var(--border)",

                  color: "var(--muted-foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
