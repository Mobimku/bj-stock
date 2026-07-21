alter table public.units
add column harga_listing numeric(14, 2) check (harga_listing > 0);

create function public.enforce_unit_listing_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'Listed' and new.harga_listing is null then
    raise exception 'Harga listing wajib diisi sebelum unit berstatus Listed';
  end if;

  if tg_op = 'UPDATE'
    and old.status in ('Terjual', 'Selesai')
    and new.harga_listing is distinct from old.harga_listing then
    raise exception 'Harga listing unit terjual tidak dapat diubah';
  end if;

  return new;
end;
$$;

create trigger enforce_unit_listing_price
before insert or update of status, harga_listing on public.units
for each row execute function public.enforce_unit_listing_price();

drop function public.advance_unit_status(text);

create function public.advance_unit_status(
  p_id_unit text,
  p_harga_listing numeric default null
)
returns public.units
language plpgsql
set search_path = ''
as $$
declare
  current_status text;
  next_status text;
  updated_unit public.units;
begin
  select status into current_status
  from public.units
  where id_unit = p_id_unit
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan';
  end if;

  if current_status = 'Listed' then
    if p_harga_listing is null or p_harga_listing <= 0 then
      raise exception 'Harga listing wajib lebih dari 0 untuk repricing';
    end if;

    update public.units
    set harga_listing = p_harga_listing
    where id_unit = p_id_unit
    returning * into updated_unit;

    return updated_unit;
  end if;

  next_status := case current_status
    when 'Masuk' then 'QC'
    when 'QC' then 'Ready'
    when 'Ready' then 'Listed'
    else null
  end;

  if next_status is null then
    raise exception 'Status unit tidak dapat dilanjutkan secara manual';
  end if;

  if next_status = 'Listed' and (p_harga_listing is null or p_harga_listing <= 0) then
    raise exception 'Harga listing wajib lebih dari 0 sebelum unit berstatus Listed';
  end if;

  update public.units
  set status = next_status,
      harga_listing = case when next_status = 'Listed' then p_harga_listing else harga_listing end
  where id_unit = p_id_unit
  returning * into updated_unit;

  return updated_unit;
end;
$$;

revoke all on function public.enforce_unit_listing_price() from public;
revoke all on function public.advance_unit_status(text, numeric) from public;
grant execute on function public.advance_unit_status(text, numeric) to authenticated;
