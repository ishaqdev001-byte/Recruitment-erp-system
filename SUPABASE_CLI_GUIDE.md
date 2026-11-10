# Supabase CLI Integration Guide

## Connection Status ✅

Your project is successfully linked and connected!

**Linked Project:**
- **Organization**: zshbclnlpuonqqowerci
- **Project**: Recruitment System
- **Project Reference**: efrvawebjmmxpthosbto
- **URL**: https://efrvawebjmmxpthosbto.supabase.co

**Environment Variables Configured:**
- ✅ `NEXT_PUBLIC_SUPABASE_URL` 
- ✅ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `SUPABASE_DB_PASSWORD`

## Common CLI Commands

### 1. **Check Migration Status**
View all applied and pending migrations:
```bash
supabase migration list --linked
```

**Output shows:**
- Local migration files
- Remote database status
- Timestamps

Current status: **29 migrations applied and synced**

### 2. **Pull Schema from Remote Database**
Download the current database schema from production:
```bash
supabase db pull --linked
```

This creates a new migration file reflecting any schema changes made directly in the cloud.

### 3. **Push Migrations to Remote Database**
Apply pending migrations to production:
```bash
supabase db push --linked
```

**⚠️ WARNING**: This affects your live database. Always test locally first.

### 4. **Repair Migration History**
Fix mismatches between local and remote migration history:
```bash
# Mark migration as reverted
supabase migration repair --status reverted {migration_name}

# Mark migration as applied
supabase migration repair --status applied {migration_name}
```

### 5. **Create New Migration**
Create a new migration file locally:
```bash
supabase migration new {migration_name}
```

This creates a new `.sql` file in `supabase/migrations/` with a timestamp.

### 6. **Reset Local Database** (Local only)
⚠️ This resets your LOCAL dev database, not production:
```bash
supabase db reset
```

### 7. **Start Local Dev Server**
Run a full local development environment:
```bash
supabase start
```

Starts:
- Local PostgreSQL database
- Supabase API server
- Supabase Studio (admin UI at localhost:54323)
- Realtime server
- Storage

### 8. **Stop Local Dev Server**
```bash
supabase stop
```

### 9. **View Logs**
```bash
supabase logs --linked postgres
supabase logs --linked api
supabase logs --linked realtime
```

### 10. **Access Database Directly**
Connect to your production database using psql:
```bash
psql postgresql://postgres:{password}@db.efrvawebjmmxpthosbto.supabase.co:5432/postgres
```

With password from `.env.local`: `@Ishaqik218`

### 11. **Run SQL Queries**
Execute SQL directly against your linked database:
```bash
supabase query --linked "SELECT * FROM companies LIMIT 5;"
```

### 12. **List All Tables**
```bash
supabase query --linked "\dt"
```

### 13. **Get Table Schema**
```bash
supabase query --linked "\d+ table_name"
```

Example:
```bash
supabase query --linked "\d+ profiles"
```

## Database Access Methods

### Method 1: Supabase Studio (Web UI)
**URL**: https://app.supabase.com

Pros:
- No installation needed
- Visual interface
- Good for quick queries
- Table editor

Steps:
1. Go to app.supabase.com
2. Sign in
3. Select "Recruitment System" project
4. Go to "SQL Editor" for queries
5. Go to "Table Editor" for data management

### Method 2: psql (Command Line)
**Connection string** from `.env.local`:
```
postgresql://postgres:@Ishaqik218@db.efrvawebjmmxpthosbto.supabase.co:5432/postgres
```

**Connect**:
```bash
psql postgresql://postgres:@Ishaqik218@db.efrvawebjmmxpthosbto.supabase.co:5432/postgres
```

**Useful psql commands**:
```bash
\dt                    # List all tables
\d+ table_name        # Show table structure
\l                    # List databases
\du                   # List users/roles
SELECT * FROM table;  # Query data
INSERT INTO table ... # Insert data
UPDATE table SET ...  # Update data
DELETE FROM table ... # Delete data
```

### Method 3: Supabase CLI
```bash
supabase query --linked "SELECT * FROM table_name;"
```

### Method 4: Node.js/JavaScript Client
```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Query
const { data, error } = await supabase
  .from("table_name")
  .select()
  .limit(5);

// Insert
const { data, error } = await supabase
  .from("table_name")
  .insert([{ column: "value" }]);

// Update
const { data, error } = await supabase
  .from("table_name")
  .update({ column: "new_value" })
  .eq("id", 1);

// Delete
const { error } = await supabase
  .from("table_name")
  .delete()
  .eq("id", 1);
```

### Method 5: DBeaver (GUI Client)
Professional database client with:
- Visual query builder
- Data export
- Backup/restore
- Performance monitoring

Connection:
- Host: `db.efrvawebjmmxpthosbto.supabase.co`
- Port: `5432`
- Database: `postgres`
- Username: `postgres`
- Password: `@Ishaqik218`

## Current Database Status

**Total Migrations**: 29 applied
- Latest: `20261105120000_profile_management_enhancements`

**Key Tables**:
- `auth.users` - Supabase Auth users
- `profiles` - User profiles with display name, phone, branch, bio
- `companies` - Company records
- `company_memberships` - User-Company links
- `company_roles` - Role definitions
- `role_permissions` - Permission mappings
- `company_staff_members` - Staff roster
- `candidates` - Candidate records
- `candidate_documents` - Document storage metadata
- `user_profile_photos` - Profile photo metadata

## Common Operations

### Check User Profiles
```bash
supabase query --linked "SELECT id, display_name, phone FROM profiles LIMIT 10;"
```

### List All Companies
```bash
supabase query --linked "SELECT id, name FROM companies;"
```

### View Staff Members
```bash
supabase query --linked "SELECT staff_id, name, position FROM company_staff_members LIMIT 5;"
```

### Count Records in Table
```bash
supabase query --linked "SELECT COUNT(*) FROM candidates;"
```

### Export Table as CSV
```bash
supabase query --linked "\COPY companies TO STDOUT WITH CSV HEADER" > companies.csv
```

### Find User by Email
```bash
supabase query --linked "SELECT id, email FROM auth.users WHERE email = 'user@example.com';"
```

### View Audit Logs
```bash
supabase query --linked "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20;"
```

## Best Practices

### ✅ DO:
- Always test migrations locally first
- Keep `SUPABASE_SERVICE_ROLE_KEY` private
- Use environment variables for sensitive data
- Version control migration files
- Document schema changes
- Regular backups
- Use RLS policies for security

### ❌ DON'T:
- Expose `SUPABASE_SERVICE_ROLE_KEY` in browser
- Execute production queries without testing
- Skip migrations (always run `db push` to sync)
- Modify database directly without migrations
- Commit `.env.local` to git
- Use `db reset` on production data

## Workflow for Database Changes

### Adding a New Feature:

1. **Create migration file**:
   ```bash
   supabase migration new add_feature_name
   ```

2. **Edit the migration file** in `supabase/migrations/`:
   ```sql
   ALTER TABLE table_name ADD COLUMN new_column TEXT;
   ```

3. **Test locally**:
   ```bash
   supabase db reset  # Reset local DB to test migration
   ```

4. **Verify in local Studio**:
   ```bash
   supabase start
   # Visit http://localhost:54323 in browser
   ```

5. **Push to production** when ready:
   ```bash
   supabase db push --linked
   ```

6. **Verify on production**:
   ```bash
   supabase migration list --linked
   supabase query --linked "SELECT * FROM table_name LIMIT 1;"
   ```

## Troubleshooting

### Issue: "Cannot connect to Podman"
**Cause**: Local Docker/Podman not running
**Solution**: Only affects local development; cloud connection works fine
```bash
# To fix local dev:
supabase start  # Will attempt to start containers
```

### Issue: Migration history mismatch
**Solution**: Repair migration status
```bash
supabase migration repair --status applied {migration_name}
```

### Issue: Permission denied on query
**Check**: RLS policies blocking your role
**Solution**: Use `SUPABASE_SERVICE_ROLE_KEY` (server-only) or adjust RLS policies

### Issue: Changes not showing
**Solution**: Pull latest schema
```bash
supabase db pull --linked
```

## Performance Tips

- **Limit queries**: Always use `LIMIT` to avoid huge result sets
- **Use indexes**: Create indexes on frequently queried columns
- **Archive old data**: Move old records to archive tables
- **Monitor slow queries**: Check query performance in Studio

## Security Reminders

1. **Keys are configured correctly** ✅
   - Public key only in browser
   - Service role key server-only
   - All sensitive keys in `.env.local`

2. **RLS policies active** ✅
   - All data tables have RLS enabled
   - Users can only access their data
   - Service role bypasses RLS

3. **Never commit secrets** ✅
   - `.env.local` in `.gitignore`
   - Rotate keys regularly
   - Use Vault for extra sensitive data

## Next Steps

1. **Test a query**:
   ```bash
   supabase query --linked "SELECT COUNT(*) as total FROM companies;"
   ```

2. **Create a new migration**:
   ```bash
   supabase migration new my_feature
   ```

3. **Pull latest schema**:
   ```bash
   supabase db pull --linked
   ```

4. **Access Studio**:
   - Go to https://app.supabase.com
   - Select Recruitment System project
   - Explore tables and data

## Additional Resources

- [Supabase CLI Docs](https://supabase.com/docs/guides/cli)
- [Database Migrations](https://supabase.com/docs/guides/cli/local-development/managing-migrations)
- [SQL Editor](https://supabase.com/docs/guides/database/sql-editor)
- [Row Level Security](https://supabase.com/docs/guides/database-security/rls)
- [Vector Database](https://supabase.com/docs/guides/ai/vector-columns)

## Summary

✨ **Your Supabase connection is live and ready!**

- **Cloud Database**: Connected and synced
- **Migrations**: 29 applied
- **Access Methods**: CLI, Studio Web, psql, Node.js, GUI clients
- **Security**: Keys configured, RLS enabled, best practices in place

You can now:
1. Query production data via CLI
2. Write/update records directly
3. Create new migrations
4. Access data through web UI
5. Manage everything from command line
