-- Invoice evidence has its own version timeline; it never changes subscription authority.
alter table app_private.lemon_subscriptions
  add column payment_issue boolean not null default false,
  add column payment_evidence_updated_at timestamptz,
  add column payment_evidence_invoice_id text,
  add column payment_evidence_receipt_id uuid,
  add constraint lemon_payment_evidence_consistency_check check (
    (payment_evidence_updated_at is null and payment_evidence_invoice_id is null
      and payment_evidence_receipt_id is null and payment_issue = false)
    or (payment_evidence_updated_at is not null
      and payment_evidence_invoice_id is not null
      and payment_evidence_invoice_id ~ '^[1-9][0-9]*$'
      and payment_evidence_receipt_id is not null)
  ),
  add constraint lemon_payment_evidence_receipt_fk
    foreign key (store_id, test_mode, payment_evidence_receipt_id)
    references app_private.lemon_webhook_receipts (store_id, test_mode, id)
    on delete restrict;

comment on column app_private.lemon_subscriptions.payment_issue is
  'Current ordered invoice payment trouble; independent of lifecycle and sticky refund evidence.';

create function public.process_lemon_payment_lifecycle_v1(
  p_store_id text,
  p_test_mode boolean,
  p_idempotency_key text,
  p_payload_valid boolean,
  p_invoice_id text,
  p_subscription_id text,
  p_customer_id text,
  p_event_name text,
  p_payment_issue boolean,
  p_invoice_created_at timestamptz,
  p_invoice_updated_at timestamptz
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_receipt app_private.lemon_webhook_receipts%rowtype;
  v_subscription app_private.lemon_subscriptions%rowtype;
begin
  select receipt.* into v_receipt
  from app_private.lemon_webhook_receipts as receipt
  where receipt.store_id = p_store_id
    and receipt.test_mode = p_test_mode
    and receipt.idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Webhook receipt is unavailable.';
  end if;
  if v_receipt.processing_status in ('processed', 'ignored', 'failed') then
    return 'duplicate';
  end if;
  if v_receipt.processing_status = 'processing' then return 'busy'; end if;
  if v_receipt.processing_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'Webhook receipt state is unavailable.';
  end if;

  update app_private.lemon_webhook_receipts as receipt
  set processing_status = 'processing',
    attempt_count = receipt.attempt_count + 1,
    last_attempt_at = pg_catalog.statement_timestamp()
  where receipt.id = v_receipt.id;

  if p_payload_valid is not true or p_test_mode is distinct from false
    or p_store_id is null or p_invoice_id is null
    or p_subscription_id is null or p_customer_id is null
    or p_event_name is null or p_payment_issue is null
    or p_store_id !~ '^[1-9][0-9]*$'
    or p_invoice_id !~ '^[1-9][0-9]*$'
    or p_subscription_id !~ '^[1-9][0-9]*$'
    or p_customer_id !~ '^[1-9][0-9]*$'
    or p_event_name not in ('subscription_payment_failed',
      'subscription_payment_success', 'subscription_payment_recovered')
    or v_receipt.event_type is distinct from p_event_name
    or v_receipt.upstream_object_type is distinct from 'subscription-invoices'
    or v_receipt.upstream_object_id is distinct from p_invoice_id
    or v_receipt.upstream_event_at is distinct from p_invoice_updated_at
    or p_invoice_created_at is null or p_invoice_updated_at is null
    or p_invoice_created_at > p_invoice_updated_at
    or p_payment_issue is distinct from (p_event_name = 'subscription_payment_failed')
  then
    update app_private.lemon_webhook_receipts as receipt
    set processing_status = 'failed', processing_outcome = 'invalid-payment-evidence',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt.id;
    return 'failed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_store_id || ':' || p_test_mode::text || ':' || p_subscription_id, 0));
  select subscription.* into v_subscription
  from app_private.lemon_subscriptions as subscription
  where subscription.store_id = p_store_id
    and subscription.test_mode = p_test_mode
    and subscription.lemon_subscription_id = p_subscription_id
  for update;

  if not found then
    -- The transaction rolls back to pending so delivery after subscription_created can recover.
    raise exception using errcode = 'P0001', message = 'Trusted subscription is unavailable.';
  end if;
  if v_subscription.lemon_customer_id is distinct from p_customer_id then
    update app_private.lemon_webhook_receipts as receipt
    set processing_status = 'failed', processing_outcome = 'payment-customer-conflict',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt.id;
    return 'failed';
  end if;

  if v_subscription.payment_evidence_updated_at is not null
    and p_invoice_updated_at < v_subscription.payment_evidence_updated_at then
    update app_private.lemon_webhook_receipts as receipt
    set processing_status = 'ignored', processing_outcome = 'stale-payment-evidence',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt.id;
    return 'ignored';
  end if;

  if p_invoice_updated_at = v_subscription.payment_evidence_updated_at then
    if v_subscription.payment_issue is not distinct from p_payment_issue
      and v_subscription.payment_evidence_invoice_id is not distinct from p_invoice_id then
      update app_private.lemon_webhook_receipts as receipt
      set processing_status = 'processed',
        processing_outcome = 'payment-evidence-idempotent',
        processed_at = pg_catalog.statement_timestamp()
      where receipt.id = v_receipt.id;
      return 'processed';
    end if;
    update app_private.lemon_webhook_receipts as receipt
    set processing_status = 'failed',
      processing_outcome = 'payment-evidence-version-conflict',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt.id;
    return 'failed';
  end if;

  update app_private.lemon_subscriptions as subscription
  set payment_issue = p_payment_issue,
    payment_evidence_updated_at = p_invoice_updated_at,
    payment_evidence_invoice_id = p_invoice_id,
    payment_evidence_receipt_id = v_receipt.id
  where subscription.id = v_subscription.id;

  update app_private.lemon_webhook_receipts as receipt
  set processing_status = 'processed', processing_outcome = 'payment-evidence-applied',
    processed_at = pg_catalog.statement_timestamp()
  where receipt.id = v_receipt.id;
  return 'processed';
end;
$$;

revoke all on function public.process_lemon_payment_lifecycle_v1(
  text, boolean, text, boolean, text, text, text, text, boolean,
  timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.process_lemon_payment_lifecycle_v1(
  text, boolean, text, boolean, text, text, text, text, boolean,
  timestamptz, timestamptz) to service_role;

-- Recreate the caller-bound read RPC inside this atomic migration to expose one boolean.
drop function public.resolve_my_commercial_access_v1();
create function public.resolve_my_commercial_access_v1()
returns table (
  lemon_subscription_id text, store_id text, product_id text, variant_id text,
  raw_status text, cancelled boolean, pause_mode text,
  pause_resumes_at timestamptz, trial_ends_at timestamptz,
  renews_at timestamptz, ends_at timestamptz,
  upstream_updated_at timestamptz, test_mode boolean,
  refund_affected boolean, payment_issue boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select subscription.lemon_subscription_id, subscription.store_id,
    subscription.product_id, subscription.variant_id, subscription.status,
    subscription.cancelled, subscription.pause_mode, subscription.pause_resumes_at,
    subscription.trial_ends_at, subscription.renews_at, subscription.ends_at,
    subscription.upstream_updated_at, subscription.test_mode,
    subscription.refund_affected, subscription.payment_issue
  from app_private.users as app_user
  inner join app_private.lemon_customers as customer
    on customer.user_id = app_user.id
  inner join app_private.lemon_subscriptions as subscription
    on subscription.store_id = customer.store_id
    and subscription.test_mode = customer.test_mode
    and subscription.lemon_customer_id = customer.lemon_customer_id
  where app_user.auth_user_id = (select auth.uid())
  order by subscription.store_id, subscription.test_mode,
    subscription.lemon_subscription_id;
$$;
revoke all on function public.resolve_my_commercial_access_v1()
  from public, anon, authenticated;
grant execute on function public.resolve_my_commercial_access_v1()
  to authenticated;

-- Only exact redelivery of an ordering-dependent failure may reclaim a receipt.
-- Deterministic payload/identity/version failures remain finalized duplicates.
create or replace function public.ingest_lemon_webhook_receipt_v1(
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
  with claimed_receipt as (
    insert into app_private.lemon_webhook_receipts as receipt (
      store_id, test_mode, event_type, idempotency_key,
      payload_sha256, upstream_object_type, upstream_object_id,
      upstream_event_at, processing_status
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
    on conflict (store_id, test_mode, idempotency_key) do update
      set processing_status = 'pending',
        processing_outcome = null,
        processed_at = null
      where receipt.processing_status = 'failed'
        and receipt.processing_outcome in (
          'customer-linkage-missing',
          'commercial-user-not-found',
          'refund-subscription-not-found'
        )
        and receipt.payload_sha256 = excluded.payload_sha256
        and receipt.event_type = excluded.event_type
        and receipt.upstream_object_type is not distinct from excluded.upstream_object_type
        and receipt.upstream_object_id is not distinct from excluded.upstream_object_id
        and receipt.upstream_event_at is not distinct from excluded.upstream_event_at
    returning 1
  )
  select exists (select 1 from claimed_receipt);
$$;

revoke all on function public.ingest_lemon_webhook_receipt_v1(
  text, boolean, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ingest_lemon_webhook_receipt_v1(
  text, boolean, text, text, text, text, text, timestamptz)
  to service_role;
