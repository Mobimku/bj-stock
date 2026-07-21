-- ============================================================
-- Fase 8 — Manajemen Akun, Pengaturan & Role Owner
-- admin_actions_log, require_owner(), patch reverse_transaction
-- + process_return, app_settings RLS update
-- ============================================================

-- ============================================================
-- 1. admin_actions_log — Audit trail aksi sensitif (Owner only)
-- ============================================================

create table public.admin_actions_log (
  id_log uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_role text not null,
  aksi text not null check (aksi in (
    'create_account', 'deactivate_account', 'reactivate_account',
    'update_app_setting', 'finance_reversal', 'process_return'
  )),
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index idx_admin_actions_log_aksi on public.admin_actions_log(aksi);
create index idx_admin_actions_log_user_id on public.admin_actions_log(user_id);
create index idx_admin_actions_log_created_at on public.admin_actions_log(created_at desc);

alter table public.admin_actions_log enable row level security;

-- RLS: owner read-only, no client-side insert/update/delete
-- All inserts happen via security definer functions

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.jwt() -> 'app_metadata' ->> 'role' = 'owner';
$$;

create policy "owner can read admin actions log"
on public.admin_actions_log for select to authenticated
using (public.is_owner());

grant select on public.admin_actions_log to authenticated;

-- ============================================================
-- 2. require_owner() — Gate function, raise jika bukan owner
-- ============================================================

create or replace function public.require_owner()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'owner' then
    raise exception 'Aksi ini hanya dapat dilakukan oleh Owner.';
  end if;
end;
$$;

-- ============================================================
-- 3. log_admin_action() — Helper untuk insert audit log
--    Dipanggil dari RPC lain (security definer context)
-- ============================================================

create or replace function public.log_admin_action(
  p_aksi text,
  p_target text default null,
  p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_actions_log (user_id, user_role, aksi, target, detail)
  values (
    auth.uid(),
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'unknown'),
    p_aksi, p_target, p_detail
  );
end;
$$;

-- ============================================================
-- 4. Patch reverse_transaction — add require_owner() + audit log
--    (was: admin-only check, now: owner-only)
-- ============================================================

create or replace function public.reverse_transaction(
  p_id_transaksi uuid,
  p_catatan text default null
)
returns public.finance_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.finance_transactions;
  reversal public.finance_transactions;
  payment_receivable_id uuid;
  payment_amount numeric;
begin
  perform require_owner();

  select * into original
  from public.finance_transactions
  where id_transaksi = p_id_transaksi
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Transaksi tidak ditemukan';
  end if;
  if original.is_reversal then
    raise exception 'Tidak dapat reversal terhadap transaksi reversal';
  end if;

  perform 1 from public.finance_transactions
  where reversal_of = p_id_transaksi and is_reversal = true;
  if found then
    raise exception 'Transaksi ini sudah di-reversal';
  end if;

  insert into public.finance_transactions (
    arah, kategori, id_account, jumlah,
    source_module, source_type, source_id, catatan,
    is_reversal, reversal_of
  ) values (
    case when original.arah = 'Masuk' then 'Keluar' else 'Masuk' end,
    original.kategori, original.id_account, original.jumlah,
    original.source_module, original.source_type, original.source_id,
    coalesce(nullif(btrim(p_catatan), ''), 'Reversal: ' || original.kategori),
    true, p_id_transaksi
  )
  returning * into reversal;

  select fp.id_receivable, fp.jumlah
  into payment_receivable_id, payment_amount
  from public.finance_payments fp
  where fp.id_transaksi = original.id_transaksi;

  if found then
    update public.receivables
    set total_dibayar = greatest(total_dibayar - payment_amount, 0),
        status = case
          when greatest(total_dibayar - payment_amount, 0) >= total_tagihan then 'Lunas'
          else 'Belum Lunas'
        end
    where id_receivable = payment_receivable_id;
  end if;

  perform public.log_admin_action(
    'finance_reversal',
    p_id_transaksi::text,
    jsonb_build_object(
      'reversal_id', reversal.id_transaksi,
      'original_kategori', original.kategori,
      'original_jumlah', original.jumlah,
      'catatan', p_catatan
    )
  );

  return reversal;
end;
$$;

-- ============================================================
-- 5. Patch process_return — add require_owner() + audit log
--    (was: admin-only check, now: owner-only)
-- ============================================================

create or replace function public.process_return(
  p_source_type text,
  p_source_id text,
  p_alasan text,
  p_jumlah_refund numeric,
  p_id_account uuid default null
)
returns public.returns
language plpgsql
security definer
set search_path = ''
as $$
declare
  retur_record public.returns;
  sale_unit_id text;
  invoice_total numeric;
  received_total numeric;
  account_count integer;
  refund_account_id uuid;
begin
  perform require_owner();

  if nullif(btrim(p_alasan), '') is null then
    raise exception 'Alasan retur wajib diisi';
  end if;
  if p_jumlah_refund <= 0 then
    raise exception 'Jumlah refund harus lebih dari 0';
  end if;

  -- Validate source exists and get reference amount
  if p_source_type = 'Sales' then
    select id_unit, harga_jual into sale_unit_id, invoice_total
    from public.sales where id_invoice = p_source_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Invoice penjualan tidak ditemukan';
    end if;
    select
      coalesce(sum(case when arah = 'Masuk' then jumlah else -jumlah end), 0),
      count(distinct id_account)
    into received_total, account_count
    from public.finance_transactions
    where kategori = 'Penjualan Unit'
      and source_id = p_source_id;
  elsif p_source_type = 'Servis' then
    select total_biaya into invoice_total
    from public.service_orders where id_servis = p_source_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Order servis tidak ditemukan';
    end if;
    select
      coalesce(sum(case when arah = 'Masuk' then jumlah else -jumlah end), 0),
      count(distinct id_account)
    into received_total, account_count
    from public.finance_transactions
    where kategori = 'Pendapatan Servis'
      and source_id = p_source_id;
  else
    raise exception 'Tipe sumber retur tidak valid';
  end if;

  if exists (
    select 1 from public.returns
    where source_type = p_source_type and source_id = p_source_id and status = 'Selesai'
  ) then
    raise exception 'Sumber transaksi ini sudah diretur';
  end if;
  if p_jumlah_refund > least(invoice_total, received_total) then
    raise exception 'Refund tidak boleh melebihi pembayaran yang diterima';
  end if;

  refund_account_id := p_id_account;
  if refund_account_id is null then
    if account_count <> 1 then
      raise exception 'Pilih akun refund untuk transaksi dengan beberapa akun pembayaran';
    end if;
    select id_account into refund_account_id
    from public.finance_transactions
    where kategori = case when p_source_type = 'Sales' then 'Penjualan Unit' else 'Pendapatan Servis' end
      and source_id = p_source_id
      and arah = 'Masuk'
    order by created_at desc
    limit 1;
  end if;
  if not exists (
    select 1 from public.finance_accounts
    where id_account = refund_account_id and is_active = true
  ) then
    raise exception 'Akun refund tidak valid';
  end if;

  -- Create return record
  insert into public.returns (source_type, source_id, alasan, jumlah_refund, status)
  values (p_source_type, p_source_id, btrim(p_alasan), p_jumlah_refund, 'Selesai')
  returning * into retur_record;

  -- Finance: record refund as cash outflow
  perform public.record_finance_txn(
    'Keluar',
    case when p_source_type = 'Sales' then 'Retur Unit' else 'Retur Servis' end,
    refund_account_id, p_jumlah_refund,
    'Retur', p_source_type, retur_record.id_retur::text,
    'return:' || retur_record.id_retur::text
  );

  -- For unit returns: revert status + close warranty
  if p_source_type = 'Sales' and sale_unit_id is not null then
    perform set_config('app.returns_flow', 'on', true);
    update public.units set status = 'Ready' where id_unit = sale_unit_id;
    perform set_config('app.returns_flow', 'off', true);

    update public.warranty
    set status = 'Habis'
    where id_unit = sale_unit_id and status = 'Aktif';
  end if;

  perform public.log_admin_action(
    'process_return',
    retur_record.id_retur::text,
    jsonb_build_object(
      'source_type', p_source_type,
      'source_id', p_source_id,
      'alasan', p_alasan,
      'jumlah_refund', p_jumlah_refund
    )
  );

  return retur_record;
end;
$$;

-- ============================================================
-- 6. Update app_settings RLS — owner write, admin read, teknisi no access
-- ============================================================

drop policy if exists "authenticated users read app settings" on public.app_settings;
drop policy if exists "admins manage app settings" on public.app_settings;

create policy "admin and owner read app settings"
on public.app_settings for select to authenticated
using (public.current_user_role() in ('admin', 'owner'));

create policy "owner manage app settings"
on public.app_settings for all to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

-- ============================================================
-- 7. Seed new app_settings default
-- ============================================================

insert into public.app_settings (key, value) values ('stock_aging_alert_days', '90')
on conflict (key) do nothing;

-- ============================================================
-- 8. Grant execute permissions
-- ============================================================

revoke all on function public.require_owner() from public;
revoke all on function public.is_owner() from public;
revoke all on function public.log_admin_action(text, text, jsonb) from public;

grant execute on function public.require_owner() to authenticated;
grant execute on function public.is_owner() to authenticated;
-- log_admin_action is internal-only, called by security definer functions
-- No direct grant needed for client usage

-- Reverse & process_return grants already exist from Fase 5 migration
-- (grant execute on function public.reverse_transaction(uuid, text) to authenticated)
-- (grant execute on function public.process_return(text, text, text, numeric, uuid) to authenticated)
-- These are preserved by create or replace.