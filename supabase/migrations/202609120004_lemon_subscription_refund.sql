alter table app_private.lemon_subscriptions
  add column refund_affected boolean not null default false,
  add column refund_evidence_updated_at timestamptz,
  add column refund_evidence_invoice_id text,
  add column refund_evidence_status text,
  add column refund_evidence_refunded_at timestamptz,
  add column refund_evidence_amount bigint,
  add column refund_evidence_receipt_id uuid,
  add constraint lemon_subscriptions_refund_status_check
    check (
      refund_evidence_status is null
      or refund_evidence_status in ('refunded', 'partial_refund')
    ),
  add constraint lemon_subscriptions_refund_amount_check
    check (
      refund_evidence_amount is null
      or refund_evidence_amount >= 0
    ),
  add constraint lemon_subscriptions_refund_evidence_consistency_check
    check (
      (
        refund_affected = false
        and refund_evidence_updated_at is null
        and refund_evidence_invoice_id is null
        and refund_evidence_status is null
        and refund_evidence_refunded_at is null
        and refund_evidence_amount is null
        and refund_evidence_receipt_id is null
      )
      or (
        refund_affected = true
        and refund_evidence_updated_at is not null
        and refund_evidence_invoice_id is not null
        and length(btrim(refund_evidence_invoice_id)) > 0
        and refund_evidence_status is not null
        and refund_evidence_refunded_at is not null
        and refund_evidence_amount is not null
        and refund_evidence_receipt_id is not null
      )
    ),
  add constraint lemon_subscriptions_refund_receipt_fk
    foreign key (store_id, test_mode, refund_evidence_receipt_id)
    references app_private.lemon_webhook_receipts (store_id, test_mode, id)
    on delete restrict;

comment on column app_private.lemon_subscriptions.refund_affected is
  'Sticky verified refund evidence; clearing requires a separately authorized policy.';
comment on column app_private.lemon_subscriptions.refund_evidence_updated_at is
  'Authoritative Subscription Invoice version time, separate from Subscription object chronology.';
comment on column app_private.lemon_subscriptions.refund_evidence_receipt_id is
  'Receipt provenance for the applied refund evidence, separate from subscription-object provenance.';

create function public.process_lemon_subscription_refund_v1(
  p_store_id text,
  p_test_mode boolean,
  p_idempotency_key text,
  p_payload_valid boolean,
  p_invoice_id text,
  p_subscription_id text,
  p_customer_id text,
  p_refund_status text,
  p_refunded boolean,
  p_refunded_at timestamptz,
  p_refunded_amount bigint,
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
  v_receipt_id uuid;
  v_event_type text;
  v_object_type text;
  v_object_id text;
  v_event_at timestamptz;
  v_processing_status text;
  v_subscription app_private.lemon_subscriptions%rowtype;
begin
  select
    receipt.id,
    receipt.event_type,
    receipt.upstream_object_type,
    receipt.upstream_object_id,
    receipt.upstream_event_at,
    receipt.processing_status
  into
    v_receipt_id,
    v_event_type,
    v_object_type,
    v_object_id,
    v_event_at,
    v_processing_status
  from app_private.lemon_webhook_receipts as receipt
  where receipt.store_id = p_store_id
    and receipt.test_mode = p_test_mode
    and receipt.idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Webhook receipt is unavailable.';
  end if;

  if v_processing_status in ('processed', 'ignored', 'failed') then
    return 'duplicate';
  end if;

  if v_processing_status = 'processing' then
    return 'busy';
  end if;

  if v_processing_status <> 'pending' then
    raise exception using
      errcode = 'P0001',
      message = 'Webhook receipt state is unavailable.';
  end if;

  update app_private.lemon_webhook_receipts as receipt
  set
    processing_status = 'processing',
    attempt_count = receipt.attempt_count + 1,
    last_attempt_at = pg_catalog.statement_timestamp()
  where receipt.id = v_receipt_id;

  if v_event_type is distinct from 'subscription_payment_refunded'
    or v_object_type is distinct from 'subscription-invoices'
    or p_payload_valid is not true
    or p_store_id is null
    or p_store_id !~ '^[1-9][0-9]*$'
    or p_invoice_id is null
    or p_invoice_id !~ '^[1-9][0-9]*$'
    or p_subscription_id is null
    or p_subscription_id !~ '^[1-9][0-9]*$'
    or p_customer_id is null
    or p_customer_id !~ '^[1-9][0-9]*$'
    or p_refund_status is null
    or p_refund_status not in ('refunded', 'partial_refund')
    or p_refunded is not true
    or p_refunded_at is null
    or p_refunded_amount is null
    or p_refunded_amount < 0
    or p_invoice_created_at is null
    or p_invoice_updated_at is null
    or p_invoice_created_at > p_invoice_updated_at
    or p_refunded_at > p_invoice_updated_at
    or v_object_id is distinct from p_invoice_id
    or v_event_at is distinct from p_invoice_updated_at
  then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'invalid-subscription-refund',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_store_id || ':' || p_test_mode::text || ':' || p_subscription_id,
      0
    )
  );

  select subscription.*
  into v_subscription
  from app_private.lemon_subscriptions as subscription
  where subscription.store_id = p_store_id
    and subscription.test_mode = p_test_mode
    and subscription.lemon_subscription_id = p_subscription_id
  for update;

  if not found then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'refund-subscription-not-found',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  if v_subscription.lemon_customer_id is distinct from p_customer_id then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'refund-customer-conflict',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  if v_subscription.refund_evidence_updated_at is not null
    and p_invoice_updated_at < v_subscription.refund_evidence_updated_at
  then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'ignored',
      processing_outcome = 'stale-refund-evidence',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'ignored';
  end if;

  if p_invoice_updated_at = v_subscription.refund_evidence_updated_at then
    if v_subscription.refund_affected is true
      and v_subscription.refund_evidence_invoice_id is not distinct from p_invoice_id
      and v_subscription.refund_evidence_status is not distinct from p_refund_status
      and v_subscription.refund_evidence_refunded_at is not distinct from p_refunded_at
      and v_subscription.refund_evidence_amount is not distinct from p_refunded_amount
    then
      update app_private.lemon_webhook_receipts as receipt
      set
        processing_status = 'processed',
        processing_outcome = 'refund-evidence-idempotent',
        processed_at = pg_catalog.statement_timestamp()
      where receipt.id = v_receipt_id;

      return 'processed';
    end if;

    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'refund-evidence-version-conflict',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  update app_private.lemon_subscriptions as subscription
  set
    refund_affected = true,
    refund_evidence_updated_at = p_invoice_updated_at,
    refund_evidence_invoice_id = p_invoice_id,
    refund_evidence_status = p_refund_status,
    refund_evidence_refunded_at = p_refunded_at,
    refund_evidence_amount = p_refunded_amount,
    refund_evidence_receipt_id = v_receipt_id
  where subscription.id = v_subscription.id;

  update app_private.lemon_webhook_receipts as receipt
  set
    processing_status = 'processed',
    processing_outcome = 'refund-evidence-applied',
    processed_at = pg_catalog.statement_timestamp()
  where receipt.id = v_receipt_id;

  return 'processed';
end;
$$;

revoke all on function public.process_lemon_subscription_refund_v1(
  text,
  boolean,
  text,
  boolean,
  text,
  text,
  text,
  text,
  boolean,
  timestamptz,
  bigint,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.process_lemon_subscription_refund_v1(
  text,
  boolean,
  text,
  boolean,
  text,
  text,
  text,
  text,
  boolean,
  timestamptz,
  bigint,
  timestamptz,
  timestamptz
) to service_role;
