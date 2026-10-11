alter table public.whatsapp_connections
  alter column phone_number_id drop not null,
  alter column business_account_id drop not null,
  alter column access_token_ciphertext drop not null,
  add column zernio_profile_id text,
  add column zernio_account_id text,
  add column webhook_id text;

alter table public.whatsapp_messages
  add column account_id text,
  add column conversation_id text;

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_contact_phone_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_contact_phone_length_check
    check (length(contact_phone) <= 200);

create unique index whatsapp_connections_zernio_account_idx
  on public.whatsapp_connections (zernio_account_id)
  where zernio_account_id is not null;

create index whatsapp_messages_company_conversation_created_idx
  on public.whatsapp_messages (company_id, conversation_id, created_at asc);

-- Meta credentials cannot be reused as Zernio account connections.
delete from public.whatsapp_connections
where zernio_account_id is null;
