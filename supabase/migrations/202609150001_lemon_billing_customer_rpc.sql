create function public.resolve_lemon_customers_for_user_v1(
  p_user_id uuid
)
returns table (
  user_id uuid,
  lemon_customer_id text,
  store_id text,
  test_mode boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    customer.user_id,
    customer.lemon_customer_id,
    customer.store_id,
    customer.test_mode
  from app_private.lemon_customers as customer
  where customer.user_id = p_user_id
  order by
    customer.test_mode,
    customer.store_id,
    customer.lemon_customer_id;
$$;

revoke all on function public.resolve_lemon_customers_for_user_v1(uuid)
  from public, anon, authenticated;

grant execute on function public.resolve_lemon_customers_for_user_v1(uuid)
  to service_role;

comment on function public.resolve_lemon_customers_for_user_v1(uuid) is
  'Server-only exact-user Lemon customer lookup for authenticated billing management.';
