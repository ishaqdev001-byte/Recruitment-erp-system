# Recruitment ERP

Next.js App Router application using React 19, TypeScript, and Tailwind CSS v4.

## Development

Run `pnpm dev` to start the development server, `pnpm build` to create a production build, and `pnpm start` to serve it.

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

Apply all pending migrations through `supabase/migrations/202610040018_workspace_invitation_expiry.sql` before starting the updated app. The company user invitation and role-management API also requires `SUPABASE_SERVICE_ROLE_KEY` in the server environment; keep this key private and never expose it through a `NEXT_PUBLIC_` variable.

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
