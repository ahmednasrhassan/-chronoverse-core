-- Private Lemon Squeezy persistence foundation.
-- These tables record upstream commercial facts only; they grant no access.

create table app_private.lemon_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  store_id text not null,
  lemon_customer_id text not null,
  test_mode boolean not null,
  upstream_created_at timestamptz not null,
  upstream_updated_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint lemon_customers_user_fk
    foreign key (user_id)
    references app_private.users (id)
    on delete restrict,
  constraint lemon_customers_lemon_customer_id_key
    unique (lemon_customer_id),
  constraint lemon_customers_store_customer_key
    unique (store_id, lemon_customer_id),
  constraint lemon_customers_user_store_mode_key
    unique (user_id, store_id, test_mode),
  constraint lemon_customers_store_id_not_empty
    check (length(btrim(store_id)) > 0),
  constraint lemon_customers_customer_id_not_empty
    check (length(btrim(lemon_customer_id)) > 0)
);

create table app_private.lemon_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload_sha256 text not null,
  idempotency_key text generated always as
    (event_type || ':' || payload_sha256) stored,
  upstream_object_type text,
  upstream_object_id text,
  upstream_event_at timestamptz,
  received_at timestamptz not null default statement_timestamp(),
  processed_at timestamptz,
  processing_status text not null default 'pending',
  processing_outcome text,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  constraint lemon_webhook_receipts_idempotency_key_key
    unique (idempotency_key),
  constraint lemon_webhook_receipts_event_type_not_empty
    check (length(btrim(event_type)) > 0),
  constraint lemon_webhook_receipts_payload_sha256_format
    check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint lemon_webhook_receipts_processing_status_check
    check (processing_status in (
      'pending',
      'processing',
      'processed',
      'failed',
      'ignored'
    )),
  constraint lemon_webhook_receipts_attempt_count_check
    check (attempt_count >= 0)
);

create table app_private.lemon_subscriptions (
  id uuid primary key default gen_random_uuid(),
  lemon_subscription_id text not null,
  store_id text not null,
  lemon_customer_id text not null,
  order_id text not null,
  order_item_id text not null,
  product_id text not null,
  variant_id text not null,
  subscription_item_id text,
  price_id text,
  quantity integer,
  status text not null,
  cancelled boolean not null,
  pause_mode text,
  pause_resumes_at timestamptz,
  trial_ends_at timestamptz,
  billing_anchor smallint,
  renews_at timestamptz,
  ends_at timestamptz,
  test_mode boolean not null,
  upstream_created_at timestamptz not null,
  upstream_updated_at timestamptz not null,
  last_webhook_receipt_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint lemon_subscriptions_customer_fk
    foreign key (store_id, lemon_customer_id)
    references app_private.lemon_customers (store_id, lemon_customer_id)
    on delete restrict,
  constraint lemon_subscriptions_last_webhook_receipt_fk
    foreign key (last_webhook_receipt_id)
    references app_private.lemon_webhook_receipts (id)
    on delete restrict,
  constraint lemon_subscriptions_lemon_subscription_id_key
    unique (lemon_subscription_id),
  constraint lemon_subscriptions_subscription_id_not_empty
    check (length(btrim(lemon_subscription_id)) > 0),
  constraint lemon_subscriptions_store_id_not_empty
    check (length(btrim(store_id)) > 0),
  constraint lemon_subscriptions_customer_id_not_empty
    check (length(btrim(lemon_customer_id)) > 0),
  constraint lemon_subscriptions_status_not_empty
    check (length(btrim(status)) > 0),
  constraint lemon_subscriptions_quantity_check
    check (quantity is null or quantity > 0),
  constraint lemon_subscriptions_billing_anchor_check
    check (billing_anchor is null or billing_anchor between 1 and 31)
);

alter table app_private.lemon_customers enable row level security;
alter table app_private.lemon_customers force row level security;
alter table app_private.lemon_subscriptions enable row level security;
alter table app_private.lemon_subscriptions force row level security;
alter table app_private.lemon_webhook_receipts enable row level security;
alter table app_private.lemon_webhook_receipts force row level security;

revoke all privileges on table app_private.lemon_customers
  from public, anon, authenticated;
revoke all privileges on table app_private.lemon_subscriptions
  from public, anon, authenticated;
revoke all privileges on table app_private.lemon_webhook_receipts
  from public, anon, authenticated;

create index lemon_customers_user_id_idx
  on app_private.lemon_customers (user_id);

create index lemon_subscriptions_customer_idx
  on app_private.lemon_subscriptions (store_id, lemon_customer_id);
create index lemon_subscriptions_lifecycle_idx
  on app_private.lemon_subscriptions (status, renews_at, ends_at);
create index lemon_subscriptions_upstream_updated_at_idx
  on app_private.lemon_subscriptions (upstream_updated_at);

create index lemon_webhook_receipts_processing_idx
  on app_private.lemon_webhook_receipts (processing_status, received_at)
  where processing_status in ('pending', 'failed');
create index lemon_webhook_receipts_upstream_object_idx
  on app_private.lemon_webhook_receipts (
    upstream_object_type,
    upstream_object_id,
    upstream_event_at
  )
  where upstream_object_id is not null;

create trigger set_lemon_customer_updated_at
before update on app_private.lemon_customers
for each row execute function app_private.set_updated_at();

create trigger set_lemon_subscription_updated_at
before update on app_private.lemon_subscriptions
for each row execute function app_private.set_updated_at();

comment on table app_private.lemon_customers is
  'Private Lemon customer linkage to stable Chronoverse user identity.';
comment on table app_private.lemon_subscriptions is
  'Upstream Lemon subscription facts only; no entitlement policy is encoded.';
comment on table app_private.lemon_webhook_receipts is
  'Webhook replay and processing metadata without raw request payloads.';
comment on column app_private.lemon_webhook_receipts.idempotency_key is
  'Unique event type plus verified request-body digest for duplicate detection.';
comment on column app_private.lemon_webhook_receipts.upstream_event_at is
  'Provider object event/update time used to reject stale processing later.';
