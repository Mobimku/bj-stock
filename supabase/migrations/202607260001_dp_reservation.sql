-- allow: SIZE_OK - one atomic reservation schema and its four transactional RPCs.

alter table public.units drop constraint if exists units_status_check;
alter table public.units add constraint units_status_check check (status in (
  'Masuk','QC','Ready','Listed','Dipesan','Terjual','Selesai','Delisted'
));

alter table public.finance_transactions drop constraint if exists finance_transactions_kategori_check;
alter table public.finance_transactions add constraint finance_transactions_kategori_check check (kategori in (
  'Pembelian Unit','Pembelian Part','Biaya Upgrade Eksternal','Penjualan Unit',
  'Pendapatan Servis','Operasional','Modal Disetor','Retur Unit','Retur Servis',
  'Selisih Penggantian Unit','Uang Muka Reservasi','Lainnya'
));

alter table public.finance_transactions drop constraint if exists finance_transactions_source_module_check;
alter table public.finance_transactions add constraint finance_transactions_source_module_check check (
  source_module in ('Stock','BankStock','Sales','Servis','Manual','Retur','Warranty','Reservasi')
);

alter table public.admin_actions_log drop constraint if exists admin_actions_log_aksi_check;
alter table public.admin_actions_log add constraint admin_actions_log_aksi_check check (aksi in (
  'create_account','deactivate_account','reactivate_account','update_app_setting',
  'finance_reversal','process_return','warranty_unit_replacement','create_reservation',
  'complete_reservation','refund_reservation','forfeit_reservation'
));

create table public.reservations (
  id_reservation uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  id_unit text not null references public.units(id_unit),
  id_customer uuid not null references public.customers(id_customer),
  dp_amount numeric not null check (dp_amount > 0),
  agreed_price numeric not null check (agreed_price > dp_amount),
  is_refundable boolean not null,
  previous_status text not null check (previous_status in ('Ready','Listed')),
  status text not null default 'Dipesan' check (status in ('Dipesan','Selesai','Dibatalkan','Hangus')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  forfeited_at timestamptz,
  id_dp_transaction uuid unique references public.finance_transactions(id_transaksi),
  id_invoice text unique references public.sales(id_invoice),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index reservations_active_unit_idx on public.reservations(id_unit)
where status = 'Dipesan';

create function public.protect_reservation_terms() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.idempotency_key is distinct from old.idempotency_key
    or new.id_unit is distinct from old.id_unit
    or new.id_customer is distinct from old.id_customer
    or new.dp_amount is distinct from old.dp_amount
    or new.agreed_price is distinct from old.agreed_price
    or new.is_refundable is distinct from old.is_refundable
    or new.previous_status is distinct from old.previous_status
    or new.expires_at is distinct from old.expires_at then
    raise exception 'Ketentuan reservasi bersifat final dan tidak dapat diubah';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_reservation_terms before update on public.reservations
for each row execute function public.protect_reservation_terms();

create or replace function public.enforce_unit_status_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = old.status then
    new.updated_at := now();
    return new;
  end if;
  if (old.status = 'Masuk' and new.status = 'QC')
    or (old.status = 'QC' and new.status = 'Ready')
    or (old.status = 'Ready' and new.status = 'Listed')
    or (old.status = 'Terjual' and new.status = 'Ready' and current_setting('app.returns_flow', true) = 'on')
    or (old.status in ('Ready','Listed') and new.status = 'Terjual' and current_setting('app.sales_flow', true) = 'on')
    or (old.status in ('Ready','Listed') and new.status = 'Delisted' and current_setting('app.delist_flow', true) = 'on')
    or (old.status = 'Delisted' and new.status = 'Ready' and current_setting('app.reactivate_flow', true) = 'on')
    or (old.status = 'Terjual' and new.status = 'QC' and current_setting('app.warranty_replacement_flow', true) = 'on')
    or (old.status in ('Ready','Listed') and new.status = 'Terjual' and current_setting('app.warranty_replacement_flow', true) = 'on')
    or (old.status in ('Ready','Listed') and new.status = 'Dipesan' and current_setting('app.reservation_flow', true) = 'on')
    or (old.status = 'Dipesan' and new.status in ('Ready','Listed','Terjual') and current_setting('app.reservation_flow', true) = 'on') then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'Transisi status unit dari % ke % tidak diizinkan', old.status, new.status;
end;
$$;

create or replace function public.prepare_sale() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status text; v_modal numeric;
begin
  select status, total_modal into v_status, v_modal
  from public.units where id_unit = new.id_unit for update;
  if not found then raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan'; end if;
  if v_status not in ('Ready','Listed')
    and not (v_status = 'Dipesan' and current_setting('app.reservation_flow', true) = 'on') then
    raise exception 'Unit harus berstatus Ready atau Listed untuk dijual';
  end if;
  new.margin := new.harga_jual - v_modal;
  return new;
end;
$$;

create function public.require_admin_or_owner() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.current_user_role(), '') not in ('admin','owner') then
    raise exception 'Aksi ini hanya dapat dilakukan oleh admin atau owner';
  end if;
end;
$$;

create function public.create_reservation(
  p_idempotency_key uuid, p_id_unit text, p_id_customer uuid, p_dp_amount numeric,
  p_agreed_price numeric, p_is_refundable boolean, p_expires_at timestamptz
) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare v_existing public.reservations; v_unit public.units; v_account uuid;
  v_reservation public.reservations; v_dp_transaction uuid;
begin
  perform public.require_admin_or_owner();
  perform pg_advisory_xact_lock(hashtext('reservation:' || p_idempotency_key::text));
  select * into v_existing from public.reservations where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.id_unit is distinct from p_id_unit
      or v_existing.id_customer is distinct from p_id_customer
      or v_existing.dp_amount is distinct from p_dp_amount
      or v_existing.agreed_price is distinct from p_agreed_price
      or v_existing.is_refundable is distinct from p_is_refundable
      or v_existing.expires_at is distinct from p_expires_at then
      raise exception 'Idempotency key sudah digunakan dengan data berbeda';
    end if;
    return v_existing;
  end if;
  if p_dp_amount <= 0 or p_dp_amount >= p_agreed_price then
    raise exception 'DP harus lebih dari 0 dan lebih kecil dari harga kesepakatan';
  end if;
  if p_expires_at <= clock_timestamp() then raise exception 'Batas waktu reservasi harus di masa depan'; end if;
  perform 1 from public.customers where id_customer = p_id_customer;
  if not found then raise exception using errcode = 'P0002', message = 'Customer tidak ditemukan'; end if;
  select * into v_unit from public.units where id_unit = p_id_unit for update;
  if not found then raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan'; end if;
  if v_unit.status not in ('Ready','Listed') then raise exception 'Unit sudah dipesan atau tidak tersedia'; end if;
  select id_account into v_account from public.finance_accounts
  where nama = 'Kas Toko' and is_active order by created_at limit 1;
  if v_account is null then raise exception 'Akun Kas Toko aktif tidak ditemukan'; end if;
  insert into public.reservations (
    idempotency_key,id_unit,id_customer,dp_amount,agreed_price,is_refundable,
    previous_status,expires_at,created_by
  ) values (
    p_idempotency_key,p_id_unit,p_id_customer,p_dp_amount,p_agreed_price,p_is_refundable,
    v_unit.status,p_expires_at,auth.uid()
  ) returning * into v_reservation;
  perform set_config('app.reservation_flow','on',true);
  update public.units set status = 'Dipesan' where id_unit = p_id_unit;
  insert into public.finance_transactions (
    arah,kategori,id_account,jumlah,source_module,source_type,source_id,
    source_event_key,created_by
  ) values (
    'Masuk','Uang Muka Reservasi',v_account,p_dp_amount,'Reservasi','ReservationDP',
    v_reservation.id_reservation::text,'reservation:dp:' || v_reservation.id_reservation,auth.uid()
  ) returning id_transaksi into v_dp_transaction;
  update public.reservations set id_dp_transaction = v_dp_transaction
  where id_reservation = v_reservation.id_reservation returning * into v_reservation;
  insert into public.admin_actions_log (aktor,aktor_role,aksi,target_type,target_id,detail)
  values (auth.uid(),public.current_user_role(),'create_reservation','reservation',
    v_reservation.id_reservation::text,jsonb_build_object('id_unit',p_id_unit,'dp_amount',p_dp_amount));
  return v_reservation;
end;
$$;

create function public.complete_reservation(
  p_id_reservation uuid, p_test jsonb, p_metode_bayar text, p_channel text,
  p_tanggal_transaksi date, p_durasi_garansi_hari integer
) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare v_reservation public.reservations; v_customer public.customers; v_dp public.finance_transactions;
  v_sale public.sales; v_result public.reservations;
begin
  perform public.require_admin_or_owner();
  select * into v_reservation from public.reservations
  where id_reservation = p_id_reservation for update;
  if not found then raise exception using errcode = 'P0002', message = 'Reservasi tidak ditemukan'; end if;
  if v_reservation.status <> 'Dipesan' then raise exception 'Reservasi sudah diselesaikan'; end if;
  if v_reservation.expires_at < clock_timestamp() then raise exception 'Batas waktu reservasi sudah terlewati'; end if;
  if p_metode_bayar not in ('Tunai','Transfer') then raise exception 'Pelunasan hanya menerima Tunai atau Transfer'; end if;
  select * into v_customer from public.customers where id_customer = v_reservation.id_customer;
  select * into v_dp from public.finance_transactions where id_transaksi = v_reservation.id_dp_transaction;
  insert into public.finance_transactions (
    arah,kategori,id_account,jumlah,source_module,source_type,source_id,source_event_key,
    is_reversal,reversal_of,created_by
  ) values (
    'Keluar','Uang Muka Reservasi',v_dp.id_account,v_reservation.dp_amount,'Reservasi',
    'ReservationCompletion',v_reservation.id_reservation::text,
    'reservation:complete:' || v_reservation.id_reservation,true,v_dp.id_transaksi,auth.uid()
  );
  perform set_config('app.reservation_flow','on',true);
  select * into v_sale from public.create_sale(
    v_reservation.id_unit,v_reservation.id_customer,v_customer.nama,v_customer.kontak_wa,
    v_customer.segmen,v_customer.sumber_lead,v_reservation.agreed_price,p_channel,
    p_metode_bayar,p_tanggal_transaksi,p_durasi_garansi_hari,p_test
  );
  update public.reservations set status='Selesai',completed_at=clock_timestamp(),id_invoice=v_sale.id_invoice
  where id_reservation=p_id_reservation returning * into v_result;
  insert into public.admin_actions_log (aktor,aktor_role,aksi,target_type,target_id,detail)
  values (auth.uid(),public.current_user_role(),'complete_reservation','reservation',p_id_reservation::text,
    jsonb_build_object('id_invoice',v_sale.id_invoice));
  return v_result;
end;
$$;

create function public.refund_reservation(p_id_reservation uuid) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare v_reservation public.reservations; v_dp public.finance_transactions; v_result public.reservations;
begin
  perform public.require_owner();
  select * into v_reservation from public.reservations where id_reservation=p_id_reservation for update;
  if not found then raise exception using errcode='P0002',message='Reservasi tidak ditemukan'; end if;
  if v_reservation.status <> 'Dipesan' then raise exception 'Reservasi sudah diselesaikan'; end if;
  if not v_reservation.is_refundable then raise exception 'Reservasi non-refundable tidak dapat di-refund'; end if;
  select * into v_dp from public.finance_transactions where id_transaksi=v_reservation.id_dp_transaction;
  insert into public.finance_transactions (
    arah,kategori,id_account,jumlah,source_module,source_type,source_id,source_event_key,
    is_reversal,reversal_of,created_by
  ) values (
    'Keluar','Uang Muka Reservasi',v_dp.id_account,v_reservation.dp_amount,'Reservasi',
    'ReservationRefund',v_reservation.id_reservation::text,'reservation:refund:' || v_reservation.id_reservation,
    true,v_dp.id_transaksi,auth.uid()
  );
  perform set_config('app.reservation_flow','on',true);
  update public.units set status=v_reservation.previous_status where id_unit=v_reservation.id_unit;
  update public.reservations set status='Dibatalkan',cancelled_at=clock_timestamp()
  where id_reservation=p_id_reservation returning * into v_result;
  insert into public.admin_actions_log (aktor,aktor_role,aksi,target_type,target_id)
  values (auth.uid(),public.current_user_role(),'refund_reservation','reservation',p_id_reservation::text);
  return v_result;
end;
$$;

create function public.forfeit_reservation(p_id_reservation uuid) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare v_reservation public.reservations; v_result public.reservations;
begin
  perform public.require_admin_or_owner();
  select * into v_reservation from public.reservations where id_reservation=p_id_reservation for update;
  if not found then raise exception using errcode='P0002',message='Reservasi tidak ditemukan'; end if;
  if v_reservation.status <> 'Dipesan' then raise exception 'Reservasi sudah diselesaikan'; end if;
  if v_reservation.is_refundable then raise exception 'Reservasi refundable tidak dapat dibuat hangus'; end if;
  perform set_config('app.reservation_flow','on',true);
  update public.units set status=v_reservation.previous_status where id_unit=v_reservation.id_unit;
  update public.reservations set status='Hangus',forfeited_at=clock_timestamp()
  where id_reservation=p_id_reservation returning * into v_result;
  insert into public.admin_actions_log (aktor,aktor_role,aksi,target_type,target_id)
  values (auth.uid(),public.current_user_role(),'forfeit_reservation','reservation',p_id_reservation::text);
  return v_result;
end;
$$;

alter table public.reservations enable row level security;
revoke all on table public.reservations from public,anon,authenticated;
grant select on table public.reservations to authenticated;
create policy "authenticated users read reservations" on public.reservations for select to authenticated
using (public.current_user_role() in ('admin','owner'));

revoke all on function public.require_admin_or_owner() from public,anon,authenticated;
revoke all on function public.protect_reservation_terms() from public,anon,authenticated;
revoke all on function public.create_reservation(uuid,text,uuid,numeric,numeric,boolean,timestamptz) from public,anon,authenticated;
revoke all on function public.complete_reservation(uuid,jsonb,text,text,date,integer) from public,anon,authenticated;
revoke all on function public.refund_reservation(uuid) from public,anon,authenticated;
revoke all on function public.forfeit_reservation(uuid) from public,anon,authenticated;
grant execute on function public.create_reservation(uuid,text,uuid,numeric,numeric,boolean,timestamptz) to authenticated;
grant execute on function public.complete_reservation(uuid,jsonb,text,text,date,integer) to authenticated;
grant execute on function public.refund_reservation(uuid) to authenticated;
grant execute on function public.forfeit_reservation(uuid) to authenticated;

drop function if exists public.get_profit_loss(date,date);
create function public.get_profit_loss(p_start_date date,p_end_date date)
returns table (
  pendapatan_sales numeric,
  pendapatan_servis numeric,
  pendapatan_dp_hangus numeric,
  retur numeric,
  hpp_unit numeric,
  biaya_part_servis numeric,
  operasional numeric,
  laba_bersih numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_user_role() not in ('admin','owner') then
    raise exception 'Hanya admin dan owner yang dapat melihat laporan Finance';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Periode laporan tidak valid';
  end if;
  return query
  with totals as (
    select
      coalesce((select sum(state.current_transaction_value)
        from public.sales_current_state state
        where state.tanggal_transaksi between p_start_date and p_end_date),0)
      + coalesce((select sum(sale.harga_jual) from public.sales sale
        where sale.tanggal_transaksi between p_start_date and p_end_date
          and exists (select 1 from public.returns completed_return
            where completed_return.source_type='Sales'
              and completed_return.source_id=sale.id_invoice
              and completed_return.status='Selesai')),0) as sales_revenue,
      coalesce((select sum(service.total_biaya) from public.service_orders service
        where service.status='Diambil'
          and service.tanggal_diambil between p_start_date and p_end_date),0) as service_revenue,
      coalesce((select sum(reservation.dp_amount) from public.reservations reservation
        where reservation.status='Hangus'
          and reservation.forfeited_at::date between p_start_date and p_end_date),0) as forfeited_dp_revenue,
      coalesce((select sum(completed_return.jumlah_refund) from public.returns completed_return
        where completed_return.status='Selesai'
          and completed_return.tanggal between p_start_date and p_end_date),0) as return_total,
      coalesce((select sum(state.current_unit_modal) from public.sales_current_state state
        where state.tanggal_transaksi between p_start_date and p_end_date),0) as unit_cost,
      coalesce((select sum(service.biaya_part) from public.service_orders service
        where service.status='Diambil'
          and service.tanggal_diambil between p_start_date and p_end_date),0) as service_part_cost,
      coalesce((select sum(case when finance_transaction.arah='Keluar'
        then finance_transaction.jumlah else -finance_transaction.jumlah end)
        from public.finance_transactions finance_transaction
        where finance_transaction.kategori='Operasional'
          and finance_transaction.tanggal between p_start_date and p_end_date),0) as operating_cost
  )
  select sales_revenue,service_revenue,forfeited_dp_revenue,return_total,unit_cost,
    service_part_cost,operating_cost,
    sales_revenue+service_revenue+forfeited_dp_revenue-return_total-unit_cost-service_part_cost-operating_cost
  from totals;
end;
$$;
revoke all on function public.get_profit_loss(date,date) from public,anon,authenticated;
grant execute on function public.get_profit_loss(date,date) to authenticated;
