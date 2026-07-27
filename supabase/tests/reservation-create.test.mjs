import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ACCOUNT_ID, CUSTOMER_ID, createReservationTestDatabase, setActor } from "./reservation-harness.mjs";
import { FUTURE_EXPIRY, completeUnitTest, createReservation } from "./reservation-fixtures.mjs";

const db = await createReservationTestDatabase();
await setActor(db, "admin");
const idempotencyKey = randomUUID();

const created = await createReservation(db, { idempotencyKey });
const reservation = created.rows[0];
assert.equal(reservation.status, "Dipesan");
assert.equal(reservation.id_unit, "UNIT-RSV-01");
assert.equal(reservation.id_customer, CUSTOMER_ID);
assert.equal(Number(reservation.dp_amount), 500000);
assert.equal(Number(reservation.agreed_price), 3500000);
assert.equal(reservation.idempotency_key, idempotencyKey);
assert.equal(reservation.expires_at.toISOString(), new Date(FUTURE_EXPIRY).toISOString());

const unit = await db.query("select status from public.units where id_unit=$1", [reservation.id_unit]);
assert.equal(unit.rows[0].status, "Dipesan");
const finance = await db.query("select * from public.finance_transactions where id_transaksi=$1", [reservation.id_dp_transaction]);
assert.equal(finance.rows[0].arah, "Masuk");
assert.equal(finance.rows[0].kategori, "Uang Muka Reservasi");
assert.equal(finance.rows[0].id_account, ACCOUNT_ID);
assert.equal(finance.rows[0].source_event_key, `reservation:dp:${reservation.id_reservation}`);

const replay = await createReservation(db, { idempotencyKey });
assert.equal(replay.rows[0].id_reservation, reservation.id_reservation);
const dpCount = await db.query("select count(*)::integer count from public.finance_transactions where source_id=$1", [reservation.id_reservation]);
assert.equal(dpCount.rows[0].count, 1);
await assert.rejects(() => createReservation(db), /reservasi|dipesan|DP/i);

await assert.rejects(
  () => db.query("select * from public.create_sale($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)",
    [reservation.id_unit,CUSTOMER_ID,null,null,null,null,3500000,"Offline","Tunai","2026-07-26",30,JSON.stringify(completeUnitTest())]),
  /Ready|Listed|reservasi|Dipesan/i,
);
const audit = await db.query("select * from public.admin_actions_log where aksi='create_reservation'");
assert.equal(audit.rows[0].user_role, "admin");
assert.equal(audit.rows[0].target, reservation.id_reservation);
assert.equal(audit.rows[0].detail.id_unit, reservation.id_unit);
assert.equal(Number(audit.rows[0].detail.dp_amount), 500000);

const roleDb = await createReservationTestDatabase();
await setActor(roleDb, "teknisi");
await assert.rejects(() => createReservation(roleDb), /admin|owner/i);
await roleDb.close();
await db.close();
console.log("reservation create contract OK");
