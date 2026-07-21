import assert from "node:assert/strict";
import {
  ACTIVE_ACCOUNT_ID,
  OWNER_ID,
  addClaimService,
  createWarrantyDatabase,
  replaceWarrantyUnit,
  seedWarrantySale,
  setActor,
} from "./warranty-replacement-harness.mjs";
import { completeUnitTest } from "./sale-unit-test-harness.mjs";

const db = await createWarrantyDatabase();
await setActor(db, "owner");
const fixture = await seedWarrantySale(db, { name: "CHAIN" });
const originalSaleTestId = "30000000-0000-4000-8000-000000000001";
await db.query(
  `insert into public.sale_unit_tests (
     id_sale_test, id_unit, test_results, blocking_checks, location,
     tester_user_id, tester_email, acknowledgement_text, confirmed_at
   ) values (
     $1, $2, $3::jsonb, $4::jsonb, 'Toko utama', $5, 'owner@bjstock.test',
     'Pembeli telah menyaksikan atau menerima ringkasan hasil pengujian di atas sebelum pembayaran dan memahami setiap catatan atau bagian yang tidak diuji. Persetujuan ini tidak menghapus, mengurangi, atau membatasi garansi BJ Laptop maupun hak konsumen berdasarkan hukum yang berlaku.',
     now()
   )`,
  [
    originalSaleTestId,
    fixture.oldUnitId,
    JSON.stringify(completeUnitTest.test_results),
    JSON.stringify(completeUnitTest.blocking_checks),
    OWNER_ID,
  ],
);
await db.query(
  "update public.sales set id_sale_test = $1 where id_invoice = $2",
  [originalSaleTestId, fixture.invoiceId],
);

const equalRequest = {
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
  invoiceId: fixture.invoiceId,
  claimId: fixture.claimId,
  replacementUnitId: fixture.replacementUnitId,
  replacementValue: 5000000,
  replacementDate: "2026-07-14",
  reason: "Penggantian setara",
};
const equalResult = await replaceWarrantyUnit(db, equalRequest);
const equalEvent = equalResult.rows[0];
assert.equal(equalEvent.sequence_no, 1);
assert.equal(Number(equalEvent.price_difference), 0);
assert.equal(equalEvent.id_finance_transaction, null);
assert.equal(equalEvent.grace_days, 7);

const replay = await replaceWarrantyUnit(db, equalRequest);
assert.equal(replay.rows[0].id_replacement, equalEvent.id_replacement);
assert.equal((await db.query("select count(*)::integer as count from public.warranty_replacements")).rows[0].count, 1);
await assert.rejects(
  () => replaceWarrantyUnit(db, { ...equalRequest, reason: "Payload berbeda" }),
  /idempotency key sudah digunakan dengan payload berbeda/i,
);

await db.query(
  `insert into public.units (id_unit, brand, model, modal_awal, total_modal, status, tanggal_masuk)
   values ('NEW-CHAIN-2', 'Lenovo', 'Top-up', 4000000, 4000000, 'Listed', '2026-06-20')`,
);
const secondClaim = await addClaimService(db, {
  name: "CHAIN-2",
  unitId: fixture.replacementUnitId,
  warrantyId: equalEvent.new_warranty_id,
  claimDate: "2026-07-15",
});
const topUpRequest = {
  idempotencyKey: "10000000-0000-4000-8000-000000000002",
  invoiceId: fixture.invoiceId,
  claimId: secondClaim.claimId,
  replacementUnitId: "NEW-CHAIN-2",
  replacementValue: 6000000,
  replacementDate: "2026-07-15",
  reason: "Upgrade pengganti",
  accountId: ACTIVE_ACCOUNT_ID,
};
const topUpResult = await replaceWarrantyUnit(db, topUpRequest);
assert.equal(topUpResult.rows[0].sequence_no, 2);
assert.equal(Number(topUpResult.rows[0].price_difference), 1000000);

await db.query(
  `insert into public.units (id_unit, brand, model, modal_awal, total_modal, status, tanggal_masuk)
   values ('NEW-CHAIN-3', 'Dell', 'Refund', 4200000, 4200000, 'Ready', '2026-06-25')`,
);
const thirdClaim = await addClaimService(db, {
  name: "CHAIN-3",
  unitId: "NEW-CHAIN-2",
  warrantyId: topUpResult.rows[0].new_warranty_id,
  claimDate: "2026-07-16",
});
const refundResult = await replaceWarrantyUnit(db, {
  idempotencyKey: "10000000-0000-4000-8000-000000000003",
  invoiceId: fixture.invoiceId,
  claimId: thirdClaim.claimId,
  replacementUnitId: "NEW-CHAIN-3",
  replacementValue: 5500000,
  replacementDate: "2026-07-16",
  reason: "Pengganti lebih murah",
  accountId: ACTIVE_ACCOUNT_ID,
});
assert.equal(refundResult.rows[0].sequence_no, 3);
assert.equal(Number(refundResult.rows[0].price_difference), -500000);
const lateReplay = await replaceWarrantyUnit(db, equalRequest);
assert.equal(lateReplay.rows[0].id_replacement, equalEvent.id_replacement);
const topUpReplay = await replaceWarrantyUnit(db, topUpRequest);
assert.equal(topUpReplay.rows[0].id_replacement, topUpResult.rows[0].id_replacement);

const finance = await db.query(`
  select arah, jumlah, source_module, kategori
  from public.finance_transactions
  where kategori = 'Selisih Penggantian Unit'
  order by tanggal, arah desc
`);
assert.deepEqual(finance.rows, [
  { arah: "Masuk", jumlah: "1000000", source_module: "Warranty", kategori: "Selisih Penggantian Unit" },
  { arah: "Keluar", jumlah: "500000", source_module: "Warranty", kategori: "Selisih Penggantian Unit" },
]);

const current = await db.query(
  `select state.*, state.current_warranty_end::text as current_warranty_end_text
   from public.sales_current_state state where id_invoice = $1`,
  [fixture.invoiceId],
);
assert.equal(current.rows[0].current_unit_id, "NEW-CHAIN-3");
assert.equal(Number(current.rows[0].current_transaction_value), 5500000);
assert.equal(Number(current.rows[0].current_unit_modal), 4200000);
assert.equal(Number(current.rows[0].current_margin), 1300000);
assert.equal(current.rows[0].replacement_count, 3);
assert.equal(current.rows[0].current_warranty_id, refundResult.rows[0].new_warranty_id);
assert.equal(current.rows[0].current_warranty_status, "Aktif");
assert.equal(current.rows[0].current_warranty_end_text, "2026-07-23");
const warranties = await db.query(`
  select status, count(*)::integer as count
  from public.warranty group by status order by status
`);
assert.deepEqual(warranties.rows, [
  { status: "Aktif", count: 1 },
  { status: "Habis", count: 3 },
]);

const units = await db.query(
  `select id_unit, status from public.units
   where id_unit in ($1, $2, 'NEW-CHAIN-2', 'NEW-CHAIN-3') order by id_unit`,
  [fixture.oldUnitId, fixture.replacementUnitId],
);
assert.deepEqual(units.rows, [
  { id_unit: "NEW-CHAIN", status: "QC" },
  { id_unit: "NEW-CHAIN-2", status: "QC" },
  { id_unit: "NEW-CHAIN-3", status: "Terjual" },
  { id_unit: "OLD-CHAIN", status: "QC" },
]);

const protectedReturnStateQuery = `
  select
    (select status from public.sales where id_invoice = $1) as sale_status,
    (select status from public.units where id_unit = 'NEW-CHAIN-3') as current_unit_status,
    (select status from public.warranty where id_garansi = $2) as current_warranty_status,
    (select count(*)::integer from public.returns where source_type = 'Sales' and source_id = $1) as returns,
    (select count(*)::integer from public.finance_transactions where source_module = 'Retur' and source_type = 'Sales') as return_finance,
    (select count(*)::integer from public.warranty_replacements where id_invoice = $1) as replacements
`;
const beforeReturnAttempt = await db.query(protectedReturnStateQuery, [
  fixture.invoiceId,
  refundResult.rows[0].new_warranty_id,
]);
await assert.rejects(
  () => db.query(
    "select public.process_return('Sales', $1, 'Retur tidak sah', 5500000, $2)",
    [fixture.invoiceId, ACTIVE_ACCOUNT_ID],
  ),
  /pernah mengalami penggantian unit.*tidak dapat diretur/i,
);
await assert.rejects(
  () => db.query(
    `insert into public.returns (source_type, source_id, alasan, jumlah_refund, status)
     values ('Sales', $1, 'Retur tidak sah', 5500000, 'Selesai')`,
    [fixture.invoiceId],
  ),
  /pernah mengalami penggantian unit.*tidak dapat diretur/i,
);
const afterReturnAttempt = await db.query(protectedReturnStateQuery, [
  fixture.invoiceId,
  refundResult.rows[0].new_warranty_id,
]);
assert.deepEqual(afterReturnAttempt.rows[0], beforeReturnAttempt.rows[0]);

const service = await db.query(
  `select status, diagnosa, tindakan,
     tanggal_selesai::text as tanggal_selesai,
     tanggal_diambil::text as tanggal_diambil
   from public.service_orders where id_servis = $1`,
  [fixture.serviceId],
);
assert.equal(service.rows[0].status, "Diambil");
assert.equal(service.rows[0].diagnosa, "Kerusakan terverifikasi");
assert.match(service.rows[0].tindakan, /Pemeriksaan awal/);
assert.match(service.rows[0].tindakan, /Penggantian unit/);
assert.equal(service.rows[0].tanggal_selesai, "2026-07-14");
assert.equal(service.rows[0].tanggal_diambil, "2026-07-14");

const originalSale = await db.query(
  "select id_unit, id_sale_test, harga_jual, margin from public.sales where id_invoice = $1",
  [fixture.invoiceId],
);
assert.deepEqual(originalSale.rows[0], {
  id_unit: fixture.oldUnitId,
  id_sale_test: originalSaleTestId,
  harga_jual: "5000000",
  margin: "2000000",
});
assert.equal(
  (await db.query("select id_unit from public.sale_unit_tests where id_sale_test = $1", [originalSaleTestId])).rows[0].id_unit,
  fixture.oldUnitId,
);
assert.equal(current.rows[0].current_unit_id, "NEW-CHAIN-3");
assert.equal((await db.query("select count(*)::integer as count from public.sales")).rows[0].count, 1);
assert.equal(
  (await db.query("select count(*)::integer as count from public.finance_transactions where kategori = 'Penjualan Unit'")).rows[0].count,
  1,
);

const report = await db.query("select * from public.get_margin_report('2026-07-01', '2026-07-31')");
assert.deepEqual(report.rows, [{
  brand: "Dell",
  unit_terjual: 1,
  total_revenue: "5500000",
  total_margin: "1300000",
  margin_rata_rata: "1300000.000000000000",
}]);

const profitLoss = await db.query("select * from public.get_profit_loss('2026-07-01', '2026-07-31')");
assert.deepEqual(profitLoss.rows, [{
  pendapatan_sales: "5500000",
  pendapatan_servis: "0",
  retur: "0",
  hpp_unit: "4200000",
  biaya_part_servis: "0",
  operasional: "0",
  laba_bersih: "1300000",
}]);

const turnover = await db.query("select * from public.get_stock_turnover('2026-07-01', '2026-07-31')");
assert.deepEqual(turnover.rows, [{
  brand: "Dell",
  unit_terjual: 1,
  rata_rata_hari: "6.0",
}]);

await db.query(
  "update public.service_orders set biaya_jasa = 100000 where id_customer = '33333333-3333-4333-8333-333333333333'",
);
const leadConversion = await db.query("select * from public.get_lead_conversion('2026-07-01', '2026-07-31')");
assert.deepEqual(leadConversion.rows, [{
  sumber_lead: "Referral",
  jumlah_customer: 1,
  konversi_sales: 1,
  konversi_servis: 3,
  total_revenue: "5800000",
}]);

await assert.rejects(
  () => db.query("select public.cancel_sale($1, 'Tidak boleh dibatalkan')", [fixture.invoiceId]),
  /pernah mengalami penggantian unit/i,
);
const protectedInvoice = await db.query(
  `select
     (select status from public.sales where id_invoice = $1) as sale_status,
     (select status from public.units where id_unit = 'NEW-CHAIN-3') as current_unit_status,
     (select count(*)::integer from public.warranty_replacements where id_invoice = $1) as replacements,
     (select count(*)::integer from public.finance_transactions where is_reversal = true and source_id = $1) as reversals`,
  [fixture.invoiceId],
);
assert.deepEqual(protectedInvoice.rows[0], {
  sale_status: "Aktif",
  current_unit_status: "Terjual",
  replacements: 3,
  reversals: 0,
});

const cancellable = await seedWarrantySale(db, { name: "CANCEL-ALLOWED" });
await db.query(
  "insert into public.receivables (source_type, source_id) values ('Sales', $1)",
  [cancellable.invoiceId],
);
const cancelledSale = await db.query(
  "select id_invoice, status from public.cancel_sale($1, 'Pembatalan biasa')",
  [cancellable.invoiceId],
);
assert.deepEqual(cancelledSale.rows[0], { id_invoice: cancellable.invoiceId, status: "Dibatalkan" });
const cancellationState = await db.query(
  `select
     (select status from public.units where id_unit = $1) as unit_status,
     (select status from public.warranty where id_garansi = $2) as warranty_status,
     (select status from public.receivables where source_type = 'Sales' and source_id = $3) as receivable_status,
     (select count(*)::integer from public.finance_transactions where is_reversal = true and source_id = $3) as reversals,
     (select count(*)::integer from public.admin_actions_log
       where target = $3 and detail ->> 'aksi' = 'cancel_sale') as audit_rows`,
  [cancellable.oldUnitId, cancellable.warrantyId, cancellable.invoiceId],
);
assert.deepEqual(cancellationState.rows[0], {
  unit_status: "Ready",
  warranty_status: "Habis",
  receivable_status: "Dibatalkan",
  reversals: 1,
  audit_rows: 1,
});
assert.equal((await db.query("select count(*)::integer as count from public.admin_actions_log where aksi = 'warranty_unit_replacement'")).rows[0].count, 3);

await db.exec(`
  create role app_user;
  grant authenticated to app_user;
  set role app_user;
`);
await setActor(db, "teknisi");
assert.equal((await db.query("select count(*)::integer as count from public.warranty_replacements")).rows[0].count, 3);
const privileges = await db.query(`
  select
    has_table_privilege(current_user, 'public.warranty_replacements', 'SELECT') as can_select,
    has_table_privilege(current_user, 'public.warranty_replacements', 'INSERT') as can_insert,
    has_table_privilege(current_user, 'public.warranty_replacements', 'UPDATE') as can_update,
    has_table_privilege(current_user, 'public.warranty_replacements', 'DELETE') as can_delete
`);
assert.deepEqual(privileges.rows[0], { can_select: true, can_insert: false, can_update: false, can_delete: false });
await db.exec("reset role");
await assert.rejects(
  () => db.query("update public.warranty_replacements set reason = 'ubah' where id_replacement = $1", [equalEvent.id_replacement]),
  /append-only/i,
);

await db.close();
console.log("warranty replacement chain migration tests passed");
