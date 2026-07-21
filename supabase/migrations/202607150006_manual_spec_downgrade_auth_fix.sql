-- Null-safe role guard for add_unit_downgrade.
-- PostgreSQL NULL NOT IN (...) evaluates to NULL, not TRUE.

create or replace function public.add_unit_downgrade(
  p_id_unit text,
  p_biaya numeric,
  p_spek_setelah text,
  p_tanggal date,
  p_catatan text
)
returns public.upgrade_log
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_record public.units;
  new_log public.upgrade_log;
  cleaned_spec text := nullif(btrim(p_spek_setelah), '');
begin
  if coalesce(public.current_user_role(), '') not in ('admin', 'teknisi', 'owner') then
    raise exception 'Role tidak diizinkan mencatat downgrade';
  end if;
  if p_biaya is null or p_biaya <= 0 then
    raise exception 'Pengurangan modal wajib lebih dari 0';
  end if;
  if cleaned_spec is null or char_length(cleaned_spec) > 2000 then
    raise exception 'Spek setelah downgrade wajib diisi dan maksimal 2000 karakter';
  end if;
  if p_catatan is not null and char_length(btrim(p_catatan)) > 1000 then
    raise exception 'Catatan maksimal 1000 karakter';
  end if;

  select * into unit_record
  from public.units
  where id_unit = p_id_unit
  for update;

  if not found then raise exception 'Unit tidak ditemukan'; end if;
  if unit_record.status not in ('Masuk', 'QC', 'Ready', 'Listed') then
    raise exception 'Downgrade hanya dapat dilakukan pada unit stok aktif';
  end if;
  if unit_record.total_modal - p_biaya <= 0 then
    raise exception 'Total modal harus tetap lebih dari 0';
  end if;

  perform set_config('app.downgrade_flow', 'on', true);
  insert into public.upgrade_log (
    id_unit, id_part, jenis, biaya, tanggal, catatan, spek_setelah
  ) values (
    p_id_unit, null, 'downgrade', p_biaya, p_tanggal,
    nullif(btrim(p_catatan), ''), cleaned_spec
  )
  returning * into new_log;

  update public.units
  set spek_saat_ini = cleaned_spec
  where id_unit = p_id_unit;
  perform set_config('app.downgrade_flow', 'off', true);

  return new_log;
end;
$$;
