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
// Seed a pre-integration row directly: the baseline RPC is the production bug under test.
const historical = await db.query(`
  insert into public.reservations (
    idempotency_key,id_unit,id_customer,dp_amount,agreed_price,is_refundable,
    previous_status,expires_at,created_by
  ) values ($1,$2,$3,500000,3500000,true,'Ready',$4,$5)
  returning *
`, [key, " UNIT-HISTORICAL ", CUSTOMER_ID, FUTURE_EXPIRY, "11111111-1111-4111-8111-111111111111"]);
await db.query("select set_config('app.reservation_flow','on',false)");
await db.query("update public.units set status='Dipesan' where id_unit=$1", [" UNIT-HISTORICAL "]);
await db.query("select set_config('app.reservation_flow','',false)");
const dp = await db.query(`
  insert into public.finance_transactions (
    arah,kategori,id_account,jumlah,source_module,source_type,source_id,
    source_event_key,created_by
  ) values ('Masuk','Uang Muka Reservasi',
    (select id_account from public.finance_accounts where nama='Kas Toko'),
    500000,'Reservasi','ReservationDP',$1,'reservation:dp:' || $1,$2)
  returning id_transaksi
`, [historical.rows[0].id_reservation, "11111111-1111-4111-8111-111111111111"]);
await db.query(
  "update public.reservations set id_dp_transaction=$1 where id_reservation=$2",
  [dp.rows[0].id_transaksi, historical.rows[0].id_reservation],
);
await db.query(
  "select public.log_admin_action('create_reservation',$1::text,jsonb_build_object('id_unit',$2::text,'dp_amount',500000))",
  [historical.rows[0].id_reservation, " UNIT-HISTORICAL "],
);
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
