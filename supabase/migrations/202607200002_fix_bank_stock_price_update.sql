-- ============================================================
-- Fix Bank Stock Price Update — Record Finance Correction
-- Root cause: update_bank_part only records finance via
-- bank_stock_restock trigger when stock_addition > 0.
-- Changing modal_per_unit without adding stock silently
-- desyncs finance from actual inventory value.
-- Fix: capture old values, calculate difference for existing
-- stock, record corrective finance entry.
-- ============================================================

create or replace function public.update_bank_part(
  p_id_part text,
  p_jenis_part text,
  p_kondisi text,
  p_stock_addition integer,
  p_modal_per_unit numeric,
  p_sumber text
)
returns public.bank_stock
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_part public.bank_stock;
  updated_part public.bank_stock;
  kas_id uuid;
  old_stock_cost numeric;
  new_stock_cost numeric;
  cost_diff numeric;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang dapat mengubah part';
  end if;
  if p_stock_addition < 0 then
    raise exception 'Jumlah restock tidak boleh negatif';
  end if;

  -- Capture old values before update
  select * into old_part
  from public.bank_stock
  where id_part = p_id_part
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Part tidak ditemukan';
  end if;

  update public.bank_stock
  set jenis_part = btrim(p_jenis_part),
      kondisi = p_kondisi,
      stock_qty = stock_qty + p_stock_addition,
      modal_per_unit = p_modal_per_unit,
      sumber = nullif(btrim(p_sumber), '')
  where id_part = p_id_part
  returning * into updated_part;

  -- Record restock entry for new stock additions
  if p_stock_addition > 0 then
    insert into public.bank_stock_restock (id_part, qty_added, modal_per_unit)
    values (p_id_part, p_stock_addition, p_modal_per_unit);
  end if;

  -- If modal_per_unit changed, adjust finance for existing stock
  if old_part.modal_per_unit is distinct from p_modal_per_unit and old_part.stock_qty > 0 then
    old_stock_cost := old_part.stock_qty * old_part.modal_per_unit;
    new_stock_cost := old_part.stock_qty * p_modal_per_unit;
    cost_diff := new_stock_cost - old_stock_cost;

    if cost_diff <> 0 then
      select id_account into kas_id from public.finance_accounts where nama = 'Kas Toko' limit 1;

      perform public.record_finance_txn(
        case when cost_diff > 0 then 'Keluar' else 'Masuk' end,
        'Pembelian Part',
        kas_id,
        abs(cost_diff),
        'BankStock',
        'Part',
        p_id_part,
        'part-price-adjust:' || p_id_part || ':' || gen_random_uuid()::text
      );
    end if;
  end if;

  return updated_part;
end;
$$;
