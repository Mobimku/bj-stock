create or replace function public.is_valid_sale_test_results(p_results jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_results) = 'object'
    and (
      select coalesce(array_agg(key order by key), array[]::text[])
      from jsonb_object_keys(p_results) as keys(key)
    ) = array[
      'av_devices',
      'battery_charging_charger',
      'boot_os_locks',
      'display_dead_pixels',
      'display_output',
      'identity_spec_serial',
      'included_accessories',
      'keyboard_touchpad',
      'physical_casing_hinges',
      'storage_health',
      'usb_ports',
      'wifi_bluetooth'
    ]::text[]
    and not exists (
      select 1
      from jsonb_each(p_results) as result(key, value)
      where jsonb_typeof(result.value) <> 'object'
        or not (result.value ? 'status')
        or exists (
          select 1
          from jsonb_object_keys(result.value) as fields(field)
          where fields.field not in ('status', 'note')
        )
        or jsonb_typeof(result.value -> 'status') <> 'string'
        or result.value ->> 'status' not in ('Lulus', 'Ada Catatan', 'Tidak Diuji')
        or (
          result.value ? 'note'
          and jsonb_typeof(result.value -> 'note') not in ('string', 'null')
        )
        or (
          jsonb_typeof(result.value -> 'note') = 'string'
          and char_length(result.value ->> 'note') > 160
        )
        or (
          result.value ->> 'status' in ('Ada Catatan', 'Tidak Diuji')
          and (
            jsonb_typeof(result.value -> 'note') <> 'string'
            or nullif(btrim(result.value ->> 'note'), '') is null
          )
        )
    )
$$;

create or replace function public.is_valid_sale_blocking_checks(p_checks jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_checks) = 'object'
    and (
      select coalesce(array_agg(key order by key), array[]::text[])
      from jsonb_object_keys(p_checks) as keys(key)
    ) = array[
      'bios_lock',
      'identity_mismatch',
      'mdm_lock',
      'serial_mismatch',
      'spec_mismatch',
      'swollen_battery',
      'unsafe_charger'
    ]::text[]
    and not exists (
      select 1
      from jsonb_each(p_checks) as blocker(key, value)
      where jsonb_typeof(blocker.value) <> 'boolean'
        or blocker.value <> 'false'::jsonb
    )
$$;

create table if not exists public.sale_unit_tests (
  id_sale_test uuid not null default gen_random_uuid(),
  id_unit text not null,
  test_results jsonb not null,
  blocking_checks jsonb not null,
  location text not null,
  tester_user_id uuid not null,
  tester_email text not null,
  acknowledgement_text text not null,
  confirmed_at timestamptz not null default now()
);

alter table public.sale_unit_tests
  add column if not exists id_sale_test uuid,
  add column if not exists id_unit text,
  add column if not exists test_results jsonb,
  add column if not exists blocking_checks jsonb,
  add column if not exists location text,
  add column if not exists tester_user_id uuid,
  add column if not exists tester_email text,
  add column if not exists acknowledgement_text text,
  add column if not exists confirmed_at timestamptz;

alter table public.sale_unit_tests
  alter column id_sale_test set default gen_random_uuid(),
  alter column id_sale_test set not null,
  alter column id_unit set not null,
  alter column test_results set not null,
  alter column blocking_checks set not null,
  alter column location set not null,
  alter column tester_user_id set not null,
  alter column tester_email set not null,
  alter column acknowledgement_text set not null,
  alter column confirmed_at set default now(),
  alter column confirmed_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_unit_tests'::regclass and contype = 'p'
  ) then
    alter table public.sale_unit_tests
      add constraint sale_unit_tests_pkey primary key (id_sale_test);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_unit_tests'::regclass
      and conname = 'sale_unit_tests_id_unit_fkey'
  ) then
    alter table public.sale_unit_tests
      add constraint sale_unit_tests_id_unit_fkey
      foreign key (id_unit) references public.units(id_unit);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_unit_tests'::regclass
      and conname = 'sale_unit_tests_id_sale_test_unit_key'
  ) then
    alter table public.sale_unit_tests
      add constraint sale_unit_tests_id_sale_test_unit_key unique (id_sale_test, id_unit);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_unit_tests'::regclass
      and conname = 'sale_unit_tests_test_results_check'
  ) then
    alter table public.sale_unit_tests
      add constraint sale_unit_tests_test_results_check
      check (public.is_valid_sale_test_results(test_results));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_unit_tests'::regclass
      and conname = 'sale_unit_tests_blocking_checks_check'
  ) then
    alter table public.sale_unit_tests
      add constraint sale_unit_tests_blocking_checks_check
      check (public.is_valid_sale_blocking_checks(blocking_checks));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_unit_tests'::regclass
      and conname = 'sale_unit_tests_location_check'
  ) then
    alter table public.sale_unit_tests
      add constraint sale_unit_tests_location_check
      check (nullif(btrim(location), '') is not null and char_length(location) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_unit_tests'::regclass
      and conname = 'sale_unit_tests_tester_email_check'
  ) then
    alter table public.sale_unit_tests
      add constraint sale_unit_tests_tester_email_check
      check (nullif(btrim(tester_email), '') is not null and char_length(tester_email) <= 320);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_unit_tests'::regclass
      and conname = 'sale_unit_tests_acknowledgement_text_check'
  ) then
    alter table public.sale_unit_tests
      add constraint sale_unit_tests_acknowledgement_text_check
      check (
        acknowledgement_text = 'Pembeli telah menyaksikan atau menerima ringkasan hasil pengujian di atas sebelum pembayaran dan memahami setiap catatan atau bagian yang tidak diuji. Persetujuan ini tidak menghapus, mengurangi, atau membatasi garansi BJ Laptop maupun hak konsumen berdasarkan hukum yang berlaku.'
      );
  end if;
end;
$$;

alter table public.sales add column if not exists id_sale_test uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sales'::regclass and conname = 'sales_id_sale_test_unit_fkey'
  ) then
    alter table public.sales
      add constraint sales_id_sale_test_unit_fkey
      foreign key (id_sale_test, id_unit)
      references public.sale_unit_tests(id_sale_test, id_unit);
  end if;
end;
$$;

create unique index if not exists sales_id_sale_test_unique
on public.sales(id_sale_test)
where id_sale_test is not null;

create or replace function public.protect_sale_unit_tests()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Hasil pengujian unit tidak dapat diubah atau dihapus';
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.sale_unit_tests'::regclass
      and tgname = 'protect_sale_unit_tests'
      and not tgisinternal
  ) then
    create trigger protect_sale_unit_tests
    before update or delete on public.sale_unit_tests
    for each row execute function public.protect_sale_unit_tests();
  end if;
end;
$$;

create or replace function public.require_sale_unit_test()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id_sale_test is null then
    raise exception using
      errcode = '23514',
      message = 'Pengujian unit wajib lengkap sebelum transaksi penjualan';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.sales'::regclass
      and tgname = 'require_sale_unit_test'
      and not tgisinternal
  ) then
    create trigger require_sale_unit_test
    before insert on public.sales
    for each row execute function public.require_sale_unit_test();
  end if;
end;
$$;

alter table public.sale_unit_tests enable row level security;
revoke all on table public.sale_unit_tests from public, anon, authenticated;
grant select on table public.sale_unit_tests to authenticated;

drop policy if exists "authenticated users read sale unit tests" on public.sale_unit_tests;
create policy "authenticated users read sale unit tests"
on public.sale_unit_tests for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

revoke insert, update, delete on table public.sales from public, anon, authenticated;

drop function if exists public.create_sale(text, uuid, text, text, text, text, numeric, text, text, date);
drop function if exists public.create_sale(text, uuid, text, text, text, text, numeric, text, text, date, integer);

create or replace function public.create_sale(
  p_id_unit text,
  p_id_customer uuid,
  p_customer_name text,
  p_customer_wa text,
  p_customer_segment text,
  p_customer_source text,
  p_harga_jual numeric,
  p_channel text,
  p_metode_bayar text,
  p_tanggal_transaksi date,
  p_durasi_garansi_hari integer,
  p_test jsonb
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_wa text := public.normalize_whatsapp(p_customer_wa);
  customer_id uuid := p_id_customer;
  month_code text := to_char(p_tanggal_transaksi, 'YYMM');
  next_number integer;
  new_sale_test_id uuid;
  tester_id uuid := auth.uid();
  tester_email text := nullif(btrim(auth.jwt() ->> 'email'), '');
  normalized_results jsonb := p_test -> 'test_results';
  category_key text;
  category_result jsonb;
  blocker_key text;
  new_sale public.sales;
begin
  if coalesce(public.current_user_role(), '') not in ('admin', 'owner') then
    raise exception 'Hanya admin dan owner yang dapat membuat transaksi penjualan';
  end if;

  if tester_id is null or tester_email is null then
    raise exception using
      errcode = '22023',
      message = 'Identitas penguji dari sesi login tidak valid';
  end if;

  if p_test is null
    or jsonb_typeof(p_test) <> 'object'
    or (
      select array_agg(key order by key)
      from jsonb_object_keys(p_test) as keys(key)
    ) <> array['acknowledged', 'blocking_checks', 'location', 'test_results']::text[]
    or jsonb_typeof(p_test -> 'location') <> 'string'
    or nullif(btrim(p_test ->> 'location'), '') is null
    or char_length(btrim(p_test ->> 'location')) > 120
    or p_test -> 'acknowledged' <> 'true'::jsonb then
    raise exception using
      errcode = '22023',
      message = 'Data pengujian unit tidak valid';
  end if;

  foreach category_key in array array[
    'identity_spec_serial', 'physical_casing_hinges', 'display_dead_pixels',
    'keyboard_touchpad', 'wifi_bluetooth', 'av_devices', 'usb_ports',
    'display_output', 'battery_charging_charger', 'storage_health',
    'boot_os_locks', 'included_accessories'
  ] loop
    category_result := normalized_results -> category_key;
    if jsonb_typeof(category_result) = 'object'
      and category_result ? 'note'
      and jsonb_typeof(category_result -> 'note') = 'string' then
      normalized_results := jsonb_set(
        normalized_results,
        array[category_key, 'note'],
        to_jsonb(btrim(category_result ->> 'note')),
        false
      );
    end if;
  end loop;

  if not coalesce(public.is_valid_sale_test_results(normalized_results), false) then
    raise exception using
      errcode = '22023',
      message = 'Data pengujian unit tidak valid';
  end if;

  if not coalesce(public.is_valid_sale_blocking_checks(p_test -> 'blocking_checks'), false) then
    foreach blocker_key in array array[
      'identity_mismatch', 'serial_mismatch', 'spec_mismatch', 'swollen_battery',
      'bios_lock', 'mdm_lock', 'unsafe_charger'
    ] loop
      if jsonb_typeof(p_test -> 'blocking_checks' -> blocker_key) = 'boolean'
        and (p_test -> 'blocking_checks' ->> blocker_key)::boolean then
        raise exception using
          errcode = '22023',
          message = format('Data pengujian unit tidak valid: hard blocker %s harus Lulus', blocker_key);
      end if;
    end loop;

    raise exception using
      errcode = '22023',
      message = 'Data pengujian unit tidak valid';
  end if;

  if p_durasi_garansi_hari is null or p_durasi_garansi_hari <= 0 then
    raise exception 'Durasi garansi wajib lebih dari 0 hari';
  end if;

  perform 1 from public.units where id_unit = p_id_unit for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan';
  end if;

  if customer_id is not null then
    perform 1 from public.customers where id_customer = customer_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Customer tidak ditemukan';
    end if;
  else
    if nullif(btrim(p_customer_name), '') is null then
      raise exception 'Nama customer wajib diisi';
    end if;

    if normalized_wa is not null then
      perform pg_advisory_xact_lock(hashtext('customer:' || normalized_wa));
      insert into public.customers (nama, kontak_wa, segmen, sumber_lead)
      values (btrim(p_customer_name), normalized_wa, p_customer_segment, p_customer_source)
      on conflict (kontak_wa) do update set kontak_wa = excluded.kontak_wa
      returning id_customer into customer_id;
    else
      insert into public.customers (nama, segmen, sumber_lead)
      values (btrim(p_customer_name), p_customer_segment, p_customer_source)
      returning id_customer into customer_id;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('invoice:' || month_code));
  select coalesce(max((regexp_match(id_invoice, '([0-9]+)$'))[1]::integer), 0) + 1
  into next_number
  from public.sales
  where id_invoice like 'INV-' || month_code || '-%';

  if next_number > 999 then
    raise exception 'Nomor invoice bulanan sudah mencapai batas 999';
  end if;

  insert into public.sale_unit_tests (
    id_unit, test_results, blocking_checks, location, tester_user_id,
    tester_email, acknowledgement_text, confirmed_at
  ) values (
    p_id_unit,
    normalized_results,
    p_test -> 'blocking_checks',
    btrim(p_test ->> 'location'),
    tester_id,
    tester_email,
    'Pembeli telah menyaksikan atau menerima ringkasan hasil pengujian di atas sebelum pembayaran dan memahami setiap catatan atau bagian yang tidak diuji. Persetujuan ini tidak menghapus, mengurangi, atau membatasi garansi BJ Laptop maupun hak konsumen berdasarkan hukum yang berlaku.',
    now()
  ) returning id_sale_test into new_sale_test_id;

  insert into public.sales (
    id_invoice, id_unit, id_customer, harga_jual, margin, channel, metode_bayar,
    tanggal_transaksi, durasi_garansi_hari, id_sale_test
  ) values (
    'INV-' || month_code || '-' || lpad(next_number::text, 3, '0'),
    p_id_unit, customer_id, p_harga_jual, 0, p_channel, p_metode_bayar,
    p_tanggal_transaksi, p_durasi_garansi_hari, new_sale_test_id
  ) returning * into new_sale;

  return new_sale;
end;
$$;

revoke all on function public.is_valid_sale_test_results(jsonb) from public, anon, authenticated;
revoke all on function public.is_valid_sale_blocking_checks(jsonb) from public, anon, authenticated;
revoke all on function public.protect_sale_unit_tests() from public, anon, authenticated;
revoke all on function public.require_sale_unit_test() from public, anon, authenticated;
revoke all on function public.create_sale(text, uuid, text, text, text, text, numeric, text, text, date, integer, jsonb) from public, anon, authenticated;
grant execute on function public.create_sale(text, uuid, text, text, text, text, numeric, text, text, date, integer, jsonb) to authenticated;
