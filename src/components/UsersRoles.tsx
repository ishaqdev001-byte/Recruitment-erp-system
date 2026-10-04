"use client";

import { useEffect, useState, type FormEvent } from "react";

type UserRecord = { id: string; name: string; email: string; roleId: string; role: string; status: string };
type RoleRecord = { id: string; name: string; description: string; created_at: string };
type PermissionRecord = { code: string; description: string };
type RolePermissionRecord = { role_id: string; permission_code: string };
type WorkspaceData = { users: UserRecord[]; roles: RoleRecord[]; permissions: PermissionRecord[]; rolePermissions: RolePermissionRecord[] };

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

export default function UsersRoles({ companyId, currentUserId }: { companyId: string; currentUserId: string }) {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [data, setData] = useState<WorkspaceData>({ users: [], roles: [], permissions: [], rolePermissions: [] });
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [showNewUser, setShowNewUser] = useState(false);
  const [showNewRole, setShowNewRole] = useState(false);
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
          setData(result);
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

  const selectedRole = data.roles.find((role) => role.id === selectedRoleId);
  const permissionsForRole = new Set(data.rolePermissions.filter((permission) => permission.role_id === selectedRoleId).map((permission) => permission.permission_code));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Users &amp; Roles</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted-foreground)" }}>Manage company access and permissions</p>
        </div>
        {tab === "users" ? (
          <button type="button" onClick={() => setShowNewUser(true)} disabled={!data.roles.length} className="rounded px-4 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Invite user</button>
        ) : (
          <button type="button" onClick={() => setShowNewRole(true)} className="rounded px-4 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>New role</button>
        )}
      </div>

      <div className="flex shrink-0 border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {(["users", "roles"] as const).map((item) => (
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
                    <td className="px-4 py-3">{user.role === "Company Owner / Primary Administrator" || user.role === "Primary Administrator" ? <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{user.role}</span> : <select aria-label={`Role for ${user.name}`} value={user.roleId} disabled={user.id === currentUserId || userActionPending === user.id} onChange={(event) => void manageUser(user, "change-role", event.target.value)} className="max-w-56 rounded border px-2 py-1 text-xs disabled:opacity-50" style={fieldStyle}>{data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>}</td>
                    <td className="px-4 py-3"><span className="rounded px-2 py-1 text-xs font-600" style={{ color: user.status === "active" ? "#10b981" : user.status === "disabled" ? "#ef4444" : "#f59e0b", background: user.status === "active" ? "#10b98120" : user.status === "disabled" ? "#ef444420" : "#f59e0b20" }}>{user.status === "active" ? "Active" : user.status === "disabled" ? "Deactivated" : "Invited"}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {user.role === "Company Owner / Primary Administrator" || user.role === "Primary Administrator" ? null : user.id === currentUserId ? <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Current user</span> : user.status === "invited" ? (
                          <button type="button" disabled={userActionPending === user.id} onClick={() => void manageUser(user, "revoke-invite")} className="rounded border px-2 py-1 text-xs disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Revoke invite</button>
                        ) : (
                          <button type="button" disabled={userActionPending === user.id} onClick={() => void manageUser(user, "set-status")} className="rounded border px-2 py-1 text-xs disabled:opacity-50" style={{ borderColor: "var(--border)", color: user.status === "disabled" ? "#10b981" : "#f59e0b" }}>{user.status === "disabled" ? "Activate" : "Deactivate"}</button>
                        )}
                        <button type="button" disabled={userActionPending === user.id} onClick={() => void manageUser(user, "delete-user")} className="rounded border px-2 py-1 text-xs disabled:opacity-50" style={{ borderColor: "#ef444440", color: "#ef4444" }}>Delete</button>
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
          <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
            <div className="space-y-2">
              <h2 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Company roles</h2>
              {data.roles.map((role) => (
                <button key={role.id} type="button" onClick={() => setSelectedRoleId(role.id)} className="w-full rounded border px-3 py-3 text-left" style={{ background: selectedRoleId === role.id ? "var(--secondary)" : "var(--card)", borderColor: selectedRoleId === role.id ? "var(--primary)" : "var(--border)", color: "var(--foreground)" }}><span className="block text-sm font-600">{role.name}</span>{role.description ? <span className="mt-1 block text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>{role.description}</span> : null}</button>
              ))}
              {!data.roles.length && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No roles are configured.</p>}
            </div>
            <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-sm font-700" style={{ color: "var(--foreground)" }}>{selectedRole?.name ?? "Permissions"}</h2>
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{selectedRole?.description || "Permissions assigned to this role"}</p>
              </div>
              <div className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
                {data.permissions.filter((permission) => permissionsForRole.has(permission.code)).map((permission) => (
                  <div key={permission.code} className="text-sm" style={{ color: "var(--foreground)" }}>
                    <div className="font-600">{permission.code}</div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{permission.description}</div>
                  </div>
                ))}
                {selectedRole && permissionsForRole.size === 0 && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No permissions have been assigned to this role.</p>}
                {!selectedRole && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Select a role to review its permissions.</p>}
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
