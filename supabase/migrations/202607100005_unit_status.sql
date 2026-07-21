
create function public.enforce_unit_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if (old.status = 'Masuk' and new.status = 'QC')
    or (old.status = 'QC' and new.status = 'Ready')
    or (old.status = 'Ready' and new.status = 'Listed') then
    new.updated_at := now();
    return new;
  end if;

  raise exception 'Transisi status unit dari % ke % tidak diizinkan', old.status, new.status;
end;
$$;

create trigger enforce_unit_status_transition
before update of status on public.units
for each row execute function public.enforce_unit_status_transition();

create function public.advance_unit_status(p_id_unit text)
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

  next_status := case current_status
    when 'Masuk' then 'QC'
    when 'QC' then 'Ready'
    when 'Ready' then 'Listed'
    else null
  end;

  if next_status is null then
    raise exception 'Status unit tidak dapat dilanjutkan secara manual';
  end if;

  update public.units
  set status = next_status
  where id_unit = p_id_unit
  returning * into updated_unit;

  return updated_unit;
end;
$$;

revoke all on function public.advance_unit_status(text) from public;
grant execute on function public.advance_unit_status(text) to authenticated;
