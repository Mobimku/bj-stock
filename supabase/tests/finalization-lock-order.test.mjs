import assert from "node:assert/strict";
import {
  ACTIVE_ACCOUNT_ID,
  createWarrantyDatabase,
  seedWarrantySale,
  setActor,
} from "./warranty-replacement-harness.mjs";

const db = await createWarrantyDatabase();
const roleGateFixture = await seedWarrantySale(db, { name: "FINAL-ROLE-GATE" });
await setActor(db, "admin");
await assert.rejects(
  () => db.query(
    "select public.process_return('Sales', $1, 'Tidak sah', 5000000, $2)",
    [roleGateFixture.invoiceId, ACTIVE_ACCOUNT_ID],
  ),
  /hanya dapat dilakukan oleh Owner/i,
);
await assert.rejects(
  () => db.query("select public.cancel_sale($1, 'Tidak sah')", [roleGateFixture.invoiceId]),
  /hanya dapat dilakukan oleh Owner/i,
);
await setActor(db, "owner");

const returnedFixture = await seedWarrantySale(db, { name: "FINAL-RETURNED" });
await db.query(
  `insert into public.returns (source_type, source_id, alasan, jumlah_refund, status)
   values ('Sales', $1, 'Sudah diretur', 5000000, 'Selesai')`,
  [returnedFixture.invoiceId],
);
await assert.rejects(
  () => db.query("select public.cancel_sale($1, 'Tidak sah')", [returnedFixture.invoiceId]),
  /sudah diretur/i,
);

const cancelledFixture = await seedWarrantySale(db, { name: "FINAL-CANCELLED" });
await db.query("select public.cancel_sale($1, 'Pembatalan final')", [cancelledFixture.invoiceId]);
await assert.rejects(
  () => db.query(
    "select public.process_return('Sales', $1, 'Tidak sah', 5000000, $2)",
    [cancelledFixture.invoiceId, ACTIVE_ACCOUNT_ID],
  ),
  /sudah dibatalkan/i,
);

const saleFixture = await seedWarrantySale(db, { name: "FINAL-SALE" });
await db.query(
  "insert into public.receivables (source_type, source_id) values ('Sales', $1)",
  [saleFixture.invoiceId],
);
const saleReturn = await db.query(
  "select * from public.process_return('Sales', $1, 'Cacat produksi', 5000000, $2)",
  [saleFixture.invoiceId, ACTIVE_ACCOUNT_ID],
);
const saleReturnState = await db.query(
  `select
     (select status from public.sales where id_invoice = $1) as sale_status,
     (select status from public.units where id_unit = $2) as unit_status,
     (select status from public.warranty where id_garansi = $3) as warranty_status,
     (select status from public.receivables where source_type = 'Sales' and source_id = $1) as receivable_status,
     (select count(*)::integer from public.finance_transactions
       where source_module = 'Retur' and source_id = $4) as finance_rows,
     (select count(*)::integer from public.admin_actions_log
       where aksi = 'process_return' and target = $4) as audit_rows`,
  [saleFixture.invoiceId, saleFixture.oldUnitId, saleFixture.warrantyId, saleReturn.rows[0].id_retur],
);
assert.deepEqual(saleReturnState.rows[0], {
  sale_status: "Aktif",
  unit_status: "Ready",
  warranty_status: "Habis",
  receivable_status: "Belum Lunas",
  finance_rows: 1,
  audit_rows: 1,
});

const serviceFixture = await seedWarrantySale(db, { name: "FINAL-SERVICE" });
await db.query("update public.service_orders set biaya_jasa = 250000 where id_servis = $1", [serviceFixture.serviceId]);
await db.query(
  `insert into public.finance_transactions (
     tanggal, arah, kategori, id_account, jumlah, source_module,
     source_type, source_id, source_event_key
   ) values ('2026-07-14', 'Masuk', 'Pendapatan Servis', $1, 250000,
     'Servis', 'ServiceInvoice', $2, $3)`,
  [ACTIVE_ACCOUNT_ID, serviceFixture.serviceId, `service:${serviceFixture.serviceId}`],
);
const serviceReturn = await db.query(
  "select * from public.process_return('Servis', $1, 'Hasil tidak sesuai', 250000, $2)",
  [serviceFixture.serviceId, ACTIVE_ACCOUNT_ID],
);
const serviceReturnState = await db.query(
  `select
     (select status from public.service_orders where id_servis = $1) as service_status,
     (select status from public.returns where id_retur = $2::uuid) as return_status,
     (select count(*)::integer from public.finance_transactions
       where kategori = 'Retur Servis' and source_id = $2::text) as finance_rows,
     (select count(*)::integer from public.admin_actions_log
       where aksi = 'process_return' and target = $2::text) as audit_rows`,
  [serviceFixture.serviceId, serviceReturn.rows[0].id_retur],
);
assert.deepEqual(serviceReturnState.rows[0], {
  service_status: "Diagnosa",
  return_status: "Selesai",
  finance_rows: 1,
  audit_rows: 1,
});

const definitions = await db.query(`
  select
    procedure.proname,
    pg_get_function_identity_arguments(procedure.oid) as arguments,
    pg_get_functiondef(procedure.oid) as definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in ('process_return', 'cancel_sale', 'reject_replaced_sale_return')
  order by procedure.proname
`);

assert.equal(definitions.rows.length, 3);
const byName = new Map(definitions.rows.map((row) => [row.proname, row]));
const processReturn = byName.get("process_return");
const cancelSale = byName.get("cancel_sale");
const rejectReplacedSaleReturn = byName.get("reject_replaced_sale_return");

assert.equal(
  processReturn.arguments,
  "p_source_type text, p_source_id text, p_alasan text, p_jumlah_refund numeric, p_id_account uuid",
);
assert.equal(cancelSale.arguments, "p_id_invoice text, p_alasan text");

const processDefinition = processReturn.definition.toLowerCase();
const cancelDefinition = cancelSale.definition.toLowerCase();
const triggerDefinition = rejectReplacedSaleReturn.definition.toLowerCase();
const lockStatement = "pg_advisory_xact_lock(hashtext('warranty-replacement:'";

assert.match(processDefinition, /perform public\.require_owner\(\);/);
assert.match(cancelDefinition, /perform public\.require_owner\(\);/);
/* PGlite serializes one in-memory connection, so lock contention needs real PostgreSQL;
   these definition assertions deterministically pin one lock-before-row-lock order. */

// PGlite serializes one in-memory connection and cannot model two PostgreSQL sessions.
// Pinning both function definitions to one lock-before-row-lock order is deterministic coverage.
const processAdvisoryLock = processDefinition.indexOf(lockStatement);
const processSaleLock = processDefinition.indexOf("from public.sales");
const processForUpdate = processDefinition.indexOf("for update", processSaleLock);
assert.ok(processAdvisoryLock >= 0 && processAdvisoryLock < processSaleLock);
assert.ok(processSaleLock >= 0 && processSaleLock < processForUpdate);

const cancelAdvisoryLock = cancelDefinition.indexOf(lockStatement);
const cancelSaleLock = cancelDefinition.indexOf("from public.sales");
const cancelForUpdate = cancelDefinition.indexOf("for update", cancelSaleLock);
assert.ok(cancelAdvisoryLock >= 0 && cancelAdvisoryLock < cancelSaleLock);
assert.ok(cancelSaleLock >= 0 && cancelSaleLock < cancelForUpdate);

assert.doesNotMatch(
  processDefinition,
  /insert into public\.returns\s*\([^)]*\bid_account\b/is,
);
assert.match(processDefinition, /public\.warranty_replacements/);
assert.match(processDefinition, /sale_status = 'dibatalkan'/);
assert.match(processDefinition, /public\.returns/);
assert.match(cancelDefinition, /public\.warranty_replacements/);
assert.match(cancelDefinition, /sale_record\.status = 'dibatalkan'/);
assert.match(cancelDefinition, /public\.returns/);
assert.match(triggerDefinition, /public\.warranty_replacements/);
assert.match(triggerDefinition, /pg_advisory_xact_lock/);
const triggerAdvisoryLock = triggerDefinition.indexOf(lockStatement);
const triggerReplacementLookup = triggerDefinition.indexOf("from public.warranty_replacements");
assert.ok(triggerAdvisoryLock >= 0 && triggerAdvisoryLock < triggerReplacementLookup);

const salesStatus = await db.query(`
  select column_default, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sales' and column_name = 'status'
`);
assert.equal(salesStatus.rows[0].is_nullable, "NO");
assert.match(salesStatus.rows[0].column_default, /Aktif/);
const salesStatusConstraint = await db.query(`
  select pg_get_constraintdef(constraint_row.oid) as definition
  from pg_constraint constraint_row
  join pg_class table_row on table_row.oid = constraint_row.conrelid
  join pg_namespace namespace on namespace.oid = table_row.relnamespace
  where namespace.nspname = 'public'
    and table_row.relname = 'sales'
    and constraint_row.conname = 'sales_status_check'
`);
assert.match(salesStatusConstraint.rows[0].definition, /Aktif/);
assert.match(salesStatusConstraint.rows[0].definition, /Dibatalkan/);

await db.close();
console.log("finalization lock-order migration tests passed");
