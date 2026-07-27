import assert from "node:assert/strict";
import { createReservationTestDatabase, setActor } from "./reservation-harness.mjs";
import { completeReservation, createReservation } from "./reservation-fixtures.mjs";

const invalidDb = await createReservationTestDatabase();
await setActor(invalidDb, "admin");
// RED must fail on the missing reservation RPC before exercising guard messages.
await createReservation(invalidDb);
await assert.rejects(() => createReservation(invalidDb, { expiresAt: "2020-01-01T00:00:00Z" }), /expir|waktu|batas/i);
await invalidDb.close();

const overdueDb = await createReservationTestDatabase();
await setActor(overdueDb, "admin");
const overdue = await createReservation(overdueDb);
await overdueDb.exec("alter table public.reservations disable trigger protect_reservation_terms");
await overdueDb.query("update public.reservations set expires_at='2020-01-01T00:00:00Z' where id_reservation=$1", [overdue.rows[0].id_reservation]);
await overdueDb.exec("alter table public.reservations enable trigger protect_reservation_terms");
await assert.rejects(() => completeReservation(overdueDb, overdue.rows[0].id_reservation), /expir|waktu|batas/i);
const overdueState = await overdueDb.query("select r.status,u.status unit_status from public.reservations r join public.units u using(id_unit) where id_reservation=$1", [overdue.rows[0].id_reservation]);
assert.equal(overdueState.rows[0].status, "Dipesan");
assert.equal(overdueState.rows[0].unit_status, "Dipesan");
await overdueDb.close();

const immutableDb = await createReservationTestDatabase();
await setActor(immutableDb, "admin");
const immutable = await createReservation(immutableDb);
for (const [column, value] of [
  ["dp_amount", "600000"], ["agreed_price", "3600000"],
  ["is_refundable", "false"], ["expires_at", "'2099-09-01T00:00:00Z'"],
]) {
  await assert.rejects(
    () => immutableDb.query(`update public.reservations set ${column}=${value} where id_reservation=$1`, [immutable.rows[0].id_reservation]),
    /ubah|immutable|final/i,
  );
}
const warranty = await immutableDb.query("select count(*)::integer count from public.warranty where id_unit='UNIT-RSV-01'");
assert.equal(warranty.rows[0].count, 0);
await immutableDb.close();
console.log("reservation guard contracts OK");
