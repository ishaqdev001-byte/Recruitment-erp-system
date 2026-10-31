# Recruitment ERP

Next.js App Router application using React 19, TypeScript, and Tailwind CSS v4.

## Development

Run `pnpm dev` to start the development server, `pnpm build` to create a production build, and `pnpm start` to serve it.

For browser and closed-browser push alerts, apply `supabase/migrations/20261031123905_browser_push_notifications.sql`, `supabase/migrations/20261031131429_notification_push_cron_scheduler.sql`, and `supabase/migrations/20261031140816_workspace_notification_events.sql`. The last migration adds permission-scoped event notifications for candidates, tasks, approvals, finance, HR, medical examinations, and inbound WhatsApp messages; legacy leave, requisition, and reminder notifications remain supported. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `NOTIFICATION_DISPATCH_SECRET` only in the app server environment. In Supabase Vault, create secrets named `notification_app_base_url` (the HTTPS app origin) and `notification_dispatch_secret` (the same value as the app's `NOTIFICATION_DISPATCH_SECRET`). Supabase Cron then calls `/api/notifications/push/dispatch` every minute. Users opt in from the notification center; push subscriptions are scoped to the signed-in user and alerts are permission-filtered.

## Project Structure

- `src/app/page.tsx` - App Router page
- `src/app/layout.tsx` - Root HTML layout, metadata, and global CSS import
- `src/App.tsx` - Client-side recruitment dashboard and navigation
- `src/components/` - Dashboard modules
- `src/index.css` - Global styles and Tailwind CSS v4 theme
- `package.json` - Dependencies and scripts

## Dependencies

- Runtime: Next.js 16, React 19, and React DOM 19
- Styling: Tailwind CSS v4 through `@tailwindcss/postcss`
- Build tooling: TypeScript 5.7 and oxfmt

## Supabase user management

Apply all pending migrations through `supabase/migrations/202610250001_company_slugs.sql` before starting the updated app. Company slugs are used for multi-tenant URL routing (e.g., `https://recruit.kilaxtech.com/kilax-dammy-recruit/login`); slugs are auto-generated from the first word of the company name and are used for SEO-friendly, case-insensitive URL paths. SMS contact groups and group members are company scoped. Task reminders are delivered in-app and through optional browser notifications while a signed-in workspace is open; assignees with a profile phone can also receive SMSUG reminders when an authorized task creator opts in. In SMSUG Settings > API Settings, turn API access on and set `SMSUG_API_KEY` only in the server environment; never expose it through a `NEXT_PUBLIC_` variable. SMSUG sends immediately and charges the account balance; check Sent Messages before retrying an ambiguous send.

For multi-tenant company login pages, the `companies.slug` field must be populated (auto-migrated on first migration run). Access company-specific login pages at `/{company-slug}/login` with company-branded header, logo from `companies.logo_url`, email/password login, forgot password flow, and WhatsApp contact button for the company chairman (`primary_admin_user_id`). No Google/Microsoft OAuth on company-scoped login pages.

For the shared WhatsApp inbox, set `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` only in the server environment; never expose them through `NEXT_PUBLIC_` variables. Apply all migrations through `202610110002_zernio_whatsapp.sql`. A company owner connects a WhatsApp Business number from Communications > WhatsApp using Zernio's hosted Embedded Signup; RecruitOS creates a Zernio profile for the company and subscribes an account-scoped webhook to `/api/communications/whatsapp/webhook`. The Zernio API key and webhook signing secret are server-only. WhatsApp read/send access is controlled by `communications.whatsapp.read` and `communications.whatsapp.send`, while only the primary company administrator can manage the connection by default. Zernio supports approved template sends for new conversations and outside the 24-hour customer-service window; company members must provide the approved template name, language, and variable values when starting a new conversation.

For the Users & Roles staff roster, Human Resource self-service, and Paychecks, apply `supabase/migrations/202610130001_company_staff.sql`, `supabase/migrations/202610130002_staff_hr_profile.sql`, `supabase/migrations/202610130003_staff_auto_enrollment_payroll.sql`, then `supabase/migrations/202610130004_payroll_adjustment_batches.sql`. Staff roster records are company-scoped and managed by the primary owner, CEO, or General Manager; only the primary owner can change the staff ID prefix and next sequence. Company accounts are automatically linked to staff records when memberships are created. Employees can update their own HR profiles and private personal documents from Human Resource. Payroll payments require finance permissions and generate a branded payslip immediately; recorded monthly benefits and deductions are included in each employee's payslip. Only one paycheck can be recorded per employee per pay month.

For Finance Accounts and account-linked receipts, invoice payments, expenses, and payroll, also apply `supabase/migrations/202610130005_company_accounts_books.sql`. Company owners, CEOs, General Managers, and Finance Managers can create accounts; each new money-in or money-out transaction must select an active company account.

For staff pay arrangements, configured base salaries, and recurring weekly transport benefits, apply `supabase/migrations/202610140002_staff_payroll_compensation.sql` after the company accounts migration. Payroll staff with an assigned weekly transport allowance use its selected active account as the monthly payroll source; the weekly rate is converted to a monthly benefit and included in the payslip and payroll ledger.

For separate candidate and contractor project charges and automatic project books, apply `supabase/migrations/202610140001_project_contractor_candidate_charges.sql` after the company accounts migration. Project candidate service charges create candidate visa invoices; contractor service charges accrue once per candidate visa and appear in Contractor Finance. Candidate deposits and candidate invoice payments are associated with the assigned project's book.

For Gmail OAuth, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only in the server environment and register `/api/communications/mail/callback?provider=gmail` using the `NEXT_PUBLIC_SITE_URL` origin. When a workspace user signs in with a `@gmail.com` address, Communications preselects that address and requires one-time Google consent before accessing its mailbox. Connected accounts expose Inbox, Outbox/Sent, Spam, and Drafts. Existing Outlook OAuth connections remain supported; Microsoft OAuth credentials are only needed if using its legacy OAuth flow. Users with other email addresses can add custom mailboxes from Communications with their IMAP/SMTP hosts, ports, TLS settings, username, and password or app password. Set `MAIL_TOKEN_ENCRYPTION_KEY` to 64 hexadecimal characters generated from 32 random bytes; back it up securely because changing it invalidates stored mailbox tokens and IMAP/SMTP credentials. Mail tokens and server credentials are encrypted at rest. Mailbox sync runs while a signed-in user opens or refreshes Communications; background push delivery is not configured. The company user invitation and role-management API requires `SUPABASE_SERVICE_ROLE_KEY`; optional task SMS delivery also uses it to securely deliver to the assigned staff member. Keep this key private and never expose it through a `NEXT_PUBLIC_` variable.

For AI Assistant features, set `OPENAI_API_KEY` only in the server environment; never expose it through a `NEXT_PUBLIC_` variable. `OPENAI_MODEL` is optional and defaults to `gpt-4o-mini`. Apply `supabase/migrations/202610120001_ai_usage.sql` to enable company-scoped token totals. Candidate data used to generate a document is sent to OpenAI for processing. Generated PDF drafts are saved in the candidate's document folder and appear in the candidate attachments drawer and Documents Management; inquiry chat is kept only in the open session. Token usage totals are stored by company. Users with `candidates.view` and the required document upload permissions can generate CV drafts; medical forms are blank administrative drafts and must be completed and verified by a licensed clinician. Academic profiles are clearly unofficial summaries based only on recorded candidate data and must never imitate examination certificates or invent results.

After applying the candidate document storage migrations, run `npm run storage:provision-candidate-folders` once to create both InterServer folders for existing candidates and move their attachments into the named candidate folders. New candidate folders are created during registration.

After applying the company root folder access migration, run `npm run storage:organize-company-folders` once to ensure each company root has `users`, `finance`, `candidates`, and `drive` directories, move primary-user vault files into `drive`, and move existing Finance Drive files into `finance`.

Set `NEXT_PUBLIC_SITE_URL` to the canonical app origin used in invitation emails, and add that origin to the Supabase Auth redirect URL allow list. It defaults to the current request origin when unset.

Set Supabase Auth's email OTP expiry to 300 seconds. The app also enforces a five-minute invitation acceptance record, but the raw Supabase confirmation token lifetime is controlled by this project-level setting.

Configure Supabase Auth's **Invite user** email template from `supabase/templates/invite.md` so invitation messages include the inviting company and assigned role.

## Styling

Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. The root layout imports this file; `postcss.config.mjs` enables Tailwind.

Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults in `src/index.css`.

## Code quality

- Use double quotes for strings containing apostrophes, or escape them in single-quoted strings.
- Ensure JSX tags are closed and braces are balanced.
- Export components as default exports.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
