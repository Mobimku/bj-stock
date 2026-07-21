-- ============================================================
-- Unit Spec History + Stricter Delist — Fase 7.8
-- 1. CREATE TABLE unit_spec_history + trigger AFTER INSERT/UPDATE on units
-- 2. UPDATE RPC delist_unit — block bila ada service_order aktif
-- ============================================================

-- ============================================================
-- 1. unit_spec_history table
-- ============================================================

create table public.unit_spec_history (
  id_history uuid primary key default gen_random_uuid(),
  id_unit text not null references public.units(id_unit) on delete cascade,
  spek_saat_ini text,
  kondisi_fisik text check (kondisi_fisik in ('A','B','C')),
  kondisi_fungsi text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  catatan text
);

create index unit_spec_history_id_unit_idx on public.unit_spec_history(id_unit);
create index unit_spec_history_changed_at_idx on public.unit_spec_history(changed_at desc);

alter table public.unit_spec_history enable row level security;

grant select on public.unit_spec_history to authenticated;

create policy "authenticated users read unit spec history"
on public.unit_spec_history for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi'));

-- ============================================================
-- 2. Trigger: snapshot spec on INSERT (initial spec) and UPDATE (change)
-- ============================================================

create or replace function public.snapshot_unit_spec()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  -- get current user id from JWT claim (auth.uid())
  v_user := auth.uid();

  if TG_OP = 'INSERT' then
    -- initial snapshot at unit creation
    insert into public.unit_spec_history (id_unit, spek_saat_ini, kondisi_fisik, kondisi_fungsi, changed_by, catatan)
    values (new.id_unit, new.spek_saat_ini, new.kondisi_fisik, new.kondisi_fungsi, v_user, 'Spek awal saat unit dibuat');
    return new;
  end if;

  -- TG_OP = 'UPDATE' — only snapshot if spec fields actually changed
  if new.spek_saat_ini is distinct from old.spek_saat_ini
     or new.kondisi_fisik is distinct from old.kondisi_fisik
     or new.kondisi_fungsi is distinct from old.kondisi_fungsi
  then
    insert into public.unit_spec_history (id_unit, spek_saat_ini, kondisi_fisik, kondisi_fungsi, changed_by)
    values (new.id_unit, new.spek_saat_ini, new.kondisi_fisik, new.kondisi_fungsi, v_user);
  end if;

  return new;
end;
$$;

revoke all on function public.snapshot_unit_spec() from public;
grant execute on function public.snapshot_unit_spec() to authenticated;

create trigger trg_unit_spec_after_insert
after insert on public.units
for each row execute function public.snapshot_unit_spec();

create trigger trg_unit_spec_after_update
after update of spek_saat_ini, kondisi_fisik, kondisi_fungsi on public.units
for each row execute function public.snapshot_unit_spec();

-- ============================================================
-- 3. Backfill: snapshot existing units (one row per unit, current spec)
-- ============================================================

insert into public.unit_spec_history (id_unit, spek_saat_ini, kondisi_fisik, kondisi_fungsi, catatan)
select id_unit, spek_saat_ini, kondisi_fisik, kondisi_fungsi, 'Backfill snapshot existing unit'
from public.units
where not exists (
  select 1 from public.unit_spec_history h where h.id_unit = units.id_unit
);

-- ============================================================
-- 4. Stricter delist: block bila ada service_order aktif
-- ============================================================

create or replace function public.delist_unit(
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
  fin_txn public.finance_transactions;
  active_service_count integer;
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

  -- Stricter: block bila ada service order aktif (belum Selesai/Diambil)
  select count(*) into active_service_count
  from public.service_orders
  where id_unit = p_id_unit
    and status in ('Diterima', 'Diagnosa', 'Dikerjakan');

  if active_service_count > 0 then
    raise exception 'Unit tidak dapat delist karena masih ada % service order aktif. Selesaikan atau batalkan servis terlebih dahulu.', active_service_count;
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
