create or replace function public.set_unit_derived_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select new.modal_awal + coalesce(sum(biaya), 0)
  into new.total_modal
  from public.upgrade_log
  where id_unit = new.id_unit;

  new.qr_payload := new.id_unit;
  new.updated_at := now();
  return new;
end;
$$;

create function public.prepare_upgrade_log()
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
    select modal_per_unit, stock_qty
    into part_cost, available_stock
    from public.bank_stock
    where id_part = new.id_part
    for update;

    if not found then
      raise exception 'Part tidak ditemukan';
    end if;
    if (tg_op = 'INSERT' or old.id_part is distinct from new.id_part) and available_stock < 1 then
      raise exception 'Stok part habis';
    end if;

    new.biaya := part_cost;
  elsif new.biaya < 0 then
    raise exception 'Biaya jasa tidak boleh negatif';
  end if;

  return new;
end;
$$;

create function public.adjust_upgrade_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.id_part is not null
    and (tg_op = 'DELETE' or old.id_part is distinct from new.id_part) then
    update public.bank_stock set stock_qty = stock_qty + 1 where id_part = old.id_part;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.id_part is not null
    and (tg_op = 'INSERT' or old.id_part is distinct from new.id_part) then
    update public.bank_stock
    set stock_qty = stock_qty - 1
    where id_part = new.id_part and stock_qty > 0;

    if not found then
      raise exception 'Stok part habis';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create function public.recalculate_unit_modal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger prepare_upgrade_log
before insert or update on public.upgrade_log
for each row execute function public.prepare_upgrade_log();

create trigger adjust_upgrade_stock
after insert or update or delete on public.upgrade_log
for each row execute function public.adjust_upgrade_stock();

create trigger recalculate_unit_modal
after insert or update or delete on public.upgrade_log
for each row execute function public.recalculate_unit_modal();

create function public.add_unit_upgrade(
  p_id_unit text,
  p_id_part text,
  p_biaya numeric,
  p_tanggal date,
  p_catatan text
)
returns public.upgrade_log
language sql
set search_path = ''
as $$
  insert into public.upgrade_log (id_unit, id_part, biaya, tanggal, catatan)
  values (p_id_unit, p_id_part, p_biaya, p_tanggal, nullif(btrim(p_catatan), ''))
  returning *
$$;

revoke all on function public.prepare_upgrade_log() from public;
revoke all on function public.adjust_upgrade_stock() from public;
revoke all on function public.recalculate_unit_modal() from public;
revoke all on function public.add_unit_upgrade(text, text, numeric, date, text) from public;
grant execute on function public.add_unit_upgrade(text, text, numeric, date, text) to authenticated;
