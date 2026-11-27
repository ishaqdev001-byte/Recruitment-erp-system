alter table public.workspace_invitations
  alter column expires_at set default (now() + interval '30 minutes');

update public.workspace_invitations
set expires_at = created_at + interval '30 minutes'
where expires_at > created_at + interval '30 minutes';

alter table public.workspace_invitations
  drop constraint workspace_invitations_check,
  add constraint workspace_invitations_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '30 minutes'
    );