alter table public.mail_connections
  alter column access_token_ciphertext drop not null,
  alter column refresh_token_ciphertext drop not null,
  alter column expires_at drop not null,
  add column auth_type text not null default 'oauth' check (auth_type in ('oauth', 'imap_smtp')),
  add column credentials_ciphertext text,
  add constraint mail_connections_auth_credentials_check check (
    (auth_type = 'oauth' and credentials_ciphertext is null)
    or (auth_type = 'imap_smtp' and credentials_ciphertext is not null)
  );

update public.permissions
set description = 'Read mail from a linked Gmail or IMAP/SMTP account'
where code = 'communications.email.read';

update public.permissions
set description = 'Send mail from a linked Gmail or IMAP/SMTP account'
where code = 'communications.email.send';