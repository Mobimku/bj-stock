import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  applyForwardReservationMigration,
  createReservationTestDatabase,
  CUSTOMER_ID,
  setActor,
} from "./reservation-harness.mjs";
import { createReservation, FUTURE_EXPIRY } from "./reservation-fixtures.mjs";

const db = await createReservationTestDatabase({ applyForward: false });
await setActor(db, "admin");
await db.query(
  "insert into public.units (id_unit,total_modal,status) values ($1,2000000,'Ready')",
  [" UNIT-HISTORICAL "],
);
const key = randomUUID();
const historical = await createReservation(db, {
  idempotencyKey: key,
  unitId: " UNIT-HISTORICAL ",
});
const before = await db.query(`
  select
    (select count(*)::int from public.customers) customers,
    (select count(*)::int from public.finance_transactions) finance,
    (select count(*)::int from public.admin_actions_log) audit
`);

await applyForwardReservationMigration(db);

const migrated = await db.query(
  "select request_payload from public.reservations where id_reservation=$1",
  [historical.rows[0].id_reservation],
);
assert.deepEqual(migrated.rows[0].request_payload, {
  id_unit: "UNIT-HISTORICAL",
  id_customer: CUSTOMER_ID,
  customer_name: null,
  customer_wa: null,
  customer_segment: null,
  customer_source: null,
  dp_amount: 500000,
  agreed_price: 3500000,
  is_refundable: true,
  expires_at: FUTURE_EXPIRY,
});

const replay = await createReservation(db, {
  idempotencyKey: key,
  unitId: " UNIT-HISTORICAL ",
});
assert.equal(replay.rows[0].id_reservation, historical.rows[0].id_reservation);
const after = await db.query(`
  select
    (select count(*)::int from public.customers) customers,
    (select count(*)::int from public.finance_transactions) finance,
    (select count(*)::int from public.admin_actions_log) audit
`);
assert.deepEqual(after.rows[0], before.rows[0]);

await db.close();
console.log("reservation forward migration transition contract OK");
