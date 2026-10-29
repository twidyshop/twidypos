-- Fix new-account workspace initialization without direct browser writes.
-- Keep workspace creation and setup saves behind authenticated SECURITY DEFINER RPCs.
create or replace function public.initialize_workspace()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_store_data jsonb;
begin
  if v_uid is null then
    raise exception 'Sesi akun tidak valid';
  end if;

  insert into public.pos_workspaces (user_id, store_data)
  values (
    v_uid,
    jsonb_build_object(
      'products', '[]'::jsonb,
      'transactions', '[]'::jsonb,
      'customers', '[]'::jsonb,
      'purchases', '[]'::jsonb,
      'cashMovements', '[]'::jsonb,
      'shifts', '[]'::jsonb,
      'returns', '[]'::jsonb,
      'stocktakeLog', '[]'::jsonb,
      'settings', jsonb_build_object(
        'storeName', '',
        'cashierName', '',
        'cashiers', '[]'::jsonb,
        'storePhone', '',
        'storeAddress', '',
        'receiptNote', 'Terima kasih sudah berbelanja!',
        'paymentMethods', jsonb_build_array('Tunai', 'Transfer BCA', 'Transfer Mandiri', 'QRIS', 'E-wallet'),
        'taxRate', 0,
        'ownerPinHash', '',
        'costPrices', '{}'::jsonb
      )
    )
  )
  on conflict (user_id) do nothing;

  select w.store_data into v_store_data
  from public.pos_workspaces as w
  where w.user_id = v_uid;

  if v_store_data is null then
    raise exception 'Data toko gagal disiapkan. Silakan coba lagi.';
  end if;

  return jsonb_build_object('ok', true, 'store_data', v_store_data);
end;
$function$;

create or replace function public.save_workspace_setup(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sesi akun tidak valid';
  end if;
  if jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Pengaturan toko tidak valid';
  end if;
  if length(btrim(coalesce(p_settings->>'storeName', ''))) = 0 then
    raise exception 'Nama toko wajib diisi';
  end if;
  if length(coalesce(p_settings->>'storeName', '')) > 60 then
    raise exception 'Nama toko maksimal 60 karakter';
  end if;

  insert into public.pos_workspaces (user_id, store_data)
  values (
    v_uid,
    jsonb_build_object(
      'products', '[]'::jsonb,
      'transactions', '[]'::jsonb,
      'customers', '[]'::jsonb,
      'purchases', '[]'::jsonb,
      'cashMovements', '[]'::jsonb,
      'shifts', '[]'::jsonb,
      'returns', '[]'::jsonb,
      'stocktakeLog', '[]'::jsonb,
      'settings', p_settings
    )
  )
  on conflict (user_id) do nothing;

  update public.pos_workspaces
    set store_data = jsonb_set(store_data, '{settings}', p_settings, true),
        updated_at = now()
    where user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.initialize_workspace() from public, anon;
grant execute on function public.initialize_workspace() to authenticated;
revoke all on function public.save_workspace_setup(jsonb) from public, anon;
grant execute on function public.save_workspace_setup(jsonb) to authenticated;
