import assert from "node:assert/strict";
import { createReservationTestDatabase, setActor } from "./reservation-harness.mjs";
import { completeReservation, createReservation } from "./reservation-fixtures.mjs";

const db = await createReservationTestDatabase();
await setActor(db, "admin");
const created = await createReservation(db);
const completed = await completeReservation(db, created.rows[0].id_reservation);
assert.equal(completed.rows[0].status, "Selesai");
assert.ok(completed.rows[0].completed_at);

const sale = await db.query("select * from public.sales where id_unit='UNIT-RSV-01'");
assert.equal(sale.rows.length, 1);
assert.equal(Number(sale.rows[0].harga_jual), 3500000);
const saleTest = await db.query("select confirmed_at from public.sale_unit_tests where id_sale_test=$1", [sale.rows[0].id_sale_test]);
assert.ok(saleTest.rows[0].confirmed_at);
const warranty = await db.query("select * from public.warranty where id_unit='UNIT-RSV-01'");
assert.equal(warranty.rows[0].tanggal_mulai.toISOString().slice(0, 10), "2026-07-26");
assert.equal(warranty.rows[0].tanggal_berakhir.toISOString().slice(0, 10), "2026-09-09");

const entries = await db.query(
  "select arah,jumlah,is_reversal,reversal_of,source_event_key from public.finance_transactions where source_id in ($1,$2) order by created_at",
  [created.rows[0].id_reservation, sale.rows[0].id_invoice],
);
assert.equal(entries.rows.length, 3);
assert.equal(entries.rows.filter((row) => row.reversal_of === created.rows[0].id_dp_transaction).length, 1);
const net = entries.rows.reduce((sum, row) => sum + (row.arah === "Masuk" ? Number(row.jumlah) : -Number(row.jumlah)), 0);
assert.equal(net, 3500000);

const cicilanDb = await createReservationTestDatabase();
await setActor(cicilanDb, "admin");
const cicilan = await createReservation(cicilanDb);
await assert.rejects(() => completeReservation(cicilanDb, cicilan.rows[0].id_reservation, { paymentMethod: "Cicilan" }), /Tunai|Transfer|Cicilan/i);
await cicilanDb.close();

const roleDb = await createReservationTestDatabase();
await setActor(roleDb, "admin");
const roleReservation = await createReservation(roleDb);
await setActor(roleDb, "teknisi");
await assert.rejects(() => completeReservation(roleDb, roleReservation.rows[0].id_reservation), /admin|owner/i);
await roleDb.close();
await db.close();
console.log("reservation completion contract OK");
