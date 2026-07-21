import assert from "node:assert/strict";
import {
  CUSTOMER_ID,
  TESTER_ID,
  applySaleUnitTestMigration,
  applySaleUnitTestReleaseFixMigration,
  completeUnitTest,
  createSale,
  createSaleUnitTestDatabase,
  setActor,
} from "./sale-unit-test-harness.mjs";

const EXISTING_TEST_ID = "44444444-4444-4444-8444-444444444444";
const acknowledgement =
  "Pembeli telah menyaksikan atau menerima ringkasan hasil pengujian di atas sebelum pembayaran dan memahami setiap catatan atau bagian yang tidak diuji. Persetujuan ini tidak menghapus, mengurangi, atau membatasi garansi BJ Laptop maupun hak konsumen berdasarkan hukum yang berlaku.";

async function installExistingRemoteShape(db) {
  await db.exec(`
    create table public.sale_unit_tests (
      id_sale_test uuid primary key default gen_random_uuid(),
      id_unit text not null references public.units(id_unit),
      test_results jsonb not null,
      blocking_checks jsonb not null,
      location text not null,
      tester_user_id uuid not null,
      tester_email text not null,
      acknowledgement_text text not null,
      confirmed_at timestamptz not null default now(),
      constraint sale_unit_tests_id_sale_test_unit_key unique (id_sale_test, id_unit)
    );
    alter table public.sales add column id_sale_test uuid;
    alter table public.sales add constraint sales_id_sale_test_unit_fkey
      foreign key (id_sale_test, id_unit)
      references public.sale_unit_tests(id_sale_test, id_unit);
    create unique index sales_id_sale_test_unique
      on public.sales(id_sale_test) where id_sale_test is not null;

    create function public.protect_sale_unit_tests()
    returns trigger language plpgsql set search_path = '' as $$
    begin
      raise exception 'old immutable trigger';
    end;
    $$;
    create trigger protect_sale_unit_tests
      before update or delete on public.sale_unit_tests
      for each row execute function public.protect_sale_unit_tests();

    create function public.require_sale_unit_test()
    returns trigger language plpgsql set search_path = '' as $$
    begin return new; end;
    $$;
    create trigger require_sale_unit_test
      before insert on public.sales
      for each row execute function public.require_sale_unit_test();

    create function public.create_sale(
      p_id_unit text, p_id_customer uuid, p_customer_name text, p_customer_wa text,
      p_customer_segment text, p_customer_source text, p_harga_jual numeric,
      p_channel text, p_metode_bayar text, p_tanggal_transaksi date,
      p_durasi_garansi_hari integer, p_test jsonb
    ) returns public.sales language plpgsql security definer set search_path = '' as $$
    begin raise exception 'old unrecorded implementation'; end;
    $$;

    alter table public.sale_unit_tests enable row level security;
    create policy "authenticated users read sale unit tests"
      on public.sale_unit_tests for select to authenticated using (true);
    grant select on public.sale_unit_tests to authenticated;

    insert into public.sale_unit_tests (
      id_sale_test, id_unit, test_results, blocking_checks, location,
      tester_user_id, tester_email, acknowledgement_text, confirmed_at
    ) values (
      '${EXISTING_TEST_ID}', 'UNIT-ADMIN',
      '${JSON.stringify(completeUnitTest.test_results)}'::jsonb,
      '${JSON.stringify(completeUnitTest.blocking_checks)}'::jsonb,
      'Remote payload', '${TESTER_ID}', 'remote@bjstock.test',
      '${acknowledgement}', '2026-07-14 12:00:00+00'
    );
    insert into public.sales (
      id_invoice, id_unit, id_customer, harga_jual, margin, channel, metode_bayar,
      tanggal_transaksi, durasi_garansi_hari, id_sale_test
    ) values (
      'INV-2607-900', 'UNIT-ADMIN', '${CUSTOMER_ID}', 4100000, 0,
      'Offline', 'Tunai', '2026-07-14', 30, '${EXISTING_TEST_ID}'
    );
  `);
}

const existingDb = await createSaleUnitTestDatabase({ applyMigration: false });
await existingDb.exec("reset role;");
await installExistingRemoteShape(existingDb);
const before = await existingDb.query(`
  select id_sale_test, id_unit, test_results, blocking_checks, location,
    tester_user_id, tester_email, acknowledgement_text,
    confirmed_at::text
  from public.sale_unit_tests where id_sale_test = $1
`, [EXISTING_TEST_ID]);

await applySaleUnitTestMigration(existingDb);
await applySaleUnitTestMigration(existingDb);
await applySaleUnitTestReleaseFixMigration(existingDb);

const after = await existingDb.query(`
  select id_sale_test, id_unit, test_results, blocking_checks, location,
    tester_user_id, tester_email, acknowledgement_text,
    confirmed_at::text
  from public.sale_unit_tests where id_sale_test = $1
`, [EXISTING_TEST_ID]);
assert.deepEqual(after.rows, before.rows, "reconciliation must preserve existing IDs and payloads");
assert.equal(
  (await existingDb.query("select id_sale_test from public.sales where id_invoice = 'INV-2607-900'"))
    .rows[0].id_sale_test,
  EXISTING_TEST_ID,
);
const reconciledShape = await existingDb.query(`
  select
    (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_sale') as overload_count,
    (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'sales' and column_name = 'id_sale_test') as nullable,
    (select count(*)::integer from pg_constraint
      where conrelid = 'public.sales'::regclass
        and conname = 'sales_id_sale_test_unit_fkey') as sale_fk_count,
    (select count(*)::integer from pg_constraint
      where conrelid = 'public.sale_unit_tests'::regclass
        and conname in (
          'sale_unit_tests_test_results_check',
          'sale_unit_tests_blocking_checks_check',
          'sale_unit_tests_acknowledgement_text_check'
        )) as validation_count,
    (select position('is_valid_sale_test_results' in pg_get_constraintdef(oid)) > 0
      from pg_constraint where conrelid = 'public.sale_unit_tests'::regclass
        and conname = 'sale_unit_tests_test_results_check') as result_check_exact,
    (select position('is_valid_sale_blocking_checks' in pg_get_constraintdef(oid)) > 0
      from pg_constraint where conrelid = 'public.sale_unit_tests'::regclass
        and conname = 'sale_unit_tests_blocking_checks_check') as blocker_check_exact,
    (select position('FOREIGN KEY (id_sale_test, id_unit)' in pg_get_constraintdef(oid)) > 0
      from pg_constraint where conrelid = 'public.sales'::regclass
        and conname = 'sales_id_sale_test_unit_fkey') as composite_fk_exact
`);
assert.deepEqual(reconciledShape.rows[0], {
  overload_count: 1,
  nullable: "YES",
  sale_fk_count: 1,
  validation_count: 3,
  result_check_exact: true,
  blocker_check_exact: true,
  composite_fk_exact: true,
});

await existingDb.exec("set role app_user;");
await setActor(existingDb, "owner", "owner@bjstock.test");
const reconciledSale = await createSale(existingDb, "UNIT-OWNER", completeUnitTest, {
  paymentMethod: "Cicilan",
});
assert.equal(Number(reconciledSale.rows[0].margin), 1500000);
assert.equal(
  (await existingDb.query("select total_tagihan from public.receivables where source_id = $1", [reconciledSale.rows[0].id_invoice])).rows[0].total_tagihan,
  "4000000",
);
await setActor(existingDb, "admin");
const reconciledCashSale = await createSale(existingDb, "UNIT-INVALID", completeUnitTest);
const reconciledSideEffects = await existingDb.query(`
  select
    (select nama from public.customers where id_customer = $1) as customer_name,
    (select status from public.units where id_unit = 'UNIT-INVALID') as unit_status,
    (select tanggal_berakhir::text from public.warranty where id_unit = 'UNIT-INVALID') as warranty_end,
    (select sum(jumlah) from public.finance_transactions where source_id = $2) as finance_total
`, [CUSTOMER_ID, reconciledCashSale.rows[0].id_invoice]);
assert.deepEqual(reconciledSideEffects.rows[0], {
  customer_name: "Customer Tetap",
  unit_status: "Terjual",
  warranty_end: "2026-08-28",
  finance_total: "4000000",
});
assert.equal(Number(reconciledCashSale.rows[0].margin), 2000000);
await existingDb.close();

const freshDb = await createSaleUnitTestDatabase({ applyMigration: false });
await freshDb.exec("reset role;");
await freshDb.query(`
  insert into public.sales (
    id_invoice, id_unit, id_customer, harga_jual, margin, channel, metode_bayar,
    tanggal_transaksi, durasi_garansi_hari
  ) values (
    'INV-HISTORICAL', 'UNIT-ADMIN', $1, 3900000, 0,
    'Offline', 'Tunai', '2026-07-13', 30
  )
`, [CUSTOMER_ID]);
const historicalBefore = await freshDb.query(`
  select id_invoice, id_unit, id_customer, harga_jual, margin, channel,
    metode_bayar, tanggal_transaksi::text, durasi_garansi_hari
  from public.sales where id_invoice = 'INV-HISTORICAL'
`);
await applySaleUnitTestMigration(freshDb);
await applySaleUnitTestMigration(freshDb);
await applySaleUnitTestReleaseFixMigration(freshDb);
assert.equal(
  (await freshDb.query("select id_sale_test from public.sales where id_invoice = 'INV-HISTORICAL'"))
    .rows[0].id_sale_test,
  null,
);
const historicalAfter = await freshDb.query(`
  select id_invoice, id_unit, id_customer, harga_jual, margin, channel,
    metode_bayar, tanggal_transaksi::text, durasi_garansi_hari
  from public.sales where id_invoice = 'INV-HISTORICAL'
`);
assert.deepEqual(historicalAfter.rows, historicalBefore.rows);
await freshDb.exec("set role app_user;");
await setActor(freshDb, "admin");
const freshSale = await createSale(freshDb, "UNIT-OWNER", completeUnitTest);
assert.ok(freshSale.rows[0].id_sale_test);
await freshDb.close();

console.log("sale unit test reconciliation migration tests passed");
