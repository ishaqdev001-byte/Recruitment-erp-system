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
const database = new PGlite();

const companyA = "10000000-0000-4000-8000-000000000001";
const companyB = "10000000-0000-4000-8000-000000000002";
const companyC = "10000000-0000-4000-8000-000000000003";
const userA = "20000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";
const userC = "20000000-0000-4000-8000-000000000003";
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
  assert.deepEqual(financeUserPermissions.rows.map((permission) => permission.code), ["finance.create", "finance.view"]);

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
    insert into auth.users (id) values ('${userA}'), ('${userB}');
    insert into public.companies (id, name) values
      ('${companyA}', 'Company A'), ('${companyB}', 'Company B');
    insert into public.company_roles (id, company_id, name) values
      ('${roleA}', '${companyA}', 'Recruiter'),
      ('${statusRole}', '${companyA}', 'Status Manager');
    insert into public.company_memberships (company_id, user_id, role_id) values
      ('${companyA}', '${userA}', '${roleA}'),
      ('${companyA}', '${userB}', '${statusRole}');
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
  const originalDocumentEditor = await database.query(
    "select updated_by from public.candidate_documents where id = $1",
    [documentCv],
  );
  assert.equal(originalDocumentEditor.rows[0].updated_by, userA);

  await database.exec("set role authenticated");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);

  const visibleCandidates = await database.query("select id from public.candidates order by id");
  assert.deepEqual(visibleCandidates.rows.map((row) => row.id), [candidateA]);

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
    `insert into public.projects (id, company_id, contractor_id, contractor_name, project_name, country, salary_range, age_bracket, total_demand, interview_mode, created_by)
      values ($1, $2, $3, 'Company A Employer', 'Project A', 'Uganda', 'UGX 1,000,000', '21-35', 10, 'Online', $4)`,
    [projectId, companyA, contractor.rows[0].id, userA],
  );
  const visibleProjects = await database.query("select id from public.projects order by id");
  assert.deepEqual(visibleProjects.rows.map((row) => row.id), [projectId]);
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