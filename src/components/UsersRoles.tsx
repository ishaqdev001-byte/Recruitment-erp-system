"use client";

import { useEffect, useState, type FormEvent } from "react";
import { SearchableSelect } from "./SearchableSelect";

type UserRecord = { id: string; name: string; email: string; roleId: string; role: string; status: string; isPrimaryAdmin: boolean };
type RoleRecord = { id: string; name: string; description: string; is_system_default: boolean; created_at: string };
type PermissionRecord = { code: string; description: string };
type RolePermissionRecord = { role_id: string; permission_code: string };
type StaffPayType = "payroll" | "project" | "no_payroll";
type StaffAccount = { id: string; name: string; account_type: string; account_number: string };
type StaffRecord = {
  id: string;
  staffId: string;
  name: string;
  position: string;
  phone: string;
  status: "Active" | "On Leave" | "Inactive";
  dateJoined: string;
  linkedUserId: string;
  payType: StaffPayType;
  baseSalary: number;
  weeklyTransportAllowance: number;
  transportAccountId: string;
};
type StaffIdSettings = { prefix: string; nextSequence: number; canChangeSequence: boolean };
type WorkspaceData = { users: UserRecord[]; roles: RoleRecord[]; permissions: PermissionRecord[]; rolePermissions: RolePermissionRecord[]; canManageRoles: boolean };

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

const emptyStaffForm = {
  name: "",
  position: "",
  status: "Active" as StaffRecord["status"],
  dateJoined: "",
  linkedUserId: "",
  payType: "payroll" as StaffPayType,
  baseSalary: "",
  weeklyTransportAllowance: "0",
  transportAccountId: "",
};

export default function UsersRoles({ companyId, currentUserId }: { companyId: string; currentUserId: string }) {
  const [tab, setTab] = useState<"users" | "roles" | "staff">("users");
  const [data, setData] = useState<WorkspaceData>({ users: [], roles: [], permissions: [], rolePermissions: [], canManageRoles: false });
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [showNewUser, setShowNewUser] = useState(false);
  const [showNewRole, setShowNewRole] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [showEditRole, setShowEditRole] = useState(false);
  const [roleEditName, setRoleEditName] = useState("");
  const [roleEditDescription, setRoleEditDescription] = useState("");
  const [roleEditPermissions, setRoleEditPermissions] = useState<string[]>([]);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState("");
  const [staffMembers, setStaffMembers] = useState<StaffRecord[]>([]);
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);
  const [staffIdSettings, setStaffIdSettings] = useState<StaffIdSettings | null>(null);
  const [staffIdPrefix, setStaffIdPrefix] = useState("");
  const [staffNextSequence, setStaffNextSequence] = useState(1);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRoleId, setUserRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userActionPending, setUserActionPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/workspace/users", { cache: "no-store" });
        const result = await response.json() as WorkspaceData & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to load users and roles.");
        if (!cancelled) {
          setData({ users: result.users ?? [], roles: result.roles ?? [], permissions: result.permissions ?? [], rolePermissions: result.rolePermissions ?? [], canManageRoles: Boolean(result.canManageRoles) });
          setSelectedRoleId((current) => current || result.roles[0]?.id || "");
          setUserRoleId((current) => current || result.roles[0]?.id || "");
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load users and roles.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [companyId, reloadKey]);

  useEffect(() => {
    if (tab !== "staff") return;
    let cancelled = false;
    const loadStaff = async () => {
      setStaffLoading(true);
      try {
        const response = await fetch("/api/workspace/staff", { cache: "no-store" });
        const result = await response.json() as { staff?: StaffRecord[]; accounts?: StaffAccount[]; settings?: StaffIdSettings; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to load staff records.");
        if (!cancelled) {
          setStaffMembers(result.staff ?? []);
          setStaffAccounts(result.accounts ?? []);
          if (result.settings) {
            setStaffIdSettings(result.settings);
            setStaffIdPrefix(result.settings.prefix);
            setStaffNextSequence(result.settings.nextSequence);
          }
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load staff records.");
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    };
    void loadStaff();
    return () => { cancelled = true; };
  }, [companyId, reloadKey, tab]);

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite-user", name: userName, email: userEmail, roleId: userRoleId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to invite user.");
      setShowNewUser(false);
      setUserName("");
      setUserEmail("");
      setNotice("Invitation sent. The user can set their password from the email link.");
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to invite user.");
    } finally {
      setSaving(false);
    }
  };

  const submitRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-role", name: roleName, description: roleDescription, permissions: selectedPermissions }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to create role.");
      setShowNewRole(false);
      setRoleName("");
      setRoleDescription("");
      setSelectedPermissions([]);
      setNotice("Role created with the selected permissions.");
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create role.");
    } finally {
      setSaving(false);
    }
  };

  const openEditRole = (role: RoleRecord) => {
    setEditingRole(role);
    setRoleEditName(role.name);
    setRoleEditDescription(role.description);
    setRoleEditPermissions(
      data.rolePermissions.filter((rp) => rp.role_id === role.id).map((rp) => rp.permission_code)
    );
    setError("");
    setShowEditRole(true);
  };

  const submitEditRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRole) return;
    setSaving(true);
    setError("");
    setNotice("");
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
        }),
      });
      const result = await response.json() as { role?: RoleRecord; permissions?: string[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update role.");
      setShowEditRole(false);
      setEditingRole(null);
      setNotice(`"${result.role?.name ?? roleEditName}" updated.`);
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update role.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (role: RoleRecord) => {
    if (!window.confirm(`Delete the "${role.name}" role? This cannot be undone. Users assigned this role must be reassigned first.`)) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-role", roleId: role.id }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to delete role.");
      if (selectedRoleId === role.id) setSelectedRoleId("");
      setNotice(`"${role.name}" deleted.`);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete role.");
    }
  };

  const manageUser = async (user: UserRecord, action: "change-role" | "set-status" | "revoke-invite" | "delete-user", roleId?: string) => {
    const prompts: Partial<Record<typeof action, string>> = {
      "set-status": user.status === "disabled" ? `Activate ${user.name}'s company access?` : `Deactivate ${user.name}'s company access?`,
      "revoke-invite": `Revoke the pending invitation for ${user.name}?`,
      "delete-user": `Remove ${user.name} from this company? Their account is deleted only if they have no other company memberships.`,
    };
    const prompt = prompts[action];
    if (prompt && !window.confirm(prompt)) return;

    setUserActionPending(user.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          userId: user.id,
          ...(action === "change-role" ? { roleId } : {}),
          ...(action === "set-status" ? { status: user.status === "disabled" ? "active" : "disabled" } : {}),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update this user.");
      setNotice(action === "change-role" ? `Role updated for ${user.name}.` : action === "set-status" ? `Access updated for ${user.name}.` : action === "revoke-invite" ? `Invitation revoked for ${user.name}.` : `${user.name} removed from this company.`);
      setReloadKey((key) => key + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update this user.");
    } finally {
      setUserActionPending("");
    }
  };

  const openNewStaff = () => {
    setEditingStaffId("");
    setStaffForm(emptyStaffForm);
    setShowStaffForm(true);
  };

  const openEditStaff = (member: StaffRecord) => {
    setEditingStaffId(member.id);
    setStaffForm({
      name: member.name,
      position: member.position,
      status: member.status,
      dateJoined: member.dateJoined,
      linkedUserId: member.linkedUserId,
      payType: member.payType,
      baseSalary: String(member.baseSalary),
      weeklyTransportAllowance: String(member.weeklyTransportAllowance),
      transportAccountId: member.transportAccountId,
    });
    setShowStaffForm(true);
  };

  const submitStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspace/staff", {
        method: editingStaffId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...staffForm, id: editingStaffId || undefined }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save staff record.");
      setShowStaffForm(false);
      setNotice(editingStaffId ? "Staff record updated." : "Staff member added.");
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save staff record.");
    } finally {
      setSaving(false);
    }
  };

  const submitStaffIdSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspace/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "configure-ids", prefix: staffIdPrefix, nextSequence: staffNextSequence }),
      });
      const result = await response.json() as { settings?: StaffIdSettings; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update staff ID settings.");
      if (result.settings) {
        setStaffIdSettings(result.settings);
        setStaffIdPrefix(result.settings.prefix);
        setStaffNextSequence(result.settings.nextSequence);
      }
      setNotice("Staff ID settings updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update staff ID settings.");
    } finally {
      setSaving(false);
    }
  };

  const selectedRole = data.roles.find((role) => role.id === selectedRoleId);
  const permissionsForRole = new Set(data.rolePermissions.filter((permission) => permission.role_id === selectedRoleId).map((permission) => permission.permission_code));
  const canManageStaff = data.users.some((user) => user.id === currentUserId && (user.isPrimaryAdmin || user.role === "CEO" || user.role === "General Manager"));
  const canManageRoles = data.users.some((user) => user.id === currentUserId && (user.isPrimaryAdmin || user.role === "CEO")) || data.canManageRoles;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Users &amp; Roles</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted-foreground)" }}>Manage company access, permissions, and staff records</p>
        </div>
        {tab === "users" ? (
          <button type="button" onClick={() => setShowNewUser(true)} disabled={!data.roles.length} className="rounded px-4 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Invite user</button>
        ) : tab === "roles" ? (
          canManageRoles ? <button type="button" onClick={() => setShowNewRole(true)} className="rounded px-4 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>New role</button> : null
        ) : (
          <button type="button" onClick={openNewStaff} className="rounded px-4 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Add staff</button>
        )}
      </div>

      <div className="flex shrink-0 border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {(["users", "roles", "staff"] as const).filter((item) => item !== "staff" || canManageStaff).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className="px-5 py-3 text-sm font-600 capitalize" style={{ color: tab === item ? "var(--primary)" : "var(--muted-foreground)", borderBottom: tab === item ? "2px solid var(--primary)" : "2px solid transparent" }}>{item}</button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <div role="alert" className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {notice && <div role="status" className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{notice}</div>}
        {loading ? <p className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading company users and roles…</p> : null}

        {!loading && tab === "users" && (
          <div className="overflow-x-auto rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <table className="w-full min-w-155 text-sm">
              <thead><tr className="border-b" style={{ borderColor: "var(--border)" }}>{["Name", "Email", "Role", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>{user.name}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{user.email}</td>
                    <td className="px-4 py-3">{user.isPrimaryAdmin ? <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{user.role}</span> : <select aria-label={`Role for ${user.name}`} value={user.roleId} disabled={user.id === currentUserId || userActionPending === user.id} onChange={(event) => void manageUser(user, "change-role", event.target.value)} className="max-w-56 rounded border px-2 py-1 text-xs disabled:opacity-50" style={fieldStyle}>{data.roles.filter((role) => role.name !== "Company Owner / Primary Administrator" && role.name !== "Primary Administrator").map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>}</td>
                    <td className="px-4 py-3"><span className="rounded px-2 py-1 text-xs font-600" style={{ color: user.status === "active" ? "#10b981" : user.status === "disabled" ? "#ef4444" : "#f59e0b", background: user.status === "active" ? "#10b98120" : user.status === "disabled" ? "#ef444420" : "#f59e0b20" }}>{user.status === "active" ? "Active" : user.status === "disabled" ? "Deactivated" : "Invited"}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {user.isPrimaryAdmin ? <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Protected company user</span> : user.id === currentUserId ? <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Current user</span> : user.status === "invited" ? (
                          <button type="button" disabled={userActionPending === user.id} onClick={() => void manageUser(user, "revoke-invite")} className="rounded border px-2 py-1 text-xs disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Revoke invite</button>
                        ) : (
                          <button type="button" disabled={userActionPending === user.id} onClick={() => void manageUser(user, "set-status")} className="rounded border px-2 py-1 text-xs disabled:opacity-50" style={{ borderColor: "var(--border)", color: user.status === "disabled" ? "#10b981" : "#f59e0b" }}>{user.status === "disabled" ? "Activate" : "Deactivate"}</button>
                        )}
                        {!user.isPrimaryAdmin && user.id !== currentUserId ? <button type="button" disabled={userActionPending === user.id} onClick={() => void manageUser(user, "delete-user")} className="rounded border px-2 py-1 text-xs disabled:opacity-50" style={{ borderColor: "#ef444440", color: "#ef4444" }}>Delete</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!data.users.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No company users found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tab === "roles" && (
          <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.25fr)]">
            {/* Role list */}
            <div className="space-y-2">
              <h2 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Company roles</h2>
              {data.roles.map((role) => {
                const isPrimaryAdmin = role.name === "Company Owner / Primary Administrator" || role.name === "Primary Administrator";
                const memberCount = data.users.filter((u) => u.roleId === role.id).length;
                return (
                  <div key={role.id} className="rounded border" style={{ background: selectedRoleId === role.id ? "var(--secondary)" : "var(--card)", borderColor: selectedRoleId === role.id ? "var(--primary)" : "var(--border)" }}>
                    <button type="button" onClick={() => setSelectedRoleId(role.id)} className="w-full px-3 py-3 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-600" style={{ color: "var(--foreground)" }}>{role.name}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {role.is_system_default && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-600 uppercase tracking-wide" style={{ background: "var(--border)", color: "var(--muted-foreground)" }}>Default</span>
                          )}
                          {memberCount > 0 && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-600" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>{memberCount} user{memberCount !== 1 ? "s" : ""}</span>
                          )}
                        </div>
                      </div>
                      {role.description ? <span className="mt-1 block text-xs" style={{ color: "var(--muted-foreground)" }}>{role.description}</span> : null}
                    </button>
                    {canManageRoles && (
                      <div className="flex gap-1.5 border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                        <button type="button" onClick={() => openEditRole(role)}
                          className="rounded border px-2.5 py-1 text-xs font-600"
                          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                          Edit
                        </button>
                        {!isPrimaryAdmin && (
                          <button type="button" onClick={() => void deleteRole(role)}
                            className="rounded border px-2.5 py-1 text-xs font-600"
                            style={{ borderColor: "#ef444440", color: "#ef4444" }}>
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!data.roles.length && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No roles are configured.</p>}
            </div>

            {/* Permission detail panel */}
            <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              {selectedRole ? (
                <>
                  <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-700" style={{ color: "var(--foreground)" }}>{selectedRole.name}</h2>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{selectedRole.description || "No description."}</p>
                      </div>
                      <span className="shrink-0 text-xs" style={{ color: "var(--muted-foreground)" }}>{permissionsForRole.size} permission{permissionsForRole.size !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  {permissionsForRole.size === 0 ? (
                    <p className="px-4 py-6 text-sm" style={{ color: "var(--muted-foreground)" }}>No permissions assigned to this role.</p>
                  ) : (
                    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                      {(() => {
                        // Group permissions by prefix (e.g. "candidates", "finance")
                        const grouped = new Map<string, PermissionRecord[]>();
                        data.permissions.filter((p) => permissionsForRole.has(p.code)).forEach((p) => {
                          const group = p.code.split(".")[0] ?? "other";
                          if (!grouped.has(group)) grouped.set(group, []);
                          grouped.get(group)!.push(p);
                        });
                        return Array.from(grouped.entries()).map(([group, perms]) => (
                          <div key={group} className="px-4 py-3">
                            <div className="mb-2 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{group.replace(/_/g, " ")}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {perms.map((p) => (
                                <span key={p.code} title={p.description} className="rounded border px-2 py-0.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                                  {p.code.split(".").slice(1).join(".")}
                                </span>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </>
              ) : (
                <p className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Select a role to review its permissions.</p>
              )}
            </div>
          </div>
        )}

        {tab === "staff" && (
          <div className="space-y-4">
            <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
                <div>
                  <div className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Staff records</div>
                  <div className="mt-1 text-xl font-700" style={{ color: "var(--foreground)" }}>{staffMembers.length}</div>
                </div>
              </div>

              {staffIdSettings?.canChangeSequence && (
                <form onSubmit={submitStaffIdSettings} className="flex flex-wrap items-end gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
                  <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Staff ID prefix<input required maxLength={10} pattern="[A-Za-z][A-Za-z0-9]{0,9}" value={staffIdPrefix} onChange={(event) => setStaffIdPrefix(event.target.value.toUpperCase())} className="mt-1 block w-36 rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
                  <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Next sequence<input required type="number" min={1} max={999999} value={staffNextSequence} onChange={(event) => setStaffNextSequence(Number(event.target.value))} className="mt-1 block w-36 rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
                  <button type="submit" disabled={saving} className="rounded border px-4 py-2 text-sm font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>{saving ? "Saving…" : "Save ID settings"}</button>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Preview: {staffIdPrefix || "XX"}-{String(staffNextSequence).padStart(4, "0")}</span>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-225 text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      {["Staff ID", "Name", "Position", "Pay arrangement", "Base salary", "Weekly transport", "Status", "Linked user", "Actions"].map((heading) => (
                        <th key={heading} className="px-4 py-3 text-left text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staffMembers.map((member) => (
                      <tr key={member.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>{member.staffId}</td>
                        <td className="px-4 py-3" style={{ color: "var(--foreground)" }}>{member.name}</td>
                        <td className="px-4 py-3" style={{ color: "var(--muted-foreground)" }}>{member.position}</td>
                        <td className="px-4 py-3 text-xs capitalize" style={{ color: "var(--muted-foreground)" }}>{member.payType.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{member.baseSalary ? `UGX ${member.baseSalary.toLocaleString("en-UG")}` : "—"}</td>
                        <td className="px-4 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{member.weeklyTransportAllowance ? `UGX ${member.weeklyTransportAllowance.toLocaleString("en-UG")}/wk` : "—"}</td>
                        <td className="px-4 py-3">
                          <span className="rounded px-2 py-1 text-xs font-600" style={{
                            color: member.status === "Active" ? "#10b981" : member.status === "On Leave" ? "#f59e0b" : "#ef4444",
                            background: member.status === "Active" ? "#10b98120" : member.status === "On Leave" ? "#f59e0b20" : "#ef444420",
                          }}>{member.status}</span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--muted-foreground)" }}>{data.users.find((user) => user.id === member.linkedUserId)?.email ?? "Not linked"}</td>
                        <td className="px-4 py-3"><button type="button" onClick={() => openEditStaff(member)} className="rounded border px-3 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Edit</button></td>
                      </tr>
                    ))}
                    {staffLoading && !staffMembers.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading staff records…</td></tr>}
                    {!staffLoading && !staffMembers.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No staff members have been added yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {showNewUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={submitUser} className="w-full max-w-md rounded border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="mb-5 text-lg font-700" style={{ color: "var(--foreground)" }}>Invite company user</h2>
            <div className="space-y-4">
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Full name<input required maxLength={200} value={userName} onChange={(event) => setUserName(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Email address<input required type="email" value={userEmail} onChange={(event) => setUserEmail(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Role<select required value={userRoleId} onChange={(event) => setUserRoleId(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}>{data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            </div>
            <p className="mt-4 text-xs" style={{ color: "var(--muted-foreground)" }}>An invitation email will let the user set their own password.</p>
            <div className="mt-6 flex gap-3">
              <button type="submit" disabled={saving} className="flex-1 rounded py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Sending…" : "Send invitation"}</button>
              <button type="button" onClick={() => setShowNewUser(false)} className="flex-1 rounded border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {showNewRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={submitRole} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="mb-5 text-lg font-700" style={{ color: "var(--foreground)" }}>Create company role</h2>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Role name<input required maxLength={100} value={roleName} onChange={(event) => setRoleName(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} placeholder="e.g. Branch Supervisor" /></label>
            <label className="mt-4 block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Duties and responsibilities<textarea required maxLength={1000} rows={3} value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} className="mt-1 w-full resize-y rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} placeholder="Describe what this role is responsible for." /></label>
            <fieldset className="mt-5">
              <legend className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Permissions</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.permissions.map((permission) => (
                  <label key={permission.code} className="flex items-start gap-2 rounded border p-2.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                    <input type="checkbox" checked={selectedPermissions.includes(permission.code)} onChange={(event) => setSelectedPermissions((current) => event.target.checked ? [...current, permission.code] : current.filter((code) => code !== permission.code))} className="mt-0.5" />
                    <span><span className="block font-600">{permission.code}</span><span style={{ color: "var(--muted-foreground)" }}>{permission.description}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-6 flex gap-3">
              <button type="submit" disabled={saving} className="flex-1 rounded py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Creating…" : "Create role"}</button>
              <button type="button" onClick={() => setShowNewRole(false)} className="flex-1 rounded border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {showEditRole && editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowEditRole(false); setError(""); } }}>
          <form onSubmit={submitEditRole} className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
              <div>
                <h2 className="text-base font-700" style={{ color: "var(--foreground)" }}>Edit role</h2>
                {editingRole.is_system_default && (
                  <p className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>System default role — name changes are applied immediately to all users with this role.</p>
                )}
              </div>
              <button type="button" onClick={() => { setShowEditRole(false); setError(""); }}
                className="rounded p-1 text-xs" style={{ color: "var(--muted-foreground)" }}>✕</button>
            </div>

            {/* Scrollable body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {error && <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

              <div>
                <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                  Role name {(editingRole.name === "Company Owner / Primary Administrator" || editingRole.name === "Primary Administrator") && <span className="ml-1 text-xs normal-case tracking-normal" style={{ color: "var(--muted-foreground)" }}>(protected — cannot be renamed)</span>}
                </label>
                <input required maxLength={100}
                  value={roleEditName}
                  onChange={(e) => setRoleEditName(e.target.value)}
                  disabled={editingRole.name === "Company Owner / Primary Administrator" || editingRole.name === "Primary Administrator"}
                  className="mt-1 w-full rounded border px-3 py-2.5 text-sm outline-none disabled:opacity-50"
                  style={fieldStyle}
                  placeholder="e.g. Branch Supervisor" />
              </div>

              <div>
                <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Duties and responsibilities</label>
                <textarea required maxLength={1000} rows={3} value={roleEditDescription}
                  onChange={(e) => setRoleEditDescription(e.target.value)}
                  className="mt-1 w-full resize-y rounded border px-3 py-2.5 text-sm outline-none"
                  style={fieldStyle}
                  placeholder="Describe what this role is responsible for." />
              </div>

              <fieldset>
                <div className="mb-3 flex items-center justify-between">
                  <legend className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    Permissions <span className="ml-1 normal-case tracking-normal font-400">({roleEditPermissions.length} selected)</span>
                  </legend>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setRoleEditPermissions(data.permissions.map((p) => p.code))}
                      className="text-xs" style={{ color: "var(--primary)" }}>Select all</button>
                    <button type="button" onClick={() => setRoleEditPermissions([])}
                      className="text-xs" style={{ color: "var(--muted-foreground)" }}>Clear all</button>
                  </div>
                </div>
                {/* Group permissions by prefix for readability */}
                {(() => {
                  const grouped = new Map<string, PermissionRecord[]>();
                  data.permissions.forEach((p) => {
                    const group = p.code.split(".")[0] ?? "other";
                    if (!grouped.has(group)) grouped.set(group, []);
                    grouped.get(group)!.push(p);
                  });
                  return Array.from(grouped.entries()).map(([group, perms]) => (
                    <div key={group} className="mb-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{group.replace(/_/g, " ")}</span>
                        <button type="button" className="text-[10px]" style={{ color: "var(--muted-foreground)" }}
                          onClick={() => {
                            const codes = perms.map((p) => p.code);
                            const allSelected = codes.every((c) => roleEditPermissions.includes(c));
                            setRoleEditPermissions((prev) => allSelected
                              ? prev.filter((c) => !codes.includes(c))
                              : [...new Set([...prev, ...codes])]);
                          }}>
                          {perms.every((p) => roleEditPermissions.includes(p.code)) ? "deselect group" : "select group"}
                        </button>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {perms.map((p) => (
                          <label key={p.code} className="flex cursor-pointer items-start gap-2 rounded border p-2.5 text-xs" style={{ borderColor: roleEditPermissions.includes(p.code) ? "var(--primary)" : "var(--border)", color: "var(--foreground)", background: roleEditPermissions.includes(p.code) ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}>
                            <input type="checkbox"
                              checked={roleEditPermissions.includes(p.code)}
                              onChange={(e) => setRoleEditPermissions((prev) => e.target.checked ? [...prev, p.code] : prev.filter((c) => c !== p.code))}
                              className="mt-0.5 shrink-0" />
                            <span>
                              <span className="block font-600">{p.code.split(".").slice(1).join(".")}</span>
                              <span style={{ color: "var(--muted-foreground)" }}>{p.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </fieldset>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 gap-3 border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
              <button type="submit" disabled={saving}
                className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button type="button" onClick={() => { setShowEditRole(false); setError(""); }}
                className="rounded border px-5 py-2.5 text-sm font-600"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showStaffForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={submitStaff} className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="mb-5 text-lg font-700" style={{ color: "var(--foreground)" }}>{editingStaffId ? `Edit ${staffMembers.find((member) => member.id === editingStaffId)?.name ?? "staff member"}` : "Add staff member"}</h2>
            {editingStaffId ? (
              <div className="mb-4 text-sm" style={{ color: "var(--muted-foreground)" }}>Staff ID: {staffMembers.find((member) => member.id === editingStaffId)?.staffId}</div>
            ) : (
              <div className="mb-4 text-sm" style={{ color: "var(--muted-foreground)" }}>Assigned staff ID: {staffIdSettings?.prefix ?? "STAFF"}-{String(staffIdSettings?.nextSequence ?? 1).padStart(4, "0")}</div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Full name<input required maxLength={200} value={staffForm.name} onChange={(event) => setStaffForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none" style={fieldStyle} placeholder="Name" /></label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Position<input required maxLength={150} value={staffForm.position} onChange={(event) => setStaffForm((current) => ({ ...current, position: event.target.value }))} className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none" style={fieldStyle} placeholder="Position" /></label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Date joined<input required type="date" value={staffForm.dateJoined} onChange={(event) => setStaffForm((current) => ({ ...current, dateJoined: event.target.value }))} className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none" style={fieldStyle} /></label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Pay arrangement<select value={staffForm.payType} onChange={(event) => { const payType = event.target.value as StaffPayType; setStaffForm((current) => ({ ...current, payType, ...(payType === "payroll" ? { baseSalary: current.baseSalary === "0" ? "" : current.baseSalary } : { baseSalary: "0", weeklyTransportAllowance: "0", transportAccountId: "" }) })); }} className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none" style={fieldStyle}><option value="payroll">Payroll</option><option value="project">Project based</option><option value="no_payroll">No payroll</option></select></label>
              {staffForm.payType === "payroll" && <>
                <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Basic salary (UGX/month)<input required min="0.01" max="999999999999.99" step="0.01" type="number" value={staffForm.baseSalary} onChange={(event) => setStaffForm((current) => ({ ...current, baseSalary: event.target.value }))} className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none" style={fieldStyle} /></label>
                <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Transport allowance (UGX/week)<input min="0" max="999999999999.99" step="0.01" type="number" value={staffForm.weeklyTransportAllowance} onChange={(event) => setStaffForm((current) => ({ ...current, weeklyTransportAllowance: event.target.value, transportAccountId: Number(event.target.value) > 0 ? current.transportAccountId : "" }))} className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none" style={fieldStyle} /></label>
                {Number(staffForm.weeklyTransportAllowance) > 0 && <>
                  <p className="text-xs md:col-span-2" style={{ color: "var(--muted-foreground)" }}>Estimated monthly payroll benefit: UGX {((Number(staffForm.weeklyTransportAllowance) * 52 / 12) || 0).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <label className="block text-xs font-700 uppercase tracking-wider md:col-span-2" style={{ color: "var(--muted-foreground)" }}>Transport allowance funding account<SearchableSelect required ariaLabel="Choose account funding weekly transport allowance" value={staffForm.transportAccountId} onChange={(transportAccountId) => setStaffForm((current) => ({ ...current, transportAccountId }))} options={staffAccounts.map((account) => ({ value: account.id, label: account.name, description: account.account_type.replace(/_/g, " "), searchText: account.account_number }))} placeholder="Select the account to fund this benefit" className="mt-1 normal-case tracking-normal" /></label>
                </>}
              </>}
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Linked user<SearchableSelect ariaLabel="Search active company user" value={staffForm.linkedUserId} onChange={(linkedUserId) => setStaffForm((current) => ({ ...current, linkedUserId }))} options={data.users.filter((user) => user.status === "active" && (!staffMembers.some((member) => member.linkedUserId === user.id) || user.id === staffForm.linkedUserId)).map((user) => ({ value: user.id, label: user.name, description: user.email, searchText: `${user.email} ${user.role}` }))} placeholder="Type a name or email" className="mt-1 normal-case tracking-normal" /></label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Status<select value={staffForm.status} onChange={(event) => setStaffForm((current) => ({ ...current, status: event.target.value as StaffRecord["status"] }))} className="mt-1 w-full rounded border px-3 py-2 text-sm outline-none" style={fieldStyle}><option value="Active">Active</option><option value="On Leave">On Leave</option><option value="Inactive">Inactive</option></select></label>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="submit" disabled={saving} className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : editingStaffId ? "Save changes" : "Save staff"}</button>
              <button type="button" onClick={() => setShowStaffForm(false)} className="flex-1 rounded border py-2.5 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const MODULES = ["Candidates", "Candidate Profiles", "Attachments", "Finance", "Income", "Expenses", "Payments", "Paychecks", "Passport Custody", "AI Tools", "Reports", "Users", "Settings"] as const;
const PERMS = ["View", "Create", "Edit", "Delete", "Approve", "Export"] as const;

const roles = [
  { id: 1, name: "Primary Administrator", color: "#f59e0b", users: 1, custom: false },
  { id: 2, name: "Recruitment Manager", color: "#6366f1", users: 2, custom: false },
  { id: 3, name: "Recruitment Agent", color: "#3b82f6", users: 4, custom: false },
  { id: 4, name: "Finance Manager", color: "#10b981", users: 1, custom: false },
  { id: 5, name: "Finance Officer", color: "#8b5cf6", users: 2, custom: false },
  { id: 6, name: "Document Officer", color: "#14b8a6", users: 1, custom: false },
  { id: 7, name: "Medical Officer", color: "#ec4899", users: 1, custom: false },
  { id: 8, name: "Viewer", color: "#6b7280", users: 3, custom: false },
  { id: 9, name: "Custom: Branch Lead", color: "#f97316", users: 2, custom: true },
];

const users = [
  { id: 1, name: "Aisha Khan", email: "aisha@recruitos.ug", role: "Primary Administrator", branch: "HQ", status: "Active", lastLogin: "Aug 26, 2026" },
  { id: 2, name: "Director Vicent", email: "vicent@recruitos.ug", role: "Recruitment Manager", branch: "Kampala", status: "Active", lastLogin: "Aug 26, 2026" },
  { id: 3, name: "Asiimwe David", email: "david@recruitos.ug", role: "Recruitment Agent", branch: "Masaka", status: "Active", lastLogin: "Aug 25, 2026" },
  { id: 4, name: "Fatuma Nakirya", email: "fatuma@recruitos.ug", role: "Recruitment Agent", branch: "Mbarara", status: "Active", lastLogin: "Aug 24, 2026" },
  { id: 5, name: "Grace Acen", email: "grace@recruitos.ug", role: "Finance Officer", branch: "HQ", status: "Active", lastLogin: "Aug 26, 2026" },
  { id: 6, name: "Peter Mukasa", email: "peter@recruitos.ug", role: "Recruitment Agent", branch: "Gulu", status: "Inactive", lastLogin: "Aug 10, 2026" },
  { id: 7, name: "Sarah Nakigozi", email: "sarah@recruitos.ug", role: "Document Officer", branch: "HQ", status: "Active", lastLogin: "Aug 23, 2026" },
];

const defaultPerms: Record<string, Record<string, boolean>> = Object.fromEntries(
  MODULES.map((m) => [m, Object.fromEntries(PERMS.map((p) => [p, p === "View"]))])
);

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
};

function LegacyUsersRoles() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [selectedRole, setSelectedRole] = useState<typeof roles[0] | null>(null);
  const [perms, setPerms] = useState(defaultPerms);
  const [showNewUser, setShowNewUser] = useState(false);
  const [showNewRole, setShowNewRole] = useState(false);

  const togglePerm = (module: string, perm: string) => {
    setPerms((prev) => ({
      ...prev,
      [module]: { ...prev[module], [perm]: !prev[module]?.[perm] },
    }));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Users & Roles</h1>
          <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>Manage system access and permissions</p>
        </div>
        <div className="flex gap-2">
          {tab === "users" && (
            <button onClick={() => setShowNewUser(true)} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              + New User
            </button>
          )}
          {tab === "roles" && (
            <button onClick={() => setShowNewRole(true)} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              + New Role
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {(["users", "roles"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-5 py-3 text-sm font-600 capitalize"
            style={{ color: tab === t ? "var(--primary)" : "var(--muted-foreground)", borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent" }}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === "users" && (
          <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {["Name", "Email", "Role", "Branch", "Status", "Last Login", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700"
                          style={{ background: (roleColor[u.role] || "#6b7280") + "22", color: roleColor[u.role] || "#6b7280" }}>
                          {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <span className="font-600" style={{ color: "var(--foreground)" }}>{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-600 px-2 py-0.5 rounded"
                        style={{ color: roleColor[u.role] || "#6b7280", background: (roleColor[u.role] || "#6b7280") + "20" }}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{u.branch}</td>
                    <td className="px-4 py-3">
                      <span className="mono text-xs font-600 px-1.5 py-0.5 rounded"
                        style={{ color: u.status === "Active" ? "#10b981" : "#ef4444", background: u.status === "Active" ? "#10b98120" : "#ef444420" }}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{u.lastLogin}</td>
                    <td className="px-4 py-3 flex gap-2">
                      <button className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Edit</button>
                      <button className="text-xs px-2 py-1 rounded border" style={{ borderColor: "#ef444430", color: "#ef4444" }}>
                        {u.status === "Active" ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "roles" && (
          <div className="users-roles-layout grid gap-5">
            {/* Role list */}
            <div className="space-y-1.5">
              <div className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>Roles</div>
              {roles.map((r) => (
                <button key={r.id} onClick={() => setSelectedRole(r)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded border text-left"
                  style={{
                    background: selectedRole?.id === r.id ? "var(--secondary)" : "var(--card)",
                    borderColor: selectedRole?.id === r.id ? r.color : "var(--border)",
                  }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                    <span className="text-sm font-600" style={{ color: "var(--foreground)" }}>{r.name}</span>
                    {r.custom && <span className="mono text-xs px-1 py-0.5 rounded" style={{ background: "#f97316"+"20", color: "#f97316" }}>CUSTOM</span>}
                  </div>
                  <span className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.users}u</span>
                </button>
              ))}
            </div>

            {/* Permission matrix */}
            {selectedRole ? (
              <div className="rounded border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: selectedRole.color }} />
                    <h3 className="font-700 text-sm" style={{ color: "var(--foreground)" }}>{selectedRole.name}</h3>
                    <span className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{selectedRole.users} users</span>
                  </div>
                  <button className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                    Save Permissions
                  </button>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                        <th className="text-left px-4 py-2.5 font-700 uppercase tracking-wider w-48" style={{ color: "var(--muted-foreground)" }}>Module</th>
                        {PERMS.map((p) => (
                          <th key={p} className="px-3 py-2.5 font-700 uppercase tracking-wider text-center" style={{ color: "var(--muted-foreground)" }}>{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map((m) => (
                        <tr key={m} className="border-b" style={{ borderColor: "var(--border)" }}>
                          <td className="px-4 py-2.5 font-600" style={{ color: "var(--foreground)" }}>{m}</td>
                          {PERMS.map((p) => (
                            <td key={p} className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={!!perms[m]?.[p]}
                                onChange={() => togglePerm(m, p)}
                                style={{ accentColor: selectedRole.color, width: "14px", height: "14px" }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded border flex items-center justify-center" style={{ background: "var(--card)", borderColor: "var(--border)", minHeight: "300px" }}>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Select a role to configure permissions</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New user modal */}
      {showNewUser && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-md" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-700 mb-5" style={{ color: "var(--foreground)" }}>New User</h2>
            <div className="space-y-3">
              {[{ label: "Full Name", ph: "User full name" }, { label: "Email", ph: "user@recruitos.ug" }, { label: "Password", ph: "Temporary password" }].map(({ label, ph }) => (
                <div key={label}>
                  <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>{label}</label>
                  <input type={label === "Password" ? "password" : "text"} placeholder={ph} className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                </div>
              ))}
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>Role</label>
                <select className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  {roles.map((r) => <option key={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>Branch</label>
                <select className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  {["HQ", "Kampala", "Masaka", "Gulu", "Mbarara"].map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Create User</button>
              <button onClick={() => setShowNewUser(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* New role modal */}
      {showNewRole && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-700 mb-5" style={{ color: "var(--foreground)" }}>New Custom Role</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>Role Name</label>
                <input type="text" placeholder="e.g. Regional Manager" className="w-full px-3 py-2 text-sm rounded border outline-none"
                  style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </div>
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>Based On</label>
                <select className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  <option>Start from scratch</option>
                  {roles.map((r) => <option key={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Create Role</button>
              <button onClick={() => setShowNewRole(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
