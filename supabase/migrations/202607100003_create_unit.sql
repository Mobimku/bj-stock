create function public.create_unit(
  p_brand text,
  p_model text,
  p_serial_number text,
  p_spek_awal text,
  p_kondisi_fisik text,
  p_kondisi_fungsi text,
  p_sumber_beli text,
  p_modal_awal numeric,
  p_tanggal_masuk date
)
returns public.units
language plpgsql
set search_path = ''
as $$
declare
  month_code text := to_char(p_tanggal_masuk, 'YYMM');
  brand_code text := regexp_replace(upper(btrim(p_brand)), '[^A-Z0-9]', '', 'g');
  next_number integer;
  new_unit public.units;
begin
  if brand_code = '' then
    raise exception 'Brand harus memuat huruf atau angka';
  end if;

  perform pg_advisory_xact_lock(hashtext('unit:' || month_code));

  select coalesce(max((regexp_match(id_unit, '([0-9]+)$'))[1]::integer), 0) + 1
  into next_number
  from public.units
  where id_unit like 'BJ-%-' || month_code || '-%';

  if next_number > 999 then
    raise exception 'Nomor unit bulanan sudah mencapai batas 999';
  end if;

  insert into public.units (
    id_unit,
    brand,
    model,
    serial_number,
    spek_awal,
    spek_saat_ini,
    kondisi_fisik,
    kondisi_fungsi,
    sumber_beli,
    modal_awal,
    tanggal_masuk
  ) values (
    'BJ-' || brand_code || '-' || month_code || '-' || lpad(next_number::text, 3, '0'),
    btrim(p_brand),
    nullif(btrim(p_model), ''),
    nullif(btrim(p_serial_number), ''),
    nullif(btrim(p_spek_awal), ''),
    nullif(btrim(p_spek_awal), ''),
    p_kondisi_fisik,
    nullif(btrim(p_kondisi_fungsi), ''),
    nullif(btrim(p_sumber_beli), ''),
    p_modal_awal,
    p_tanggal_masuk
  )
  returning * into new_unit;

  return new_unit;
end;
$$;

revoke all on function public.create_unit(text, text, text, text, text, text, text, numeric, date)
from public;
grant execute on function public.create_unit(text, text, text, text, text, text, text, numeric, date)
to authenticated;
