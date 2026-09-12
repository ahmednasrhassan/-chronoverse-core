create function public.ingest_lemon_webhook_receipt_v1(
  store_id text,
  test_mode boolean,
  event_type text,
  idempotency_key text,
  payload_sha256 text,
  upstream_object_type text,
  upstream_object_id text,
  upstream_event_at timestamptz
)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with inserted_receipt as (
    insert into app_private.lemon_webhook_receipts (
      store_id,
      test_mode,
      event_type,
      idempotency_key,
      payload_sha256,
      upstream_object_type,
      upstream_object_id,
      upstream_event_at,
      processing_status
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
    on conflict (store_id, test_mode, idempotency_key) do nothing
    returning 1
  )
  select exists (select 1 from inserted_receipt);
$$;

revoke all on function public.ingest_lemon_webhook_receipt_v1(
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.ingest_lemon_webhook_receipt_v1(
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;
