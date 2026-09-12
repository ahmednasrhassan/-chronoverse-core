-- Lemon reports quantity 0 for usage-based subscription items.
alter table app_private.lemon_subscriptions
  drop constraint lemon_subscriptions_quantity_check;
alter table app_private.lemon_subscriptions
  add constraint lemon_subscriptions_quantity_check
  check (quantity is null or quantity >= 0);

create function public.process_lemon_subscription_webhook_v1(
  p_store_id text,
  p_test_mode boolean,
  p_idempotency_key text,
  p_payload_valid boolean,
  p_custom_data_state text,
  p_chronoverse_user_id uuid,
  p_lemon_subscription_id text,
  p_lemon_customer_id text,
  p_lemon_order_id text,
  p_lemon_order_item_id text,
  p_lemon_product_id text,
  p_lemon_variant_id text,
  p_lemon_subscription_item_id text,
  p_lemon_price_id text,
  p_quantity integer,
  p_raw_status text,
  p_cancelled boolean,
  p_pause_mode text,
  p_pause_resumes_at timestamptz,
  p_trial_ends_at timestamptz,
  p_billing_anchor smallint,
  p_renews_at timestamptz,
  p_ends_at timestamptz,
  p_upstream_created_at timestamptz,
  p_upstream_updated_at timestamptz
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
  v_subscription_found boolean;
  v_customer_user_id uuid;
  v_customer_mapping_found boolean;
  v_user_customer_id text;
  v_user_mapping_found boolean;
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

  if v_event_type not in (
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'subscription_resumed',
    'subscription_expired',
    'subscription_paused',
    'subscription_unpaused',
    'subscription_plan_changed'
  ) or v_object_type is distinct from 'subscriptions' then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'ignored',
      processing_outcome = case
        when v_event_type in (
          'subscription_payment_failed',
          'subscription_payment_success',
          'subscription_payment_recovered',
          'subscription_payment_refunded'
        ) then 'unsupported-subscription-invoice-event'
        else 'unsupported-webhook-event'
      end,
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'ignored';
  end if;

  if p_payload_valid is not true
    or p_custom_data_state is null
    or p_custom_data_state not in ('absent', 'valid', 'invalid')
    or p_lemon_subscription_id is null
    or pg_catalog.btrim(p_lemon_subscription_id) = ''
    or p_lemon_customer_id is null
    or pg_catalog.btrim(p_lemon_customer_id) = ''
    or p_lemon_order_id is null
    or pg_catalog.btrim(p_lemon_order_id) = ''
    or p_lemon_order_item_id is null
    or pg_catalog.btrim(p_lemon_order_item_id) = ''
    or p_lemon_product_id is null
    or pg_catalog.btrim(p_lemon_product_id) = ''
    or p_lemon_variant_id is null
    or pg_catalog.btrim(p_lemon_variant_id) = ''
    or p_raw_status is null
    or pg_catalog.btrim(p_raw_status) = ''
    or p_cancelled is null
    or p_upstream_created_at is null
    or p_upstream_updated_at is null
    or p_upstream_created_at > p_upstream_updated_at
    or (p_quantity is not null and p_quantity < 0)
    or (p_billing_anchor is not null and p_billing_anchor not between 1 and 31)
    or (p_pause_mode is not null and p_pause_mode not in ('free', 'void'))
    or (p_pause_mode is null and p_pause_resumes_at is not null)
    or not (
      (
        p_lemon_subscription_item_id is null
        and p_lemon_price_id is null
        and p_quantity is null
      )
      or (
        p_lemon_subscription_item_id is not null
        and pg_catalog.btrim(p_lemon_subscription_item_id) <> ''
        and p_lemon_price_id is not null
        and pg_catalog.btrim(p_lemon_price_id) <> ''
        and p_quantity is not null
      )
    )
    or (p_custom_data_state = 'valid' and p_chronoverse_user_id is null)
    or (p_custom_data_state <> 'valid' and p_chronoverse_user_id is not null)
  then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'invalid-subscription-payload',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  if v_object_id is distinct from p_lemon_subscription_id
    or v_event_at is distinct from p_upstream_updated_at
  then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'receipt-payload-mismatch',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  if p_custom_data_state = 'invalid' then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'invalid-commercial-identity',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_store_id || ':' || p_test_mode::text || ':' || p_lemon_subscription_id,
      0
    )
  );

  select subscription.*
  into v_subscription
  from app_private.lemon_subscriptions as subscription
  where subscription.store_id = p_store_id
    and subscription.test_mode = p_test_mode
    and subscription.lemon_subscription_id = p_lemon_subscription_id
  for update;
  v_subscription_found := found;

  if v_subscription_found
    and p_upstream_updated_at < v_subscription.upstream_updated_at
  then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'ignored',
      processing_outcome = 'stale-subscription-event',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'ignored';
  end if;

  if p_custom_data_state = 'valid' then
    perform 1
    from app_private.users as app_user
    where app_user.id = p_chronoverse_user_id
    for key share;

    if not found then
      update app_private.lemon_webhook_receipts as receipt
      set
        processing_status = 'failed',
        processing_outcome = 'commercial-user-not-found',
        processed_at = pg_catalog.statement_timestamp()
      where receipt.id = v_receipt_id;

      return 'failed';
    end if;
  end if;

  select customer.user_id
  into v_customer_user_id
  from app_private.lemon_customers as customer
  where customer.store_id = p_store_id
    and customer.test_mode = p_test_mode
    and customer.lemon_customer_id = p_lemon_customer_id;
  v_customer_mapping_found := found;

  if p_custom_data_state = 'valid' then
    select customer.lemon_customer_id
    into v_user_customer_id
    from app_private.lemon_customers as customer
    where customer.user_id = p_chronoverse_user_id
      and customer.store_id = p_store_id
      and customer.test_mode = p_test_mode;
    v_user_mapping_found := found;
  else
    v_user_customer_id := null;
    v_user_mapping_found := false;
  end if;

  if v_customer_mapping_found
    and (
      p_custom_data_state = 'valid'
      and v_customer_user_id is distinct from p_chronoverse_user_id
    )
  then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'customer-linkage-conflict',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  if v_user_mapping_found
    and v_user_customer_id is distinct from p_lemon_customer_id
  then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'customer-linkage-conflict',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  if v_event_type = 'subscription_created'
    and p_custom_data_state <> 'valid'
  then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'trusted-customer-identity-required',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  if v_subscription_found
    and v_subscription.lemon_customer_id is distinct from p_lemon_customer_id
  then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'subscription-customer-conflict',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  if v_subscription_found
    and p_upstream_updated_at = v_subscription.upstream_updated_at
  then
    if v_subscription.lemon_customer_id is not distinct from p_lemon_customer_id
      and v_subscription.order_id is not distinct from p_lemon_order_id
      and v_subscription.order_item_id is not distinct from p_lemon_order_item_id
      and v_subscription.product_id is not distinct from p_lemon_product_id
      and v_subscription.variant_id is not distinct from p_lemon_variant_id
      and v_subscription.subscription_item_id
        is not distinct from p_lemon_subscription_item_id
      and v_subscription.price_id is not distinct from p_lemon_price_id
      and v_subscription.quantity is not distinct from p_quantity
      and v_subscription.status is not distinct from p_raw_status
      and v_subscription.cancelled is not distinct from p_cancelled
      and v_subscription.pause_mode is not distinct from p_pause_mode
      and v_subscription.pause_resumes_at
        is not distinct from p_pause_resumes_at
      and v_subscription.trial_ends_at is not distinct from p_trial_ends_at
      and v_subscription.billing_anchor is not distinct from p_billing_anchor
      and v_subscription.renews_at is not distinct from p_renews_at
      and v_subscription.ends_at is not distinct from p_ends_at
      and v_subscription.upstream_created_at
        is not distinct from p_upstream_created_at
    then
      update app_private.lemon_webhook_receipts as receipt
      set
        processing_status = 'processed',
        processing_outcome = 'subscription-version-idempotent',
        processed_at = pg_catalog.statement_timestamp()
      where receipt.id = v_receipt_id;

      return 'processed';
    end if;

    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'subscription-version-conflict',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  if not v_subscription_found and v_event_type = 'subscription_created' then
    -- These verified subscription timestamps bound the first observed linkage.
    insert into app_private.lemon_customers (
      user_id,
      store_id,
      lemon_customer_id,
      test_mode,
      upstream_created_at,
      upstream_updated_at
    )
    values (
      p_chronoverse_user_id,
      p_store_id,
      p_lemon_customer_id,
      p_test_mode,
      p_upstream_created_at,
      p_upstream_updated_at
    )
    on conflict do nothing;

    select customer.user_id
    into v_customer_user_id
    from app_private.lemon_customers as customer
    where customer.store_id = p_store_id
      and customer.test_mode = p_test_mode
      and customer.lemon_customer_id = p_lemon_customer_id;
    v_customer_mapping_found := found;

    select customer.lemon_customer_id
    into v_user_customer_id
    from app_private.lemon_customers as customer
    where customer.user_id = p_chronoverse_user_id
      and customer.store_id = p_store_id
      and customer.test_mode = p_test_mode;
    v_user_mapping_found := found;

    if not v_customer_mapping_found
      or not v_user_mapping_found
      or v_customer_user_id is distinct from p_chronoverse_user_id
      or v_user_customer_id is distinct from p_lemon_customer_id
    then
      update app_private.lemon_webhook_receipts as receipt
      set
        processing_status = 'failed',
        processing_outcome = 'customer-linkage-conflict',
        processed_at = pg_catalog.statement_timestamp()
      where receipt.id = v_receipt_id;

      return 'failed';
    end if;
  elsif not v_customer_mapping_found then
    update app_private.lemon_webhook_receipts as receipt
    set
      processing_status = 'failed',
      processing_outcome = 'customer-linkage-missing',
      processed_at = pg_catalog.statement_timestamp()
    where receipt.id = v_receipt_id;

    return 'failed';
  end if;

  if v_subscription_found then
    update app_private.lemon_subscriptions as subscription
    set
      order_id = p_lemon_order_id,
      order_item_id = p_lemon_order_item_id,
      product_id = p_lemon_product_id,
      variant_id = p_lemon_variant_id,
      subscription_item_id = p_lemon_subscription_item_id,
      price_id = p_lemon_price_id,
      quantity = p_quantity,
      status = p_raw_status,
      cancelled = p_cancelled,
      pause_mode = p_pause_mode,
      pause_resumes_at = p_pause_resumes_at,
      trial_ends_at = p_trial_ends_at,
      billing_anchor = p_billing_anchor,
      renews_at = p_renews_at,
      ends_at = p_ends_at,
      upstream_created_at = p_upstream_created_at,
      upstream_updated_at = p_upstream_updated_at,
      last_webhook_receipt_id = v_receipt_id
    where subscription.id = v_subscription.id;
  else
    insert into app_private.lemon_subscriptions (
      lemon_subscription_id,
      store_id,
      lemon_customer_id,
      order_id,
      order_item_id,
      product_id,
      variant_id,
      subscription_item_id,
      price_id,
      quantity,
      status,
      cancelled,
      pause_mode,
      pause_resumes_at,
      trial_ends_at,
      billing_anchor,
      renews_at,
      ends_at,
      test_mode,
      upstream_created_at,
      upstream_updated_at,
      last_webhook_receipt_id
    )
    values (
      p_lemon_subscription_id,
      p_store_id,
      p_lemon_customer_id,
      p_lemon_order_id,
      p_lemon_order_item_id,
      p_lemon_product_id,
      p_lemon_variant_id,
      p_lemon_subscription_item_id,
      p_lemon_price_id,
      p_quantity,
      p_raw_status,
      p_cancelled,
      p_pause_mode,
      p_pause_resumes_at,
      p_trial_ends_at,
      p_billing_anchor,
      p_renews_at,
      p_ends_at,
      p_test_mode,
      p_upstream_created_at,
      p_upstream_updated_at,
      v_receipt_id
    );
  end if;

  update app_private.lemon_webhook_receipts as receipt
  set
    processing_status = 'processed',
    processing_outcome = 'subscription-applied',
    processed_at = pg_catalog.statement_timestamp()
  where receipt.id = v_receipt_id;

  return 'processed';
end;
$$;

revoke all on function public.process_lemon_subscription_webhook_v1(
  text,
  boolean,
  text,
  boolean,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  boolean,
  text,
  timestamptz,
  timestamptz,
  smallint,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.process_lemon_subscription_webhook_v1(
  text,
  boolean,
  text,
  boolean,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  boolean,
  text,
  timestamptz,
  timestamptz,
  smallint,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) to service_role;
