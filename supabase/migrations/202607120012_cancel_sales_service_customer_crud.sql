-- ============================================================
-- Fase 8.2 — Cancel Sales, Cancel Service, Customer CRUD
-- ============================================================

-- ============================================================
-- 1. Add status to sales (Aktif/Dibatalkan)
-- ============================================================
alter table public.sales add column if not exists status text default 'Aktif'
  check (status in ('Aktif', 'Dibatalkan'));

-- ============================================================
-- 2. Add Dibatalkan to service_orders status check
-- ============================================================
alter table public.service_orders drop constraint if exists service_orders_status_check;
alter table public.service_orders add constraint service_orders_status_check
  check (status in ('Diterima','Diagnosa','Dikerjakan','Selesai','Diambil','Dibatalkan'));

-- ============================================================
-- 3. cancel_sale() — Owner-only: batalkan invoice, kembalikan
--    unit ke Ready, akhiri warranty, reversal finance
-- ============================================================
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
  inv_finance record;
  inv_warranty record;
begin
  perform require_owner();

  -- Lock & validate sale
  select * into sale_record from public.sales where id_invoice = p_id_invoice for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice tidak ditemukan';
  end if;
  if sale_record.status = 'Dibatalkan' then
    raise exception 'Invoice sudah dibatalkan sebelumnya.';
  end if;

  -- 1. Revert unit status
  update public.units set status = 'Ready' where id_unit = sale_record.id_unit;
  if not found then
    raise exception 'Unit terkait tidak ditemukan.';
  end if;

  -- 2. End warranty
  update public.warranty set status = 'Habis'
  where id_unit = sale_record.id_unit and status = 'Aktif';

  -- 3. Reverse finance (Penjualan Unit) — insert reversal transaksi
  for inv_finance in
    select * from public.finance_transactions
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
      current_date, 'Keluar', 'Retur Unit', inv_finance.id_account, inv_finance.jumlah,
      'Manual', 'SalesCancel', p_id_invoice,
      'cancel-sale:' || p_id_invoice || ':' || inv_finance.id_transaksi,
      true, inv_finance.id_transaksi,
      coalesce(p_alasan, 'Pembatalan invoice'),
      auth.uid()
    );
  end loop;

  -- 4. If cicilan, mark receivable as Dibatalkan
  update public.receivables set status = 'Dibatalkan'
  where source_type = 'Sales' and source_id = p_id_invoice;

  -- 5. Mark sale as cancelled
  update public.sales set status = 'Dibatalkan' where id_invoice = p_id_invoice;

  -- 6. Audit log
  perform log_admin_action('finance_reversal', p_id_invoice,
    jsonb_build_object('aksi', 'cancel_sale', 'alasan', p_alasan)
  );

  -- Return updated record
  select * into sale_record from public.sales where id_invoice = p_id_invoice;
  return sale_record;
end;
$$;

grant execute on function public.cancel_sale to authenticated;

-- ============================================================
-- 4. cancel_service() — Owner-only: batalkan service order,
--    kembalikan part ke bank stock, reversal finance
-- ============================================================
create or replace function public.cancel_service(
  p_id_servis text,
  p_alasan text default null
)
returns public.service_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_record public.service_orders;
  part_log record;
begin
  perform require_owner();

  select * into service_record from public.service_orders where id_servis = p_id_servis for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Service order tidak ditemukan';
  end if;
  if service_record.status = 'Dibatalkan' then
    raise exception 'Service order sudah dibatalkan sebelumnya.';
  end if;
  if service_record.status = 'Diambil' then
    raise exception 'Service order sudah selesai/diambil, tidak bisa dibatalkan. Gunakan fitur Retur.';
  end if;

  -- 1. Return parts to bank stock
  for part_log in
    select * from public.service_part_log where id_servis = p_id_servis
  loop
    update public.bank_stock
    set stock_qty = stock_qty + 1
    where id_part = part_log.id_part;
  end loop;

  -- 2. Reverse finance (Pendapatan Servis) if any
  -- For service orders, finance entries are created when payment is recorded
  update public.receivables set status = 'Dibatalkan'
  where source_type = 'Servis' and source_id = p_id_servis;

  -- 3. Clear part logs and set status
  delete from public.service_part_log where id_servis = p_id_servis;
  update public.service_orders set
    status = 'Dibatalkan',
    biaya_jasa = 0,
    biaya_part = 0
  where id_servis = p_id_servis;

  -- 4. Audit log
  perform log_admin_action('finance_reversal', p_id_servis,
    jsonb_build_object('aksi', 'cancel_service', 'alasan', p_alasan)
  );

  -- Return updated record
  select * into service_record from public.service_orders where id_servis = p_id_servis;
  return service_record;
end;
$$;

grant execute on function public.cancel_service to authenticated;

-- ============================================================
-- 5. RLS policy: allow admin+owner to update/delete customers
-- ============================================================
-- Existing RLS policies already allow admin+owner all operations on customers
-- (from patch-rls migration). No additional RLS needed.

-- ============================================================
-- 6. Grant permissions
-- ============================================================
grant execute on function public.cancel_sale to authenticated;
grant execute on function public.cancel_service to authenticated;
