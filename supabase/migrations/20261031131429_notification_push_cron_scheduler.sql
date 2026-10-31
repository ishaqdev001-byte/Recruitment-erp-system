create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_notification_pushes()
returns void
language plpgsql
set search_path = ''
as $$
declare
  app_base_url text;
  dispatch_secret text;
begin
  select decrypted_secret
  into app_base_url
  from vault.decrypted_secrets
  where name = 'notification_app_base_url'
  limit 1;

  select decrypted_secret
  into dispatch_secret
  from vault.decrypted_secrets
  where name = 'notification_dispatch_secret'
  limit 1;

  if app_base_url is null or dispatch_secret is null then
    raise notice 'Push dispatch skipped: configure notification_app_base_url and notification_dispatch_secret in Vault.';
    return;
  end if;

  app_base_url := rtrim(app_base_url, '/');

  if app_base_url not like 'https://%' then
    raise exception 'notification_app_base_url must use HTTPS.';
  end if;

  perform net.http_post(
    url := app_base_url || '/api/notifications/push/dispatch',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || dispatch_secret,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function private.dispatch_notification_pushes() from public, anon, authenticated;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'dispatch-browser-push-notifications'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'dispatch-browser-push-notifications',
    '* * * * *',
    'select private.dispatch_notification_pushes();'
  );
end;
$$;