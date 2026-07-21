-- allow: SIZE_OK - F-WRT-04 is an indivisible schema, guard, read-model, and atomic RPC migration.

insert into public.app_settings (key, value)
values ('replacement_grace_days', '7')
on conflict (key) do nothing;

alter table public.finance_transactions
drop constraint if exists finance_transactions_kategori_check;
alter table public.finance_transactions
add constraint finance_transactions_kategori_check check (kategori in (
  'Pembelian Unit','Pembelian Part','Biaya Upgrade Eksternal',
  'Penjualan Unit','Pendapatan Servis','Operasional',
  'Modal Disetor','Retur Unit','Retur Servis','Selisih Penggantian Unit','Lainnya'
));

alter table public.finance_transactions
drop constraint if exists finance_transactions_source_module_check;
alter table public.finance_transactions
add constraint finance_transactions_source_module_check check (
  source_module in ('Stock','BankStock','Sales','Servis','Manual','Retur','Warranty')
);

alter table public.admin_actions_log
drop constraint if exists admin_actions_log_aksi_check;
alter table public.admin_actions_log
add constraint admin_actions_log_aksi_check check (aksi in (
  'create_account','deactivate_account','reactivate_account',
  'update_app_setting','finance_reversal','process_return','warranty_unit_replacement'
));

create table public.warranty_replacements (
  id_replacement uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  id_invoice text not null references public.sales(id_invoice),
  sequence_no integer not null check (sequence_no > 0),
  id_klaim uuid not null unique references public.warranty_claim(id_klaim),
  old_unit_id text not null unique references public.units(id_unit),
  replacement_unit_id text not null unique references public.units(id_unit),
  old_warranty_id uuid not null unique references public.warranty(id_garansi),
  new_warranty_id uuid not null unique references public.warranty(id_garansi),
  replacement_date date not null,
  grace_days integer not null check (grace_days > 0),
  previous_transaction_value numeric not null check (previous_transaction_value > 0),
  replacement_transaction_value numeric not null check (replacement_transaction_value > 0),
  price_difference numeric generated always as (
    replacement_transaction_value - previous_transaction_value
  ) stored,
  replacement_unit_modal numeric not null check (replacement_unit_modal > 0),
  adjusted_margin numeric generated always as (
    replacement_transaction_value - replacement_unit_modal
  ) stored,
  id_account uuid references public.finance_accounts(id_account),
  id_finance_transaction uuid unique references public.finance_transactions(id_transaksi),
  reason text not null check (btrim(reason) <> ''),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id_invoice, sequence_no),
  check (old_unit_id <> replacement_unit_id),
  check (
    (price_difference = 0 and id_account is null and id_finance_transaction is null)
    or (price_difference <> 0 and id_account is not null and id_finance_transaction is not null)
  )
);

create index warranty_replacements_invoice_latest_idx
on public.warranty_replacements (id_invoice, sequence_no desc);

alter table public.warranty_replacements enable row level security;
revoke all on table public.warranty_replacements from public, anon, authenticated;
grant select on table public.warranty_replacements to authenticated;

create policy "authenticated users read warranty replacements"
on public.warranty_replacements for select to authenticated
using (public.current_user_role() in ('owner', 'admin', 'teknisi'));

create function public.protect_warranty_replacements()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Warranty replacement bersifat append-only';
end;
$$;

create trigger protect_warranty_replacements
before update or delete on public.warranty_replacements
for each row execute function public.protect_warranty_replacements();

create or replace function public.enforce_unit_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    new.updated_at := now();
    return new;
  end if;

  if (old.status = 'Masuk' and new.status = 'QC')
    or (old.status = 'QC' and new.status = 'Ready')
    or (old.status = 'Ready' and new.status = 'Listed')
    or (old.status = 'Terjual' and new.status = 'Ready'
      and current_setting('app.returns_flow', true) = 'on')
    or (old.status in ('Ready', 'Listed') and new.status = 'Terjual'
      and current_setting('app.sales_flow', true) = 'on')
    or (old.status in ('Ready', 'Listed') and new.status = 'Delisted'
      and current_setting('app.delist_flow', true) = 'on')
    or (old.status = 'Delisted' and new.status = 'Ready'
      and current_setting('app.reactivate_flow', true) = 'on')
    or (old.status = 'Terjual' and new.status = 'QC'
      and current_setting('app.warranty_replacement_flow', true) = 'on')
    or (old.status in ('Ready', 'Listed') and new.status = 'Terjual'
      and current_setting('app.warranty_replacement_flow', true) = 'on')
  then
    new.updated_at := now();
    return new;
  end if;

  raise exception 'Transisi status unit dari % ke % tidak diizinkan', old.status, new.status;
end;
$$;

create or replace function public.enforce_service_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    if new.tanggal_selesai is distinct from old.tanggal_selesai
      or new.tanggal_diambil is distinct from old.tanggal_diambil then
      raise exception 'Tanggal status servis tidak boleh diubah manual';
    end if;
    return new;
  end if;

  if old.status in ('Diagnosa', 'Dikerjakan', 'Selesai')
    and new.status = 'Diambil'
    and current_setting('app.warranty_replacement_flow', true) = 'on' then
    new.tanggal_selesai := coalesce(old.tanggal_selesai, new.tanggal_selesai);
    new.tanggal_diambil := coalesce(new.tanggal_diambil, new.tanggal_selesai);
    return new;
  end if;

  new.tanggal_selesai := old.tanggal_selesai;
  new.tanggal_diambil := old.tanggal_diambil;

  if old.status = 'Diterima' and new.status = 'Diagnosa' then
    if nullif(btrim(new.diagnosa), '') is null then
      raise exception 'Diagnosa wajib diisi';
    end if;
  elsif old.status = 'Diagnosa' and new.status = 'Dikerjakan' then
    if nullif(btrim(new.tindakan), '') is null then
      raise exception 'Tindakan wajib diisi';
    end if;
  elsif old.status = 'Dikerjakan' and new.status = 'Selesai' then
    new.tanggal_selesai := (now() at time zone 'Asia/Jakarta')::date;
  elsif old.status = 'Selesai' and new.status = 'Diambil' then
    if public.current_user_role() is not null
      and public.current_user_role() is distinct from 'admin' then
      raise exception 'Hanya admin yang dapat menyerahkan unit servis';
    end if;
    new.tanggal_diambil := (now() at time zone 'Asia/Jakarta')::date;
  else
    raise exception 'Transisi status servis dari % ke % tidak diizinkan', old.status, new.status;
  end if;

  return new;
end;
$$;

create view public.sales_current_state with (security_invoker = true) as
select
  s.id_invoice,
  s.id_unit as original_unit_id,
  s.id_customer,
  s.harga_jual as original_transaction_value,
  s.margin as original_margin,
  s.channel,
  s.metode_bayar,
  s.durasi_garansi_hari,
  s.tanggal_transaksi,
  coalesce(latest.replacement_unit_id, s.id_unit) as current_unit_id,
  current_unit.brand as current_brand,
  current_unit.model as current_model,
  coalesce(latest.replacement_transaction_value, s.harga_jual) as current_transaction_value,
  coalesce(latest.replacement_unit_modal, s.harga_jual - s.margin) as current_unit_modal,
  coalesce(latest.adjusted_margin, s.margin) as current_margin,
  coalesce(latest.sequence_no, 0) as replacement_count,
  current_warranty.id_garansi as current_warranty_id,
  current_warranty.tanggal_mulai as current_warranty_start,
  current_warranty.tanggal_berakhir as current_warranty_end,
  current_warranty.status as current_warranty_status
from public.sales s
left join lateral (
  select wr.*
  from public.warranty_replacements wr
  where wr.id_invoice = s.id_invoice
  order by wr.sequence_no desc
  limit 1
) latest on true
left join lateral (
  select w.id_garansi
  from public.warranty w
  where w.id_unit = s.id_unit
  order by w.tanggal_mulai desc, w.id_garansi
  limit 1
) original_warranty on true
join public.units current_unit
  on current_unit.id_unit = coalesce(latest.replacement_unit_id, s.id_unit)
left join public.warranty current_warranty
  on current_warranty.id_garansi = coalesce(latest.new_warranty_id, original_warranty.id_garansi)
where not exists (
  select 1
  from public.returns r
  where r.source_type = 'Sales'
    and r.source_id = s.id_invoice
    and r.status = 'Selesai'
)
and not exists (
  select 1
  from public.admin_actions_log action
  where action.target = s.id_invoice
    and action.detail ->> 'aksi' = 'cancel_sale'
);

revoke all on table public.sales_current_state from public, anon, authenticated;
grant select on table public.sales_current_state to authenticated;

create or replace function public.get_margin_report(
  p_start_date date,
  p_end_date date
)
returns table (
  brand text,
  unit_terjual integer,
  total_revenue numeric,
  total_margin numeric,
  margin_rata_rata numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() not in ('admin', 'owner') then
    raise exception 'Hanya admin dan owner yang dapat melihat laporan';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Periode laporan tidak valid';
  end if;

  return query
  select
    state.current_brand,
    count(*)::integer,
    coalesce(sum(state.current_transaction_value), 0),
    coalesce(sum(state.current_margin), 0),
    case when count(*) > 0
      then coalesce(sum(state.current_margin), 0) / count(*)
      else 0
    end
  from public.sales_current_state state
  where state.tanggal_transaksi between p_start_date and p_end_date
  group by state.current_brand
  order by coalesce(sum(state.current_margin), 0) desc;
end;
$$;

create or replace function public.get_stock_turnover(
  p_start_date date,
  p_end_date date
)
returns table (
  brand text,
  unit_terjual integer,
  rata_rata_hari numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() not in ('admin', 'owner') then
    raise exception 'Hanya admin dan owner yang dapat melihat laporan';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Periode laporan tidak valid';
  end if;

  return query
  select
    state.current_brand,
    count(*)::integer,
    case when count(*) > 0
      then round(avg((state.tanggal_transaksi - current_unit.tanggal_masuk)::numeric), 1)
      else null
    end
  from public.sales_current_state state
  join public.units current_unit on current_unit.id_unit = state.current_unit_id
  where state.tanggal_transaksi between p_start_date and p_end_date
  group by state.current_brand
  order by 3 asc;
end;
$$;

create or replace function public.get_lead_conversion(
  p_start_date date,
  p_end_date date
)
returns table (
  sumber_lead text,
  jumlah_customer integer,
  konversi_sales integer,
  konversi_servis integer,
  total_revenue numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() not in ('admin', 'owner') then
    raise exception 'Hanya admin dan owner yang dapat melihat laporan';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Periode laporan tidak valid';
  end if;

  return query
  with sales_by_customer as (
    select
      state.id_customer,
      count(*)::integer as sale_count,
      coalesce(sum(state.current_transaction_value), 0) as sale_revenue
    from public.sales_current_state state
    where state.tanggal_transaksi between p_start_date and p_end_date
    group by state.id_customer
  ), services_by_customer as (
    select
      service.id_customer,
      count(*)::integer as service_count,
      coalesce(sum(service.total_biaya), 0) as service_revenue
    from public.service_orders service
    where service.tanggal_masuk between p_start_date and p_end_date
    group by service.id_customer
  )
  select
    customer.sumber_lead,
    count(*)::integer,
    coalesce(sum(sales_by_customer.sale_count), 0)::integer,
    coalesce(sum(services_by_customer.service_count), 0)::integer,
    coalesce(sum(sales_by_customer.sale_revenue), 0)
      + coalesce(sum(services_by_customer.service_revenue), 0)
  from public.customers customer
  left join sales_by_customer on sales_by_customer.id_customer = customer.id_customer
  left join services_by_customer on services_by_customer.id_customer = customer.id_customer
  group by customer.sumber_lead
  order by 5 desc;
end;
$$;

create or replace function public.cancel_sale(
  p_id_invoice text,
  p_alasan text default null
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_record public.sales;
  finance_record public.finance_transactions;
begin
  perform public.require_owner();
  perform pg_advisory_xact_lock(hashtext('warranty-replacement:' || coalesce(p_id_invoice, '')));

  select * into sale_record
  from public.sales
  where id_invoice = p_id_invoice
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice tidak ditemukan';
  end if;
  if sale_record.status = 'Dibatalkan' then
    raise exception 'Invoice sudah dibatalkan sebelumnya.';
  end if;
  if exists (
    select 1
    from public.warranty_replacements replacement
    where replacement.id_invoice = p_id_invoice
  ) then
    raise exception 'Invoice yang pernah mengalami penggantian unit tidak dapat dibatalkan melalui Cancel Sales';
  end if;

  perform set_config('app.returns_flow', 'on', true);
  update public.units set status = 'Ready' where id_unit = sale_record.id_unit;
  if not found then
    raise exception 'Unit terkait tidak ditemukan.';
  end if;
  perform set_config('app.returns_flow', 'off', true);

  update public.warranty
  set status = 'Habis'
  where id_unit = sale_record.id_unit and status = 'Aktif';

  for finance_record in
    select *
    from public.finance_transactions
    where source_module = 'Sales'
      and source_id = p_id_invoice
      and is_reversal = false
      and arah = 'Masuk'
  loop
    insert into public.finance_transactions (
      tanggal, arah, kategori, id_account, jumlah,
      source_module, source_type, source_id, source_event_key,
      is_reversal, reversal_of, catatan, created_by
    ) values (
      current_date, 'Keluar', 'Retur Unit', finance_record.id_account, finance_record.jumlah,
      'Manual', 'SalesCancel', p_id_invoice,
      'cancel-sale:' || p_id_invoice || ':' || finance_record.id_transaksi,
      true, finance_record.id_transaksi,
      coalesce(p_alasan, 'Pembatalan invoice'),
      auth.uid()
    );
  end loop;

  update public.receivables
  set status = 'Dibatalkan'
  where source_type = 'Sales' and source_id = p_id_invoice;

  update public.sales
  set status = 'Dibatalkan'
  where id_invoice = p_id_invoice
  returning * into sale_record;

  perform public.log_admin_action(
    'finance_reversal',
    p_id_invoice,
    jsonb_build_object('aksi', 'cancel_sale', 'alasan', p_alasan)
  );

  return sale_record;
end;
$$;

create function public.replace_warranty_unit(
  p_idempotency_key uuid,
  p_id_invoice text,
  p_id_klaim uuid,
  p_replacement_unit_id text,
  p_replacement_transaction_value numeric,
  p_replacement_date date,
  p_reason text,
  p_id_account uuid default null
)
returns public.warranty_replacements
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event public.warranty_replacements;
  latest_event public.warranty_replacements;
  sale_record public.sales;
  old_unit public.units;
  replacement_unit public.units;
  old_warranty public.warranty;
  claim_record public.warranty_claim;
  service_record public.service_orders;
  finance_record public.finance_transactions;
  replacement_event public.warranty_replacements;
  replacement_id uuid := gen_random_uuid();
  new_warranty_id uuid := gen_random_uuid();
  current_unit_id text;
  current_warranty_id uuid;
  previous_transaction_value numeric;
  price_difference numeric;
  next_sequence integer;
  grace_value text;
  grace_days integer;
  new_warranty_end date;
  service_action text;
begin
  perform public.require_owner();

  if p_idempotency_key is null then
    raise exception 'Idempotency key wajib diisi';
  end if;
  if nullif(btrim(p_id_invoice), '') is null then
    raise exception 'Invoice wajib diisi';
  end if;
  if p_id_klaim is null then
    raise exception 'Klaim garansi wajib diisi';
  end if;
  if nullif(btrim(p_replacement_unit_id), '') is null then
    raise exception 'Unit pengganti wajib diisi';
  end if;
  if p_replacement_transaction_value is null or p_replacement_transaction_value <= 0 then
    raise exception 'Nilai transaksi unit pengganti wajib lebih dari 0';
  end if;
  if p_replacement_date is null then
    raise exception 'Tanggal penggantian wajib diisi';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Alasan penggantian wajib diisi';
  end if;

  perform pg_advisory_xact_lock(hashtext('warranty-replacement:' || p_id_invoice));
  perform pg_advisory_xact_lock(hashtext('warranty-idempotency:' || p_idempotency_key::text));

  select * into existing_event
  from public.warranty_replacements
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if existing_event.id_invoice is distinct from p_id_invoice
      or existing_event.id_klaim is distinct from p_id_klaim
      or existing_event.replacement_unit_id is distinct from p_replacement_unit_id
      or existing_event.replacement_transaction_value is distinct from p_replacement_transaction_value
      or existing_event.replacement_date is distinct from p_replacement_date
      or existing_event.reason is distinct from btrim(p_reason)
      or existing_event.id_account is distinct from p_id_account then
      raise exception 'Idempotency key sudah digunakan dengan payload berbeda';
    end if;
    return existing_event;
  end if;

  select * into sale_record
  from public.sales
  where id_invoice = p_id_invoice
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice tidak ditemukan';
  end if;

  if exists (
    select 1 from public.returns
    where source_type = 'Sales' and source_id = p_id_invoice and status = 'Selesai'
  ) or exists (
    select 1 from public.admin_actions_log
    where target = p_id_invoice and detail ->> 'aksi' = 'cancel_sale'
  ) then
    raise exception 'Invoice sudah diretur atau dibatalkan';
  end if;

  if exists (
    select 1 from public.warranty_replacements where id_klaim = p_id_klaim
  ) then
    raise exception 'Klaim garansi sudah digunakan';
  end if;

  select * into latest_event
  from public.warranty_replacements
  where id_invoice = p_id_invoice
  order by sequence_no desc
  limit 1
  for update;

  if found then
    current_unit_id := latest_event.replacement_unit_id;
    current_warranty_id := latest_event.new_warranty_id;
    previous_transaction_value := latest_event.replacement_transaction_value;
    next_sequence := latest_event.sequence_no + 1;
  else
    current_unit_id := sale_record.id_unit;
    previous_transaction_value := sale_record.harga_jual;
    next_sequence := 1;
  end if;

  if current_unit_id = p_replacement_unit_id then
    raise exception 'Unit pengganti harus berbeda dari unit aktif';
  end if;

  perform 1
  from public.units
  where id_unit in (current_unit_id, p_replacement_unit_id)
  order by id_unit
  for update;

  select * into old_unit from public.units where id_unit = current_unit_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Unit aktif tidak ditemukan';
  end if;
  if old_unit.status <> 'Terjual' then
    raise exception 'Unit aktif harus berstatus Terjual';
  end if;

  select * into replacement_unit
  from public.units
  where id_unit = p_replacement_unit_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Unit pengganti tidak ditemukan';
  end if;
  if replacement_unit.status not in ('Ready', 'Listed') then
    raise exception 'Unit pengganti harus berstatus Ready atau Listed';
  end if;

  if current_warranty_id is null then
    select id_garansi into current_warranty_id
    from public.warranty
    where id_unit = current_unit_id
    order by tanggal_mulai desc, id_garansi
    limit 1;
  end if;

  select * into old_warranty
  from public.warranty
  where id_garansi = current_warranty_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Garansi unit aktif tidak ditemukan';
  end if;
  if old_warranty.status <> 'Aktif'
    or p_replacement_date not between old_warranty.tanggal_mulai and old_warranty.tanggal_berakhir then
    raise exception 'Garansi tidak aktif pada tanggal penggantian';
  end if;

  select * into claim_record
  from public.warranty_claim
  where id_klaim = p_id_klaim
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Klaim garansi tidak ditemukan';
  end if;
  if claim_record.id_garansi is distinct from old_warranty.id_garansi
    or claim_record.tanggal not between old_warranty.tanggal_mulai and p_replacement_date then
    raise exception 'Klaim garansi tidak sesuai dengan garansi unit aktif';
  end if;
  select * into service_record
  from public.service_orders
  where id_klaim = p_id_klaim
  for update;
  if found then
    if service_record.id_unit is distinct from current_unit_id then
      raise exception 'Order servis klaim tidak sesuai dengan unit aktif';
    end if;
    if service_record.status in ('Diambil', 'Dibatalkan') then
      raise exception 'Order servis klaim sudah ditutup';
    end if;
    if service_record.status not in ('Diagnosa', 'Dikerjakan', 'Selesai')
      or nullif(btrim(service_record.diagnosa), '') is null then
      raise exception 'Order servis klaim wajib memiliki diagnosis sebelum penggantian';
    end if;
  end if;

  price_difference := p_replacement_transaction_value - previous_transaction_value;
  if price_difference = 0 then
    if p_id_account is not null then
      raise exception 'Penggantian tanpa selisih tidak boleh memakai akun Finance';
    end if;
  else
    if p_id_account is null then
      raise exception 'Akun Finance wajib untuk penggantian dengan selisih';
    end if;
    perform 1
    from public.finance_accounts
    where id_account = p_id_account and is_active = true
    for update;
    if not found then
      raise exception 'Akun Finance tidak aktif atau tidak ditemukan';
    end if;
  end if;

  select value into grace_value
  from public.app_settings
  where key = 'replacement_grace_days'
  for update;
  if not found or grace_value !~ '^[0-9]+$' or grace_value::integer <= 0 then
    raise exception 'Setting replacement_grace_days tidak valid';
  end if;
  grace_days := grace_value::integer;
  new_warranty_end := greatest(
    old_warranty.tanggal_berakhir,
    p_replacement_date + grace_days
  );

  perform set_config('app.warranty_replacement_flow', 'on', true);
  update public.units set status = 'QC' where id_unit = current_unit_id;
  update public.units set status = 'Terjual' where id_unit = p_replacement_unit_id;
  perform set_config('app.warranty_replacement_flow', 'off', true);

  update public.warranty
  set status = 'Habis'
  where id_garansi = old_warranty.id_garansi;

  insert into public.warranty (
    id_garansi, id_unit, tanggal_mulai, tanggal_berakhir, status
  ) values (
    new_warranty_id, p_replacement_unit_id, p_replacement_date, new_warranty_end, 'Aktif'
  );

  service_action := format(
    'Penggantian unit %s -> %s: %s',
    current_unit_id,
    p_replacement_unit_id,
    btrim(p_reason)
  );
  if service_record.id_servis is not null then
    perform set_config('app.warranty_replacement_flow', 'on', true);
    update public.service_orders
    set status = 'Diambil',
        tindakan = concat_ws(E'\n', nullif(btrim(tindakan), ''), service_action),
        tanggal_selesai = coalesce(tanggal_selesai, p_replacement_date),
        tanggal_diambil = p_replacement_date
    where id_servis = service_record.id_servis
    returning * into service_record;
    perform set_config('app.warranty_replacement_flow', 'off', true);

    update public.warranty_claim
    set tindakan = service_record.tindakan
    where id_klaim = p_id_klaim;
  else
    update public.warranty_claim
    set tindakan = concat_ws(E'\n', nullif(btrim(tindakan), ''), service_action)
    where id_klaim = p_id_klaim;
  end if;

  if price_difference <> 0 then
    select * into finance_record
    from public.record_finance_txn(
      case when price_difference > 0 then 'Masuk' else 'Keluar' end,
      'Selisih Penggantian Unit',
      p_id_account,
      abs(price_difference),
      'Warranty',
      'WarrantyReplacement',
      replacement_id::text,
      'warranty-replacement:' || p_idempotency_key::text,
      service_action,
      p_replacement_date
    );
  end if;

  insert into public.warranty_replacements (
    id_replacement,
    idempotency_key,
    id_invoice,
    sequence_no,
    id_klaim,
    old_unit_id,
    replacement_unit_id,
    old_warranty_id,
    new_warranty_id,
    replacement_date,
    grace_days,
    previous_transaction_value,
    replacement_transaction_value,
    replacement_unit_modal,
    id_account,
    id_finance_transaction,
    reason,
    created_by
  ) values (
    replacement_id,
    p_idempotency_key,
    p_id_invoice,
    next_sequence,
    p_id_klaim,
    current_unit_id,
    p_replacement_unit_id,
    old_warranty.id_garansi,
    new_warranty_id,
    p_replacement_date,
    grace_days,
    previous_transaction_value,
    p_replacement_transaction_value,
    replacement_unit.total_modal,
    p_id_account,
    finance_record.id_transaksi,
    btrim(p_reason),
    auth.uid()
  )
  returning * into replacement_event;

  perform public.log_admin_action(
    'warranty_unit_replacement',
    replacement_event.id_replacement::text,
    jsonb_build_object(
      'id_invoice', p_id_invoice,
      'sequence_no', next_sequence,
      'old_unit_id', current_unit_id,
      'replacement_unit_id', p_replacement_unit_id,
      'price_difference', price_difference,
      'reason', btrim(p_reason)
    )
  );

  return replacement_event;
end;
$$;

revoke all on function public.protect_warranty_replacements() from public;
revoke all on function public.replace_warranty_unit(uuid,text,uuid,text,numeric,date,text,uuid) from public;
revoke all on function public.get_margin_report(date,date) from public;
revoke all on function public.get_stock_turnover(date,date) from public;
revoke all on function public.get_lead_conversion(date,date) from public;
revoke all on function public.cancel_sale(text,text) from public;
grant execute on function public.replace_warranty_unit(uuid,text,uuid,text,numeric,date,text,uuid) to authenticated;
grant execute on function public.get_margin_report(date,date) to authenticated;
grant execute on function public.get_stock_turnover(date,date) to authenticated;
grant execute on function public.get_lead_conversion(date,date) to authenticated;
grant execute on function public.cancel_sale(text,text) to authenticated;
