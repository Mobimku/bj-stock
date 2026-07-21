import assert from "node:assert/strict";
import {
  createWarrantyDatabase,
  setActor,
} from "./warranty-replacement-harness.mjs";

const db = await createWarrantyDatabase({ includeHistoricalSale: true });
await setActor(db, "owner");

const currentState = await db.query(`
  select id_customer, original_margin, current_unit_modal, current_margin
  from public.sales_current_state
  where id_invoice = 'INV-HISTORICAL-NULL'
`);
assert.deepEqual(currentState.rows, [{
  id_customer: null,
  original_margin: null,
  current_unit_modal: "2000000",
  current_margin: "1000000",
}]);

const marginReport = await db.query(
  "select * from public.get_margin_report('2026-07-10', '2026-07-10')",
);
assert.deepEqual(marginReport.rows, [{
  brand: "Acer",
  unit_terjual: 1,
  total_revenue: "3000000",
  total_margin: "1000000",
  margin_rata_rata: "1000000.000000000000",
}]);

const profitLoss = await db.query(
  "select * from public.get_profit_loss('2026-07-10', '2026-07-10')",
);
assert.deepEqual(profitLoss.rows, [{
  pendapatan_sales: "3000000",
  pendapatan_servis: "0",
  retur: "0",
  hpp_unit: "2000000",
  biaya_part_servis: "0",
  operasional: "0",
  laba_bersih: "1000000",
}]);

const historicalNullability = await db.query(`
  select column_name, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sales'
    and column_name in ('id_customer', 'margin')
  order by column_name
`);
assert.deepEqual(historicalNullability.rows, [
  { column_name: "id_customer", is_nullable: "YES" },
  { column_name: "margin", is_nullable: "YES" },
]);

const saleTestPolicy = await db.query(`
  select qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'sale_unit_tests'
    and policyname = 'admin and owner read sale unit tests'
`);
assert.equal(saleTestPolicy.rows.length, 1);
assert.match(saleTestPolicy.rows[0].qual, /admin/);
assert.match(saleTestPolicy.rows[0].qual, /owner/);
assert.doesNotMatch(saleTestPolicy.rows[0].qual, /teknisi/);

await db.exec(`
  insert into public.units (
    id_unit, brand, model, modal_awal, total_modal, status, tanggal_masuk
  ) values (
    'DIRECT-SALE-GATE', 'Acer', 'Gate', 1500000, 1500000, 'Ready', '2026-07-15'
  )
`);
await assert.rejects(
  () => db.query(`
    insert into public.sales (
      id_invoice, id_unit, id_customer, harga_jual, margin, channel,
      metode_bayar, durasi_garansi_hari, tanggal_transaksi
    ) values (
      'INV-DIRECT-GATE', 'DIRECT-SALE-GATE', null, 2000000, null,
      'Offline', 'Tunai', 30, '2026-07-15'
    )
  `),
  /Pengujian unit wajib lengkap/,
);

await db.close();
console.log("combined Fase 9.2-9.3 release blocker tests passed");
