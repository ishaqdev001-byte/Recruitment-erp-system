const chairmanRoles = new Set([
  "chairman",
  "company owner / primary administrator",
  "primary administrator",
]);

export function canViewCandidateFinance(
  roleName: string,
  hasFinancePermission: boolean,
) {
  const normalizedRole = roleName.trim().toLocaleLowerCase();
  return chairmanRoles.has(normalizedRole) ||
    (normalizedRole.includes("finance") && hasFinancePermission);
}
