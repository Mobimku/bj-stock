drop trigger set_unit_derived_fields on public.units;

create trigger set_unit_derived_fields
before insert or update of modal_awal, total_modal, qr_payload on public.units
for each row execute function public.set_unit_derived_fields();

create index upgrade_log_id_unit_idx on public.upgrade_log(id_unit);

create or replace function public.prepare_upgrade_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  part_cost numeric;
  available_stock integer;
begin
  if new.id_part is not null then
    if tg_op = 'UPDATE' and old.id_part is not distinct from new.id_part then
      new.biaya := old.biaya;
    else
      if tg_op = 'UPDATE' then
        perform 1
        from public.bank_stock
        where id_part in (old.id_part, new.id_part)
        order by id_part
        for update;
      end if;

      select modal_per_unit, stock_qty into part_cost, available_stock
      from public.bank_stock
      where id_part = new.id_part
      for update;

      if not found then
        raise exception 'Part tidak ditemukan';
      end if;
      if available_stock < 1 then
        raise exception 'Stok part habis';
      end if;

      new.biaya := part_cost;
    end if;
  elsif new.biaya < 0 then
    raise exception 'Biaya jasa tidak boleh negatif';
  end if;

  return new;
end;
$$;

create or replace function public.recalculate_unit_modal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from public.units where id_unit = new.id_unit for update;
  elsif tg_op = 'DELETE' then
    perform 1 from public.units where id_unit = old.id_unit for update;
  else
    perform 1
    from public.units
    where id_unit in (old.id_unit, new.id_unit)
    order by id_unit
    for update;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    update public.units
    set total_modal = modal_awal + coalesce((
      select sum(biaya) from public.upgrade_log where id_unit = old.id_unit
    ), 0),
    updated_at = now()
    where id_unit = old.id_unit;
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and (tg_op = 'INSERT' or old.id_unit is distinct from new.id_unit) then
    update public.units
    set total_modal = modal_awal + coalesce((
      select sum(biaya) from public.upgrade_log where id_unit = new.id_unit
    ), 0),
    updated_at = now()
    where id_unit = new.id_unit;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
