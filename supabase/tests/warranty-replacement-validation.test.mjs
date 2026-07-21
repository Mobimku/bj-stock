import assert from "node:assert/strict";
import {
  ACTIVE_ACCOUNT_ID,
  INACTIVE_ACCOUNT_ID,
  createWarrantyDatabase,
  replaceWarrantyUnit,
  seedWarrantySale,
  setActor,
} from "./warranty-replacement-harness.mjs";

const db = await createWarrantyDatabase();
const fixture = await seedWarrantySale(db, { name: "VALIDATION" });
const baseRequest = {
  idempotencyKey: "20000000-0000-4000-8000-000000000001",
  invoiceId: fixture.invoiceId,
  claimId: fixture.claimId,
  replacementUnitId: fixture.replacementUnitId,
  replacementValue: 5500000,
  replacementDate: "2026-07-14",
  reason: "Validasi penggantian",
  accountId: ACTIVE_ACCOUNT_ID,
};

await setActor(db, "admin");
await assert.rejects(() => replaceWarrantyUnit(db, baseRequest), /hanya dapat dilakukan oleh Owner/i);
await setActor(db, "owner");

await assert.rejects(
  () => replaceWarrantyUnit(db, { ...baseRequest, invoiceId: "INV-TIDAK-ADA" }),
  /Invoice tidak ditemukan/i,
);
await assert.rejects(
  () => replaceWarrantyUnit(db, { ...baseRequest, claimId: "99999999-9999-4999-8999-999999999999" }),
  /Klaim garansi tidak ditemukan/i,
);
await assert.rejects(
  () => replaceWarrantyUnit(db, { ...baseRequest, replacementUnitId: "UNIT-TIDAK-ADA" }),
  /Unit pengganti tidak ditemukan/i,
);
await assert.rejects(
  () => replaceWarrantyUnit(db, { ...baseRequest, replacementUnitId: fixture.oldUnitId }),
  /harus berbeda/i,
);
await assert.rejects(
  () => replaceWarrantyUnit(db, { ...baseRequest, accountId: INACTIVE_ACCOUNT_ID }),
  /Akun Finance tidak aktif/i,
);
await assert.rejects(
  () => replaceWarrantyUnit(db, { ...baseRequest, accountId: null }),
  /Akun Finance wajib/i,
);
await assert.rejects(
  () => replaceWarrantyUnit(db, { ...baseRequest, replacementValue: 5000000, accountId: ACTIVE_ACCOUNT_ID }),
  /tidak boleh memakai akun Finance/i,
);

const badStatus = await seedWarrantySale(db, { name: "BAD-STATUS", oldStatus: "QC" });
await assert.rejects(
  () => replaceWarrantyUnit(db, {
    ...baseRequest,
    idempotencyKey: "20000000-0000-4000-8000-000000000002",
    invoiceId: badStatus.invoiceId,
    claimId: badStatus.claimId,
    replacementUnitId: badStatus.replacementUnitId,
  }),
  /Unit aktif harus berstatus Terjual/i,
);
const badReplacement = await seedWarrantySale(db, { name: "BAD-REPLACEMENT", replacementStatus: "QC" });
await assert.rejects(
  () => replaceWarrantyUnit(db, {
    ...baseRequest,
    idempotencyKey: "20000000-0000-4000-8000-000000000003",
    invoiceId: badReplacement.invoiceId,
    claimId: badReplacement.claimId,
    replacementUnitId: badReplacement.replacementUnitId,
  }),
  /Unit pengganti harus berstatus Ready atau Listed/i,
);
const noDiagnosis = await seedWarrantySale(db, {
  name: "NO-DIAGNOSIS",
  diagnosis: null,
  serviceStatus: "Diterima",
});
await assert.rejects(
  () => replaceWarrantyUnit(db, {
    ...baseRequest,
    idempotencyKey: "20000000-0000-4000-8000-000000000009",
    invoiceId: noDiagnosis.invoiceId,
    claimId: noDiagnosis.claimId,
    replacementUnitId: noDiagnosis.replacementUnitId,
  }),
  /wajib memiliki diagnosis/i,
);
const expired = await seedWarrantySale(db, { name: "EXPIRED", warrantyStatus: "Habis" });
await assert.rejects(
  () => replaceWarrantyUnit(db, {
    ...baseRequest,
    idempotencyKey: "20000000-0000-4000-8000-000000000008",
    claimId: expired.claimId,
  }),
  /Klaim garansi tidak sesuai/i,
);
await assert.rejects(
  () => replaceWarrantyUnit(db, {
    ...baseRequest,
    idempotencyKey: "20000000-0000-4000-8000-000000000004",
    invoiceId: expired.invoiceId,
    claimId: expired.claimId,
    replacementUnitId: expired.replacementUnitId,
  }),
  /Garansi tidak aktif/i,
);

const manualClaim = await seedWarrantySale(db, { name: "MANUAL-CLAIM" });
await db.query("delete from public.service_orders where id_servis = $1", [manualClaim.serviceId]);
const manualResult = await replaceWarrantyUnit(db, {
  ...baseRequest,
  idempotencyKey: "20000000-0000-4000-8000-000000000010",
  invoiceId: manualClaim.invoiceId,
  claimId: manualClaim.claimId,
  replacementUnitId: manualClaim.replacementUnitId,
  replacementValue: 5000000,
  accountId: null,
  reason: "Penggantian dari klaim manual",
});
assert.equal(manualResult.rows[0].id_klaim, manualClaim.claimId);
const manualAction = await db.query(
  "select tindakan from public.warranty_claim where id_klaim = $1",
  [manualClaim.claimId],
);
assert.match(manualAction.rows[0].tindakan, /Penggantian unit/);

const returned = await seedWarrantySale(db, { name: "RETURNED" });
await db.query(
  `insert into public.returns (source_type, source_id, alasan, jumlah_refund, status)
   values ('Sales', $1, 'Retur selesai', 5000000, 'Selesai')`,
  [returned.invoiceId],
);
await assert.rejects(
  () => replaceWarrantyUnit(db, {
    ...baseRequest,
    idempotencyKey: "20000000-0000-4000-8000-000000000005",
    invoiceId: returned.invoiceId,
    claimId: returned.claimId,
    replacementUnitId: returned.replacementUnitId,
  }),
  /Invoice sudah diretur atau dibatalkan/i,
);
const cancelled = await seedWarrantySale(db, { name: "CANCELLED" });
await db.query(
  `insert into public.admin_actions_log (user_id, user_role, aksi, target, detail)
   values ($1, 'owner', 'finance_reversal', $2, '{"aksi":"cancel_sale"}')`,
  ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", cancelled.invoiceId],
);
await db.query("update public.sales set status = 'Dibatalkan' where id_invoice = $1", [cancelled.invoiceId]);
await assert.rejects(
  () => replaceWarrantyUnit(db, {
    ...baseRequest,
    idempotencyKey: "20000000-0000-4000-8000-000000000006",
    invoiceId: cancelled.invoiceId,
    claimId: cancelled.claimId,
    replacementUnitId: cancelled.replacementUnitId,
  }),
  /Invoice sudah diretur atau dibatalkan/i,
);
const activeInvoices = await db.query("select id_invoice from public.sales_current_state order by id_invoice");
assert.ok(!activeInvoices.rows.some((row) => row.id_invoice === returned.invoiceId));
assert.ok(!activeInvoices.rows.some((row) => row.id_invoice === cancelled.invoiceId));

await db.exec(`
  create function public.fail_replacement_audit() returns trigger language plpgsql as $$
  begin
    if new.aksi = 'warranty_unit_replacement' then
      raise exception 'Simulasi kegagalan audit';
    end if;
    return new;
  end;
  $$;
  create trigger fail_replacement_audit before insert on public.admin_actions_log
    for each row execute function public.fail_replacement_audit();
`);
await assert.rejects(() => replaceWarrantyUnit(db, baseRequest), /Simulasi kegagalan audit/);
const rolledBack = await db.query(
  `select
    (select status from public.units where id_unit = $1) as old_status,
    (select status from public.units where id_unit = $2) as replacement_status,
    (select status from public.warranty where id_garansi = $3) as warranty_status,
    (select status from public.service_orders where id_servis = $4) as service_status,
    (select count(*)::integer from public.warranty_replacements where id_invoice = $5) as replacements,
    (select count(*)::integer from public.finance_transactions where source_module = 'Warranty') as finance_rows`,
  [fixture.oldUnitId, fixture.replacementUnitId, fixture.warrantyId, fixture.serviceId, fixture.invoiceId],
);
assert.deepEqual(rolledBack.rows[0], {
  old_status: "Terjual",
  replacement_status: "Ready",
  warranty_status: "Aktif",
  service_status: "Diagnosa",
  replacements: 0,
  finance_rows: 0,
});
await db.exec("drop trigger fail_replacement_audit on public.admin_actions_log; drop function public.fail_replacement_audit();");

const completed = await replaceWarrantyUnit(db, baseRequest);
await assert.rejects(
  () => replaceWarrantyUnit(db, {
    ...baseRequest,
    idempotencyKey: "20000000-0000-4000-8000-000000000007",
  }),
  /Klaim garansi sudah digunakan/i,
);
assert.equal(completed.rows[0].id_klaim, fixture.claimId);

await db.close();
console.log("warranty replacement validation migration tests passed");
