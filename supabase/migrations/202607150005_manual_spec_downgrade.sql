-- Manual specification downgrade: reduce unit capital without stock or cash movement.

alter table public.upgrade_log
  add column jenis text,
  add column spek_setelah text;

update public.upgrade_log
set jenis = case when id_part is null then 'service' else 'part' end;

alter table public.upgrade_log
  alter column jenis set not null,
  add constraint upgrade_log_jenis_check
    check (jenis in ('part', 'service', 'downgrade')),
  add constraint upgrade_log_jenis_data_check check (
    (jenis = 'part' and id_part is not null and spek_setelah is null)
    or (jenis = 'service' and id_part is null and spek_setelah is null)
    or (
      jenis = 'downgrade'
      and id_part is null
      and biaya > 0
      and nullif(btrim(spek_setelah), '') is not null
    )
  );

drop policy if exists "authenticated users manage upgrade logs" on public.upgrade_log;
create policy "authenticated users manage upgrade logs"
on public.upgrade_log for all to authenticated
using (
  public.current_user_role() in ('admin', 'teknisi', 'owner')
  and jenis <> 'downgrade'
)
with check (public.current_user_role() in ('admin', 'teknisi', 'owner'));

create or replace function public.set_unit_derived_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select new.modal_awal + coalesce(sum(
    case when jenis = 'downgrade' then -biaya else biaya end
  ), 0)
  into new.total_modal
  from public.upgrade_log
  where id_unit = new.id_unit;

  new.qr_payload := new.id_unit;
  new.updated_at := now();
  return new;
end;
$$;

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
  if new.jenis = 'part' then
    if new.id_part is null then
      raise exception 'Part Bank Stock wajib dipilih';
    end if;

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

      if not found then raise exception 'Part tidak ditemukan'; end if;
      if available_stock < 1 then raise exception 'Stok part habis'; end if;
      new.biaya := part_cost;
    end if;
  elsif new.jenis = 'service' then
    if new.id_part is not null then raise exception 'Jasa tidak boleh memakai part'; end if;
    if new.biaya < 0 then raise exception 'Biaya jasa tidak boleh negatif'; end if;
  elsif new.jenis = 'downgrade' then
    if current_setting('app.downgrade_flow', true) <> 'on' then
      raise exception 'Downgrade wajib melalui add_unit_downgrade';
    end if;
    if new.id_part is not null then raise exception 'Downgrade manual tidak boleh memakai part'; end if;
    if new.biaya <= 0 then raise exception 'Pengurangan modal wajib lebih dari 0'; end if;
    new.spek_setelah := nullif(btrim(new.spek_setelah), '');
    if new.spek_setelah is null then raise exception 'Spek setelah downgrade wajib diisi'; end if;
  else
    raise exception 'Jenis Upgrade Log tidak valid';
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
      select sum(case when jenis = 'downgrade' then -biaya else biaya end)
      from public.upgrade_log
      where id_unit = old.id_unit
    ), 0),
    updated_at = now()
    where id_unit = old.id_unit;
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and (tg_op = 'INSERT' or old.id_unit is distinct from new.id_unit) then
    update public.units
    set total_modal = modal_awal + coalesce((
      select sum(case when jenis = 'downgrade' then -biaya else biaya end)
      from public.upgrade_log
      where id_unit = new.id_unit
    ), 0),
    updated_at = now()
    where id_unit = new.id_unit;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.add_unit_upgrade(
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
  insert into public.upgrade_log (id_unit, id_part, jenis, biaya, tanggal, catatan)
  values (
    p_id_unit,
    p_id_part,
    case when p_id_part is null then 'service' else 'part' end,
    p_biaya,
    p_tanggal,
    nullif(btrim(p_catatan), '')
  )
  returning *
$$;

create or replace function public.journal_external_upgrade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kas_id uuid;
  active_txn public.finance_transactions;
begin
  if tg_op = 'UPDATE'
    and new.jenis is not distinct from old.jenis
    and new.biaya is not distinct from old.biaya then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.jenis = 'service' and old.biaya > 0 then
    select ft.* into active_txn
    from public.finance_transactions ft
    where ft.source_module = 'Stock'
      and ft.source_type = 'UpgradeLog'
      and ft.source_id = old.id_log::text
      and ft.is_reversal = false
      and not exists (
        select 1 from public.finance_transactions reversal
        where reversal.reversal_of = ft.id_transaksi and reversal.is_reversal = true
      )
    order by ft.created_at desc
    limit 1
    for update;

    if found then
      insert into public.finance_transactions (
        arah, kategori, id_account, jumlah,
        source_module, source_type, source_id, catatan,
        is_reversal, reversal_of
      ) values (
        case when active_txn.arah = 'Masuk' then 'Keluar' else 'Masuk' end,
        active_txn.kategori, active_txn.id_account, active_txn.jumlah,
        active_txn.source_module, active_txn.source_type, active_txn.source_id,
        'Koreksi biaya upgrade eksternal', true, active_txn.id_transaksi
      );
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.jenis = 'service' and new.biaya > 0 then
    select id_account into kas_id from public.finance_accounts where nama = 'Kas Toko' limit 1;
    perform public.record_finance_txn(
      'Keluar', 'Biaya Upgrade Eksternal', kas_id, new.biaya,
      'Stock', 'UpgradeLog', new.id_log::text,
      case
        when tg_op = 'INSERT' then 'upgrade:' || new.id_log::text
        else 'upgrade-correction:' || new.id_log::text || ':' || gen_random_uuid()::text
      end
    );
  end if;
  return coalesce(new, old);
end;
$$;

create function public.add_unit_downgrade(
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
  if public.current_user_role() not in ('admin', 'teknisi', 'owner') then
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

revoke all on function public.add_unit_downgrade(text, numeric, text, date, text) from public;
grant execute on function public.add_unit_downgrade(text, numeric, text, date, text) to authenticated;
