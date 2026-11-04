const chairmanRoles = new Set([
  "chairman",
  "company owner / primary administrator",
  "primary administrator",
]);

export function canViewCandidateFinance(
  roleName: string,
  hasFinancePermission: boolean,
  isPrimaryAdministrator = false,
) {
  const normalizedRole = roleName.trim().toLocaleLowerCase();
  return isPrimaryAdministrator ||
    chairmanRoles.has(normalizedRole) ||
    (normalizedRole.includes("finance") && hasFinancePermission);
}
