export type RoleAccessSettings = {
  candidate_scope: "company" | "assigned"
  inquiry_scope: "company" | "created"
  candidate_registration: boolean
  agent_visa_finance: boolean
}

export const DEFAULT_ROLE_ACCESS_SETTINGS: RoleAccessSettings = {
  candidate_scope: "company",
  inquiry_scope: "company",
  candidate_registration: true,
  agent_visa_finance: false,
}

export function isRecruitmentAgentRole(roleName: string): boolean {
  return roleName.trim().toLowerCase() === "recruitment agent"
}

export function isRecruitmentAgentRestrictedPermission(
  permissionCode: string,
): boolean {
  return (
    permissionCode === "human_resources.view" ||
    [
      "attendance.",
      "approvals.",
      "communications.",
      "drive.",
      "finance.",
      "leave.",
      "requisitions.",
      "tasks.",
    ].some((prefix) => permissionCode.startsWith(prefix))
  )
}

export function roleAccessSettings(
  value: unknown,
  roleName = "",
): RoleAccessSettings {
  const settings =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const isAgentRole = isRecruitmentAgentRole(roleName)

  return {
    candidate_scope:
      settings.candidate_scope === "assigned"
        ? "assigned"
        : settings.candidate_scope === "company"
          ? "company"
          : isAgentRole
            ? "assigned"
            : DEFAULT_ROLE_ACCESS_SETTINGS.candidate_scope,
    inquiry_scope:
      settings.inquiry_scope === "created"
        ? "created"
        : settings.inquiry_scope === "company"
          ? "company"
          : isAgentRole
            ? "created"
            : DEFAULT_ROLE_ACCESS_SETTINGS.inquiry_scope,
    candidate_registration:
      typeof settings.candidate_registration === "boolean"
        ? settings.candidate_registration
        : isAgentRole
          ? false
          : DEFAULT_ROLE_ACCESS_SETTINGS.candidate_registration,
    agent_visa_finance:
      typeof settings.agent_visa_finance === "boolean"
        ? settings.agent_visa_finance
        : isAgentRole
          ? true
          : DEFAULT_ROLE_ACCESS_SETTINGS.agent_visa_finance,
  }
}

export function isRoleAccessSettings(value: unknown): value is RoleAccessSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const settings = value as Record<string, unknown>
  return (
    (settings.candidate_scope === "company" ||
      settings.candidate_scope === "assigned") &&
    (settings.inquiry_scope === "company" ||
      settings.inquiry_scope === "created") &&
    typeof settings.candidate_registration === "boolean" &&
    typeof settings.agent_visa_finance === "boolean"
  )
}
