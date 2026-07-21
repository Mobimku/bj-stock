create function public.reject_replaced_sale_return()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type = 'Sales' then
    perform pg_advisory_xact_lock(hashtext('warranty-replacement:' || new.source_id));

    if exists (
      select 1
      from public.warranty_replacements replacement
      where replacement.id_invoice = new.source_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'Invoice yang pernah mengalami penggantian unit tidak dapat diretur';
    end if;
  end if;

  return new;
end;
$$;

create trigger reject_replaced_sale_return
before insert or update on public.returns
for each row execute function public.reject_replaced_sale_return();

create or replace function public.get_profit_loss(
  p_start_date date,
  p_end_date date
)
returns table (
  pendapatan_sales numeric,
  pendapatan_servis numeric,
  retur numeric,
  hpp_unit numeric,
  biaya_part_servis numeric,
  operasional numeric,
  laba_bersih numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() not in ('admin', 'owner') then
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
        where state.tanggal_transaksi between p_start_date and p_end_date), 0)
      + coalesce((select sum(sale.harga_jual)
        from public.sales sale
        where sale.tanggal_transaksi between p_start_date and p_end_date
          and exists (
            select 1
            from public.returns completed_return
            where completed_return.source_type = 'Sales'
              and completed_return.source_id = sale.id_invoice
              and completed_return.status = 'Selesai'
          )), 0) as sales_revenue,
      coalesce((select sum(service.total_biaya)
        from public.service_orders service
        where service.status = 'Diambil'
          and service.tanggal_diambil between p_start_date and p_end_date), 0) as service_revenue,
      coalesce((select sum(completed_return.jumlah_refund)
        from public.returns completed_return
        where completed_return.status = 'Selesai'
          and completed_return.tanggal between p_start_date and p_end_date), 0) as return_total,
      coalesce((select sum(state.current_unit_modal)
        from public.sales_current_state state
        where state.tanggal_transaksi between p_start_date and p_end_date), 0) as unit_cost,
      coalesce((select sum(service.biaya_part)
        from public.service_orders service
        where service.status = 'Diambil'
          and service.tanggal_diambil between p_start_date and p_end_date), 0) as service_part_cost,
      coalesce((select sum(case when finance_transaction.arah = 'Keluar'
        then finance_transaction.jumlah else -finance_transaction.jumlah end)
        from public.finance_transactions finance_transaction
        where finance_transaction.kategori = 'Operasional'
          and finance_transaction.tanggal between p_start_date and p_end_date), 0) as operating_cost
  )
  select sales_revenue, service_revenue, return_total, unit_cost,
    service_part_cost, operating_cost,
    sales_revenue + service_revenue - return_total - unit_cost - service_part_cost - operating_cost
  from totals;
end;
$$;

revoke all on function public.reject_replaced_sale_return() from public, anon, authenticated;
revoke all on function public.get_profit_loss(date, date) from public, anon, authenticated;
grant execute on function public.get_profit_loss(date, date) to authenticated;
