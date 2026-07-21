alter table public.sales add column if not exists status text;
update public.sales set status = 'Aktif' where status is null;
alter table public.sales alter column status set default 'Aktif';
alter table public.sales alter column status set not null;
alter table public.sales drop constraint if exists sales_status_check;
alter table public.sales add constraint sales_status_check
  check (status in ('Aktif', 'Dibatalkan'));

create or replace function public.process_return(
  p_source_type text,
  p_source_id text,
  p_alasan text,
  p_jumlah_refund numeric,
  p_id_account uuid default null
)
returns public.returns
language plpgsql
security definer
set search_path = ''
as $$
declare
  retur_record public.returns;
  sale_unit_id text;
  sale_status text;
  invoice_total numeric;
  received_total numeric;
  account_count integer;
  refund_account_id uuid;
begin
  perform public.require_owner();

  if nullif(btrim(p_alasan), '') is null then
    raise exception 'Alasan retur wajib diisi';
  end if;
  if p_jumlah_refund <= 0 then
    raise exception 'Jumlah refund harus lebih dari 0';
  end if;

  if p_source_type = 'Sales' then
    perform pg_advisory_xact_lock(hashtext('warranty-replacement:' || coalesce(p_source_id, '')));

    select id_unit, harga_jual, status
    into sale_unit_id, invoice_total, sale_status
    from public.sales
    where id_invoice = p_source_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Invoice penjualan tidak ditemukan';
    end if;
    if sale_status = 'Dibatalkan' then
      raise exception 'Invoice sudah dibatalkan';
    end if;
    if exists (
      select 1
      from public.warranty_replacements replacement
      where replacement.id_invoice = p_source_id
    ) then
      raise exception 'Invoice yang pernah mengalami penggantian unit tidak dapat diretur';
    end if;

    select
      coalesce(sum(case when arah = 'Masuk' then jumlah else -jumlah end), 0),
      count(distinct id_account)
    into received_total, account_count
    from public.finance_transactions
    where kategori = 'Penjualan Unit'
      and source_id = p_source_id;
  elsif p_source_type = 'Servis' then
    select total_biaya into invoice_total
    from public.service_orders
    where id_servis = p_source_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Order servis tidak ditemukan';
    end if;

    select
      coalesce(sum(case when arah = 'Masuk' then jumlah else -jumlah end), 0),
      count(distinct id_account)
    into received_total, account_count
    from public.finance_transactions
    where kategori = 'Pendapatan Servis'
      and source_id = p_source_id;
  else
    raise exception 'Tipe sumber retur tidak valid';
  end if;

  if exists (
    select 1
    from public.returns
    where source_type = p_source_type
      and source_id = p_source_id
      and status = 'Selesai'
  ) then
    raise exception 'Sumber transaksi ini sudah diretur';
  end if;
  if p_jumlah_refund > least(invoice_total, received_total) then
    raise exception 'Refund tidak boleh melebihi pembayaran yang diterima';
  end if;

  refund_account_id := p_id_account;
  if refund_account_id is null then
    if account_count <> 1 then
      raise exception 'Pilih akun refund untuk transaksi dengan beberapa akun pembayaran';
    end if;
    select id_account into refund_account_id
    from public.finance_transactions
    where kategori = case
        when p_source_type = 'Sales' then 'Penjualan Unit'
        else 'Pendapatan Servis'
      end
      and source_id = p_source_id
      and arah = 'Masuk'
    order by created_at desc
    limit 1;
  end if;
  if not exists (
    select 1
    from public.finance_accounts
    where id_account = refund_account_id and is_active = true
  ) then
    raise exception 'Akun refund tidak valid';
  end if;

  insert into public.returns (source_type, source_id, alasan, jumlah_refund, status)
  values (p_source_type, p_source_id, btrim(p_alasan), p_jumlah_refund, 'Selesai')
  returning * into retur_record;

  perform public.record_finance_txn(
    'Keluar',
    case when p_source_type = 'Sales' then 'Retur Unit' else 'Retur Servis' end,
    refund_account_id,
    p_jumlah_refund,
    'Retur',
    p_source_type,
    retur_record.id_retur::text,
    'return:' || retur_record.id_retur::text
  );

  if p_source_type = 'Sales' and sale_unit_id is not null then
    perform set_config('app.returns_flow', 'on', true);
    update public.units set status = 'Ready' where id_unit = sale_unit_id;
    perform set_config('app.returns_flow', 'off', true);

    update public.warranty
    set status = 'Habis'
    where id_unit = sale_unit_id and status = 'Aktif';
  end if;

  perform public.log_admin_action(
    'process_return',
    retur_record.id_retur::text,
    jsonb_build_object(
      'source_type', p_source_type,
      'source_id', p_source_id,
      'alasan', p_alasan,
      'jumlah_refund', p_jumlah_refund
    )
  );

  return retur_record;
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
    from public.returns completed_return
    where completed_return.source_type = 'Sales'
      and completed_return.source_id = p_id_invoice
      and completed_return.status = 'Selesai'
  ) then
    raise exception 'Invoice sudah diretur dan tidak dapat dibatalkan';
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

revoke all on function public.process_return(text,text,text,numeric,uuid) from public, anon, authenticated;
revoke all on function public.cancel_sale(text,text) from public, anon, authenticated;
grant execute on function public.process_return(text,text,text,numeric,uuid) to authenticated;
grant execute on function public.cancel_sale(text,text) to authenticated;
