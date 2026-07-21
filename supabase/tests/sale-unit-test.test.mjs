import assert from "node:assert/strict";
import {
  TESTER_ID,
  completeUnitTest,
  createSale,
  createSaleUnitTestDatabase,
  setActor,
} from "./sale-unit-test-harness.mjs";

const db = await createSaleUnitTestDatabase();

// Given a complete, non-blocked test acknowledged by the buyer
await setActor(db, "admin");
// When an admin confirms the sale
const adminSale = await createSale(db, "UNIT-ADMIN", completeUnitTest, {
  customerId: null,
  customerName: "Nama tidak menimpa",
  customerWa: "081234567890",
});
// Then the immutable test and every existing sale side effect are committed together
assert.equal(adminSale.rows[0].id_invoice, "INV-2607-001");
assert.equal(Number(adminSale.rows[0].margin), 1000000);
assert.ok(adminSale.rows[0].id_sale_test);
const stored = await db.query(`
  select sut.*, sut.confirmed_at is not null as has_confirmed_at
  from public.sale_unit_tests sut
  join public.sales s on s.id_sale_test = sut.id_sale_test
  where s.id_invoice = 'INV-2607-001'
`);
assert.equal(stored.rows[0].tester_user_id, TESTER_ID);
assert.equal(stored.rows[0].tester_email, "tester@bjstock.test");
assert.equal(stored.rows[0].id_unit, "UNIT-ADMIN");
assert.equal(stored.rows[0].location, "Toko utama");
assert.equal(
  stored.rows[0].acknowledgement_text,
  "Pembeli telah menyaksikan atau menerima ringkasan hasil pengujian di atas sebelum pembayaran dan memahami setiap catatan atau bagian yang tidak diuji. Persetujuan ini tidak menghapus, mengurangi, atau membatasi garansi BJ Laptop maupun hak konsumen berdasarkan hukum yang berlaku.",
);
assert.equal(stored.rows[0].has_confirmed_at, true);
assert.deepEqual(stored.rows[0].test_results, completeUnitTest.test_results);
assert.deepEqual(stored.rows[0].blocking_checks, completeUnitTest.blocking_checks);
const sideEffects = await db.query(`
  select
    (select status from public.units where id_unit = 'UNIT-ADMIN') as unit_status,
    (select tanggal_berakhir::text from public.warranty where id_unit = 'UNIT-ADMIN') as warranty_end,
    (select sum(jumlah) from public.finance_transactions where source_id = 'INV-2607-001') as finance_total,
    (select count(*)::integer from public.customers where kontak_wa = '6281234567890') as customer_count,
    (select min(nama) from public.customers where kontak_wa = '6281234567890') as customer_name
`);
assert.deepEqual(sideEffects.rows[0], {
  unit_status: "Terjual",
  warranty_end: "2026-08-28",
  finance_total: "4000000",
  customer_count: 1,
  customer_name: "Customer Tetap",
});

// Given the owner role has the same operational sale rights as admin
await setActor(db, "owner", "owner@bjstock.test");
// When the owner confirms another valid sale
const ownerUnitTest = structuredClone(completeUnitTest);
ownerUnitTest.test_results.usb_ports = { status: "Tidak Diuji", note: "x".repeat(160) };
ownerUnitTest.test_results.display_output = { status: "Lulus", note: "  Normal  " };
const ownerSale = await createSale(db, "UNIT-OWNER", ownerUnitTest, {
  salePrice: 3500000,
  paymentMethod: "Cicilan",
});
// Then the sale succeeds and keeps the existing receivable behavior
assert.equal(ownerSale.rows[0].id_invoice, "INV-2607-002");
assert.equal(
  (await db.query(`
    select char_length(sut.test_results -> 'usb_ports' ->> 'note') as note_length
    from public.sale_unit_tests sut
    join public.sales s on s.id_sale_test = sut.id_sale_test
    where s.id_invoice = 'INV-2607-002'
  `)).rows[0].note_length,
  160,
);
assert.equal(
  (await db.query(`
    select sut.test_results -> 'display_output' ->> 'note' as note
    from public.sale_unit_tests sut
    join public.sales s on s.id_sale_test = sut.id_sale_test
    where s.id_invoice = 'INV-2607-002'
  `)).rows[0].note,
  "Normal",
);
assert.equal(
  (await db.query("select total_tagihan from public.receivables where source_id = 'INV-2607-002'"))
    .rows[0].total_tagihan,
  "3500000",
);

// Given a technician cannot create sales
await setActor(db, "teknisi");
// When the technician calls the RPC
// Then the database rejects the operation
await assert.rejects(
  () => createSale(db, "UNIT-INVALID", completeUnitTest),
  /Hanya admin dan owner/,
);

await setActor(db, "admin");
const invalidCases = [
  ["missing category", (test) => delete test.test_results.included_accessories],
  ["extra category", (test) => { test.test_results.extra = { status: "Lulus" }; }],
  ["invalid status", (test) => { test.test_results.usb_ports.status = "Rusak"; }],
  ["null status", (test) => { test.test_results.usb_ports.status = null; }],
  ["long note", (test) => { test.test_results.usb_ports.note = "x".repeat(161); }],
  ["missing non-pass note", (test) => { test.test_results.usb_ports.status = "Tidak Diuji"; }],
  ["true blocker", (test) => { test.blocking_checks.mdm_lock = true; }],
  ["missing blocker", (test) => delete test.blocking_checks.mdm_lock],
  ["extra blocker", (test) => { test.blocking_checks.extra = false; }],
  ["non-boolean blocker", (test) => { test.blocking_checks.mdm_lock = "false"; }],
  ["blank location", (test) => { test.location = "   "; }],
  ["long location", (test) => { test.location = "x".repeat(121); }],
  ["missing acknowledgement", (test) => { test.acknowledged = false; }],
  ["client tester identity", (test) => { test.tester_email = "forged@example.test"; }],
];
for (const [name, mutate] of invalidCases) {
  // Given one required domain invariant is violated
  const invalidTest = structuredClone(completeUnitTest);
  mutate(invalidTest);
  // When sale confirmation is attempted
  // Then no sale can be created
  await assert.rejects(
    () => createSale(db, "UNIT-INVALID", invalidTest),
    /Data pengujian unit tidak valid/,
    name,
  );
}

for (const blockerKey of Object.keys(completeUnitTest.blocking_checks)) {
  const blockedTest = structuredClone(completeUnitTest);
  blockedTest.blocking_checks[blockerKey] = true;
  await assert.rejects(
    () => createSale(db, "UNIT-INVALID", blockedTest),
    /hard blocker .* harus Lulus/,
    blockerKey,
  );
}

// Given a valid test but an invalid sale target
const beforeAtomicFailure = await db.query("select count(*)::integer as count from public.sale_unit_tests");
// When a later sale validation fails
await assert.rejects(
  () => createSale(db, "UNIT-NOT-FOUND", completeUnitTest),
  /Unit tidak ditemukan/,
);
// Then the earlier test insert rolls back with the sale
const afterAtomicFailure = await db.query("select count(*)::integer as count from public.sale_unit_tests");
assert.equal(afterAtomicFailure.rows[0].count, beforeAtomicFailure.rows[0].count);

await db.exec(`
  reset role;
  create function public.fail_atomic_sale() returns trigger
  language plpgsql set search_path = '' as $$
  begin
    if new.id_unit = 'UNIT-INVALID' then raise exception 'forced sale failure'; end if;
    return new;
  end;
  $$;
  create trigger fail_atomic_sale before insert on public.sales
    for each row execute function public.fail_atomic_sale();
  set role app_user;
`);
await setActor(db, "admin");
const beforeAtomicSideEffects = await db.query(`
  select
    (select count(*)::integer from public.sale_unit_tests) as tests,
    (select count(*)::integer from public.sales) as sales,
    (select count(*)::integer from public.customers) as customers,
    (select count(*)::integer from public.warranty) as warranties,
    (select count(*)::integer from public.finance_transactions) as finance,
    (select count(*)::integer from public.receivables) as receivables,
    (select status from public.units where id_unit = 'UNIT-INVALID') as unit_status
`);
await assert.rejects(() => createSale(db, "UNIT-INVALID", completeUnitTest, {
  customerId: null,
  customerName: "Customer rollback",
  customerWa: "6289999999999",
}), /forced sale failure/);
const afterAtomicSideEffects = await db.query(`
  select
    (select count(*)::integer from public.sale_unit_tests) as tests,
    (select count(*)::integer from public.sales) as sales,
    (select count(*)::integer from public.customers) as customers,
    (select count(*)::integer from public.warranty) as warranties,
    (select count(*)::integer from public.finance_transactions) as finance,
    (select count(*)::integer from public.receivables) as receivables,
    (select status from public.units where id_unit = 'UNIT-INVALID') as unit_status
`);
assert.deepEqual(afterAtomicSideEffects.rows[0], beforeAtomicSideEffects.rows[0]);
await db.exec(`
  reset role;
  drop trigger fail_atomic_sale on public.sales;
  drop function public.fail_atomic_sale();
`);

await db.exec("reset role;");
await assert.rejects(
  () => db.query(`
    insert into public.sale_unit_tests (
      id_unit, test_results, blocking_checks, location, tester_user_id,
      tester_email, acknowledgement_text
    )
    select id_unit, '{}'::jsonb, blocking_checks, location, tester_user_id,
      tester_email, acknowledgement_text
    from public.sale_unit_tests where id_sale_test = $1
  `, [stored.rows[0].id_sale_test]),
  /sale_unit_tests_test_results_check/,
);
await assert.rejects(
  () => db.query(`
    insert into public.sale_unit_tests (
      id_unit, test_results, blocking_checks, location, tester_user_id,
      tester_email, acknowledgement_text
    )
    select id_unit, test_results, '{}'::jsonb, location, tester_user_id,
      tester_email, acknowledgement_text
    from public.sale_unit_tests where id_sale_test = $1
  `, [stored.rows[0].id_sale_test]),
  /sale_unit_tests_blocking_checks_check/,
);
// Given the sales table remains nullable only for historical rows
// When a future direct insert omits the test link
// Then the insert gate rejects it
await assert.rejects(
  () => db.query(`
    insert into public.sales (
      id_invoice, id_unit, id_customer, harga_jual, margin, channel, metode_bayar,
      tanggal_transaksi, durasi_garansi_hari
    ) values (
      'INV-BYPASS', 'UNIT-INVALID', '33333333-3333-4333-8333-333333333333',
      3000000, 0, 'Offline', 'Tunai', '2026-07-14', 30
    )
  `),
  /Pengujian unit wajib lengkap/,
);

const saleTestId = stored.rows[0].id_sale_test;
const unlinkedTest = await db.query(`
  insert into public.sale_unit_tests (
    id_unit, test_results, blocking_checks, location, tester_user_id,
    tester_email, acknowledgement_text, confirmed_at
  )
  select
    id_unit, test_results, blocking_checks, location, tester_user_id,
    tester_email, acknowledgement_text, confirmed_at
  from public.sale_unit_tests
  where id_sale_test = $1
  returning id_sale_test
`, [saleTestId]);
await assert.rejects(
  () => db.query(`
    insert into public.sales (
      id_invoice, id_unit, id_customer, harga_jual, margin, channel, metode_bayar,
      tanggal_transaksi, durasi_garansi_hari, id_sale_test
    ) values (
      'INV-MISMATCH', 'UNIT-INVALID', '33333333-3333-4333-8333-333333333333',
      3000000, 0, 'Offline', 'Tunai', '2026-07-14', 30, $1
    )
  `, [unlinkedTest.rows[0].id_sale_test]),
  /sales_id_sale_test_unit_fkey/,
);
// Given a test is linked to a final sale
// When any caller tries to update or delete it
// Then database-level immutability rejects both operations
await assert.rejects(
  () => db.query("update public.sale_unit_tests set location = 'Lain' where id_sale_test = $1", [saleTestId]),
  /tidak dapat diubah atau dihapus/,
);
await assert.rejects(
  () => db.query("delete from public.sale_unit_tests where id_sale_test = $1", [saleTestId]),
  /tidak dapat diubah atau dihapus/,
);

const overloads = await db.query(`
  select pg_get_function_identity_arguments(p.oid) as arguments
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_sale'
`);
assert.equal(overloads.rows.length, 1);
assert.match(overloads.rows[0].arguments, /p_test jsonb$/);
assert.equal(
  (await db.query(`select to_regprocedure(
    'public.create_sale(text,uuid,text,text,text,text,numeric,text,text,date)'
  ) is null as dropped`)).rows[0].dropped,
  true,
);
assert.equal(
  (await db.query(`select to_regprocedure(
    'public.create_sale(text,uuid,text,text,text,text,numeric,text,text,date,integer)'
  ) is null as dropped`)).rows[0].dropped,
  true,
);

// Given invoice readers are authenticated operational roles
const privileges = await db.query(`
  select
    has_function_privilege(
      'authenticated',
      'public.create_sale(text,uuid,text,text,text,text,numeric,text,text,date,integer,jsonb)',
      'EXECUTE'
    ) as authenticated_execute,
    has_function_privilege(
      'anon',
      'public.create_sale(text,uuid,text,text,text,text,numeric,text,text,date,integer,jsonb)',
      'EXECUTE'
    ) as anon_execute,
    has_table_privilege('authenticated', 'public.sale_unit_tests', 'INSERT') as authenticated_insert_test,
    has_table_privilege('authenticated', 'public.sales', 'INSERT') as authenticated_insert_sale
`);
assert.deepEqual(privileges.rows[0], {
  authenticated_execute: true,
  anon_execute: false,
  authenticated_insert_test: false,
  authenticated_insert_sale: false,
});

await db.exec("set role app_user;");
await setActor(db, "teknisi");
// When a technician reads sale test history
// Then the same read access as sales is available
assert.equal((await db.query("select count(*)::integer as count from public.sale_unit_tests")).rows[0].count, 0);
await db.exec("reset role; set role anon;");
// Given an anonymous caller
// When sale test history is queried
// Then no table privilege exposes it
await assert.rejects(() => db.query("select * from public.sale_unit_tests"), /permission denied/);

await db.exec("reset role;");
await db.close();
console.log("sale unit test contract migration tests passed");
