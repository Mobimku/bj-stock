-- ============================================================
-- Patch: Include role `owner` in all RLS policies and RPCs
--
-- Owner is a superset of Admin — all admin-accessible data
-- and operations must also be available to owner.
-- ============================================================

-- ============================================================
-- 1. Units
-- ============================================================
drop policy if exists "authenticated users read units" on public.units;
create policy "authenticated users read units"
on public.units for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

drop policy if exists "admins manage units" on public.units;
create policy "admins manage units"
on public.units for all to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

-- ============================================================
-- 2. Bank Stock
-- ============================================================
drop policy if exists "authenticated users read bank stock" on public.bank_stock;
create policy "authenticated users read bank stock"
on public.bank_stock for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

drop policy if exists "admins manage bank stock" on public.bank_stock;
create policy "admins manage bank stock"
on public.bank_stock for all to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

-- ============================================================
-- 3. Customers
-- ============================================================
drop policy if exists "authenticated users read customers" on public.customers;
create policy "authenticated users read customers"
on public.customers for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

drop policy if exists "admins manage customers" on public.customers;
create policy "admins manage customers"
on public.customers for all to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

-- ============================================================
-- 4. Upgrade Logs
-- ============================================================
drop policy if exists "authenticated users read upgrade logs" on public.upgrade_log;
create policy "authenticated users read upgrade logs"
on public.upgrade_log for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

drop policy if exists "authenticated users manage upgrade logs" on public.upgrade_log;
create policy "authenticated users manage upgrade logs"
on public.upgrade_log for all to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'))
with check (public.current_user_role() in ('admin', 'teknisi', 'owner'));

-- ============================================================
-- 5. Sales & Warranty
-- ============================================================
drop policy if exists "authenticated users read sales" on public.sales;
create policy "authenticated users read sales"
on public.sales for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

drop policy if exists "authenticated users read warranties" on public.warranty;
create policy "authenticated users read warranties"
on public.warranty for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

drop policy if exists "authenticated users read warranty claims" on public.warranty_claim;
create policy "authenticated users read warranty claims"
on public.warranty_claim for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

-- ============================================================
-- 6. Service Orders & Part Logs
-- ============================================================
drop policy if exists "authenticated users read service orders" on public.service_orders;
create policy "authenticated users read service orders"
on public.service_orders for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

drop policy if exists "authenticated users read service part logs" on public.service_part_log;
create policy "authenticated users read service part logs"
on public.service_part_log for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

-- ============================================================
-- 7. Finance Tables
-- ============================================================
drop policy if exists "admins manage finance_accounts" on public.finance_accounts;
create policy "admins manage finance_accounts"
on public.finance_accounts for all to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "admins manage finance_transactions" on public.finance_transactions;
create policy "admins manage finance_transactions"
on public.finance_transactions for all to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "admins manage returns" on public.returns;
create policy "admins manage returns"
on public.returns for all to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "admins manage receivables" on public.receivables;
create policy "admins manage receivables"
on public.receivables for all to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "admins manage finance_payments" on public.finance_payments;
create policy "admins manage finance_payments"
on public.finance_payments for all to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "admins manage bank_stock_restock" on public.bank_stock_restock;
create policy "admins manage bank_stock_restock"
on public.bank_stock_restock for all to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

-- ============================================================
-- 8. Unit Spec History
-- ============================================================
drop policy if exists "authenticated users read unit spec history" on public.unit_spec_history;
create policy "authenticated users read unit spec history"
on public.unit_spec_history for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

-- ============================================================
-- 9. Patch security definer RPCs that check role inline
-- ============================================================

-- create_sale — admin + owner (was: admin only)
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
  p_tanggal_transaksi date
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_id uuid := p_id_customer;
  month_code text := to_char(p_tanggal_transaksi, 'YYMM');
  next_number integer;
  new_sale public.sales;
begin
  if public.current_user_role() not in ('admin', 'owner') then
    raise exception 'Hanya admin dan owner yang dapat membuat transaksi penjualan';
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

    if nullif(btrim(p_customer_wa), '') is not null then
      insert into public.customers (nama, kontak_wa, segmen, sumber_lead)
      values (
        btrim(p_customer_name), btrim(p_customer_wa), p_customer_segment, p_customer_source
      )
      on conflict (kontak_wa) do update
      set nama = excluded.nama,
          segmen = coalesce(excluded.segmen, customers.segmen),
          sumber_lead = coalesce(excluded.sumber_lead, customers.sumber_lead)
      returning id_customer into customer_id;
    else
      insert into public.customers (nama, segmen, sumber_lead)
      values (btrim(p_customer_name), p_customer_segment, p_customer_source)
      returning id_customer into customer_id;
    end if;
  end if;

  select coalesce(max(right(id_invoice, 4))::int, 0) + 1 into next_number
  from public.sales
  where id_invoice like 'INV-' || month_code || '-%';

  insert into public.sales (id_invoice, id_unit, id_customer, harga_jual, margin, channel, metode_bayar, tanggal_transaksi)
  values (
    'INV-' || month_code || '-' || lpad(next_number::text, 4, '0'),
    p_id_unit,
    customer_id,
    p_harga_jual,
    p_harga_jual - (select coalesce(total_modal, 0) from public.units where id_unit = p_id_unit),
    p_channel,
    p_metode_bayar,
    p_tanggal_transaksi
  )
  returning * into new_sale;

  return new_sale;
end;
$$;

-- delist_unit — admin + owner (was: admin only)
create or replace function public.delist_unit(
  p_id_unit text,
  p_jenis text,
  p_alasan text
)
returns public.units
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_record public.units;
  fin_txn public.finance_transactions;
  active_service_count integer;
begin
  if public.current_user_role() not in ('admin', 'owner') then
    raise exception 'Hanya admin dan owner yang dapat delist unit';
  end if;
  if nullif(btrim(p_alasan), '') is null then
    raise exception 'Alasan delist wajib diisi';
  end if;
  if p_jenis not in ('rusak', 'retur_supplier', 'salah_input', 'hilang') then
    raise exception 'Jenis delist tidak valid';
  end if;

  select * into unit_record
  from public.units
  where id_unit = p_id_unit
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan';
  end if;
  if unit_record.status not in ('Ready', 'Listed') then
    raise exception 'Hanya unit berstatus Ready atau Listed yang dapat delist';
  end if;

  select count(*) into active_service_count
  from public.service_orders
  where id_unit = p_id_unit
    and status in ('Diterima', 'Diagnosa', 'Dikerjakan');
  if active_service_count > 0 then
    raise exception 'Unit tidak dapat delist karena masih ada % service order aktif', active_service_count;
  end if;

  if p_jenis = 'salah_input' then
    -- soft-delete: clear all references
    delete from public.upgrade_log where id_unit = p_id_unit;

    delete from public.finance_transactions
    where source_module = 'Stock' and source_id = p_id_unit;

    delete from public.units where id_unit = p_id_unit
    returning * into unit_record;
    return unit_record;
  end if;

  update public.units
  set status = 'Selesai'
  where id_unit = p_id_unit
  returning * into unit_record;

  insert into public.finance_transactions (
    arah, kategori, id_account, jumlah,
    source_module, source_type, source_id, catatan
  ) values (
    'Keluar',
    case p_jenis
      when 'rusak' then 'Operasional'
      when 'retur_supplier' then 'Pembelian Unit'
      when 'hilang' then 'Operasional'
    end,
    (select id_account from public.finance_accounts
     where tipe = 'Bank' and is_active = true
     order by created_at limit 1),
    unit_record.total_modal,
    'Stock', 'unit_delist', p_id_unit,
    'Delist ' || p_jenis || ': ' || nullif(btrim(p_alasan), '') || ' — unit ' || unit_record.id_unit
  )
  returning * into fin_txn;

  return unit_record;
end;
$$;

-- reactivate_unit — admin + owner (was: admin only)
create or replace function public.reactivate_unit(
  p_id_unit text,
  p_catatan text default null
)
returns public.units
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_record public.units;
begin
  if public.current_user_role() not in ('admin', 'owner') then
    raise exception 'Hanya admin dan owner yang dapat reaktivasi unit';
  end if;

  select * into unit_record
  from public.units
  where id_unit = p_id_unit
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan';
  end if;
  if unit_record.status != 'Selesai' then
    raise exception 'Hanya unit berstatus Selesai yang dapat diaktifkan kembali';
  end if;

  update public.units
  set status = 'Ready'
  where id_unit = p_id_unit
  returning * into unit_record;

  return unit_record;
end;
$$;
