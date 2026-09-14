create function public.resolve_lemon_subscription_scope_v1(
  p_store_id text,
  p_test_mode boolean,
  p_subscription_id text
)
returns table (
  lemon_subscription_id text,
  store_id text,
  product_id text,
  variant_id text,
  test_mode boolean
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
    subscription.test_mode
  from app_private.lemon_subscriptions as subscription
  where subscription.store_id = p_store_id
    and subscription.test_mode = p_test_mode
    and subscription.lemon_subscription_id = p_subscription_id;
$$;

revoke all on function public.resolve_lemon_subscription_scope_v1(
  text,
  boolean,
  text
) from public, anon, authenticated;

grant execute on function public.resolve_lemon_subscription_scope_v1(
  text,
  boolean,
  text
) to service_role;

comment on function public.resolve_lemon_subscription_scope_v1(
  text,
  boolean,
  text
) is
  'Server-only subscription scope lookup for verified refund webhook filtering.';
