create function public.resolve_my_commercial_access_v1()
returns table (
  lemon_subscription_id text,
  store_id text,
  product_id text,
  variant_id text,
  raw_status text,
  cancelled boolean,
  pause_mode text,
  pause_resumes_at timestamptz,
  trial_ends_at timestamptz,
  renews_at timestamptz,
  ends_at timestamptz,
  upstream_updated_at timestamptz,
  test_mode boolean,
  refund_affected boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    subscription.lemon_subscription_id,
    subscription.store_id,
    subscription.product_id,
    subscription.variant_id,
    subscription.status,
    subscription.cancelled,
    subscription.pause_mode,
    subscription.pause_resumes_at,
    subscription.trial_ends_at,
    subscription.renews_at,
    subscription.ends_at,
    subscription.upstream_updated_at,
    subscription.test_mode,
    subscription.refund_affected
  from app_private.users as app_user
  inner join app_private.lemon_customers as customer
    on customer.user_id = app_user.id
  inner join app_private.lemon_subscriptions as subscription
    on subscription.store_id = customer.store_id
    and subscription.test_mode = customer.test_mode
    and subscription.lemon_customer_id = customer.lemon_customer_id
  where app_user.auth_user_id = (select auth.uid())
  order by
    subscription.store_id,
    subscription.test_mode,
    subscription.lemon_subscription_id;
$$;

revoke all on function public.resolve_my_commercial_access_v1()
  from public, anon, authenticated;

grant execute on function public.resolve_my_commercial_access_v1()
  to authenticated;

comment on function public.resolve_my_commercial_access_v1() is
  'Returns only persisted commercial facts for the authenticated caller.';
