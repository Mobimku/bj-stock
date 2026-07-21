import { completeUnitTest } from "./sale-unit-test-harness.mjs";

export const ACTIVE_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
export const INACTIVE_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
export const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export async function seedWarrantySale(db, fixture) {
  const oldUnitId = `OLD-${fixture.name}`;
  const replacementUnitId = `NEW-${fixture.name}`;
  const invoiceId = `INV-${fixture.name}`;
  await db.query(
    `insert into public.units (id_unit, brand, model, modal_awal, total_modal, status, tanggal_masuk) values
      ($1, 'Original', $2, 3000000, 3000000, $3, '2026-06-01'),
      ($4, 'Replacement', $5, 3500000, 3500000, $6, '2026-06-10')`,
    [oldUnitId, fixture.name, fixture.oldStatus ?? "Terjual", replacementUnitId, fixture.name, fixture.replacementStatus ?? "Ready"],
  );
  const saleTest = await db.query(
    `insert into public.sale_unit_tests (
       id_unit, test_results, blocking_checks, location, tester_user_id,
       tester_email, acknowledgement_text, confirmed_at
     ) values (
       $1, $2::jsonb, $3::jsonb, 'Toko utama', $4, 'owner@bjstock.test',
       'Pembeli telah menyaksikan atau menerima ringkasan hasil pengujian di atas sebelum pembayaran dan memahami setiap catatan atau bagian yang tidak diuji. Persetujuan ini tidak menghapus, mengurangi, atau membatasi garansi BJ Laptop maupun hak konsumen berdasarkan hukum yang berlaku.',
       now()
     ) returning id_sale_test`,
    [oldUnitId, JSON.stringify(completeUnitTest.test_results), JSON.stringify(completeUnitTest.blocking_checks), OWNER_ID],
  );
  await db.query(
    `insert into public.sales (
       id_invoice, id_unit, id_customer, harga_jual, margin, channel,
       metode_bayar, durasi_garansi_hari, tanggal_transaksi, id_sale_test
     ) values ($1, $2, '33333333-3333-4333-8333-333333333333', 5000000, 2000000, 'Offline', 'Tunai', 30, '2026-07-01', $3)`,
    [invoiceId, oldUnitId, saleTest.rows[0].id_sale_test],
  );
  const warranty = await db.query(
    `insert into public.warranty (id_unit, tanggal_mulai, tanggal_berakhir, status)
     values ($1, '2026-07-01', $2, $3) returning id_garansi`,
    [oldUnitId, fixture.warrantyEnd ?? "2026-07-18", fixture.warrantyStatus ?? "Aktif"],
  );
  const claim = await addClaimService(db, {
    name: fixture.name,
    unitId: oldUnitId,
    warrantyId: warranty.rows[0].id_garansi,
    claimDate: "2026-07-14",
    diagnosis: fixture.diagnosis,
    serviceStatus: fixture.serviceStatus,
  });
  await db.query(
    `insert into public.finance_transactions (
      tanggal, arah, kategori, id_account, jumlah, source_module,
      source_type, source_id, source_event_key
    ) values ('2026-07-01', 'Masuk', 'Penjualan Unit', $1, 5000000, 'Sales', 'SalesInvoice', $2, $3)`,
    [ACTIVE_ACCOUNT_ID, invoiceId, `sale:${invoiceId}`],
  );
  return { oldUnitId, replacementUnitId, invoiceId, warrantyId: warranty.rows[0].id_garansi, ...claim };
}

export async function addClaimService(db, fixture) {
  const claim = await db.query(
    `insert into public.warranty_claim (id_garansi, tanggal, keluhan, tindakan, biaya)
     values ($1, $2, 'Unit bermasalah', 'Pemeriksaan awal', 0) returning id_klaim`,
    [fixture.warrantyId, fixture.claimDate],
  );
  const serviceId = `SVC-${fixture.name}`;
  await db.query(
    `insert into public.service_orders (
      id_servis, id_unit, id_customer, id_klaim, jenis_servis, brand_model, keluhan,
      diagnosa, tindakan, status, tanggal_masuk, qr_payload
    ) values ($1, $2, '33333333-3333-4333-8333-333333333333', $3,
      'Repair', 'Laptop test', 'Unit bermasalah', $5,
      'Pemeriksaan awal', $6, $4, '/s/' || $1)`,
    [
      serviceId,
      fixture.unitId,
      claim.rows[0].id_klaim,
      fixture.claimDate,
      fixture.diagnosis === undefined ? "Kerusakan terverifikasi" : fixture.diagnosis,
      fixture.serviceStatus ?? "Diagnosa",
    ],
  );
  return { claimId: claim.rows[0].id_klaim, serviceId };
}
