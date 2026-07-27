import assert from "node:assert/strict";
import { createReservationTestDatabase, setActor } from "./reservation-harness.mjs";
import { createReservation } from "./reservation-fixtures.mjs";

const refundDb = await createReservationTestDatabase();
await setActor(refundDb, "admin");
const refundable = await createReservation(refundDb);
await setActor(refundDb, "owner");
const refunded = await refundDb.query("select * from public.refund_reservation($1)", [refundable.rows[0].id_reservation]);
assert.equal(refunded.rows[0].status, "Dibatalkan");
assert.ok(refunded.rows[0].cancelled_at);
const refundUnit = await refundDb.query("select status from public.units where id_unit='UNIT-RSV-01'");
assert.equal(refundUnit.rows[0].status, "Listed");
const refundFinance = await refundDb.query("select * from public.finance_transactions where source_id=$1", [refundable.rows[0].id_reservation]);
assert.equal(refundFinance.rows.length, 2);
assert.equal(refundFinance.rows.filter((row) => row.is_reversal).length, 1);
assert.equal(refundFinance.rows.reduce((sum,row) => sum + (row.arah === "Masuk" ? Number(row.jumlah) : -Number(row.jumlah)),0), 0);
await refundDb.close();

const ownerGateDb = await createReservationTestDatabase();
await setActor(ownerGateDb, "admin");
const ownerGate = await createReservation(ownerGateDb);
await assert.rejects(() => ownerGateDb.query("select * from public.refund_reservation($1)", [ownerGate.rows[0].id_reservation]), /Owner/i);
await ownerGateDb.close();

const nonRefundDb = await createReservationTestDatabase();
await setActor(nonRefundDb, "admin");
const nonRefundable = await createReservation(nonRefundDb, { isRefundable: false });
await setActor(nonRefundDb, "owner");
await assert.rejects(() => nonRefundDb.query("select * from public.refund_reservation($1)", [nonRefundable.rows[0].id_reservation]), /refund|non/i);
await setActor(nonRefundDb, "admin");
const before = await nonRefundDb.query("select count(*)::integer count from public.finance_transactions where source_id=$1", [nonRefundable.rows[0].id_reservation]);
const forfeited = await nonRefundDb.query("select * from public.forfeit_reservation($1)", [nonRefundable.rows[0].id_reservation]);
assert.equal(forfeited.rows[0].status, "Hangus");
const after = await nonRefundDb.query("select count(*)::integer count from public.finance_transactions where source_id=$1", [nonRefundable.rows[0].id_reservation]);
assert.equal(before.rows[0].count, 1);
assert.equal(after.rows[0].count, 1);
const profitLoss = await nonRefundDb.query(
  "select * from public.get_profit_loss($1,$2)",
  ["2026-01-01", "2099-12-31"],
);
assert.equal(Number(profitLoss.rows[0].pendapatan_dp_hangus), 500000);
assert.equal(Number(profitLoss.rows[0].laba_bersih), 500000);
await nonRefundDb.close();

const forfeitGateDb = await createReservationTestDatabase();
await setActor(forfeitGateDb, "admin");
const forfeitGate = await createReservation(forfeitGateDb);
await assert.rejects(() => forfeitGateDb.query("select * from public.forfeit_reservation($1)", [forfeitGate.rows[0].id_reservation]), /refund|forfeit/i);
await setActor(forfeitGateDb, "teknisi");
await assert.rejects(() => forfeitGateDb.query("select * from public.forfeit_reservation($1)", [forfeitGate.rows[0].id_reservation]), /admin|owner/i);
await forfeitGateDb.close();
console.log("reservation resolution contracts OK");
