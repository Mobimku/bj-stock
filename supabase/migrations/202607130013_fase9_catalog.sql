-- Fase 9 — Katalog Publik (Modul 11)
-- 2026-07-13

-- 1. Seed store_whatsapp_number if not exists (SPEC.md §3 app_settings)
insert into app_settings (key, value)
select 'store_whatsapp_number', ''
where not exists (select 1 from app_settings where key = 'store_whatsapp_number');

-- 2. RPC: get_catalog_units — public catalog grid
-- Returns only fields safe for public (BR-09: no modal_awal/total_modal/serial_number)
create or replace function public.get_catalog_units()
returns table (
  id_unit text,
  brand text,
  model text,
  spek_saat_ini text,
  kondisi_fisik text,
  kondisi_fungsi text,
  harga_listing numeric,
  foto_url text[]
)
language sql
security definer
stable
as $$
  select id_unit, brand, model, spek_saat_ini, kondisi_fisik, kondisi_fungsi, harga_listing, foto_url
  from public.units
  where status = 'Listed' and harga_listing is not null
  order by updated_at desc;
$$;

grant execute on function public.get_catalog_units() to anon, authenticated;

-- 3. RPC: get_catalog_unit — public detail page (includes status for availability check)
create or replace function public.get_catalog_unit(p_id_unit text)
returns table (
  id_unit text,
  brand text,
  model text,
  spek_saat_ini text,
  kondisi_fisik text,
  kondisi_fungsi text,
  harga_listing numeric,
  foto_url text[],
  status text,
  tanggal_masuk date
)
language sql
security definer
stable
as $$
  select id_unit, brand, model, spek_saat_ini, kondisi_fisik, kondisi_fungsi, harga_listing, foto_url, status, tanggal_masuk
  from public.units
  where id_unit = p_id_unit;
$$;

grant execute on function public.get_catalog_unit(text) to anon, authenticated;

-- 4. RPC: get_store_whatsapp_number — for WA button (public)
create or replace function public.get_store_whatsapp_number()
returns text
language sql
security definer
stable
as $$
  select value from public.app_settings where key = 'store_whatsapp_number';
$$;

grant execute on function public.get_store_whatsapp_number() to anon, authenticated;
