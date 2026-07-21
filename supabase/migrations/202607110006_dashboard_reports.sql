-- ============================================================
-- Dashboard & Reports — Fase 6
-- Read-only PostgreSQL functions for dashboard summary and reports.
-- All admin-only (security definer + role check), konsisten dengan Fase 5.
-- ============================================================

-- ============================================================
-- 1. Dashboard Summary — unit per status, servis aktif, garansi akan habis
-- ============================================================

create function public.get_dashboard_summary()
returns table (
  status text,
  jumlah integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang dapat melihat dashboard';
  end if;
  return query
    select u.status, count(*)::integer
    from public.units u
    group by u.status
    order by u.status;
end;
$$;

revoke all on function public.get_dashboard_summary() from public;
grant execute on function public.get_dashboard_summary() to authenticated;


-- ============================================================
-- 2. Servis Aktif — daftar servis yang belum selesai/diambil
-- ============================================================

create function public.get_active_services()
returns table (
  id_servis text,
  brand_model text,
  status text,
  tanggal_masuk date,
  estimasi_selesai date,
  jenis_servis text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang dapat melihat dashboard';
  end if;
  return query
    select
      so.id_servis, so.brand_model, so.status,
      so.tanggal_masuk, so.estimasi_selesai, so.jenis_servis
    from public.service_orders so
    where so.status in ('Diterima', 'Diagnosa', 'Dikerjakan')
    order by so.tanggal_masuk asc;
end;
$$;

revoke all on function public.get_active_services() from public;
grant execute on function public.get_active_services() to authenticated;


-- ============================================================
-- 3. Garansi Akan Habis — warranty Aktif yang berakhir dalam 7 hari
-- ============================================================

create function public.get_warranty_expiring(p_days integer default 7)
returns table (
  id_unit text,
  brand text,
  model text,
  tanggal_berakhir date,
  sisa_hari integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang dapat melihat dashboard';
  end if;
  if p_days is null or p_days < 0 then
    raise exception 'Jumlah hari tidak valid';
  end if;
  return query
    select
      w.id_unit, u.brand, u.model,
      w.tanggal_berakhir,
      (w.tanggal_berakhir - current_date)::integer as sisa_hari
    from public.warranty w
    join public.units u on u.id_unit = w.id_unit
    where w.status = 'Aktif'
      and w.tanggal_berakhir between current_date and current_date + p_days
    order by w.tanggal_berakhir asc;
end;
$$;

revoke all on function public.get_warranty_expiring(integer) from public;
grant execute on function public.get_warranty_expiring(integer) to authenticated;


-- ============================================================
-- 4. Laporan Margin per Brand/Periode
-- ============================================================

create function public.get_margin_report(
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
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang dapat melihat laporan';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Periode laporan tidak valid';
  end if;
  return query
    select
      u.brand,
      count(*)::integer as unit_terjual,
      coalesce(sum(s.harga_jual), 0) as total_revenue,
      coalesce(sum(s.margin), 0) as total_margin,
      case when count(*) > 0
        then coalesce(sum(s.margin), 0) / count(*)
        else 0
      end as margin_rata_rata
    from public.sales s
    join public.units u on u.id_unit = s.id_unit
    where s.tanggal_transaksi between p_start_date and p_end_date
    group by u.brand
    order by total_margin desc;
end;
$$;

revoke all on function public.get_margin_report(date, date) from public;
grant execute on function public.get_margin_report(date, date) to authenticated;


-- ============================================================
-- 5. Laporan Perputaran Stock — rata-rata hari Masuk → Terjual
-- ============================================================

create function public.get_stock_turnover(
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
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang dapat melihat laporan';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Periode laporan tidak valid';
  end if;
  return query
    select
      u.brand,
      count(*)::integer as unit_terjual,
      case when count(*) > 0
        then round(avg((s.tanggal_transaksi - u.tanggal_masuk)::numeric), 1)
        else null
      end as rata_rata_hari
    from public.sales s
    join public.units u on u.id_unit = s.id_unit
    where s.tanggal_transaksi between p_start_date and p_end_date
    group by u.brand
    order by rata_rata_hari asc;
end;
$$;

revoke all on function public.get_stock_turnover(date, date) from public;
grant execute on function public.get_stock_turnover(date, date) to authenticated;


-- ============================================================
-- 6. Laporan Distribusi Sumber Lead vs Konversi
-- ============================================================

create function public.get_lead_conversion(
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
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang dapat melihat laporan';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Periode laporan tidak valid';
  end if;
  return query
    select
      c.sumber_lead,
      count(distinct c.id_customer)::integer as jumlah_customer,
      count(distinct s.id_invoice)::integer as konversi_sales,
      count(distinct so.id_servis)::integer as konversi_servis,
      coalesce(sum(s.harga_jual), 0) + coalesce(sum(so.total_biaya), 0) as total_revenue
    from public.customers c
    left join public.sales s
      on s.id_customer = c.id_customer
      and s.tanggal_transaksi between p_start_date and p_end_date
    left join public.service_orders so
      on so.id_customer = c.id_customer
      and so.tanggal_masuk between p_start_date and p_end_date
    group by c.sumber_lead
    order by total_revenue desc;
end;
$$;

revoke all on function public.get_lead_conversion(date, date) from public;
grant execute on function public.get_lead_conversion(date, date) to authenticated;
