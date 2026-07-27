import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createReservationTestDatabase,
  setActor,
  CUSTOMER_ID,
} from "./reservation-harness.mjs";
import { completeReservation, createCustomerReservation } from "./reservation-fixtures.mjs";

// A failure after customer resolution rolls back every side effect.
{
  const db = await createReservationTestDatabase();
  await setActor(db, "admin");
  await db.query("delete from public.finance_accounts");
  const before = await db.query(`
    select
      (select count(*)::int from public.customers) customers,
      (select count(*)::int from public.reservations) reservations,
      (select count(*)::int from public.finance_transactions) finance,
      (select count(*)::int from public.admin_actions_log) audit,
      (select status from public.units where id_unit='UNIT-RSV-01') unit_status
  `);
  await assert.rejects(
    () => createCustomerReservation(db, {
      customerId: null,
      customerName: "Orphan Risk",
      customerWa: "6285599999999",
      customerSegment: "Remote Worker",
      customerSource: "Reels",
    }),
    /Akun Kas Toko aktif tidak ditemukan/,
  );
  const after = await db.query(`
    select
      (select count(*)::int from public.customers) customers,
      (select count(*)::int from public.reservations) reservations,
      (select count(*)::int from public.finance_transactions) finance,
      (select count(*)::int from public.admin_actions_log) audit,
      (select status from public.units where id_unit='UNIT-RSV-01') unit_status
  `);
  assert.deepEqual(after.rows[0], before.rows[0]);
  await db.close();
  console.log("post-customer failure rolls back all reservation effects — OK");
}

// ── Case 1: existing customer UUID works via the new overload ─────────────
// Given  an existing customer (CUSTOMER_ID) and a 'Listed' unit
// When   the 11-param overload is called with non-null p_id_customer
// Then   reservation.id_customer === CUSTOMER_ID, unit status = 'Dipesan',
//        DP finance transaction recorded
{
  const db = await createReservationTestDatabase();
  await setActor(db, "admin");
  const r = await createCustomerReservation(db, {
    unitId: "UNIT-RSV-01",
    customerId: CUSTOMER_ID,
  });
  assert.equal(r.rows[0].id_customer, CUSTOMER_ID);
  assert.equal(r.rows[0].status, "Dipesan");
  const unit = await db.query(
    "select status from public.units where id_unit='UNIT-RSV-01'",
  );
  assert.equal(unit.rows[0].status, "Dipesan");
  const dp = await db.query(
    "select count(*)::int c from public.finance_transactions where source_id=$1",
    [r.rows[0].id_reservation],
  );
  assert.equal(dp.rows[0].c, 1);
  await db.close();
  console.log("Case 1: existing customer via new overload — OK");
}

// ── Case 2: null customerId + new data creates both atomically ───────────
// Given  a 'Ready' unit and no customer with kontak_wa = '6285522222222'
// When   the 11-param overload is called with p_id_customer = null and
//        customer_name / wa / segment / source
// Then   a new customer row exists, reservation.id_customer points to it,
//        unit status = 'Dipesan'
{
  const db = await createReservationTestDatabase();
  await setActor(db, "admin");
  const r = await createCustomerReservation(db, {
    unitId: "UNIT-RSV-02",
    customerId: null,
    customerName: "Budi Baru",
    customerWa: "6285522222222",
    customerSegment: "Pelajar",
    customerSource: "Instagram",
  });
  const cust = await db.query(
    "select * from public.customers where id_customer=$1",
    [r.rows[0].id_customer],
  );
  assert.equal(cust.rows[0].kontak_wa, "6285522222222");
  const unit = await db.query(
    "select status from public.units where id_unit='UNIT-RSV-02'",
  );
  assert.equal(unit.rows[0].status, "Dipesan");
  await db.close();
  console.log("Case 2: new customer atomically — OK");
}

// 0812, bare 812, and canonical 628 forms resolve one preserved profile.
for (const [index, customerWa] of ["0812-3456-7890", "81234567890", "6281234567890"].entries()) {
  const db = await createReservationTestDatabase();
  await setActor(db, "admin");
  await db.query("update public.customers set kontak_wa='6281234567890' where id_customer=$1", [CUSTOMER_ID]);
  const before = await db.query(
    "select count(*)::int c from public.customers",
  );
  const r = await createCustomerReservation(db, {
    unitId: `UNIT-RSV-0${index + 1}`,
    customerId: null,
    customerName: "Nama Berbeda",
    customerWa,
    customerSegment: "Orang Tua",
    customerSource: "TikTok",
  });
  const after = await db.query(
    "select count(*)::int c from public.customers",
  );
  assert.equal(after.rows[0].c, before.rows[0].c);
  const cust = await db.query(
    "select nama from public.customers where id_customer=$1",
    [r.rows[0].id_customer],
  );
  assert.equal(cust.rows[0].nama, "Customer Test");
  assert.equal(r.rows[0].id_customer, CUSTOMER_ID);
  assert.equal(r.rows[0].request_payload.customer_wa, "6281234567890");
  await db.close();
  console.log(`WA form ${customerWa} reuses preserved profile — OK`);
}

// ── Case 4: idempotency replay returns original, no double customer/Finance ─
// Given  a reservation was created via the 11-param overload
// When   the same idempotency key is replayed with identical params
// Then   same reservation row returned, single DP transaction, customer count
//        unchanged
{
  const db = await createReservationTestDatabase();
  await setActor(db, "admin");
  const key = randomUUID();
  const request = {
    idempotencyKey: key,
    unitId: "UNIT-RSV-04",
    customerId: null,
    customerName: "Customer Tanpa WA",
  };
  const r1 = await createCustomerReservation(db, request);
  const r2 = await createCustomerReservation(db, request);
  assert.equal(r2.rows[0].id_reservation, r1.rows[0].id_reservation);
  const dp = await db.query(
    "select count(*)::int c from public.finance_transactions where source_module='Reservasi'",
  );
  assert.equal(dp.rows[0].c, 1);
  const cust = await db.query(
    "select count(*)::int c from public.customers",
  );
  assert.equal(cust.rows[0].c, 2);
  await db.close();
  console.log("Case 4: idempotency replay — OK");
}

// ── Case 6: completion produces one sale for the reservation-owned customer ─
// Given  reservation created via the 11-param overload
// When   complete_reservation is called with valid unit-test data
// Then   status = 'Selesai', 1 sale row, 3 finance entries
//        (DP + reversal + payment), customer count unchanged
{
  const db = await createReservationTestDatabase();
  await setActor(db, "admin");
  const r = await createCustomerReservation(db, { unitId: "UNIT-RSV-01" });
  const completed = await completeReservation(
    db,
    r.rows[0].id_reservation,
  );
  assert.equal(completed.rows[0].status, "Selesai");
  const sale = await db.query(
    "select id_customer from public.sales where id_unit='UNIT-RSV-01'",
  );
  assert.equal(sale.rows.length, 1);
  assert.equal(sale.rows[0].id_customer, r.rows[0].id_customer);
  const finance = await db.query(
    "select count(*)::int c from public.finance_transactions where source_id in ($1,$2)",
    [r.rows[0].id_reservation, completed.rows[0].id_invoice],
  );
  assert.equal(finance.rows[0].c, 3);
  const cust = await db.query(
    "select count(*)::int c from public.customers",
  );
  assert.equal(cust.rows[0].c, 1);
  await db.close();
  console.log("Case 6: completion for owned customer — OK");
}

console.log("All 6 reservation customer contract tests passed");
