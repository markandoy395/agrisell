begin;
-- Before enabling delivery, save the deployed function URL and the same random
-- value used for PUSH_WEBHOOK_SECRET in Supabase Vault:
-- select vault.create_secret(
--   'https://<project-ref>.supabase.co/functions/v1/send-notification',
--   'push_function_url'
-- );
-- select vault.create_secret('<long-random-value>', 'push_function_secret');

create extension if not exists pg_net;
create or replace function private.dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  webhook_secret text;
begin
  select decrypted_secret into function_url
  from vault.decrypted_secrets
  where name = 'push_function_url';

  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'push_function_secret';

  if function_url is null or webhook_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agrisell-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;
drop trigger if exists notifications_dispatch_push_after_insert
  on public.notifications;
create trigger notifications_dispatch_push_after_insert
after insert on public.notifications
for each row execute function private.dispatch_notification_push();
revoke all on function private.dispatch_notification_push() from public, anon,
  authenticated;
commit;
