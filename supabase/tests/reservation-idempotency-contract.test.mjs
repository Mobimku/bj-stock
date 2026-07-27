import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createReservationTestDatabase, setActor } from "./reservation-harness.mjs";
import { createCustomerReservation } from "./reservation-fixtures.mjs";

const db = await createReservationTestDatabase();
await setActor(db, "admin");
const key = randomUUID();
const created = await createCustomerReservation(db, {
  idempotencyKey: key,
  unitId: "UNIT-RSV-04",
  customerId: null,
  customerName: "Idempotent Customer",
  customerWa: "81234567891",
});

await assert.rejects(
  () => createCustomerReservation(db, {
    idempotencyKey: key,
    unitId: "UNIT-RSV-04",
    customerId: null,
    customerName: "Changed Customer",
    customerWa: "81234567891",
  }),
  /Idempotency key sudah digunakan dengan data berbeda/,
);
assert.equal(
  (await db.query("select count(*)::int c from public.customers")).rows[0].c,
  2,
);
await assert.rejects(
  () => db.query(
    "update public.reservations set request_payload=jsonb_set(request_payload,'{customer_name}','\"Changed\"') where id_reservation=$1",
    [created.rows[0].id_reservation],
  ),
  /Ketentuan reservasi bersifat final dan tidak dapat diubah/,
);

await db.close();
console.log("reservation canonical idempotency and immutability contracts OK");
