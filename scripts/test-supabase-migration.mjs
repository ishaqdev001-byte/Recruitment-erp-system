import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL("../supabase/migrations/202610030001_tenant_documents_security.sql", import.meta.url),
  "utf8",
);
const companySeed = await readFile(
  new URL("../supabase/migrations/202610040001_seed_kilax_dammy_recruit.sql", import.meta.url),
  "utf8",
);
const candidateSeed = await readFile(
  new URL("../supabase/migrations/202610040002_import_kilax_candidate_roster.sql", import.meta.url),
  "utf8",
);
const companyBrandingMigration = await readFile(
  new URL("../supabase/migrations/202610040003_company_branding.sql", import.meta.url),
  "utf8",
);
const defaultRolesMigration = await readFile(
  new URL("../supabase/migrations/202610040004_company_default_roles.sql", import.meta.url),
  "utf8",
);
const primaryUserProtectionMigration = await readFile(
  new URL("../supabase/migrations/202610040005_protect_primary_company_user.sql", import.meta.url),
  "utf8",
);
const documentEditorMigration = await readFile(
  new URL("../supabase/migrations/202610040006_track_document_editor.sql", import.meta.url),
  "utf8",
);
const candidateProfileMigration = await readFile(
  new URL("../supabase/migrations/202610040007_candidate_profile_details.sql", import.meta.url),
  "utf8",
);
const recruitmentAgentsMigration = await readFile(
  new URL("../supabase/migrations/202610040008_recruitment_agents.sql", import.meta.url),
  "utf8",
);
const employersMigration = await readFile(
  new URL("../supabase/migrations/202610040009_employers.sql", import.meta.url),
  "utf8",
);
const projectsMigration = await readFile(
  new URL("../supabase/migrations/202610040010_projects.sql", import.meta.url),
  "utf8",
);
const suppliersMigration = await readFile(
  new URL("../supabase/migrations/202610040011_suppliers.sql", import.meta.url),
  "utf8",
);
const invoicesMigration = await readFile(
  new URL("../supabase/migrations/202610040012_invoices.sql", import.meta.url),
  "utf8",
);
const financialReceiptsMigration = await readFile(
  new URL("../supabase/migrations/202610040013_financial_receipts.sql", import.meta.url),
  "utf8",
);
const passportTrackingMigration = await readFile(
  new URL("../supabase/migrations/202610040014_passport_tracking.sql", import.meta.url),
  "utf8",
);
const candidateVisaInvoicesMigration = await readFile(
  new URL("../supabase/migrations/202610040015_candidate_visa_invoices.sql", import.meta.url),
  "utf8",
);
const attendanceLeaveMigration = await readFile(
  new URL("../supabase/migrations/202610040016_attendance_leave.sql", import.meta.url),
  "utf8",
);
const attendanceHistoryMigration = await readFile(
  new URL("../supabase/migrations/202610040017_attendance_history_audit.sql", import.meta.url),
  "utf8",
);
const workspaceInvitationExpiryMigration = await readFile(
  new URL("../supabase/migrations/202610040018_workspace_invitation_expiry.sql", import.meta.url),
  "utf8",
);
const database = new PGlite();

const companyA = "10000000-0000-4000-8000-000000000001";
const companyB = "10000000-0000-4000-8000-000000000002";
const companyC = "10000000-0000-4000-8000-000000000003";
const userA = "20000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";
const userC = "20000000-0000-4000-8000-000000000003";
const userD = "20000000-0000-4000-8000-000000000004";
const roleA = "30000000-0000-4000-8000-000000000001";
const statusRole = "30000000-0000-4000-8000-000000000002";
const candidateA = "40000000-0000-4000-8000-000000000001";
const candidateB = "40000000-0000-4000-8000-000000000002";
const documentCv = "50000000-0000-4000-8000-000000000001";
const documentMedical = "50000000-0000-4000-8000-000000000002";

try {
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  await database.exec(migration);
  await database.exec(companySeed);
  await database.exec(candidateSeed);
  await database.exec(companyBrandingMigration);
  await database.exec(defaultRolesMigration);
  await database.exec(primaryUserProtectionMigration);
  await database.exec(documentEditorMigration);
  await database.exec(candidateProfileMigration);
  await database.exec(recruitmentAgentsMigration);
  await database.exec(recruitmentAgentsMigration);
  await database.exec(employersMigration);
  await database.exec(employersMigration);
  await database.exec(projectsMigration);
  await database.exec(suppliersMigration);
  await database.exec(suppliersMigration);
  await database.exec(invoicesMigration);
  await database.exec(invoicesMigration);
  await database.exec(financialReceiptsMigration);
  await database.exec(financialReceiptsMigration);
  await database.exec(passportTrackingMigration);
  await database.exec(passportTrackingMigration);
  await database.exec(candidateVisaInvoicesMigration);
  await database.exec(candidateVisaInvoicesMigration);
  await database.exec(attendanceLeaveMigration);
  await database.exec(attendanceLeaveMigration);
  await database.exec(attendanceHistoryMigration);
  await database.exec(attendanceHistoryMigration);
  await database.exec(workspaceInvitationExpiryMigration);
  await database.exec(workspaceInvitationExpiryMigration);

  const seededCompany = await database.query(
    "select id, name, status from public.companies where id = $1",
    ["7b4f08da-81a8-4f4b-9f74-31c326dae701"],
  );
  assert.deepEqual(seededCompany.rows, [{
    id: "7b4f08da-81a8-4f4b-9f74-31c326dae701",
    name: "Kilax Dammy Recruit",
    status: "trial",
  }]);
  const companyLogoColumn = await database.query(
    "select logo_url from public.companies where id = $1",
    ["7b4f08da-81a8-4f4b-9f74-31c326dae701"],
  );
  assert.equal(companyLogoColumn.rows[0].logo_url, "");
  const seededRoles = await database.query(
    "select name, description from public.company_roles where company_id = $1 order by name",
    ["7b4f08da-81a8-4f4b-9f74-31c326dae701"],
  );
  assert.ok(seededRoles.rows.some((role) => role.name === "CEO" && role.description.length > 0));
  assert.ok(seededRoles.rows.some((role) => role.name === "Documents Officer"));
  const financeUserPermissions = await database.query(
    `select permission.code from public.role_permissions role_permission
      join public.company_roles role on role.id = role_permission.role_id
      join public.permissions permission on permission.code = role_permission.permission_code
      where role.company_id = $1 and role.name = 'Finance User' order by permission.code`,
    ["7b4f08da-81a8-4f4b-9f74-31c326dae701"],
  );
  assert.deepEqual(financeUserPermissions.rows.map((permission) => permission.code), ["attendance.clock", "finance.create", "finance.view", "leave.create"]);

  await database.exec(`insert into public.companies (id, name) values ('${companyC}', 'New Company')`);
  const futureCompanyRoles = await database.query(
    "select count(*)::integer as count from public.company_roles where company_id = $1",
    [companyC],
  );
  assert.equal(futureCompanyRoles.rows[0].count, 11);
  const primaryRole = await database.query(
    "select id from public.company_roles where company_id = $1 and name = 'Company Owner / Primary Administrator'",
    [companyC],
  );
  const futureProjectPermissions = await database.query(
    `select role.name, role_permission.permission_code
      from public.role_permissions role_permission
      join public.company_roles role on role.id = role_permission.role_id
      where role.company_id = $1 and role.name in ('Company Owner / Primary Administrator', 'Branch Manager')
        and role_permission.permission_code like 'projects.%'
      order by role.name, role_permission.permission_code`,
    [companyC],
  );
  assert.ok(futureProjectPermissions.rows.some((permission) => permission.name === "Company Owner / Primary Administrator" && permission.permission_code === "projects.status"));
  assert.ok(!futureProjectPermissions.rows.some((permission) => permission.name === "Branch Manager" && permission.permission_code === "projects.status"));
  const futureSupplierPermissions = await database.query(
    `select role.name, role_permission.permission_code
      from public.role_permissions role_permission
      join public.company_roles role on role.id = role_permission.role_id
      where role.company_id = $1 and role.name = 'Company Owner / Primary Administrator'
        and role_permission.permission_code like 'suppliers.%'
      order by role_permission.permission_code`,
    [companyC],
  );
  assert.deepEqual(futureSupplierPermissions.rows.map((permission) => permission.permission_code), ["suppliers.create", "suppliers.view"]);
  await database.exec(`insert into auth.users (id) values ('${userC}')`);
  await database.query(
    "insert into public.company_memberships (company_id, user_id, role_id) values ($1, $2, $3)",
    [companyC, userC, primaryRole.rows[0].id],
  );
  const protectedPrimary = await database.query(
    "select primary_admin_user_id from public.companies where id = $1",
    [companyC],
  );
  assert.equal(protectedPrimary.rows[0].primary_admin_user_id, userC);
  await assert.rejects(
    database.query("update public.company_memberships set status = 'disabled' where company_id = $1 and user_id = $2", [companyC, userC]),
    /primary company administrator membership is protected/,
  );
  await assert.rejects(
    database.query("delete from public.company_memberships where company_id = $1 and user_id = $2", [companyC, userC]),
    /primary company administrator membership is protected/,
  );
  const seededCandidates = await database.query(
    "select count(*)::integer as count from public.candidates where company_id = $1",
    ["7b4f08da-81a8-4f4b-9f74-31c326dae701"],
  );
  assert.equal(seededCandidates.rows[0].count, 17);
  const candidateDetails = await database.query(
    "select details from public.candidates where company_id = $1 limit 1",
    ["7b4f08da-81a8-4f4b-9f74-31c326dae701"],
  );
  assert.deepEqual(candidateDetails.rows[0].details, {});
  const seededPassports = await database.query(
    "select count(*)::integer as count from public.candidate_passports where company_id = $1",
    ["7b4f08da-81a8-4f4b-9f74-31c326dae701"],
  );
  assert.equal(seededPassports.rows[0].count, 17);

  await database.exec(`
    insert into auth.users (id) values ('${userA}'), ('${userB}'), ('${userD}');
    insert into public.companies (id, name) values
      ('${companyA}', 'Company A'), ('${companyB}', 'Company B');
    insert into public.company_roles (id, company_id, name) values
      ('${roleA}', '${companyA}', 'Recruiter'),
      ('${statusRole}', '${companyA}', 'Status Manager');
    insert into public.company_memberships (company_id, user_id, role_id) values
      ('${companyA}', '${userA}', '${roleA}'),
      ('${companyA}', '${userB}', '${statusRole}');
    insert into public.company_memberships (company_id, user_id, role_id)
      select '${companyA}', '${userD}', id from public.company_roles where company_id = '${companyA}' and name = 'General Manager';
    update public.company_memberships set created_at = now() - interval '30 days' where company_id = '${companyA}';
    insert into public.role_permissions (role_id, company_id, permission_code) values
      ('${roleA}', '${companyA}', 'candidates.view'),
      ('${roleA}', '${companyA}', 'candidates.create'),
      ('${roleA}', '${companyA}', 'documents.view'),
      ('${roleA}', '${companyA}', 'documents.download');
    insert into public.role_permissions (role_id, company_id, permission_code) values
      ('${roleA}', '${companyA}', 'employers.view'),
      ('${roleA}', '${companyA}', 'employers.create'),
      ('${roleA}', '${companyA}', 'projects.view'),
      ('${roleA}', '${companyA}', 'projects.create'),
      ('${roleA}', '${companyA}', 'projects.edit'),
      ('${roleA}', '${companyA}', 'projects.delete'),
      ('${roleA}', '${companyA}', 'projects.status'),
      ('${roleA}', '${companyA}', 'suppliers.view'),
      ('${roleA}', '${companyA}', 'suppliers.create'),
      ('${roleA}', '${companyA}', 'finance.view'),
      ('${roleA}', '${companyA}', 'finance.create'),
      ('${roleA}', '${companyA}', 'candidates.edit'),
      ('${roleA}', '${companyA}', 'passport.view'),
      ('${roleA}', '${companyA}', 'passport.edit'),
      ('${statusRole}', '${companyA}', 'projects.view'),
      ('${statusRole}', '${companyA}', 'projects.status');
    insert into public.candidates (id, company_id, file_number, first_name, last_name) values
      ('${candidateA}', '${companyA}', 'A-001', 'Candidate', 'A'),
      ('${candidateB}', '${companyB}', 'B-001', 'Candidate', 'B');
    insert into public.candidate_documents (
      id, company_id, candidate_id, file_name, original_file_name, file_type,
      mime_type, file_size, storage_path, document_type, uploaded_by
    ) values
      ('${documentCv}', '${companyA}', '${candidateA}', 'cv.pdf', 'cv.pdf', 'pdf',
        'application/pdf', 100, 'company/${companyA}/candidates/${candidateA}/cv/60000000-0000-4000-8000-000000000001.pdf', 'cv', '${userA}'),
      ('${documentMedical}', '${companyA}', '${candidateA}', 'medical.pdf', 'medical.pdf', 'pdf',
        'application/pdf', 100, 'company/${companyA}/candidates/${candidateA}/medical/60000000-0000-4000-8000-000000000002.pdf', 'medical', '${userA}');
  `);
  const invitationId = "90000000-0000-4000-8000-000000000001";
  await database.query(
    `insert into public.workspace_invitations (id, company_id, user_id, role_id)
      values ($1, $2, $3, $4)`,
    [invitationId, companyA, userA, roleA],
  );
  const invitationExpiry = await database.query(
    `select extract(epoch from expires_at - created_at)::integer as lifetime_seconds
      from public.workspace_invitations where id = $1`,
    [invitationId],
  );
  assert.equal(invitationExpiry.rows[0].lifetime_seconds, 300);
  const invitationTableAccess = await database.query(
    "select has_table_privilege('authenticated', 'public.workspace_invitations', 'select') as can_read",
  );
  assert.equal(invitationTableAccess.rows[0].can_read, false);
  const originalDocumentEditor = await database.query(
    "select updated_by from public.candidate_documents where id = $1",
    [documentCv],
  );
  assert.equal(originalDocumentEditor.rows[0].updated_by, userA);

  await database.exec("set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);

  const recruiterAttendanceScope = await database.query(
    "select public.current_user_can_manage_company_attendance($1) as can_view_team",
    [companyA],
  );
  assert.deepEqual(recruiterAttendanceScope.rows, [{ can_view_team: false }]);
  const selfAttendancePermissions = await database.query(
    "select public.current_user_has_company_permission($1, 'attendance.clock') as can_clock, public.current_user_has_company_permission($1, 'leave.create') as can_request_leave",
    [companyA],
  );
  assert.deepEqual(selfAttendancePermissions.rows, [{ can_clock: true, can_request_leave: true }]);
  const tooOldAttendanceDate = await database.query("select ((now() at time zone 'Africa/Kampala')::date - interval '4 months')::date as work_date");
  await assert.rejects(
    database.query("select public.record_attendance_absences($1, $2, $2)", [companyA, tooOldAttendanceDate.rows[0].work_date]),
    /Personal attendance history is limited to three months/,
  );
  await assert.rejects(database.query("select public.record_attendance_action($1, 'check-in', '')", [companyA]), /Add a comment/);
  await database.exec("reset role");
  await database.query(
    `insert into public.attendance_records (company_id, employee_id, work_date, check_in_at, check_out_at)
      values ($1, $2, (now() at time zone 'Africa/Kampala')::date - interval '4 months', now() - interval '4 months', now() - interval '4 months' + interval '8 hours')`,
    [companyA, userA],
  );
  await database.exec("set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  const threeMonthPersonalHistory = await database.query(
    "select count(*)::integer as count from public.attendance_records where company_id = $1 and employee_id = $2",
    [companyA, userA],
  );
  assert.deepEqual(threeMonthPersonalHistory.rows, [{ count: 0 }]);
  await database.query("select public.record_attendance_action($1, 'check-in', 'Started work')", [companyA]);
  const ownAttendance = await database.query("select employee_id, check_out_at, check_in_comment, status from public.attendance_records where company_id = $1", [companyA]);
  assert.deepEqual(ownAttendance.rows, [{ employee_id: userA, check_out_at: null, check_in_comment: "Started work", status: "present" }]);
  await assert.rejects(database.query("select public.record_attendance_action($1, 'check-in', 'Duplicate attempt')", [companyA]), /already been recorded/);
  await assert.rejects(database.query("select public.record_attendance_action($1, 'check-in', 'Cross-tenant attempt')", [companyB]), /Attendance permission required/);
  await database.query("select public.record_attendance_action($1, 'check-out', 'Finished work')", [companyA]);
  const completedAttendance = await database.query("select check_out_at, check_out_comment from public.attendance_records where company_id = $1", [companyA]);
  assert.ok(completedAttendance.rows[0].check_out_at);
  assert.equal(completedAttendance.rows[0].check_out_comment, "Finished work");
  await assert.rejects(
    database.query("insert into public.attendance_records (company_id, employee_id, work_date, check_in_at) values ($1, $2, current_date, now())", [companyA, userB]),
    /permission denied|row-level security/,
  );

  const createdLeave = await database.query(
    `insert into public.leave_requests (company_id, employee_id, leave_type, start_date, end_date, reason)
      values ($1, $2, 'annual', '2026-10-12', '2026-10-14', 'Family plans') returning id, status`,
    [companyA, userA],
  );
  assert.equal(createdLeave.rows[0].status, "pending");
  const ownLeaveRequests = await database.query("select id from public.leave_requests where company_id = $1", [companyA]);
  assert.deepEqual(ownLeaveRequests.rows.map((request) => request.id), [createdLeave.rows[0].id]);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
  const coworkerLeaveRequests = await database.query("select id from public.leave_requests where company_id = $1", [companyA]);
  assert.deepEqual(coworkerLeaveRequests.rows, []);
  const coworkerAttendance = await database.query("select employee_id from public.attendance_records where company_id = $1", [companyA]);
  assert.deepEqual(coworkerAttendance.rows, []);
  await database.exec("reset role");
  await database.query(
    `insert into public.role_permissions (role_id, company_id, permission_code)
      values ($1, $2, 'attendance.view') on conflict do nothing`,
    [statusRole, companyA],
  );
  await database.exec("set role authenticated");
  const customRoleAttendanceScope = await database.query(
    "select public.current_user_can_manage_company_attendance($1) as can_view_team",
    [companyA],
  );
  assert.deepEqual(customRoleAttendanceScope.rows, [{ can_view_team: false }]);
  const coworkerStillCannotReadTeam = await database.query("select employee_id from public.attendance_records where company_id = $1", [companyA]);
  assert.deepEqual(coworkerStillCannotReadTeam.rows, []);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userD]);
  const managerVisibility = await database.query(
    "select public.current_user_can_manage_company_attendance($1) as can_view_attendance, public.current_user_has_company_permission($1, 'leave.manage') as can_review_leave",
    [companyA],
  );
  assert.deepEqual(managerVisibility.rows, [{ can_view_attendance: true, can_review_leave: true }]);
  const teamAttendance = await database.query("select employee_id from public.attendance_records where company_id = $1 and work_date = (now() at time zone 'Africa/Kampala')::date", [companyA]);
  assert.deepEqual(teamAttendance.rows.map((record) => record.employee_id), [userA]);
  const teamLeaveRequests = await database.query("select id from public.leave_requests where company_id = $1", [companyA]);
  assert.deepEqual(teamLeaveRequests.rows.map((request) => request.id), [createdLeave.rows[0].id]);
  await database.query("select public.review_leave_request($1, 'approved', 'Approved')", [createdLeave.rows[0].id]);
  const yesterday = await database.query("select (now() at time zone 'Africa/Kampala')::date - 1 as work_date");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  await database.query(
    `insert into public.leave_requests (company_id, employee_id, leave_type, start_date, end_date, reason)
      values ($1, $2, 'sick', $3, $3, 'Recovery day')`,
    [companyA, userA, yesterday.rows[0].work_date],
  );
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userD]);
  await database.query("select public.record_attendance_absences($1, $2, $2)", [companyA, yesterday.rows[0].work_date]);
  const dailyStates = await database.query("select employee_id, status from public.attendance_records where company_id = $1 and work_date = $2 order by employee_id", [companyA, yesterday.rows[0].work_date]);
  assert.deepEqual(dailyStates.rows, [
    { employee_id: userA, status: "leave" },
    { employee_id: userB, status: "absent" },
    { employee_id: userD, status: "absent" },
  ]);
  await database.exec("reset role");
  const dailyStateAudit = await database.query(
    "select action, metadata from public.audit_logs where entity_type = 'attendance_record'",
  );
  assert.ok(dailyStateAudit.rows.some((entry) => entry.action === "attendance_absent_marked"), JSON.stringify(dailyStateAudit.rows));
  assert.ok(dailyStateAudit.rows.some((entry) => entry.action === "attendance_leave_recorded"));
  await database.exec("set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userD]);
  const attendanceAudit = await database.query(
    "select action, metadata->>'check_in_comment' as check_in_comment from public.audit_logs where entity_type = 'attendance_record' and entity_id = (select id from public.attendance_records where company_id = $1 and employee_id = $2 and work_date = (now() at time zone 'Africa/Kampala')::date) order by created_at",
    [companyA, userA],
  );
  assert.ok(attendanceAudit.rows.some((entry) => entry.action === "attendance_checked_in" && entry.check_in_comment === "Started work"));
  assert.ok(attendanceAudit.rows.some((entry) => entry.action === "attendance_checked_out"));
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  const reviewedLeave = await database.query("select status, review_note, reviewed_by from public.leave_requests where id = $1", [createdLeave.rows[0].id]);
  assert.deepEqual(reviewedLeave.rows, [{ status: "approved", review_note: "Approved", reviewed_by: userD }]);

  const visibleCandidates = await database.query("select id from public.candidates order by id");
  assert.deepEqual(visibleCandidates.rows.map((row) => row.id), [candidateA]);
  await database.query(
    `update public.candidates set details = $2::jsonb where id = $1`,
    [candidateA, JSON.stringify({ passportNumber: "P-0001", passportIssue: "2026-01-01", passportExpiry: "2031-01-01", passportStatus: "Available", passportBranch: "Kampala", passportStorageLocation: "Locker A" })],
  );
  const syncedPassport = await database.query("select tracking_number, passport_number, passport_status, storage_branch, storage_location from public.candidate_passports where candidate_id = $1", [candidateA]);
  assert.deepEqual(syncedPassport.rows, [{ tracking_number: 1, passport_number: "P-0001", passport_status: "available", storage_branch: "Kampala", storage_location: "Locker A" }]);
  const listedPassport = await database.query("select tracking_number, candidate_name, file_number, agent_name, company_name from public.list_passport_tracking($1)", [companyA]);
  assert.deepEqual(listedPassport.rows, [{ tracking_number: 1, candidate_name: "Candidate A", file_number: "A-001", agent_name: "", company_name: "Company A" }]);
  await assert.rejects(
    database.query("update public.candidate_passports set passport_status = 'withdrawn' where candidate_id = $1", [candidateA]),
    /candidate_passports_withdrawn_details/,
  );
  await database.query(
    "update public.candidate_passports set passport_status = 'withdrawn', withdrawn_at = '2026-10-05', withdrawal_requested_by = 'Candidate A' where candidate_id = $1",
    [candidateA],
  );
  await assert.rejects(
    database.query("update public.candidate_passports set passport_status = 'transferred', withdrawn_at = null, withdrawal_requested_by = '' where candidate_id = $1", [candidateA]),
    /candidate_passports_transfer_details/,
  );

  await database.query(
    `insert into public.employers (company_id, created_by, company_name, contact_persons, phone_numbers, email_addresses, countries)
      values ($1, $2, 'Company A Employer', array['Contact'], array['+1 555 0100'], array['contact@example.com'], array['Uganda'])`,
    [companyA, userA],
  );
  const visibleEmployers = await database.query("select company_name from public.employers order by company_name");
  assert.deepEqual(visibleEmployers.rows.map((row) => row.company_name), ["Company A Employer"]);
  const contractor = await database.query("select id from public.employers where company_id = $1", [companyA]);
  const projectId = "70000000-0000-4000-8000-000000000001";
  await database.query(
    `insert into public.projects (id, company_id, contractor_id, contractor_name, project_name, country, salary_range, age_bracket, total_demand, service_charge, interview_mode, created_by)
      values ($1, $2, $3, 'Company A Employer', 'Project A', 'Uganda', 'UGX 1,000,000', '21-35', 10, 100, 'Online', $4)`,
    [projectId, companyA, contractor.rows[0].id, userA],
  );
  const visibleProjects = await database.query("select id from public.projects order by id");
  assert.deepEqual(visibleProjects.rows.map((row) => row.id), [projectId]);
  const supplierId = "80000000-0000-4000-8000-000000000001";
  await database.query(
    `insert into public.suppliers (id, company_id, created_by, supplier_name, contact_person, phone, email, branch)
      values ($1, $2, $3, 'Supplier A', 'Contact A', '+1 555 0101', 'supplier@example.com', 'Kampala')`,
    [supplierId, companyA, userA],
  );
  const visibleSuppliers = await database.query("select id from public.suppliers order by id");
  assert.deepEqual(visibleSuppliers.rows.map((row) => row.id), [supplierId]);
  const recipientOptions = await database.query("select recipient_type, recipient_name from public.list_invoice_recipients($1) order by recipient_type", [companyA]);
  assert.deepEqual(recipientOptions.rows.map((recipient) => recipient.recipient_type), ["candidate", "contractor", "supplier"]);
  const createdInvoice = await database.query(
    `insert into public.invoices (company_id, recipient_type, recipient_id, recipient_name, description, amount, due_date, created_by)
      values ($1, 'candidate', $2, 'Untrusted Recipient Name', 'Recruitment invoice', 100, '2026-10-15', $3)
      returning id, invoice_number, status`,
    [companyA, candidateA, userA],
  );
  assert.match(createdInvoice.rows[0].invoice_number, /^INV-\d{4}-\d{5}$/);
  assert.equal(createdInvoice.rows[0].status, "sent");
  const invoiceId = createdInvoice.rows[0].id;
  const savedRecipientName = await database.query("select recipient_name from public.invoices where id = $1", [invoiceId]);
  assert.equal(savedRecipientName.rows[0].recipient_name, "Candidate A");
  await database.query("select public.record_invoice_payment($1, $2)", [invoiceId, 40]);
  const partialInvoice = await database.query("select status from public.invoices where id = $1", [invoiceId]);
  assert.equal(partialInvoice.rows[0].status, "partially_paid");
  await database.query("select public.record_invoice_payment($1, $2)", [invoiceId, 60]);
  const paidInvoice = await database.query("select status from public.invoices where id = $1", [invoiceId]);
  assert.equal(paidInvoice.rows[0].status, "paid");
  await assert.rejects(database.query("select public.record_invoice_payment($1, $2)", [invoiceId, 1]), /exceeds the outstanding/);
  const receiptCandidates = await database.query("select candidate_name from public.list_finance_candidates($1)", [companyA]);
  assert.deepEqual(receiptCandidates.rows.map((candidate) => candidate.candidate_name), ["Candidate A"]);
  const candidateDeposit = await database.query(
    `insert into public.financial_receipts (company_id, entry_type, candidate_id, received_from, category, amount, payment_method, created_by)
      values ($1, 'candidate_deposit', $2, 'Spoofed Name', 'Candidate deposit', 25, 'Cash', $3)
      returning receipt_number, received_from`,
    [companyA, candidateA, userA],
  );
  assert.match(candidateDeposit.rows[0].receipt_number, /^RCT-\d{4}-\d{5}$/);
  assert.equal(candidateDeposit.rows[0].received_from, "Candidate A");
  await database.query(
    "update public.candidates set details = details || '{\"visaStatus\":\"Received\"}'::jsonb where id = $1",
    [candidateA],
  );
  const visaInvoicesBeforeAssignment = await database.query(
    "select count(*)::integer as count from public.invoices where visa_candidate_id = $1",
    [candidateA],
  );
  assert.equal(visaInvoicesBeforeAssignment.rows[0].count, 0);
  await database.query(
    `update public.candidates
      set position = 'Cook', details = details || '{"assignedContracts":"Project A"}'::jsonb
      where id = $1`,
    [candidateA],
  );
  const visaInvoices = await database.query(
    "select id, description, amount from public.invoices where visa_candidate_id = $1",
    [candidateA],
  );
  assert.equal(visaInvoices.rows.length, 1);
  assert.equal(visaInvoices.rows[0].description, "Visa payment for Cook");
  assert.equal(Number(visaInvoices.rows[0].amount), 100);
  const visaAllocation = await database.query(
    "select amount from public.invoice_deposit_allocations where invoice_id = $1",
    [visaInvoices.rows[0].id],
  );
  assert.deepEqual(visaAllocation.rows, [{ amount: "25.00" }]);
  const visaBalance = await database.query(
    `select invoice.amount - coalesce(sum(allocation.amount), 0) as balance_due
      from public.invoices invoice
      left join public.invoice_deposit_allocations allocation on allocation.invoice_id = invoice.id
      where invoice.id = $1 group by invoice.id`,
    [visaInvoices.rows[0].id],
  );
  assert.equal(Number(visaBalance.rows[0].balance_due), 75);
  await database.query(
    "update public.candidates set details = details || '{\"stage\":\"Final Round\"}'::jsonb where id = $1",
    [candidateA],
  );
  const duplicateVisaInvoices = await database.query(
    "select count(*)::integer as count from public.invoices where visa_candidate_id = $1",
    [candidateA],
  );
  assert.equal(duplicateVisaInvoices.rows[0].count, 1);
  await assert.rejects(database.query("select public.record_invoice_payment($1, $2)", [visaInvoices.rows[0].id, 76]), /exceeds the outstanding/);
  await database.query(
    `insert into public.financial_receipts (company_id, entry_type, received_from, category, amount, payment_method, created_by)
      values ($1, 'other_income', 'Training service', 'Other income', 15, 'Bank transfer', $2)`,
    [companyA, userA],
  );
  const invoiceInstallmentCount = await database.query("select count(*)::integer as count from public.invoice_payments where company_id = $1", [companyA]);
  const standaloneReceiptCount = await database.query("select count(*)::integer as count from public.financial_receipts where company_id = $1", [companyA]);
  assert.equal(invoiceInstallmentCount.rows[0].count, 2);
  assert.equal(standaloneReceiptCount.rows[0].count, 2);
  await assert.rejects(
    database.query(
      `insert into public.financial_receipts (company_id, entry_type, candidate_id, received_from, category, amount, payment_method, created_by)
        values ($1, 'candidate_deposit', $2, 'Candidate B', 'Deposit', 25, 'Cash', $3)`,
      [companyA, candidateB, userA],
    ),
  );
  await assert.rejects(
    database.query(
      `insert into public.invoices (company_id, recipient_type, recipient_id, recipient_name, description, amount, due_date, created_by)
        values ($1, 'candidate', $2, 'Candidate B', 'Cross-tenant invoice', 100, '2026-10-15', $3)`,
      [companyB, candidateB, userA],
    ),
  );
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
  await database.query("update public.projects set status = 'inactive' where id = $1", [projectId]);
  await assert.rejects(
    database.query("update public.projects set project_name = 'Unauthorized Edit' where id = $1", [projectId]),
    /status-only change/,
  );
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  await assert.rejects(
    database.query(
      `insert into public.projects (company_id, contractor_id, contractor_name, project_name, country, salary_range, age_bracket, total_demand, interview_mode, created_by)
        values ($1, $2, 'Company A Employer', 'Cross-tenant Project', 'Uganda', 'UGX 1,000,000', '21-35', 10, 'Online', $3)`,
      [companyB, contractor.rows[0].id, userA],
    ),
  );
  await assert.rejects(
    database.query(
      `insert into public.employers (company_id, created_by, company_name, contact_persons, phone_numbers, email_addresses, countries)
        values ($1, $2, 'Company B Employer', array['Contact'], array['+1 555 0100'], array['contact@example.com'], array['Uganda'])`,
      [companyB, userA],
    ),
  );
  await assert.rejects(
    database.query(
      `insert into public.suppliers (company_id, created_by, supplier_name, contact_person, phone, email, branch)
        values ($1, $2, 'Cross-tenant Supplier', 'Contact', '+1 555 0102', 'other@example.com', 'Kampala')`,
      [companyB, userA],
    ),
  );

  const visibleDocuments = await database.query("select id from public.candidate_documents order by id");
  assert.deepEqual(visibleDocuments.rows.map((row) => row.id), [documentCv]);

  const medicalDownload = await database.query(
    "select public.can_access_candidate_document($1, 'medical', 'download') as allowed",
    [companyA],
  );
  assert.equal(medicalDownload.rows[0].allowed, false);

  await database.exec("reset role");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
  await database.query("update public.candidate_documents set notes = 'Updated by another company user' where id = $1", [documentCv]);
  const changedDocumentEditor = await database.query(
    "select updated_by from public.candidate_documents where id = $1",
    [documentCv],
  );
  assert.equal(changedDocumentEditor.rows[0].updated_by, userB);
  await database.exec("reset role");

  await database.exec(`
    insert into public.role_permissions (role_id, company_id, permission_code) values
      ('${roleA}', '${companyA}', 'medical_documents.view'),
      ('${roleA}', '${companyA}', 'documents.edit');
  `);
  await database.exec("set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);

  await assert.rejects(
    database.query("update public.candidate_documents set document_type = 'other' where id = $1", [documentMedical]),
    /immutable/,
  );
  await assert.rejects(
    database.query(
      "insert into public.candidates (company_id, file_number, first_name, last_name) values ($1, 'B-002', 'Other', 'Tenant')",
      [companyB],
    ),
  );

  console.log("Supabase migration and tenant RLS checks passed.");
} finally {
  await database.close();
}