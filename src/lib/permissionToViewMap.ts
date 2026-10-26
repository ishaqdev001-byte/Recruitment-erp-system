/**
 * Permission-to-View Mapping
 *
 * Maps permission codes from the database to the frontend views they control.
 * This is the single source of truth for which permissions grant access to which views.
 *
 * Format: permission_code → Set<View>
 */

import type { View } from "../App";

const medicalOnlyPermissions = new Set([
  "candidates.view",
  "documents.view",
  "documents.upload",
  "documents.download",
  "medical_documents.view",
  "medical.view",
  "medical.update",
]);
const medicalAccessPermissions = new Set(["medical_documents.view", "medical.view", "medical.update"]);

export function isMedicalOnlyUser(permissions: string[]): boolean {
  const hasMedicalAccess = permissions.some((permission) => medicalAccessPermissions.has(permission));
  if (!hasMedicalAccess) return false;

  return permissions.every((permission) => medicalOnlyPermissions.has(permission));
}

/**
 * Maps each permission code to the views it grants access to.
 * Used to determine which views a user can access based on their role's permissions.
 *
 * When a role has permission "candidates.view", the user gains access to:
 * - "candidates" (pipeline)
 * - "candidate-inquiries" (inquiries)
 * - potentially "documents" if combined with documents.view
 */
export const PERMISSION_TO_VIEWS: Record<string, Set<View>> = {
  // Candidates permissions
  "candidates.view": new Set(["candidates", "candidate-inquiries", "medical-appointments"]),
  "candidates.create": new Set(["candidates", "medical-appointments"]),
  "candidates.edit": new Set(["candidates"]),
  "candidates.delete": new Set(["candidates"]),

  // Documents permissions
  "documents.view": new Set(["documents", "drive"]),
  "documents.upload": new Set(["documents", "drive"]),
  "documents.download": new Set(["documents", "drive"]),
  "documents.edit": new Set(["documents", "drive"]),
  "documents.delete": new Set(["documents", "drive"]),

  // Medical documents and examination permissions
  "medical_documents.view": new Set(["medical-management"]),
  "medical.view": new Set(["medical-management", "hospital-management"]),
  "medical.update": new Set(["medical-management", "hospital-management"]),

  // Passport permissions
  "passport.view": new Set(["passport"]),
  "passport.edit": new Set(["passport"]),

  // Finance permissions
  "finance.view": new Set(["finance", "accounts", "invoices", "payments", "paychecks", "reports"]),
  "finance.create": new Set(["finance", "accounts", "invoices", "payments", "paychecks", "requisitions"]),
  "finance.edit": new Set(["finance", "accounts", "invoices", "payments", "paychecks"]),
  "finance.approve": new Set(["finance", "approvals"]),

  // Users & Roles permissions
  "users.view": new Set(["users"]),
  "users.invite": new Set(["users"]),
  "users.edit": new Set(["users"]),

  // Audit permissions
  "audit.view": new Set(["auditlog", "reports"]),

  // Tasks permissions
  "tasks.view": new Set(["tasks"]),
  "tasks.create": new Set(["tasks"]),

  // Communications permissions
  "communications.email.read": new Set(["communications"]),
  "communications.email.send": new Set(["communications"]),
  "communications.sms.send": new Set(["communications"]),
  "communications.whatsapp.read": new Set(["communications"]),
  "communications.whatsapp.send": new Set(["communications"]),

  // Roles management
  "roles.manage": new Set(["users", "settings"]),

  // Employers & Contractors
  "employers.view": new Set(["contractors", "projects"]),
  "employers.create": new Set(["contractors", "projects"]),
  "employers.edit": new Set(["contractors", "projects"]),
  "employers.delete": new Set(["contractors", "projects"]),

  // Suppliers
  "suppliers.view": new Set(["suppliers"]),
  "suppliers.create": new Set(["suppliers"]),
  "suppliers.edit": new Set(["suppliers"]),
  "suppliers.delete": new Set(["suppliers"]),

  // Projects
  "projects.view": new Set(["projects"]),
  "projects.create": new Set(["projects"]),
  "projects.edit": new Set(["projects"]),
  "projects.delete": new Set(["projects"]),
  "projects.status": new Set(["projects"]),

  // Branches
  "branches.view": new Set(["branches"]),
  "branches.manage": new Set(["branches"]),

  // Approvals
  "approvals.view": new Set(["approvals"]),
  "approvals.manage": new Set(["approvals"]),

  // Requisitions
  "requisitions.view": new Set(["requisitions"]),
  "requisitions.create": new Set(["requisitions"]),
  "requisitions.review": new Set(["requisitions"]),
  "requisitions.verify": new Set(["requisitions"]),
  "requisitions.authorize": new Set(["requisitions"]),

  // Attendance
  "attendance.view": new Set(["attendance"]),
  "attendance.clock": new Set(["attendance"]),
  "attendance.manage": new Set(["attendance"]),

  // Leave
  "leave.view": new Set(["leave"]),
  "leave.create": new Set(["leave"]),
  "leave.manage": new Set(["leave"]),
  "leave.types": new Set(["leave"]),
  "leave.finalize": new Set(["leave"]),

  // Settings
  "settings.manage": new Set(["settings"]),

  // AI
  "ai.view": new Set(["ai"]),
};

/**
 * Returns the set of views that the given permissions grant access to.
 * Merges all views from all provided permissions.
 */
export function viewsFromPermissions(permissions: string[]): Set<View> {
  const allowedViews = new Set<View>();

  if (isMedicalOnlyUser(permissions)) {
    if (permissions.some((permission) => medicalAccessPermissions.has(permission))) {
      allowedViews.add("medical-management");
    }
    return allowedViews;
  }

  for (const permCode of permissions) {
    const views = PERMISSION_TO_VIEWS[permCode];
    if (views) {
      views.forEach((view) => allowedViews.add(view));
    }
  }

  // Dashboard and HR self-service are available to all non-medical-only roles.
  allowedViews.add("dashboard");
  allowedViews.add("human-resources");

  return allowedViews;
}

/**
 * Returns true if the given view is accessible with the provided permissions.
 */
export function canAccessView(view: View, permissions: string[]): boolean {
  const allowedViews = viewsFromPermissions(permissions);
  return allowedViews.has(view);
}
