create table public.staff_hr_profile_reminders (
  staff_id uuid primary key references public.company_staff_members (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  personal_details_completed_at timestamptz,
  reminder_stage text not null default 'profile_completion'
    check (reminder_stage in ('profile_completion', 'information_review')),
  next_reminder_at timestamptz,
  update_required boolean not null default false,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_hr_profile_reminders_due_idx
  on public.staff_hr_profile_reminders (next_reminder_at)
  where next_reminder_at is not null and update_required = false;

alter table public.staff_hr_profile_reminders enable row level security;
revoke all on public.staff_hr_profile_reminders from public, anon, authenticated;
grant all on public.staff_hr_profile_reminders to service_role;