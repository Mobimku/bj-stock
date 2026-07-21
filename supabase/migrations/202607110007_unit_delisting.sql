-- ============================================================
-- Unit Delisting — Fase 7.5
-- Add Delisted status, delist columns, RPC delist_unit & reactivate_unit
-- ============================================================

-- ============================================================
-- 1. Add Delisted to status CHECK + delist columns
-- ============================================================

alter table public.units
drop constraint units_status_check;

alter table public.units
add constraint units_status_check
  check (status in ('Masuk','QC','Ready','Listed','Terjual','Selesai','Delisted'));

alter table public.units
add column delist_jenis text check (delist_jenis in ('rusak','retur_supplier','salah_input','hilang')),
add column delist_alasan text,
add column delist_tanggal date;

-- ============================================================
-- 2. Update enforce_unit_status_transition — allow delist flow
-- ============================================================

create or replace function public.enforce_unit_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    new.updated_at := now();
    return new;
  end if;

  if (old.status = 'Masuk' and new.status = 'QC')
    or (old.status = 'QC' and new.status = 'Ready')
    or (old.status = 'Ready' and new.status = 'Listed')
    or (old.status = 'Terjual' and new.status = 'Ready'
      and current_setting('app.returns_flow', true) = 'on')
    or (old.status in ('Ready', 'Listed') and new.status = 'Terjual'
      and current_setting('app.sales_flow', true) = 'on')
    or (old.status in ('Ready', 'Listed') and new.status = 'Delisted'
      and current_setting('app.delist_flow', true) = 'on')
    or (old.status = 'Delisted' and new.status = 'Ready'
      and current_setting('app.reactivate_flow', true) = 'on')
  then
    new.updated_at := now();
    return new;
  end if;

  raise exception 'Transisi status unit dari % ke % tidak diizinkan', old.status, new.status;
end;
$$;

-- ============================================================
-- 3. RPC delist_unit — atomic: status change + finance reversal
-- ============================================================

create function public.delist_unit(
  p_id_unit text,
  p_alasan text,
  p_jenis text
)
returns public.units
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_record public.units;
  kas_id uuid;
  fin_txn public.finance_transactions;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang dapat delist unit';
  end if;
  if nullif(btrim(p_alasan), '') is null then
    raise exception 'Alasan delist wajib diisi';
  end if;
  if p_jenis not in ('rusak', 'retur_supplier', 'salah_input', 'hilang') then
    raise exception 'Jenis delist tidak valid';
  end if;

  select * into unit_record
  from public.units
  where id_unit = p_id_unit
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan';
  end if;
  if unit_record.status not in ('Ready', 'Listed') then
    raise exception 'Hanya unit berstatus Ready atau Listed yang dapat delist';
  end if;

  -- Change status to Delisted
  perform set_config('app.delist_flow', 'on', true);
  update public.units
  set status = 'Delisted',
      delist_jenis = p_jenis,
      delist_alasan = btrim(p_alasan),
      delist_tanggal = current_date
  where id_unit = p_id_unit
  returning * into unit_record;
  perform set_config('app.delist_flow', 'off', true);

  -- Finance reversal for retur_supplier and salah_input
  if p_jenis in ('retur_supplier', 'salah_input') then
    -- Reverse unit purchase transaction
    for fin_txn in
      select ft.* from public.finance_transactions ft
      where ft.source_module = 'Stock'
        and ft.source_id = p_id_unit
        and ft.is_reversal = false
        and not exists (
          select 1 from public.finance_transactions rev
          where rev.reversal_of = ft.id_transaksi and rev.is_reversal = true
        )
    loop
      insert into public.finance_transactions (
        arah, kategori, id_account, jumlah,
        source_module, source_type, source_id, catatan,
        is_reversal, reversal_of
      ) values (
        case when fin_txn.arah = 'Masuk' then 'Keluar' else 'Masuk' end,
        fin_txn.kategori, fin_txn.id_account, fin_txn.jumlah,
        fin_txn.source_module, fin_txn.source_type, fin_txn.source_id,
        'Delist unit: ' || p_jenis || ' — ' || btrim(p_alasan),
        true, fin_txn.id_transaksi
      );
    end loop;
  end if;

  -- Hard delete for salah_input
  if p_jenis = 'salah_input' then
    delete from public.upgrade_log where id_unit = p_id_unit;
    delete from public.units where id_unit = p_id_unit;
    return null;
  end if;

  return unit_record;
end;
$$;

revoke all on function public.delist_unit(text, text, text) from public;
grant execute on function public.delist_unit(text, text, text) to authenticated;

-- ============================================================
-- 4. RPC reactivate_unit — return Delisted unit to Ready
-- ============================================================

create function public.reactivate_unit(
  p_id_unit text
)
returns public.units
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_record public.units;
  had_reversal boolean;
  kas_id uuid;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang dapat reactivate unit';
  end if;

  select * into unit_record
  from public.units
  where id_unit = p_id_unit
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan';
  end if;
  if unit_record.status <> 'Delisted' then
    raise exception 'Hanya unit berstatus Delisted yang dapat direactivate';
  end if;

  -- Check if there was a finance reversal (retur_supplier)
  select exists (
    select 1 from public.finance_transactions ft
    where ft.source_module = 'Stock'
      and ft.source_id = p_id_unit
      and ft.is_reversal = true
  ) into had_reversal;

  -- If previously reversed, create new purchase transaction
  if had_reversal then
    select id_account into kas_id
    from public.finance_accounts where nama = 'Kas Toko' limit 1;

    perform public.record_finance_txn(
      'Keluar', 'Pembelian Unit', kas_id, unit_record.total_modal,
      'Stock', 'Unit', p_id_unit,
      'unit-reactivate:' || p_id_unit || ':' || gen_random_uuid()::text,
      'Reactivate unit setelah delist'
    );
  end if;

  -- Change status back to Ready
  perform set_config('app.reactivate_flow', 'on', true);
  update public.units
  set status = 'Ready',
      delist_jenis = null,
      delist_alasan = null,
      delist_tanggal = null
  where id_unit = p_id_unit
  returning * into unit_record;
  perform set_config('app.reactivate_flow', 'off', true);

  return unit_record;
end;
$$;

revoke all on function public.reactivate_unit(text) from public;
grant execute on function public.reactivate_unit(text) to authenticated;
