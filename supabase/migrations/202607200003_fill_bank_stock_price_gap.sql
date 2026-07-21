-- ============================================================
-- One-time fill gap: bank stock purchase cost vs finance
-- Formula per part:
--   expected = SUM(restock.qty_added) * bank_stock.modal_per_unit (current)
--   finance_net = SUM(Keluar) - SUM(Masuk) where source_module='BankStock'
--   gap = expected - finance_net
-- Insert ONE corrective txn if gap <> 0.
-- Idempotent: source_event_key = 'part-price-gap-fill:v1:' || id_part
--              (unique + ON CONFLICT DO NOTHING in record_finance_txn)
-- ============================================================

do $$
declare
  r record;
  kas_id uuid;
  expected numeric;
  finance_net numeric;
  gap numeric;
  event_key text;
  txn public.finance_transactions;
begin
  select id_account into kas_id
  from public.finance_accounts
  where nama = 'Kas Toko'
  limit 1;

  if kas_id is null then
    raise exception 'Akun Kas Toko tidak ditemukan';
  end if;

  for r in
    select
      bs.id_part,
      bs.modal_per_unit,
      coalesce((
        select sum(restock.qty_added)
        from public.bank_stock_restock restock
        where restock.id_part = bs.id_part
      ), 0) as qty_restocked,
      coalesce((
        select sum(
          case
            when ft.arah = 'Keluar' then ft.jumlah
            when ft.arah = 'Masuk' then -ft.jumlah
            else 0
          end
        )
        from public.finance_transactions ft
        where ft.source_module = 'BankStock'
          and ft.source_id = bs.id_part
      ), 0) as finance_net
    from public.bank_stock bs
  loop
    expected := r.qty_restocked * r.modal_per_unit;
    finance_net := r.finance_net;
    gap := expected - finance_net;

    if gap = 0 then
      continue;
    end if;

    event_key := 'part-price-gap-fill:v1:' || r.id_part;

    -- Skip if already filled (idempotent)
    if exists (
      select 1 from public.finance_transactions where source_event_key = event_key
    ) then
      continue;
    end if;

    select * into txn
    from public.record_finance_txn(
      case when gap > 0 then 'Keluar' else 'Masuk' end,
      'Pembelian Part',
      kas_id,
      abs(gap),
      'BankStock',
      'Part',
      r.id_part,
      event_key,
      format(
        'Koreksi historis harga part: expected %s, finance %s, gap %s (qty restock %s × modal %s)',
        expected::text,
        finance_net::text,
        gap::text,
        r.qty_restocked::text,
        r.modal_per_unit::text
      ),
      current_date
    );

    if txn.id_transaksi is null then
      raise exception 'Gagal insert koreksi untuk %', r.id_part;
    end if;

    raise notice 'Filled gap for %: expected=%, finance=%, gap=% (txn=%)',
      r.id_part, expected, finance_net, gap, txn.id_transaksi;
  end loop;
end;
$$;
