-- Public catalog presentation: hide internal grade, expose update time for sorting,
-- and add a configurable Google Maps store link.

insert into public.app_settings (key, value)
values ('store_google_maps_url', '')
on conflict (key) do nothing;

drop function public.get_catalog_units();
create function public.get_catalog_units()
returns table (
  id_unit text,
  brand text,
  model text,
  spek_saat_ini text,
  kondisi_fungsi text,
  harga_listing numeric,
  foto_url text[],
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    u.id_unit,
    u.brand,
    u.model,
    u.spek_saat_ini,
    u.kondisi_fungsi,
    u.harga_listing,
    u.foto_url,
    u.updated_at
  from public.units u
  where u.status = 'Listed' and u.harga_listing is not null
  order by u.updated_at desc, u.id_unit;
$$;

grant execute on function public.get_catalog_units() to anon, authenticated;

drop function public.get_catalog_unit(text);
create function public.get_catalog_unit(p_id_unit text)
returns table (
  id_unit text,
  brand text,
  model text,
  spek_saat_ini text,
  kondisi_fungsi text,
  harga_listing numeric,
  foto_url text[],
  status text,
  tanggal_masuk date
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    u.id_unit,
    u.brand,
    u.model,
    u.spek_saat_ini,
    u.kondisi_fungsi,
    u.harga_listing,
    u.foto_url,
    u.status,
    u.tanggal_masuk
  from public.units u
  where u.id_unit = p_id_unit;
$$;

grant execute on function public.get_catalog_unit(text) to anon, authenticated;
