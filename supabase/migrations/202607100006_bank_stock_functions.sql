create function public.create_bank_part(
  p_jenis_part text,
  p_kondisi text,
  p_stock_qty integer,
  p_modal_per_unit numeric,
  p_sumber text
)
returns public.bank_stock
language plpgsql
set search_path = ''
as $$
declare
  part_code text := regexp_replace(upper(split_part(btrim(p_jenis_part), ' ', 1)), '[^A-Z0-9]', '', 'g');
  next_number integer;
  new_part public.bank_stock;
begin
  if part_code = '' then
    raise exception 'Jenis part harus memuat huruf atau angka';
  end if;

  perform pg_advisory_xact_lock(hashtext('part:' || part_code));

  select coalesce(max((regexp_match(id_part, '([0-9]+)$'))[1]::integer), 0) + 1
  into next_number
  from public.bank_stock
  where id_part like 'BS-' || part_code || '-%';

  if next_number > 999 then
    raise exception 'Nomor part sudah mencapai batas 999';
  end if;

  insert into public.bank_stock (
    id_part,
    jenis_part,
    kondisi,
    stock_qty,
    modal_per_unit,
    sumber
  ) values (
    'BS-' || part_code || '-' || lpad(next_number::text, 3, '0'),
    btrim(p_jenis_part),
    p_kondisi,
    p_stock_qty,
    p_modal_per_unit,
    nullif(btrim(p_sumber), '')
  )
  returning * into new_part;

  return new_part;
end;
$$;

create function public.update_bank_part(
  p_id_part text,
  p_jenis_part text,
  p_kondisi text,
  p_stock_addition integer,
  p_modal_per_unit numeric,
  p_sumber text
)
returns public.bank_stock
language plpgsql
set search_path = ''
as $$
declare
  updated_part public.bank_stock;
begin
  if p_stock_addition < 0 then
    raise exception 'Jumlah restock tidak boleh negatif';
  end if;

  update public.bank_stock
  set jenis_part = btrim(p_jenis_part),
      kondisi = p_kondisi,
      stock_qty = stock_qty + p_stock_addition,
      modal_per_unit = p_modal_per_unit,
      sumber = nullif(btrim(p_sumber), '')
  where id_part = p_id_part
  returning * into updated_part;

  if not found then
    raise exception using errcode = 'P0002', message = 'Part tidak ditemukan';
  end if;

  return updated_part;
end;
$$;

revoke all on function public.create_bank_part(text, text, integer, numeric, text) from public;
revoke all on function public.update_bank_part(text, text, text, integer, numeric, text) from public;
grant execute on function public.create_bank_part(text, text, integer, numeric, text) to authenticated;
grant execute on function public.update_bank_part(text, text, text, integer, numeric, text) to authenticated;
