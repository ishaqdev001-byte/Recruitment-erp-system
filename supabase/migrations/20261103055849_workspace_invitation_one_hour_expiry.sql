alter table public.workspace_invitations
  alter column expires_at set default (now() + interval '1 hour');

alter table public.workspace_invitations
  drop constraint workspace_invitations_check,
  add constraint workspace_invitations_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '1 hour'
    );

update public.workspace_invitations
set expires_at = created_at + interval '1 hour'
where accepted_at is null
  and expires_at > now()
  and expires_at < created_at + interval '1 hour';