drop policy if exists "authenticated users read sale unit tests" on public.sale_unit_tests;
create policy "admin and owner read sale unit tests"
on public.sale_unit_tests for select to authenticated
using (public.current_user_role() in ('admin', 'owner'));

create or replace view public.sales_current_state
with (security_invoker = false) as
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
  coalesce(latest.replacement_unit_modal, s.harga_jual - s.margin, current_unit.total_modal) as current_unit_modal,
  coalesce(latest.adjusted_margin, s.margin, s.harga_jual - current_unit.total_modal) as current_margin,
  coalesce(latest.sequence_no, 0) as replacement_count,
  current_warranty.id_garansi as current_warranty_id,
  current_warranty.tanggal_mulai as current_warranty_start,
  current_warranty.tanggal_berakhir as current_warranty_end,
  current_warranty.status as current_warranty_status
from public.sales s
left join lateral (
  select replacement.*
  from public.warranty_replacements replacement
  where replacement.id_invoice = s.id_invoice
  order by replacement.sequence_no desc
  limit 1
) latest on true
left join lateral (
  select warranty.id_garansi
  from public.warranty warranty
  where warranty.id_unit = s.id_unit
  order by warranty.tanggal_mulai desc, warranty.id_garansi
  limit 1
) original_warranty on true
join public.units current_unit
  on current_unit.id_unit = coalesce(latest.replacement_unit_id, s.id_unit)
left join public.warranty current_warranty
  on current_warranty.id_garansi = coalesce(latest.new_warranty_id, original_warranty.id_garansi)
where s.status = 'Aktif'
  and public.current_user_role() in ('owner', 'admin', 'teknisi')
  and not exists (
    select 1
    from public.returns completed_return
    where completed_return.source_type = 'Sales'
      and completed_return.source_id = s.id_invoice
      and completed_return.status = 'Selesai'
  );

revoke all on table public.sales_current_state from public, anon, authenticated;
grant select on table public.sales_current_state to authenticated;
