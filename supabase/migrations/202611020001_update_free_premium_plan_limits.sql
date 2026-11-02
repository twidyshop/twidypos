-- Align Free and Premium product quotas with the published plan table.
-- Free: 50 transactions/day, 100 products.
-- Premium: 500 transactions/day, 500 products.
-- Full Unlimited remains unchanged.

create or replace function public.twidypos_get_my_plan_usage()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_created timestamptz;
  v_rollout timestamptz;
  v_sub public.twidypos_subscriptions%rowtype;
  v_plan text;
  v_product_count integer := 0;
  v_tx_count integer := 0;
  v_product_limit integer;
  v_tx_limit integer;
begin
  if v_uid is null then raise exception 'Login diperlukan'; end if;
  select created_at into v_created from auth.users where id=v_uid;
  select rollout_at into v_rollout from public.twidypos_plan_config where singleton=true;
  if v_created is null or v_rollout is null then raise exception 'Akun atau konfigurasi paket tidak valid'; end if;
  if v_created < v_rollout then
    v_plan := 'unlimited';
  else
    select * into v_sub from public.twidypos_subscriptions where user_id=v_uid;
    if not found then v_plan := 'free';
    elsif v_sub.grandfathered then v_plan := 'unlimited';
    elsif v_sub.status <> 'active' or (v_sub.current_period_end is not null and v_sub.current_period_end <= now()) then v_plan := 'free';
    else v_plan := v_sub.plan_code;
    end if;
  end if;
  select jsonb_array_length(coalesce(store_data->'products','[]'::jsonb))
    into v_product_count from public.pos_workspaces where user_id=v_uid;
  v_product_count := coalesce(v_product_count,0);
  select count(*)::integer into v_tx_count from public.twidypos_daily_transactions
    where user_id=v_uid and usage_date=(timezone('Asia/Jakarta',now()))::date;
  v_product_limit := case v_plan when 'free' then 100 when 'premium' then 500 else null end;
  v_tx_limit := case v_plan when 'free' then 50 when 'premium' then 500 else null end;
  return jsonb_build_object(
    'plan_code',v_plan,
    'product_count',v_product_count,
    'transaction_count_today',v_tx_count,
    'product_limit',v_product_limit,
    'transaction_limit',v_tx_limit,
    'products_remaining',case when v_product_limit is null then null else greatest(0,v_product_limit-v_product_count) end,
    'transactions_remaining',case when v_tx_limit is null then null else greatest(0,v_tx_limit-v_tx_count) end
  );
end;
$function$;

create or replace function public.twidypos_enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_created timestamptz;
  v_rollout timestamptz;
  v_sub public.twidypos_subscriptions%rowtype;
  v_product_count integer;
  v_plan text;
  v_product_limit integer;
  v_daily_limit integer;
  v_tx jsonb;
  v_tx_id text;
  v_today date := (timezone('Asia/Jakarta', now()))::date;
  v_used integer;
begin
  select u.created_at into v_created from auth.users u where u.id = new.user_id;
  if v_created is null then raise exception 'Akun pemilik toko tidak valid'; end if;
  select rollout_at into v_rollout from private.twidypos_plan_config where id=true;
  if v_created < v_rollout then
    insert into public.twidypos_subscriptions(user_id, plan_code, status, current_period_end, grandfathered)
    values(new.user_id, 'unlimited', 'active', null, true)
    on conflict(user_id) do update set grandfathered=true, plan_code='unlimited', status='active', current_period_end=null;
    return new;
  end if;
  insert into public.twidypos_subscriptions(user_id, plan_code, status, grandfathered)
  values(new.user_id, 'free', 'active', false) on conflict(user_id) do nothing;
  select * into v_sub from public.twidypos_subscriptions where user_id = new.user_id for update;
  v_plan := case
    when v_sub.grandfathered then 'unlimited'
    when v_sub.status <> 'active' then 'free'
    when v_sub.current_period_end is not null and v_sub.current_period_end <= now() then 'free'
    else v_sub.plan_code end;
  v_product_limit := case v_plan when 'free' then 100 when 'premium' then 500 else null end;
  v_daily_limit := case v_plan when 'free' then 50 when 'premium' then 500 else null end;
  v_product_count := jsonb_array_length(coalesce(new.store_data->'products','[]'::jsonb));
  if v_product_limit is not null and v_product_count > v_product_limit then
    raise exception 'Batas paket %: maksimal % produk. Hapus produk atau tingkatkan paket.', v_plan, v_product_limit using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  for v_tx in
    select value from jsonb_array_elements(coalesce(new.store_data->'transactions','[]'::jsonb))
    where nullif(value->>'id','') is not null
      and (tg_op='INSERT' or not exists (
        select 1 from jsonb_array_elements(coalesce(old.store_data->'transactions','[]'::jsonb)) oldtx(value)
        where oldtx.value->>'id'=value->>'id'
      ))
  loop
    v_tx_id := nullif(v_tx->>'id','');
    insert into public.twidypos_daily_transactions(user_id, usage_date, transaction_id)
    values(new.user_id, v_today, v_tx_id) on conflict(user_id, usage_date, transaction_id) do nothing;
  end loop;
  if v_daily_limit is not null then
    select count(*) into v_used from public.twidypos_daily_transactions where user_id=new.user_id and usage_date=v_today;
    if v_used > v_daily_limit then
      raise exception 'Batas paket % tercapai: maksimal % transaksi per hari.', v_plan, v_daily_limit using errcode='P0001';
    end if;
  end if;
  return new;
end;
$function$;
