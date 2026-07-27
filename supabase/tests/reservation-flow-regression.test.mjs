/**
 * Regression contract: validates the three reservation/sale flows have
 * correct test vs no-test boundaries. Fails if create_reservation
 * wrongly requires F-SLS-02 data, or if direct sale lacks it.
 * Also contains a source-level structural contract for the UI boundaries.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createReservationTestDatabase, setActor, CUSTOMER_ID } from "./reservation-harness.mjs";
import { completeUnitTest, createReservation, FUTURE_EXPIRY } from "./reservation-fixtures.mjs";

const db = await createReservationTestDatabase();
await setActor(db, "admin");

// ── Data-flow contracts ──────────────────────────────────────────

// 1. Reservation (F-RSV-01) requires NO unit test data — DP-only flow
const reservation = (await createReservation(db)).rows[0];
assert.equal(reservation.status, "Dipesan");
assert.ok(reservation.id_reservation, "Reservation created without test data");

// 2. Direct sale (F-SLS-01 + F-SLS-02) REQUIRES complete unit test data.
//    Use CUSTOMER_ID from harness (valid fixture row) and UNIT-RSV-02 (Ready).
await assert.rejects(
  () => db.query(
    `select * from public.create_sale($1,$2,null,null,null,null,$3,$4,$5,$6,$7,$8::jsonb)`,
    ["UNIT-RSV-02", CUSTOMER_ID, 3500000, "Offline", "Tunai", "2026-07-27", 30, JSON.stringify({})],
  ),
  /22023|test|pengujian|blocking/i,
  "Direct sale without valid unit test must be rejected (empty test data)",
);

// 3. Direct sale WITH complete unit test succeeds — same unit, same customer
const saleResult = await db.query(
  `select * from public.create_sale($1,$2,null,null,null,null,$3,$4,$5,$6,$7,$8::jsonb)`,
  ["UNIT-RSV-02", CUSTOMER_ID, 3500000, "Offline", "Tunai", "2026-07-27", 30,
    JSON.stringify(completeUnitTest())],
);
const sale = saleResult.rows[0];
assert.ok(sale?.id_invoice, "Direct sale with full test data must succeed");

// 4. Reservation completion (F-RSV-02) ACCEPTS F-SLS-02 unit test data
const prep = (await createReservation(db, { unitId: "UNIT-RSV-03" })).rows[0];
assert.equal(prep.status, "Dipesan");
const completed = await db.query(
  `select * from public.complete_reservation($1,$2::jsonb,$3,$4,$5,$6)`,
  [prep.id_reservation, JSON.stringify(completeUnitTest()), "Tunai", "Offline", "2026-07-27", 45],
);
assert.ok(completed.rows[0].id_invoice, "Reservation completion with test must succeed");

await db.close();

// ── Source-level structural contract ─────────────────────────────
// Verifies UI component wiring, not implementation prose.

const thisFile = new URL(import.meta.url);
const root = new URL("../../", thisFile);
const saleFormPath = new URL("app/(dashboard)/sales/new/sale-form.tsx", root);
const completionPath = new URL("app/(dashboard)/sales/new/reservation-completion-form.tsx", root);

const saleFormSrc = await readFile(saleFormPath, "utf8");
const completionSrc = await readFile(completionPath, "utf8");

// Reservation branch calls submitReservation WITHOUT unitTest param
assert.ok(saleFormSrc.includes("submitReservation(values)"),
  "Reservation branch calls submitReservation(values) — no unitTest param");

// Reservation branch has no goToTest path (SaleTestSection is only in sale path)
assert.ok(saleFormSrc.includes('transactionType === "sale"'),
  "sale-form has a sale/reservation branch discriminator");

// Direct-sale branch retains SaleTestSection and buildSaleTestPayload
assert.ok(saleFormSrc.includes("SaleTestSection"),
  "sale-form retains SaleTestSection import for direct-sale path");
assert.ok(saleFormSrc.includes("buildSaleTestPayload"),
  "sale-form retains buildSaleTestPayload for direct-sale path");

// Completion form retains SaleTestSection (F-RSV-02 applies F-SLS-02)
assert.ok(completionSrc.includes("SaleTestSection"),
  "ReservationCompletionForm retains SaleTestSection");

// noValidate must NOT be present (native validation for reservation)
assert.ok(!saleFormSrc.includes("noValidate"),
  "sale-form must NOT have noValidate — reservation uses native form validation");

// sale-form imports serializeWibExpiry for reservation submission
assert.ok(saleFormSrc.includes("serializeWibExpiry"),
  "sale-form imports serializeWibExpiry for reservation submission");

console.log("reservation flow regression + source contract OK");
