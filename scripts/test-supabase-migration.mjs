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
const candidateInquiriesMigration = await readFile(
  new URL("../supabase/migrations/202610170001_candidate_inquiries.sql", import.meta.url),
  "utf8",
);
const candidateInquiryMultipleJobsMigration = await readFile(
  new URL("../supabase/migrations/202610170002_candidate_inquiry_multiple_jobs.sql", import.meta.url),
  "utf8",
);
const medicalAppointmentsAndOtherIncomeMigration = await readFile(
  new URL("../supabase/migrations/202610170003_medical_appointments_and_other_income.sql", import.meta.url),
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
const companyDriveMigration = await readFile(
  new URL("../supabase/migrations/202610040019_company_drive.sql", import.meta.url),
  "utf8",
);
const companyDriveMountsMigration = await readFile(
  new URL("../supabase/migrations/202610040020_company_drive_mounts.sql", import.meta.url),
  "utf8",
);
const candidateDocumentStorageMigration = await readFile(
  new URL("../supabase/migrations/202610040021_candidate_document_storage.sql", import.meta.url),
  "utf8",
);
const candidateFinanceStorageMigration = await readFile(
  new URL("../supabase/migrations/202610040022_candidate_finance_storage.sql", import.meta.url),
  "utf8",
);
const userFolderStorageMigration = await readFile(
  new URL("../supabase/migrations/202610040023_user_folder_storage.sql", import.meta.url),
  "utf8",
);
const companyRootFolderAccessMigration = await readFile(
  new URL("../supabase/migrations/202610040024_company_root_folder_access.sql", import.meta.url),
  "utf8",
);
const googleTasksMigration = await readFile(
  new URL("../supabase/migrations/202610040025_google_tasks.sql", import.meta.url),
  "utf8",
);
const smsugCommunicationsMigration = await readFile(
  new URL("../supabase/migrations/202610040026_smsug_communications.sql", import.meta.url),
  "utf8",
);
const mailConnectionsMigration = await readFile(
  new URL("../supabase/migrations/202610040027_mail_connections.sql", import.meta.url),
  "utf8",
);
const smsContactGroupsMigration = await readFile(
  new URL("../supabase/migrations/202610040029_sms_contact_groups.sql", import.meta.url),
  "utf8",
);
const smsPermissionRepairMigration = await readFile(
  new URL("../supabase/migrations/202610040030_sms_permission_repair.sql", import.meta.url),
  "utf8",
);
const aiUsageMigration = await readFile(
  new URL("../supabase/migrations/202610120001_ai_usage.sql", import.meta.url),
  "utf8",
);
const companyStaffMigration = await readFile(
  new URL("../supabase/migrations/202610130001_company_staff.sql", import.meta.url),
  "utf8",
);
const staffHrProfileMigration = await readFile(
  new URL("../supabase/migrations/202610130002_staff_hr_profile.sql", import.meta.url),
  "utf8",
);
const staffPayrollMigration = await readFile(
  new URL("../supabase/migrations/202610130003_staff_auto_enrollment_payroll.sql", import.meta.url),
  "utf8",
);
const payrollAdjustmentMigration = await readFile(
  new URL("../supabase/migrations/202610130004_payroll_adjustment_batches.sql", import.meta.url),
  "utf8",
);
const companyAccountsMigration = await readFile(
  new URL("../supabase/migrations/202610130005_company_accounts_books.sql", import.meta.url),
  "utf8",
);
const staffPayrollCompensationMigration = await readFile(
  new URL("../supabase/migrations/202610140002_staff_payroll_compensation.sql", import.meta.url),
  "utf8",
);
const projectChargesMigration = await readFile(
  new URL("../supabase/migrations/202610140001_project_contractor_candidate_charges.sql", import.meta.url),
  "utf8",
);
const projectSubmissionCountsMigration = await readFile(
  new URL("../supabase/migrations/202610150001_project_submission_counts.sql", import.meta.url),
  "utf8",
);
const database = new PGlite();

const companyA = "10000000-0000-4000-8000-000000000001";
const companyB = "10000000-0000-4000-8000-000000000002";
const companyC = "10000000-0000-4000-8000-000000000003";
const companyD = "10000000-0000-4000-8000-000000000004";
const userA = "20000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";
const userC = "20000000-0000-4000-8000-000000000003";
const userD = "20000000-0000-4000-8000-000000000004";
const userE = "20000000-0000-4000-8000-000000000005";
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
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    grant usage on schema auth to service_role;
    grant insert, select, update, delete on auth.users to service_role;
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
  await database.exec(candidateInquiriesMigration);
  await database.exec(candidateInquiriesMigration);
  await database.exec(attendanceLeaveMigration);
  await database.exec(attendanceLeaveMigration);
  await database.exec(attendanceHistoryMigration);
  await database.exec(attendanceHistoryMigration);
  await database.exec(workspaceInvitationExpiryMigration);
  await database.exec(workspaceInvitationExpiryMigration);
  await database.exec(companyDriveMigration);
  await database.exec(companyDriveMigration);
  await database.exec(companyDriveMountsMigration);
  await database.exec(companyDriveMountsMigration);
  await database.exec(candidateDocumentStorageMigration);
  await database.exec(candidateDocumentStorageMigration);
  await database.exec(candidateFinanceStorageMigration);
  await database.exec(candidateFinanceStorageMigration);
  await database.exec(userFolderStorageMigration);
  await database.exec(userFolderStorageMigration);
  const legacyRootId = "90000000-0000-4000-8000-000000000010";
  const legacyPersonalFolderId = "90000000-0000-4000-8000-000000000011";
  const ownerRootId = "90000000-0000-4000-8000-000000000012";
  const ownerPersonalFolderId = "90000000-0000-4000-8000-000000000013";
  const ownerFileId = "90000000-0000-4000-8000-000000000014";
  await database.exec(`
    insert into auth.users (id) values ('${userA}');
    insert into public.companies (id, name) values ('${companyC}', 'New Company');
    insert into public.companies (id, name, primary_admin_user_id) values ('${companyD}', 'Owner Company', '${userA}');
    insert into public.company_drive_items (id, company_id, item_type, category, name, is_system, created_by, modified_by)
      values ('${legacyRootId}', '${companyC}', 'folder', 'shared', 'New Company', true, '${userA}', '${userA}');
    insert into public.company_drive_items (id, company_id, parent_id, item_type, category, name, is_system, created_by, modified_by)
      values ('${legacyPersonalFolderId}', '${companyC}', '${legacyRootId}', 'folder', 'shared', 'User A', true, '${userA}', '${userA}');
    insert into public.company_drive_items (id, company_id, item_type, category, name, is_system, created_by, modified_by)
      values ('${ownerRootId}', '${companyD}', 'folder', 'shared', 'Owner Company', true, '${userA}', '${userA}');
    insert into public.company_drive_items (id, company_id, parent_id, item_type, category, name, is_system, created_by, modified_by)
      values ('${ownerPersonalFolderId}', '${companyD}', '${ownerRootId}', 'folder', 'shared', 'Owner Name', true, '${userA}', '${userA}');
    insert into public.company_drive_items (
      id, company_id, parent_id, item_type, category, name, file_type, mime_type,
      file_size, storage_path, created_by, modified_by
    ) values (
      '${ownerFileId}', '${companyD}', '${ownerPersonalFolderId}', 'file', 'shared', 'Owner file.pdf', 'pdf', 'application/pdf',
      100, 'company/${companyD}/users/${userA}/owner-name--${ownerPersonalFolderId}/${ownerFileId}.pdf', '${userA}', '${userA}'
    );
  `);
  await database.exec(companyRootFolderAccessMigration);
  await database.exec(companyRootFolderAccessMigration);
  await database.exec(googleTasksMigration);
  await database.exec(smsugCommunicationsMigration);
  await database.exec(mailConnectionsMigration);
  await database.exec(smsContactGroupsMigration);
  await database.exec(smsContactGroupsMigration);
  await database.query(
    "delete from public.role_permissions where company_id = $1 and permission_code = 'communications.sms.send'",
    [companyC],
  );
  await database.exec(smsPermissionRepairMigration);
  await database.exec(smsPermissionRepairMigration);
  await database.exec(aiUsageMigration);
  await database.exec(aiUsageMigration);
  await database.exec(companyStaffMigration);
  await database.exec(staffHrProfileMigration);
  await database.exec(staffPayrollMigration);
  await database.exec(payrollAdjustmentMigration);
  await database.exec(companyAccountsMigration);
  await database.exec(companyAccountsMigration);
  await database.exec(medicalAppointmentsAndOtherIncomeMigration);
  await database.exec(medicalAppointmentsAndOtherIncomeMigration);
  await database.exec(staffPayrollCompensationMigration);
  await database.exec(staffPayrollCompensationMigration);
  await database.exec(`
    grant usage on schema public to service_role;
    grant all privileges on all tables in schema public to service_role;
    grant all privileges on all sequences in schema public to service_role;
  `);
  const legacyContractorId = "80000000-0000-4000-8000-000000000002";
  const legacyProjectId = "70000000-0000-4000-8000-000000000002";
  await database.query(
    `insert into public.company_memberships (company_id, user_id, role_id)
      select $1, $2, id from public.company_roles
      where company_id = $1 and name = 'Company Owner / Primary Administrator'`,
    [companyD, userA],
  );
  await database.query(
    `insert into public.employers (id, company_id, created_by, company_name, contact_persons, phone_numbers, email_addresses, countries)
      values ($1, $2, $3, 'Legacy Contractor', array['Contact'], array['+1 555 0199'], array['legacy@example.com'], array['Uganda'])`,
    [legacyContractorId, companyD, userA],
  );
  await database.query(
    `insert into public.projects (id, company_id, contractor_id, contractor_name, project_name, country, salary_range, age_bracket, total_demand, service_charge, interview_mode, created_by)
      values ($1, $2, $3, 'Legacy Contractor', 'Legacy Project', 'Uganda', 'UGX 1,000,000', '21-35', 1, 500, 'Online', $4)`,
    [legacyProjectId, companyD, legacyContractorId, userA],
  );
  await database.exec(projectChargesMigration);
  await database.exec(projectChargesMigration);
  const legacyProjectAccount = await database.query(
    "select account_id from public.projects where id = $1",
    [legacyProjectId],
  );
  assert.ok(legacyProjectAccount.rows[0].account_id);
  const legacyProjectBook = await database.query(
    "select account_type from public.company_accounts where id = $1",
    [legacyProjectAccount.rows[0].account_id],
  );
  assert.deepEqual(legacyProjectBook.rows, [{ account_type: "project" }]);

  const staffTables = await database.query(
    `select relname, relrowsecurity from pg_class
      where relname in ('company_accounts', 'company_account_transactions', 'company_expenses', 'company_staff_documents', 'company_staff_id_settings', 'company_staff_members', 'company_staff_paychecks', 'company_staff_payroll_adjustments', 'company_payroll_reference_settings')
      order by relname`,
  );
  assert.deepEqual(staffTables.rows, [
    { relname: "company_account_transactions", relrowsecurity: true },
    { relname: "company_accounts", relrowsecurity: true },
    { relname: "company_expenses", relrowsecurity: true },
    { relname: "company_payroll_reference_settings", relrowsecurity: true },
    { relname: "company_staff_documents", relrowsecurity: true },
    { relname: "company_staff_id_settings", relrowsecurity: true },
    { relname: "company_staff_members", relrowsecurity: true },
    { relname: "company_staff_paychecks", relrowsecurity: true },
    { relname: "company_staff_payroll_adjustments", relrowsecurity: true },
  ]);
  await database.query(
    "insert into public.company_staff_id_settings (company_id, staff_id_prefix, next_sequence) values ($1, 'AB', 8)",
    [companyC],
  );
  const allocatedStaffId = await database.query(
    "select * from public.allocate_company_staff_sequence($1)",
    [companyC],
  );
  assert.deepEqual(allocatedStaffId.rows, [{ staff_id_prefix: "AB", sequence_number: 8 }]);
  const nextStaffSequence = await database.query(
    "select next_sequence from public.company_staff_id_settings where company_id = $1",
    [companyC],
  );
  assert.equal(nextStaffSequence.rows[0].next_sequence, 9);

  const smsGroupTables = await database.query(
    `select relname, relrowsecurity from pg_class
      where relname in ('sms_contact_groups', 'sms_contact_group_members') order by relname`,
  );
  assert.deepEqual(smsGroupTables.rows, [
    { relname: "sms_contact_group_members", relrowsecurity: true },
    { relname: "sms_contact_groups", relrowsecurity: true },
  ]);
  const ownerSmsPermission = await database.query(
    `select count(*)::integer as count from public.role_permissions role_permission
      join public.company_roles role on role.id = role_permission.role_id
      where role.company_id = $1 and role.name = 'Company Owner / Primary Administrator'
        and role_permission.permission_code = 'communications.sms.send'`,
    [companyC],
  );
  assert.equal(ownerSmsPermission.rows[0].count, 1);

  const migratedUsersFolder = await database.query(
    "select id from public.company_drive_items where company_id = $1 and parent_id = $2 and lower(name) = 'users'",
    [companyC, legacyRootId],
  );
  const migratedPersonalFolder = await database.query(
    "select parent_id from public.company_drive_items where id = $1",
    [legacyPersonalFolderId],
  );
  assert.equal(migratedPersonalFolder.rows[0].parent_id, migratedUsersFolder.rows[0].id);
  const migratedOwnerFile = await database.query(
    "select parent_id from public.company_drive_items where id = $1",
    [ownerFileId],
  );
  assert.equal(migratedOwnerFile.rows[0].parent_id, ownerRootId);
  const removedOwnerFolder = await database.query(
    "select id from public.company_drive_items where id = $1",
    [ownerPersonalFolderId],
  );
  assert.deepEqual(removedOwnerFolder.rows, []);

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
  assert.deepEqual(financeUserPermissions.rows.map((permission) => permission.code), ["attendance.clock", "communications.email.read", "communications.email.send", "communications.sms.send", "drive.delete.own", "drive.edit", "drive.finance.view", "drive.move", "drive.upload", "drive.view", "finance.create", "finance.view", "leave.create", "tasks.create", "tasks.edit", "tasks.view"]);

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
  const autoStaffRecord = await database.query(
    "select id, staff_id, linked_user_id from public.company_staff_members where company_id = $1 and linked_user_id = $2",
    [companyC, userC],
  );
  assert.equal(autoStaffRecord.rows.length, 1);
  assert.equal(autoStaffRecord.rows[0].staff_id, "AB-0009");
  assert.equal(autoStaffRecord.rows[0].linked_user_id, userC);
  const payrollReference = await database.query(
    "select public.allocate_company_payroll_reference($1) as reference",
    [companyC],
  );
  assert.equal(payrollReference.rows[0].reference, "NC-000001");
  await database.query(
    `insert into public.company_staff_payroll_adjustments (
      company_id, staff_member_id, pay_period, adjustment_type, amount,
      payment_method, payment_reference, description, created_by
    ) values ($1, $2, '2026-10-01', 'benefit', 25000, 'Mobile money', $3, 'Transport allowance', $4)`,
    [companyC, autoStaffRecord.rows[0].id, payrollReference.rows[0].reference, userC],
  );
  const recordedAdjustment = await database.query(
    "select adjustment_type, amount, payment_reference from public.company_staff_payroll_adjustments where company_id = $1",
    [companyC],
  );
  assert.deepEqual(recordedAdjustment.rows, [{ adjustment_type: "benefit", amount: "25000.00", payment_reference: "NC-000001" }]);
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
    insert into auth.users (id) values ('${userB}'), ('${userD}'), ('${userE}');
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
    insert into public.company_memberships (company_id, user_id, role_id)
      select '${companyA}', '${userE}', id from public.company_roles where company_id = '${companyA}' and name = 'Finance Manager';
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
      ('${statusRole}', '${companyA}', 'candidates.edit'),
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
  const defaultMedicalTypes = await database.query(
    "select name, fee, account_id from public.company_income_types where company_id = $1 and is_default order by name",
    [companyD],
  );
  assert.deepEqual(defaultMedicalTypes.rows.map((item) => item.name), ["General Medical Examination", "Laboratory Test", "X-Ray"]);
  assert.ok(defaultMedicalTypes.rows.every((item) => item.fee === "0.00" && item.account_id));
  const convertedInquiryId = "91000000-0000-4000-8000-000000000001";
  const overdueInquiryId = "91000000-0000-4000-8000-000000000002";
  const legacyInquiryId = "91000000-0000-4000-8000-000000000003";
  const convertedInquiryCandidateId = "40000000-0000-4000-8000-000000000004";
  await database.exec("reset role; set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  await database.exec("reset role; set role service_role");
  await database.query(
    `insert into public.candidate_inquiries (
      id, company_id, created_by, first_name, last_name, phone, discovery_source,
      desired_countries, job_of_interest, communication_method, handled_by_user_id, handled_by_name
    ) values ($1, $2, $3, 'Legacy', 'Inquiry', '+256700000003', 'walk_in', array['UAE'], 'Cleaner', 'call', $3, 'Recruiter A')`,
    [legacyInquiryId, companyA, userA],
  );
  await database.exec("reset role");
  await database.exec(candidateInquiryMultipleJobsMigration);
  await database.exec(candidateInquiryMultipleJobsMigration);
  const migratedJobInterests = await database.query("select job_of_interest from public.candidate_inquiries where id = $1", [legacyInquiryId]);
  assert.deepEqual(migratedJobInterests.rows, [{ job_of_interest: ["Cleaner"] }]);
  await database.exec("set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  await database.query(
    `insert into public.candidate_inquiries (
      id, company_id, created_by, first_name, last_name, phone, discovery_source,
      desired_countries, job_of_interest, communication_method, handled_by_user_id, handled_by_name
    ) values ($1, $2, $3, 'Converted', 'Inquiry', '+256700000001', 'walk_in', array['UAE'], array['Cleaner', 'Cook'], 'call', $3, 'Recruiter A')`,
    [convertedInquiryId, companyA, userA],
  );
  await database.query(
    `insert into public.candidates (id, company_id, file_number, first_name, last_name, phone, created_by, inquiry_id)
      values ($1, $2, 'A-INQ-001', 'Converted', 'Inquiry', '+256700000001', $3, $4)`,
    [convertedInquiryCandidateId, companyA, userA, convertedInquiryId],
  );
  const convertedInquiry = await database.query("select status, job_of_interest from public.candidate_inquiries where id = $1", [convertedInquiryId]);
  assert.deepEqual(convertedInquiry.rows, [{ status: "converted", job_of_interest: ["Cleaner", "Cook"] }]);

  await database.query(
    `insert into public.candidate_inquiries (
      id, company_id, created_by, first_name, last_name, phone, discovery_source,
      desired_countries, job_of_interest, communication_method, handled_by_user_id, handled_by_name, created_at
    ) values ($1, $2, $3, 'Overdue', 'Inquiry', '+256700000002', 'radio', array['Qatar'], array['Cook'], 'both', $3, 'Recruiter A', now() - interval '16 days')`,
    [overdueInquiryId, companyA, userA],
  );
  await database.query("select public.dispatch_candidate_inquiry_reminders($1)", [companyA]);
  await database.query("select public.dispatch_candidate_inquiry_reminders($1)", [companyA]);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userD]);
  const firstInquiryReminder = await database.query(
    "select title, body from public.candidate_inquiry_notifications where company_id = $1 and recipient_id = $2",
    [companyA, userD],
  );
  assert.equal(firstInquiryReminder.rows.length, 1);
  assert.equal(firstInquiryReminder.rows[0].title, "Candidate inquiry follow-up");
  assert.match(firstInquiryReminder.rows[0].body, /Hello/);
  assert.match(firstInquiryReminder.rows[0].body, /Overdue Inquiry/);
  await database.exec("reset role; set role service_role");
  await database.query("update public.candidate_inquiries set last_reminded_at = now() - interval '16 days' where id = $1", [overdueInquiryId]);
  await database.exec("reset role; set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  await database.query("select public.dispatch_candidate_inquiry_reminders($1)", [companyA]);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userD]);
  const repeatedInquiryReminders = await database.query(
    "select id from public.candidate_inquiry_notifications where company_id = $1 and recipient_id = $2",
    [companyA, userD],
  );
  assert.equal(repeatedInquiryReminders.rows.length, 2);
  await database.exec("reset role; set role service_role");
  const largeCandidateInvoiceId = "50000000-0000-4000-8000-000000000003";
  await database.query(
    `insert into public.candidate_documents (
      id, company_id, candidate_id, file_name, original_file_name, file_type,
      mime_type, file_size, storage_path, document_type, uploaded_by
    ) values ($1, $2, $3, 'invoice.pdf', 'invoice.pdf', 'pdf',
      'application/pdf', 5242880, $4, 'invoice', $5)`,
    [largeCandidateInvoiceId, companyA, candidateA, `company/${companyA}/candidates/candidate-a--${candidateA}/invoice/${largeCandidateInvoiceId}.pdf`, userA],
  );
  const largeCandidateInvoice = await database.query(
    "select file_size, document_type from public.candidate_documents where id = $1",
    [largeCandidateInvoiceId],
  );
  assert.deepEqual(largeCandidateInvoice.rows, [{ file_size: 5242880, document_type: "invoice" }]);
  await database.query("delete from public.candidate_documents where id = $1", [largeCandidateInvoiceId]);
  await database.exec("reset role; set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  await database.exec("reset role; set role service_role");
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
  await database.exec("reset role; set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
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

  await database.query(
    `insert into public.ai_usage_logs (company_id, user_id, document_type, model, input_tokens, output_tokens)
      values ($1, $2, 'cv', 'gpt-4o-mini', 120, 80)`,
    [companyA, userA],
  );
  await database.query(
    `insert into public.ai_usage_logs (company_id, user_id, document_type, model, input_tokens, output_tokens)
      values ($1, $2, 'academic', 'gpt-4o-mini', 10, 20), ($1, $2, 'chat', 'gpt-4o-mini', 15, 5)`,
    [companyA, userA],
  );
  const companyAiUsage = await database.query("select public.company_ai_usage_total($1) as tokens", [companyA]);
  assert.deepEqual(companyAiUsage.rows, [{ tokens: 250 }]);
  const unrelatedCompanyAiUsage = await database.query("select public.company_ai_usage_total($1) as tokens", [companyB]);
  assert.deepEqual(unrelatedCompanyAiUsage.rows, [{ tokens: 0 }]);
  await assert.rejects(
    database.query(
      `insert into public.ai_usage_logs (company_id, user_id, document_type, model, input_tokens, output_tokens)
        values ($1, $2, 'cv', 'gpt-4o-mini', 120, 80)`,
      [companyB, userA],
    ),
    /row-level security|permission denied/,
  );

  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
  const coworkerCandidateDocuments = await database.query(
    "select document_type from public.candidate_documents where company_id = $1 order by document_type",
    [companyA],
  );
  assert.deepEqual(coworkerCandidateDocuments.rows.map((document) => document.document_type), ["cv", "medical"]);
  const coworkerCandidates = await database.query(
    "select id from public.candidates where company_id = $1 order by id",
    [companyA],
  );
  assert.deepEqual(coworkerCandidates.rows, [
    { id: candidateA },
    { id: convertedInquiryCandidateId },
  ]);
  const unrelatedFinanceAccess = await database.query(
    "select public.can_access_company_drive($1, 'finance', 'view') as can_view",
    [companyA],
  );
  assert.deepEqual(unrelatedFinanceAccess.rows, [{ can_view: false }]);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userD]);
  const generalManagerFinanceAccess = await database.query(
    "select public.can_access_company_drive($1, 'finance', 'view') as can_view",
    [companyA],
  );
  assert.deepEqual(generalManagerFinanceAccess.rows, [{ can_view: true }]);
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
    { employee_id: userE, status: "absent" },
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

  const sharedFolderId = "90000000-0000-4000-8000-000000000001";
  const ownerManagedFolderId = "90000000-0000-4000-8000-000000000002";
  const financeDriveFileId = "90000000-0000-4000-8000-000000000003";
  const userDriveRootId = "90000000-0000-4000-8000-000000000006";
  const usersFolderId = "90000000-0000-4000-8000-000000000009";
  const personalFolderId = "90000000-0000-4000-8000-000000000007";
  const selectedFolderId = "90000000-0000-4000-8000-000000000008";
  await database.query(
    `insert into public.company_drive_items (id, company_id, item_type, category, name, is_system, created_by, modified_by)
      values ($1, $2, 'folder', 'shared', 'Company A', true, $3, $3)`,
    [userDriveRootId, companyA, userA],
  );
  await database.query(
    `insert into public.company_drive_items (id, company_id, parent_id, item_type, category, name, is_system, created_by, modified_by)
      values ($1, $2, $3, 'folder', 'shared', 'Users', true, $4, $4)`,
    [usersFolderId, companyA, userDriveRootId, userA],
  );
  await database.query(
    `insert into public.company_drive_items (id, company_id, parent_id, item_type, category, name, is_system, created_by, modified_by)
      values ($1, $2, $3, 'folder', 'shared', 'Aisha Khan', true, $4, $4)`,
    [personalFolderId, companyA, usersFolderId, userA],
  );
  await database.query(
    `insert into public.company_drive_items (id, company_id, parent_id, item_type, category, name, created_by, modified_by)
      values ($1, $2, $3, 'folder', 'shared', 'Local Backup', $4, $4)`,
    [selectedFolderId, companyA, personalFolderId, userA],
  );
  const resolvedUserFolderPath = await database.query(
    "select folder_ids, folder_names from public.company_drive_personal_folder_path($1, $2)",
    [companyA, selectedFolderId],
  );
  assert.deepEqual(resolvedUserFolderPath.rows, [{
    folder_ids: [selectedFolderId, personalFolderId],
    folder_names: ["Local Backup", "Aisha Khan"],
  }]);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
  const colleaguePersonalFolderPath = await database.query(
    "select folder_ids, folder_names from public.company_drive_personal_folder_path($1, $2)",
    [companyA, selectedFolderId],
  );
  assert.deepEqual(colleaguePersonalFolderPath.rows, []);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  await database.query(
    `insert into public.company_drive_items (id, company_id, item_type, category, name, created_by, modified_by)
      values ($1, $2, 'folder', 'shared', 'Aisha Documents', $3, $3)`,
    [sharedFolderId, companyA, userA],
  );
  const userBackupFileId = "90000000-0000-4000-8000-000000000005";
  await database.query(
    `insert into public.company_drive_items (
      id, company_id, parent_id, item_type, category, name, file_type, mime_type,
      file_size, storage_path, created_by, modified_by
    ) values ($1, $2, null, 'file', 'shared', 'backup.txt', 'txt', 'text/plain', 100, $3, $4, $4)`,
    [userBackupFileId, companyA, `company/${companyA}/drive/${userBackupFileId}.txt`, userA],
  );
  await database.query(
    `update public.company_drive_items set
      file_type = 'pdf', mime_type = 'application/pdf', file_size = 200,
      storage_path = $2, modified_by = $3 where id = $1`,
    [userBackupFileId, `company/${companyA}/users/${userA}/aisha-khan--${personalFolderId}/local-backup--${selectedFolderId}/${userBackupFileId}.pdf`, userA],
  );
  const updatedBackupFile = await database.query(
    "select file_type, file_size, storage_path from public.company_drive_items where id = $1",
    [userBackupFileId],
  );
  assert.deepEqual(updatedBackupFile.rows, [{ file_type: "pdf", file_size: 200, storage_path: `company/${companyA}/users/${userA}/aisha-khan--${personalFolderId}/local-backup--${selectedFolderId}/${userBackupFileId}.pdf` }]);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
  const colleagueDriveFolder = await database.query("select id, name from public.company_drive_items where id = $1", [sharedFolderId]);
  assert.deepEqual(colleagueDriveFolder.rows, [{ id: sharedFolderId, name: "Aisha Documents" }]);
  await database.query("update public.company_drive_items set name = 'Aisha Workspace', modified_by = $2 where id = $1", [sharedFolderId, userB]);
  const colleagueDelete = await database.query("delete from public.company_drive_items where id = $1 returning id", [sharedFolderId]);
  assert.deepEqual(colleagueDelete.rows, []);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  await database.query("delete from public.company_drive_items where id = $1", [sharedFolderId]);
  await database.query(
    `insert into public.company_drive_items (id, company_id, item_type, category, name, created_by, modified_by)
      values ($1, $2, 'folder', 'shared', 'Owner managed folder', $3, $3)`,
    [ownerManagedFolderId, companyA, userA],
  );
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userD]);
  await database.query("delete from public.company_drive_items where id = $1", [ownerManagedFolderId]);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userE]);
  await database.query(
    `insert into public.company_drive_items (
      id, company_id, item_type, category, name, file_type, mime_type, file_size,
      storage_path, source_type, source_id, created_by, modified_by
    ) values (
      $1, $2, 'file', 'finance', 'RCT-2026-00001.pdf', 'pdf', 'application/pdf', 100,
      $3, 'receipt', '90000000-0000-4000-8000-000000000004', $4, $4
    )`,
    [financeDriveFileId, companyA, `company/${companyA}/drive/${financeDriveFileId}.pdf`, userE],
  );
  await database.query(
    "update public.company_drive_items set storage_path = $2, modified_by = $3 where id = $1",
    [financeDriveFileId, `company/${companyA}/finance/candidates/candidate-a--${candidateA}/invoice/${financeDriveFileId}.pdf`, userE],
  );
  const financeManagerDriveAccess = await database.query("select id, storage_path from public.company_drive_items where id = $1", [financeDriveFileId]);
  assert.deepEqual(financeManagerDriveAccess.rows, [{ id: financeDriveFileId, storage_path: `company/${companyA}/finance/candidates/candidate-a--${candidateA}/invoice/${financeDriveFileId}.pdf` }]);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userD]);
  const generalManagerFinanceDriveAccess = await database.query("select id from public.company_drive_items where id = $1", [financeDriveFileId]);
  assert.deepEqual(generalManagerFinanceDriveAccess.rows, [{ id: financeDriveFileId }]);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  const recruiterFinanceDriveAccess = await database.query("select id from public.company_drive_items where id = $1", [financeDriveFileId]);
  assert.deepEqual(recruiterFinanceDriveAccess.rows, []);

  const visibleCandidates = await database.query("select id from public.candidates order by id");
  assert.deepEqual(visibleCandidates.rows.map((row) => row.id), [candidateA, convertedInquiryCandidateId]);
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
  const visibleEmployers = await database.query("select company_name from public.employers where company_id = $1 order by company_name", [companyA]);
  assert.deepEqual(visibleEmployers.rows.map((row) => row.company_name), ["Company A Employer"]);
  const contractor = await database.query("select id from public.employers where company_id = $1", [companyA]);
  const accountId = "a0000000-0000-4000-8000-000000000001";
  await database.exec("reset role; set role service_role");
  await database.query(
    `insert into public.company_accounts (id, company_id, name, account_type, created_by)
      values ($1, $2, 'Main Cash', 'cash', $3)`,
    [accountId, companyA, userA],
  );
  const transportStaffId = "b0000000-0000-4000-8000-000000000001";
  await assert.rejects(
    database.query(
      `insert into public.company_staff_members (company_id, staff_id, name, position, date_of_birth, date_joined, created_by, pay_type, base_salary)
        values ($1, 'A-TR01', 'Transport Test', 'Driver', '1990-01-01', '2026-10-01', $2, 'project', 100000)`,
      [companyA, userA],
    ),
    /company_staff_members_non_payroll_compensation_check/,
  );
  await assert.rejects(
    database.query(
      `insert into public.company_staff_members (company_id, staff_id, name, position, date_of_birth, date_joined, created_by, pay_type, base_salary, weekly_transport_allowance)
        values ($1, 'A-TR02', 'Transport Test', 'Driver', '1990-01-01', '2026-10-01', $2, 'payroll', 100000, 25000)`,
      [companyA, userA],
    ),
    /company_staff_members_transport_account_required_check/,
  );
  await database.query(
    `insert into public.company_staff_members (id, company_id, staff_id, name, position, date_of_birth, date_joined, created_by, pay_type, base_salary, weekly_transport_allowance, transport_account_id)
      values ($1, $2, 'A-TR03', 'Transport Test', 'Driver', '1990-01-01', '2026-10-01', $3, 'payroll', 1000000, 25000, $4)`,
    [transportStaffId, companyA, userA, accountId],
  );
  const transportStaffCompensation = await database.query(
    "select pay_type, base_salary, weekly_transport_allowance, transport_account_id from public.company_staff_members where id = $1",
    [transportStaffId],
  );
  assert.deepEqual(transportStaffCompensation.rows, [{ pay_type: "payroll", base_salary: "1000000.00", weekly_transport_allowance: "25000.00", transport_account_id: accountId }]);

  const nonOwnerRoleUser = "20000000-0000-4000-8000-000000000006";
  const nonOwnerRoleId = "30000000-0000-4000-8000-000000000006";
  await database.exec("reset role; set role service_role");
  await database.query("insert into auth.users (id) values ($1)", [nonOwnerRoleUser]);
  await database.query(
    "insert into public.company_roles (id, company_id, name, description) values ($1, $2, 'Recruitment Manager', 'Project support')",
    [nonOwnerRoleId, companyA],
  );
  await database.query(
    "insert into public.company_memberships (company_id, user_id, role_id, status) values ($1, $2, $3, 'active')",
    [companyA, nonOwnerRoleUser, nonOwnerRoleId],
  );
  await database.exec("reset role; set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [nonOwnerRoleUser]);
  await assert.rejects(
    database.query(
      `insert into public.projects (company_id, contractor_id, contractor_name, project_name, country, salary_range, age_bracket, total_demand, candidate_service_charge, contractor_service_charge, interview_mode, created_by)
         values ($1, $2, 'Company A Employer', 'Forbidden Project', 'Uganda', 'UGX 1,000,000', '21-35', 3, 100, 50, 'Online', $3)`,
      [companyA, contractor.rows[0].id, nonOwnerRoleUser],
    ),
    /Project accounts may only be created by the company owner, CEO, or Finance Manager/,
  );
  await database.exec("reset role; set role service_role");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userE]);
  const projectId = "70000000-0000-4000-8000-000000000001";
  await database.query(
    `insert into public.projects (id, company_id, contractor_id, contractor_name, project_name, country, salary_range, age_bracket, total_demand, contractor_service_charge, candidate_service_charge, interview_mode, created_by)
      values ($1, $2, $3, 'Company A Employer', 'Project A', 'Uganda', 'UGX 1,000,000', '21-35', 10, 40, 100, 'Online', $4)`,
    [projectId, companyA, contractor.rows[0].id, userE],
  );
  await database.exec("reset role; set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  const submittedCandidateId = "40000000-0000-4000-8000-000000000003";
  await database.query(
    `insert into public.candidates (id, company_id, file_number, first_name, last_name, created_by, details)
      values ($1, $2, 'A-SUB-001', 'Submitted', 'Candidate', $3,
        '{"stage":"Submitted to Project","assignedContracts":"Project A","contracts":"Project A"}'::jsonb)`,
    [submittedCandidateId, companyA, userA],
  );
  await database.exec("reset role");
  await database.exec(projectSubmissionCountsMigration);
  await database.exec(projectSubmissionCountsMigration);
  await database.exec("set role authenticated");
  const initialSubmittedCount = await database.query("select submitted_count from public.projects where id = $1", [projectId]);
  assert.deepEqual(initialSubmittedCount.rows, [{ submitted_count: 1 }]);
  await database.query(
    `update public.candidates set details = details || jsonb_build_object('assignedProjectId', $1::text)
      where id = $2`,
    [projectId, submittedCandidateId],
  );
  const duplicateSubmissionCount = await database.query("select submitted_count from public.projects where id = $1", [projectId]);
  assert.deepEqual(duplicateSubmissionCount.rows, [{ submitted_count: 1 }]);
  const secondProjectId = "70000000-0000-4000-8000-000000000003";
  await database.exec("reset role; set role service_role");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userE]);
  await database.query(
    `insert into public.projects (id, company_id, contractor_id, contractor_name, project_name, country, salary_range, age_bracket, total_demand, contractor_service_charge, candidate_service_charge, interview_mode, created_by)
      values ($1, $2, $3, 'Company A Employer', 'Project B', 'UAE', 'UGX 1,000,000', '21-35', 10, 40, 100, 'Online', $4)`,
    [secondProjectId, companyA, contractor.rows[0].id, userE],
  );
  await database.exec("reset role; set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
  await database.query(
    `update public.candidates set details = details || jsonb_build_object('assignedProjectId', $1::text, 'assignedContracts', 'Project B', 'contracts', 'Project B')
      where id = $2`,
    [secondProjectId, submittedCandidateId],
  );
  const reassignedCounts = await database.query("select id, submitted_count from public.projects where id in ($1, $2) order by id", [projectId, secondProjectId]);
  assert.deepEqual(reassignedCounts.rows, [
    { id: projectId, submitted_count: 0 },
    { id: secondProjectId, submitted_count: 1 },
  ]);
  await assert.rejects(
    database.query("update public.projects set submitted_count = 99 where id = $1", [secondProjectId]),
    /Project submitted count is maintained automatically/,
  );
  await database.exec("reset role; set role service_role");
  await database.query("delete from public.candidates where id = $1", [submittedCandidateId]);
  const deletedSubmissionCount = await database.query("select submitted_count from public.projects where id = $1", [secondProjectId]);
  assert.deepEqual(deletedSubmissionCount.rows, [{ submitted_count: 0 }]);
  await database.query("delete from public.projects where id = $1", [secondProjectId]);
  await database.exec("reset role; set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
  const projectAccount = await database.query("select account_id from public.projects where id = $1", [projectId]);
  const projectAccountId = projectAccount.rows[0].account_id;
  await database.exec("reset role; set role service_role");
  const projectBook = await database.query("select name, account_type from public.company_accounts where id = $1", [projectAccountId]);
  assert.equal(projectBook.rows[0].name.startsWith("Project: Project A #"), true);
  assert.equal(projectBook.rows[0].account_type, "project");
  await database.exec("reset role; set role authenticated");
  const visibleProjects = await database.query("select id from public.projects where company_id = $1 order by id", [companyA]);
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
  assert.deepEqual(recipientOptions.rows.map((recipient) => recipient.recipient_type), ["candidate", "candidate", "contractor", "supplier"]);
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
  await database.query("select public.record_invoice_payment($1, $2, $3)", [invoiceId, 40, accountId]);
  const partialInvoice = await database.query("select status from public.invoices where id = $1", [invoiceId]);
  assert.equal(partialInvoice.rows[0].status, "partially_paid");
  await database.query("select public.record_invoice_payment($1, $2, $3)", [invoiceId, 60, accountId]);
  const paidInvoice = await database.query("select status from public.invoices where id = $1", [invoiceId]);
  assert.equal(paidInvoice.rows[0].status, "paid");
  await assert.rejects(database.query("select public.record_invoice_payment($1, $2, $3)", [invoiceId, 1, accountId]), /exceeds the outstanding/);
  const receiptCandidates = await database.query("select candidate_name from public.list_finance_candidates($1)", [companyA]);
  assert.deepEqual(receiptCandidates.rows.map((candidate) => candidate.candidate_name), ["Converted Inquiry", "Candidate A"]);
  const candidateDeposit = await database.query(
    `insert into public.financial_receipts (company_id, entry_type, candidate_id, received_from, category, amount, payment_method, created_by, account_id)
      values ($1, 'candidate_deposit', $2, 'Spoofed Name', 'Candidate deposit', 25, 'Cash', $3, $4)
      returning receipt_number, received_from`,
    [companyA, candidateA, userA, accountId],
  );
  assert.match(candidateDeposit.rows[0].receipt_number, /^RCT-\d{4}-\d{5}$/);
  assert.equal(candidateDeposit.rows[0].received_from, "Candidate A");
  await database.exec("reset role; set role service_role");
  const accountLedgerTotals = await database.query(
    `select transaction_type, direction, sum(amount)::numeric(14, 2)::text as amount, count(*)::integer as count
      from public.company_account_transactions where account_id = $1
      group by transaction_type, direction order by transaction_type`,
    [accountId],
  );
  assert.deepEqual(accountLedgerTotals.rows, [
    { transaction_type: "income", direction: "credit", amount: "25.00", count: 1 },
    { transaction_type: "invoice_payment", direction: "credit", amount: "100.00", count: 2 },
  ]);
  const accountBalance = await database.query(
    "select sum(case when direction = 'credit' then amount else -amount end)::numeric(14, 2)::text as balance from public.company_account_transactions where account_id = $1",
    [accountId],
  );
  assert.equal(accountBalance.rows[0].balance, "125.00");
  await database.exec("reset role; set role authenticated");
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
  const contractorCharge = await database.query(
    "select contractor_id, candidate_id, amount from public.project_contractor_charges where project_id = $1",
    [projectId],
  );
  assert.deepEqual(contractorCharge.rows, [{ contractor_id: contractor.rows[0].id, candidate_id: candidateA, amount: "40.00" }]);
  const contractorFinance = await database.query(
    "select contractor_id, project_name, visa_count, contractor_service_charge, amount_due, account_id from public.list_project_contractor_finance($1)",
    [companyA],
  );
  assert.deepEqual(contractorFinance.rows, [{
    contractor_id: contractor.rows[0].id,
    project_name: "Project A",
    visa_count: 1,
    contractor_service_charge: "40.00",
    amount_due: "40.00",
    account_id: projectAccountId,
  }]);
  const visaInvoiceAccount = await database.query("select project_id, project_account_id from public.invoices where id = $1", [visaInvoices.rows[0].id]);
  assert.deepEqual(visaInvoiceAccount.rows, [{ project_id: projectId, project_account_id: projectAccountId }]);
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
  await assert.rejects(database.query("select public.record_invoice_payment($1, $2, $3)", [visaInvoices.rows[0].id, 1, accountId]), /assigned project account/);
  await assert.rejects(database.query("select public.record_invoice_payment($1, $2, $3)", [visaInvoices.rows[0].id, 76, projectAccountId]), /exceeds the outstanding/);
  const assignedProjectDeposit = await database.query(
    `insert into public.financial_receipts (company_id, entry_type, candidate_id, received_from, category, amount, payment_method, created_by)
      values ($1, 'candidate_deposit', $2, 'Candidate A', 'Candidate deposit', 10, 'Cash', $3)
      returning project_id, account_id`,
    [companyA, candidateA, userA],
  );
  assert.deepEqual(assignedProjectDeposit.rows, [{ project_id: projectId, account_id: projectAccountId }]);
  await database.query(
    `insert into public.financial_receipts (company_id, entry_type, received_from, category, amount, payment_method, created_by, account_id)
      values ($1, 'other_income', 'Training service', 'Other income', 15, 'Bank transfer', $2, $3)`,
    [companyA, userA, accountId],
  );
  await database.exec("reset role; set role service_role");
  const accountLedger = await database.query(
    `select direction, sum(amount)::numeric(14, 2) as amount
      from public.company_account_transactions where company_id = $1 and account_id = $2 group by direction order by direction`,
    [companyA, accountId],
  );
  assert.deepEqual(accountLedger.rows, [{ direction: "credit", amount: "140.00" }]);
  await database.exec("reset role; set role authenticated");
  const invoiceInstallmentCount = await database.query("select count(*)::integer as count from public.invoice_payments where company_id = $1", [companyA]);
  const standaloneReceiptCount = await database.query("select count(*)::integer as count from public.financial_receipts where company_id = $1", [companyA]);
  assert.equal(invoiceInstallmentCount.rows[0].count, 2);
  assert.equal(standaloneReceiptCount.rows[0].count, 3);
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
  assert.deepEqual(visibleDocuments.rows.map((row) => row.id), [documentCv, documentMedical]);

  const medicalDownload = await database.query(
    "select public.can_access_candidate_document($1, 'medical', 'download') as allowed",
    [companyA],
  );
  assert.equal(medicalDownload.rows[0].allowed, true);

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