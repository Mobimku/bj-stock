import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const jakartaToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const migration = await readFile(
  new URL("../migrations/202607100001_initial_inventory.sql", import.meta.url),
  "utf8",
);
const authMigration = await readFile(
  new URL("../migrations/202607100002_auth_roles.sql", import.meta.url),
  "utf8",
);
const createUnitMigration = await readFile(
  new URL("../migrations/202607100003_create_unit.sql", import.meta.url),
  "utf8",
);
const photoMigration = await readFile(
  new URL("../migrations/202607100004_unit_photos.sql", import.meta.url),
  "utf8",
);
const statusMigration = await readFile(
  new URL("../migrations/202607100005_unit_status.sql", import.meta.url),
  "utf8",
);
const bankStockMigration = await readFile(
  new URL("../migrations/202607100006_bank_stock_functions.sql", import.meta.url),
  "utf8",
);
const upgradeMigration = await readFile(
  new URL("../migrations/202607100007_upgrade_triggers.sql", import.meta.url),
  "utf8",
);
const hardeningMigration = await readFile(
  new URL("../migrations/202607100008_phase1_hardening.sql", import.meta.url),
  "utf8",
);
const salesMigration = await readFile(
  new URL("../migrations/202607100009_sales_warranty.sql", import.meta.url),
  "utf8",
);
const serviceMigration = await readFile(
  new URL("../migrations/202607110001_service_module.sql", import.meta.url),
  "utf8",
);
const crmMigration = await readFile(
  new URL("../migrations/202607110002_crm_customer_identity.sql", import.meta.url),
  "utf8",
);
const listingPriceMigration = await readFile(
  new URL("../migrations/202607110003_unit_listing_price.sql", import.meta.url),
  "utf8",
);
const dynamicWarrantyMigration = await readFile(
  new URL("../migrations/202607110004_dynamic_sales_warranty.sql", import.meta.url),
  "utf8",
);
const financeMigration = await readFile(
  new URL("../migrations/202607110005_finance_module.sql", import.meta.url),
  "utf8",
);
const dashboardMigration = await readFile(
  new URL("../migrations/202607110006_dashboard_reports.sql", import.meta.url),
  "utf8",
);
const delistMigration = await readFile(
  new URL("../migrations/202607110007_unit_delisting.sql", import.meta.url),
  "utf8",
);
const saleUnitTestMigration = await readFile(
  new URL("../migrations/202607150001_f_sls_02_reconciliation.sql", import.meta.url),
  "utf8",
);
const salesUxFixMigration = await readFile(
  new URL("../migrations/202607150004_fase9_4_sales_ux_fixes.sql", import.meta.url),
  "utf8",
);
const manualSpecDowngradeMigration = await readFile(
  new URL("../migrations/202607150005_manual_spec_downgrade.sql", import.meta.url),
  "utf8",
);
const manualSpecDowngradeAuthFixMigration = await readFile(
  new URL("../migrations/202607150006_manual_spec_downgrade_auth_fix.sql", import.meta.url),
  "utf8",
);
const seed = await readFile(new URL("../seed.sql", import.meta.url), "utf8");

await db.exec(`
  create schema auth;
  create role authenticated;
  create role anon;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.jwt(), auth.uid() to authenticated;
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
`);
await db.exec(migration);
await db.exec(authMigration);
await db.exec(createUnitMigration);
await db.exec(photoMigration);
await db.exec(statusMigration);
await db.exec(bankStockMigration);
await db.exec(upgradeMigration);
await db.exec(hardeningMigration);
await db.exec(salesMigration);
await db.exec(serviceMigration);
await db.exec(crmMigration);
await db.exec(listingPriceMigration);
await db.exec(dynamicWarrantyMigration);
await db.exec(financeMigration);
await db.exec(dashboardMigration);
await db.exec(delistMigration);
await db.exec(saleUnitTestMigration);
await db.exec(salesUxFixMigration);
await db.exec(manualSpecDowngradeMigration);
await db.exec(manualSpecDowngradeAuthFixMigration);
await db.exec(`
  create function public.test_sale_payload() returns jsonb language sql immutable as $$
    select '{
      "test_results":{
        "identity_spec_serial":{"status":"Lulus"},
        "physical_casing_hinges":{"status":"Lulus"},
        "display_dead_pixels":{"status":"Lulus"},
        "keyboard_touchpad":{"status":"Lulus"},
        "wifi_bluetooth":{"status":"Lulus"},
        "av_devices":{"status":"Lulus"},
        "usb_ports":{"status":"Lulus"},
        "display_output":{"status":"Lulus"},
        "battery_charging_charger":{"status":"Lulus"},
        "storage_health":{"status":"Lulus"},
        "boot_os_locks":{"status":"Lulus"},
        "included_accessories":{"status":"Ada Catatan","note":"Data pengujian"}
      },
      "blocking_checks":{
        "identity_mismatch":false,
        "serial_mismatch":false,
        "spec_mismatch":false,
        "swollen_battery":false,
        "bios_lock":false,
        "mdm_lock":false,
        "unsafe_charger":false
      },
      "location":"Toko utama",
      "acknowledged":true
    }'::jsonb
  $$;
`);
await db.exec(seed);

await db.exec("begin; insert into public.customers (nama, sumber_lead) values ('Lead Marketplace', 'Facebook Marketplace')");
assert.equal(
  (await db.query("select sumber_lead from public.customers where nama = 'Lead Marketplace'")).rows[0].sumber_lead,
  "Facebook Marketplace",
);
await db.exec("rollback");

const { rows } = await db.query(
  "select modal_awal, total_modal, qr_payload from public.units where id_unit = $1",
  ["BJ-HP-2607-001"],
);

assert.deepEqual(rows[0], {
  modal_awal: "2500000.00",
  total_modal: "2750000.00",
  qr_payload: "BJ-HP-2607-001",
});
const seedStock = await db.query(
  "select stock_qty from public.bank_stock where id_part = 'BS-RAM-001'",
);
assert.equal(seedStock.rows[0].stock_qty, 4);
const seedService = await db.query(`
  select so.biaya_jasa, so.biaya_part, so.total_biaya, so.status, bs.stock_qty
  from public.service_orders so
  cross join public.bank_stock bs
  where so.id_servis = 'SVC-2607-001' and bs.id_part = 'BS-BATTERY-001'
`);
assert.deepEqual(seedService.rows[0], {
  biaya_jasa: "150000.00",
  biaya_part: "300000.00",
  total_biaya: "450000.00",
  status: "Diambil",
  stock_qty: 1,
});
await db.exec("update public.units set total_modal = 1 where id_unit = 'BJ-HP-2607-001';");
const protectedTotal = await db.query(
  "select total_modal from public.units where id_unit = 'BJ-HP-2607-001'",
);
assert.equal(protectedTotal.rows[0].total_modal, "2750000.00");
await assert.rejects(() =>
  db.query(
    "insert into public.units (id_unit, brand, modal_awal, total_modal) values ('INVALID', 'HP', 0, 0)",
  ),
);

await db.exec(`
  create role app_user;
  grant authenticated to app_user;
  set role app_user;
  select set_config('request.jwt.claims', '{}', false);
`);
await assert.rejects(
  () => db.query(`
    select public.create_sale(
      'BJ-HP-2607-001', (select id_customer from public.customers limit 1),
      null, null, null, null, 4000000, 'Offline', 'Tunai', '2026-07-10', 30,
      public.test_sale_payload()
    )
  `),
  /Hanya admin/,
);
await assert.rejects(
  () => db.query(`
    select public.create_service_order(
      null, null, 'Tanpa Role', null, null, null, 'Cleaning', 'Asus', 'Kotor',
      '2026-07-11', null, 7, false
    )
  `),
  /Role tidak diizinkan/,
);
await assert.rejects(
  () => db.query(`
    select public.add_unit_downgrade(
      'BJ-HP-2607-001', 100000, 'Spek bypass role', '2026-07-11', null
    )
  `),
  /Role tidak diizinkan mencatat downgrade/,
);
await db.exec(
  `select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"teknisi@bjstock.test","app_metadata":{"role":"teknisi"}}', false);`,
);
const techUpdate = await db.query(
  "update public.units set status = 'QC' where id_unit = 'BJ-HP-2607-001'",
);
assert.equal(techUpdate.affectedRows, 0);
const externalService = await db.query(`
  select (public.create_service_order(
    null, null, 'Customer Servis', '6282222222222', 'Lainnya', 'WA',
    'Cleaning', 'Asus VivoBook', 'Kipas berdebu', '2026-07-11', '2026-07-12', 7, false
  )).id_servis as id_servis
`);
assert.equal(externalService.rows[0].id_servis, "SVC-2607-002");
await assert.rejects(
  () => db.query(`
    select public.create_service_order(
      'BJ-HP-2607-001', (select id_customer from public.customers limit 1),
      null, null, null, null, 'Repair', null, 'Klaim teknisi',
      '2026-07-11', null, 7, true
    )
  `),
  /Hanya admin/,
);
await db.query(`
  select public.update_service_status(
    'SVC-2607-002', 'Diagnosa', 'Debu menumpuk', null, null, '2026-07-12'
  )
`);
await assert.rejects(() => db.query(`
  select public.update_service_status(
    'SVC-2607-002', 'Selesai', null, null, 300000, null
  )
`));
await db.query(`
  select public.update_service_status(
    'SVC-2607-002', 'Dikerjakan', null, 'Bongkar dan cleaning', null, null
  )
`);
await db.query(
  "insert into public.upgrade_log (id_unit, jenis, biaya, catatan) values ('BJ-HP-2607-001', 'service', 0, 'Pemeriksaan teknisi')",
);
await assert.rejects(
  () => db.query(`
    select public.create_sale(
      'BJ-HP-2607-001', (select id_customer from public.customers limit 1),
      null, null, null, null, 4000000, 'Offline', 'Tunai', '2026-07-10', 30,
      public.test_sale_payload()
    )
  `),
  /Hanya admin/,
);
await db.exec(
  `select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","email":"admin@bjstock.test","app_metadata":{"role":"admin"}}', false);`,
);
const adminUpdate = await db.query(
  "update public.units set status = 'QC' where id_unit = 'BJ-HP-2607-001'",
);
assert.equal(adminUpdate.affectedRows, 1);
await db.query("select public.advance_unit_status('BJ-HP-2607-001')");
await assert.rejects(
  () => db.query("select public.advance_unit_status('BJ-HP-2607-001')"),
  /Harga listing wajib/,
);
await db.query("select public.advance_unit_status('BJ-HP-2607-001', 4200000)");
await db.query("select public.advance_unit_status('BJ-HP-2607-001', 3900000)");
const listingPrice = await db.query(
  "select harga_listing from public.units where id_unit = 'BJ-HP-2607-001'",
);
assert.equal(listingPrice.rows[0].harga_listing, "3900000.00");
await assert.rejects(() => db.query("select public.advance_unit_status('BJ-HP-2607-001')"));
await assert.rejects(() =>
  db.query("update public.units set status = 'Terjual' where id_unit = 'BJ-HP-2607-001'"),
);
const julyUnit = await db.query(`
  select (public.create_unit(
    'Lenovo', 'ThinkPad T480', 'SEED-LENOVO-001', 'Core i5', 'B', 'Normal',
    'Perorangan', 3000000, '2026-07-11'
  )).id_unit as id_unit
`);
assert.equal(julyUnit.rows[0].id_unit, "BJ-LENOVO-2607-003");
const augustUnit = await db.query(`
  select (public.create_unit(
    'Acer', 'Swift 3', 'SEED-ACER-001', 'Core i5', 'A', 'Normal',
    'Perorangan', 3500000, '2026-08-01'
  )).id_unit as id_unit
`);
assert.equal(augustUnit.rows[0].id_unit, "BJ-ACER-2608-001");
const createdPart = await db.query(`
  select (public.create_bank_part('RAM', 'New', 2, 300000, 'Distributor')).id_part as id_part
`);
assert.equal(createdPart.rows[0].id_part, "BS-RAM-002");
await db.query("select public.create_bank_part('SSD', 'New', 0, 400000, 'Distributor')");
await assert.rejects(() =>
  db.query(`
    select public.add_unit_upgrade(
      'BJ-HP-2607-001', 'BS-SSD-001', 0, '2026-07-12', 'Harus ditolak'
    )
  `),
);
const emptyStock = await db.query(
  "select stock_qty from public.bank_stock where id_part = 'BS-SSD-001'",
);
assert.equal(emptyStock.rows[0].stock_qty, 0);
await db.query(`
  select public.update_bank_part('BS-RAM-002', 'RAM', 'New', 3, 300000, 'Distributor')
`);
const partStock = await db.query(
  "select stock_qty from public.bank_stock where id_part = 'BS-RAM-002'",
);
assert.equal(partStock.rows[0].stock_qty, 5);
await assert.rejects(() =>
  db.query(`select public.update_bank_part('BS-RAM-002', 'RAM', 'New', -1, 300000, 'Distributor')`),
);
const partUpgrade = await db.query(`
  select (public.add_unit_upgrade(
    'BJ-HP-2607-001', 'BS-RAM-001', 999999, '2026-07-12', 'Upgrade RAM'
  )).id_log as id_log
`);
let moneyCheck = await db.query(`
  select u.total_modal, b.stock_qty
  from public.units u cross join public.bank_stock b
  where u.id_unit = 'BJ-HP-2607-001' and b.id_part = 'BS-RAM-001'
`);
assert.deepEqual(moneyCheck.rows[0], { total_modal: "3000000.00", stock_qty: 3 });
await db.query(`
  select public.update_bank_part('BS-RAM-001', 'RAM 8 GB DDR4', 'Copotan', 0, 300000, 'Unit donor')
`);
await db.query("update public.upgrade_log set catatan = 'Catatan diperbarui' where id_log = $1", [
  partUpgrade.rows[0].id_log,
]);
const historicalCost = await db.query(
  "select biaya from public.upgrade_log where id_log = $1",
  [partUpgrade.rows[0].id_log],
);
assert.equal(historicalCost.rows[0].biaya, "250000.00");
await db.query(`
  select public.update_bank_part('BS-RAM-001', 'RAM 8 GB DDR4', 'Copotan', 0, 250000, 'Unit donor')
`);
const serviceUpgrade = await db.query(`
  select (public.add_unit_upgrade(
    'BJ-HP-2607-001', null, 100000, '2026-07-12', 'Jasa pemasangan'
  )).id_log as id_log
`);
await db.query("update public.upgrade_log set biaya = 150000 where id_log = $1", [
  serviceUpgrade.rows[0].id_log,
]);
moneyCheck = await db.query(
  "select total_modal from public.units where id_unit = 'BJ-HP-2607-001'",
);
assert.equal(moneyCheck.rows[0].total_modal, "3150000.00");
await db.query("delete from public.upgrade_log where id_log = $1", [serviceUpgrade.rows[0].id_log]);
await db.query("delete from public.upgrade_log where id_log = $1", [partUpgrade.rows[0].id_log]);
moneyCheck = await db.query(`
  select u.total_modal, b.stock_qty
  from public.units u cross join public.bank_stock b
  where u.id_unit = 'BJ-HP-2607-001' and b.id_part = 'BS-RAM-001'
`);
assert.deepEqual(moneyCheck.rows[0], { total_modal: "2750000.00", stock_qty: 4 });

const downgradeFinanceBefore = await db.query(`
  select count(*)::integer as count
  from public.finance_transactions
  where source_type = 'UpgradeLog'
`);
const manualDowngrade = await db.query(`
  select (public.add_unit_downgrade(
    'BJ-LENOVO-2607-003', 200000, 'Core i5, RAM 4 GB', '2026-07-12', 'Turunkan RAM 8 GB ke 4 GB'
  )).id_log as id_log
`);
const downgradeCheck = await db.query(`
  select u.total_modal, u.spek_saat_ini, l.jenis, l.biaya, l.spek_setelah, b.stock_qty
  from public.units u
  join public.upgrade_log l on l.id_log = $1
  cross join public.bank_stock b
  where u.id_unit = 'BJ-LENOVO-2607-003' and b.id_part = 'BS-RAM-001'
`, [manualDowngrade.rows[0].id_log]);
assert.deepEqual(downgradeCheck.rows[0], {
  total_modal: "2800000.00",
  spek_saat_ini: "Core i5, RAM 4 GB",
  jenis: "downgrade",
  biaya: "200000.00",
  spek_setelah: "Core i5, RAM 4 GB",
  stock_qty: 4,
});
const downgradeFinanceAfter = await db.query(`
  select count(*)::integer as count
  from public.finance_transactions
  where source_type = 'UpgradeLog'
`);
assert.equal(downgradeFinanceAfter.rows[0].count, downgradeFinanceBefore.rows[0].count);
await assert.rejects(
  () => db.query(`
    select public.add_unit_downgrade(
      'BJ-LENOVO-2607-003', 3000000, 'Spek tidak valid', '2026-07-12', null
    )
  `),
  /Total modal harus tetap lebih dari 0/,
);
const rejectedDowngrade = await db.query(`
  select total_modal, spek_saat_ini from public.units where id_unit = 'BJ-LENOVO-2607-003'
`);
assert.deepEqual(rejectedDowngrade.rows[0], {
  total_modal: "2800000.00",
  spek_saat_ini: "Core i5, RAM 4 GB",
});
const blockedDowngradeDelete = await db.query(
  "delete from public.upgrade_log where id_log = $1",
  [manualDowngrade.rows[0].id_log],
);
assert.equal(blockedDowngradeDelete.affectedRows, 0);
await assert.rejects(
  () => db.query(`
    insert into public.upgrade_log (
      id_unit, jenis, biaya, spek_setelah, tanggal, catatan
    ) values (
      'BJ-LENOVO-2607-003', 'downgrade', 100000, 'Bypass spek', '2026-07-12', 'Bypass RPC'
    )
  `),
  /Downgrade wajib melalui add_unit_downgrade/,
);

const sellableUnit = await db.query(
  "select status from public.units where id_unit = 'BJ-HP-2607-001'",
);
assert.equal(sellableUnit.rows[0].status, "Listed");
const sale = await db.query(`
  select (public.create_sale(
    'BJ-HP-2607-001', (select id_customer from public.customers where kontak_wa = '6281234567890'),
    null, null, null, null, 4000000, 'Offline', 'Tunai', '2026-07-10', 45,
    public.test_sale_payload()
  )).id_invoice as id_invoice
`);
assert.equal(sale.rows[0].id_invoice, "INV-2607-002");
const saleMoney = await db.query(
  "select margin from public.sales where id_invoice = 'INV-2607-002'",
);
assert.equal(saleMoney.rows[0].margin, "1250000.00");
const soldUnit = await db.query(
  "select status from public.units where id_unit = 'BJ-HP-2607-001'",
);
assert.equal(soldUnit.rows[0].status, "Terjual");
const unitWarranty = await db.query(`
  select w.tanggal_mulai, w.tanggal_berakhir, w.status, s.durasi_garansi_hari
  from public.warranty w
  join public.sales s on s.id_unit = w.id_unit
  where w.id_unit = 'BJ-HP-2607-001'
`);
assert.equal(unitWarranty.rows[0].tanggal_mulai.toISOString().slice(0, 10), "2026-07-10");
assert.equal(unitWarranty.rows[0].tanggal_berakhir.toISOString().slice(0, 10), "2026-08-24");
assert.equal(unitWarranty.rows[0].status, "Aktif");
assert.equal(unitWarranty.rows[0].durasi_garansi_hari, 45);
await assert.rejects(() => db.query(`
  select public.create_sale(
    'BJ-HP-2607-001', (select id_customer from public.customers limit 1),
    null, null, null, null, 4100000, 'WA', 'Transfer', '2026-07-10', 30,
    public.test_sale_payload()
  )
`));
const claim = await db.query(`
  select (public.create_warranty_claim(
    'BJ-HP-2607-001', '2026-07-10', 'Keyboard bermasalah', 'Ganti keyboard', 0
  )).biaya as biaya
`);
assert.equal(claim.rows[0].biaya, "0.00");

await db.query("select public.advance_unit_status('BJ-LENOVO-2607-003')");
await db.query("select public.advance_unit_status('BJ-LENOVO-2607-003')");
await db.query(`
  select public.create_sale(
    'BJ-LENOVO-2607-003', null,
    'Customer Baru', '6281111111111', 'Pelajar', 'WA',
    3500000, 'Marketplace', 'Transfer', '2026-01-01', 14,
    public.test_sale_payload()
  )
`);
const createdCustomer = await db.query(
  "select nama from public.customers where kontak_wa = '6281111111111'",
);
assert.equal(createdCustomer.rows[0].nama, "Customer Baru");
await db.query("select public.refresh_unit_warranty('BJ-LENOVO-2607-003')");
const expiredWarranty = await db.query(`
  select tanggal_berakhir, status
  from public.warranty where id_unit = 'BJ-LENOVO-2607-003'
`);
assert.equal(expiredWarranty.rows[0].tanggal_berakhir.toISOString().slice(0, 10), "2026-01-15");
assert.equal(expiredWarranty.rows[0].status, "Habis");

const servicePart = await db.query(`
  select (public.create_bank_part('Keyboard', 'New', 2, 200000, 'Distributor')).id_part as id_part
`);
assert.equal(servicePart.rows[0].id_part, "BS-KEYBOARD-001");
await db.query(`
  select public.add_service_part('SVC-2607-002', 'BS-KEYBOARD-001', '2026-07-11')
`);
await db.query(`
  select public.update_service_status(
    'SVC-2607-002', 'Selesai', null, null, 300000, null
  )
`);
await db.exec(
  `select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"teknisi@bjstock.test","app_metadata":{"role":"teknisi"}}', false);`,
);
await assert.rejects(
  () => db.query(`
    select public.update_service_status(
      'SVC-2607-002', 'Diambil', null, null, null, null
    )
  `),
  /Hanya admin/,
);
await db.exec(
  `select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","email":"admin@bjstock.test","app_metadata":{"role":"admin"}}', false);`,
);
await db.query(`
  select public.update_service_status(
    'SVC-2607-002', 'Diambil', null, null, null, null
  )
`);
const externalResult = await db.query(`
  select so.biaya_jasa, so.biaya_part, so.total_biaya, so.status,
         so.tanggal_selesai, so.tanggal_diambil, bs.stock_qty
  from public.service_orders so
  cross join public.bank_stock bs
  where so.id_servis = 'SVC-2607-002' and bs.id_part = 'BS-KEYBOARD-001'
`);
assert.equal(externalResult.rows[0].biaya_jasa, "300000.00");
assert.equal(externalResult.rows[0].biaya_part, "200000.00");
assert.equal(externalResult.rows[0].total_biaya, "500000.00");
assert.equal(externalResult.rows[0].status, "Diambil");
assert.equal(externalResult.rows[0].stock_qty, 1);
assert.equal(externalResult.rows[0].tanggal_selesai.toISOString().slice(0, 10), jakartaToday);
assert.equal(externalResult.rows[0].tanggal_diambil.toISOString().slice(0, 10), jakartaToday);
await assert.rejects(() => db.query(`
  select public.add_service_part('SVC-2607-002', 'BS-KEYBOARD-001', '2026-07-11')
`));

const warrantyService = await db.query(`
  select (public.create_service_order(
    'BJ-HP-2607-001',
    (select id_customer from public.customers where kontak_wa = '6281234567890'),
    null, null, null, null, 'Repair', null, 'Keyboard bermasalah lagi',
    '2026-07-11', '2026-07-12', 7, true
  )).id_servis as id_servis
`);
assert.equal(warrantyService.rows[0].id_servis, "SVC-2607-003");
await assert.rejects(() => db.query(`
  select public.add_service_part('SVC-2607-003', 'BS-KEYBOARD-001', '2026-07-11')
`));
await db.query(`
  select public.update_service_status(
    'SVC-2607-003', 'Diagnosa', 'Keyboard rusak', null, null, null
  )
`);
await db.query(`
  select public.update_service_status(
    'SVC-2607-003', 'Dikerjakan', null, 'Ganti keyboard', null, null
  )
`);
await db.query(`
  select public.add_service_part('SVC-2607-003', 'BS-KEYBOARD-001', '2026-07-11')
`);
await assert.rejects(() => db.query(`
  select public.add_service_part('SVC-2607-003', 'BS-KEYBOARD-001', '2026-07-11')
`));
await db.query(`
  select public.update_service_status(
    'SVC-2607-003', 'Selesai', null, null, 0, null
  )
`);
const warrantyServiceResult = await db.query(`
  select so.biaya_part, so.total_biaya, so.id_klaim, wc.biaya as biaya_klaim,
         wc.tindakan, w.id_unit, bs.stock_qty
  from public.service_orders so
  join public.warranty_claim wc on wc.id_klaim = so.id_klaim
  join public.warranty w on w.id_garansi = wc.id_garansi
  cross join public.bank_stock bs
  where so.id_servis = 'SVC-2607-003' and bs.id_part = 'BS-KEYBOARD-001'
`);
assert.equal(warrantyServiceResult.rows[0].biaya_part, "200000.00");
assert.equal(warrantyServiceResult.rows[0].total_biaya, "200000.00");
assert.equal(warrantyServiceResult.rows[0].biaya_klaim, "0.00");
assert.equal(warrantyServiceResult.rows[0].tindakan, "Ganti keyboard");
assert.equal(warrantyServiceResult.rows[0].id_unit, "BJ-HP-2607-001");
assert.equal(warrantyServiceResult.rows[0].stock_qty, 0);

await db.query(`
  select public.create_service_order(
    null, null, 'Nama Tidak Boleh Menimpa', '+6281234567890', 'Lainnya', 'WA',
    'Cleaning', 'Laptop Customer Lama', 'Servis berulang',
    '2026-07-11', null, 7, false
  )
`);
const deduplicatedCustomer = await db.query(`
  select count(*)::integer as total, min(nama) as nama
  from public.customers where kontak_wa = '6281234567890'
`);
assert.deepEqual(deduplicatedCustomer.rows[0], { total: 1, nama: "Customer Seed" });

const crmUnit = await db.query(`
  select (public.create_unit(
    'CRM', 'Repeat Customer', 'SEED-CRM-001', 'Core i5', 'B', 'Normal',
    'Perorangan', 2000000, '2026-07-11'
  )).id_unit as id_unit
`);
await db.query("select public.advance_unit_status($1)", [crmUnit.rows[0].id_unit]);
await db.query("select public.advance_unit_status($1)", [crmUnit.rows[0].id_unit]);
await db.query(`
  select public.create_sale(
    $1, null, 'Nama Juga Tidak Boleh Menimpa', '081234567890', 'Lainnya', 'WA',
    3000000, 'Offline', 'Tunai', '2026-07-11', 7,
    public.test_sale_payload()
  )
`, [crmUnit.rows[0].id_unit]);
const salesDeduplicatedCustomer = await db.query(`
  select count(*)::integer as total, min(nama) as nama
  from public.customers where kontak_wa = '6281234567890'
`);
assert.deepEqual(salesDeduplicatedCustomer.rows[0], { total: 1, nama: "Customer Seed" });

await db.exec("reset role;");
await db.exec("update public.service_orders set biaya_part = 1 where id_servis = 'SVC-2607-003';");
const protectedServiceCost = await db.query(
  "select biaya_part, total_biaya from public.service_orders where id_servis = 'SVC-2607-003'",
);
assert.deepEqual(protectedServiceCost.rows[0], {
  biaya_part: "200000.00",
  total_biaya: "200000.00",
});
const publicPath = await db.query(
  "select qr_payload from public.service_orders where id_servis = 'SVC-2607-003'",
);
assert.match(publicPath.rows[0].qr_payload, /^\/s\/SVC-2607-003-[0-9a-f-]{36}$/);
await db.exec("set role anon;");
const publicService = await db.query(
  "select id_servis, status, estimasi_selesai from public.get_public_service($1)",
  [publicPath.rows[0].qr_payload.slice(3)],
);
assert.equal(publicService.rows[0].id_servis, "SVC-2607-003");
assert.equal(publicService.rows[0].status, "Selesai");
const guessedPublicService = await db.query(
  "select id_servis from public.get_public_service('SVC-2607-003')",
);
assert.equal(guessedPublicService.rows.length, 0);
await assert.rejects(() => db.query("select * from public.service_orders"));
await db.exec("reset role;");

// --- Finance Module Tests ---

// 1. Verify finance accounts seeded
const accounts = await db.query(
  "select nama from public.finance_accounts order by nama"
);
assert.equal(accounts.rows.length, 2);
assert.equal(accounts.rows[0].nama, "Bank Utama");
assert.equal(accounts.rows[1].nama, "Kas Toko");

// 2. Check Pembelian Unit entries (2 seed + 3 test-created units: Lenovo, Acer, CRM)
const unitPurchases = await db.query(`
  select count(*)::integer as cnt from public.finance_transactions
  where kategori = 'Pembelian Unit'
`);
assert.equal(unitPurchases.rows[0].cnt, 5);

// 3. Verify specific unit purchase entry
const lenovoPurchase = await db.query(`
  select jumlah, arah from public.finance_transactions
  where source_event_key = 'unit-purchase:BJ-LENOVO-2607-003'
`);
assert.equal(Number(lenovoPurchase.rows[0].jumlah), 3000000);
assert.equal(lenovoPurchase.rows[0].arah, "Keluar");

// 4. Check Pembelian Part entries (3 restocks)
const partPurchases = await db.query(`
  select count(*)::integer as cnt from public.finance_transactions
  where kategori = 'Pembelian Part'
`);
assert.equal(partPurchases.rows[0].cnt, 3);

// 5. Verify part restock totals
const partTotal = await db.query(`
  select sum(jumlah) as total from public.finance_transactions
  where kategori = 'Pembelian Part'
`);
assert.equal(Number(partTotal.rows[0].total), 1900000); // 600k + 900k + 400k

// 6. Check external upgrade entry
const externalUpgrade = await db.query(`
  select count(*)::integer as total,
    sum(case when arah = 'Keluar' then jumlah else -jumlah end) as net
  from public.finance_transactions
  where kategori = 'Biaya Upgrade Eksternal'
`);
assert.equal(externalUpgrade.rows[0].total, 4);
assert.equal(Number(externalUpgrade.rows[0].net), 0);

// 7. Check Penjualan Unit entries (seed + test sale + Lenovo + CRM)
const salesIncome = await db.query(`
  select count(*)::integer as cnt, sum(jumlah) as total
  from public.finance_transactions
  where kategori = 'Penjualan Unit'
`);
assert.equal(salesIncome.rows[0].cnt, 4);
assert.equal(Number(salesIncome.rows[0].total), 14300000); // 3.8M + 4M + 3.5M + 3M

// 8. Test Cicilan flow: advance BJ-ACER to Listed, create cicilan sale
await db.query("select public.advance_unit_status('BJ-ACER-2608-001')"); // Masuk→QC
await db.query("select public.advance_unit_status('BJ-ACER-2608-001')"); // QC→Ready
await db.query("select public.advance_unit_status('BJ-ACER-2608-001', 4200000)"); // Ready→Listed

const cicilanSale = await db.query(`
  select (public.create_sale(
    'BJ-ACER-2608-001',
    (select id_customer from public.customers where kontak_wa = '6281234567890'),
    null, null, null, null,
    4200000, 'Offline', 'Cicilan', '2026-08-01', 30,
    public.test_sale_payload()
  )).id_invoice as id_invoice
`);
assert.equal(cicilanSale.rows[0].id_invoice, "INV-2608-001");

// 9. Verify receivable created for cicilan
const receivable = await db.query(`
  select total_tagihan, total_dibayar, status from public.receivables
  where source_type = 'Sales' and source_id = 'INV-2608-001'
`);
assert.equal(Number(receivable.rows[0].total_tagihan), 4200000);
assert.equal(Number(receivable.rows[0].total_dibayar), 0);
assert.equal(receivable.rows[0].status, "Belum Lunas");

// 10. Record partial payment
await assert.rejects(
  () => db.query(`
    select public.record_sale_payment('INV-2607-001', 1, 'cash-sale-extra')
  `),
  /hanya untuk penjualan Cicilan/,
);
await assert.rejects(
  () => db.query(`
    select public.record_sale_payment('INV-2608-001', 4200001, 'sale-overpay')
  `),
  /melebihi sisa tagihan/,
);
await db.query(`
  select public.record_sale_payment('INV-2608-001', 2000000, 'sale-partial-1')
`);
const partialPaid = await db.query(`
  select total_dibayar, status from public.receivables
  where source_id = 'INV-2608-001'
`);
assert.equal(Number(partialPaid.rows[0].total_dibayar), 2000000);
assert.equal(partialPaid.rows[0].status, "Belum Lunas");
await db.query(`
  select public.record_sale_payment('INV-2608-001', 2000000, 'sale-partial-1')
`);
const retriedPayment = await db.query(`
  select count(*)::integer as total
  from public.finance_transactions
  where source_event_key = 'sale-payment:sale-partial-1'
`);
assert.equal(retriedPayment.rows[0].total, 1);

// 11. Record remaining payment (full payment)
await db.query(`
  select public.record_sale_payment('INV-2608-001', 2200000, 'sale-final-1')
`);
const fullPaid = await db.query(`
  select total_dibayar, status from public.receivables
  where source_id = 'INV-2608-001'
`);
assert.equal(Number(fullPaid.rows[0].total_dibayar), 4200000);
assert.equal(fullPaid.rows[0].status, "Lunas");
await db.query(`
  select public.reverse_transaction(
    (select id_transaksi from public.finance_transactions
      where source_event_key = 'sale-payment:sale-final-1'),
    'Pembayaran cicilan dibatalkan'
  )
`);
const reversedPayment = await db.query(`
  select total_dibayar, status from public.receivables
  where source_id = 'INV-2608-001'
`);
assert.equal(Number(reversedPayment.rows[0].total_dibayar), 2000000);
assert.equal(reversedPayment.rows[0].status, "Belum Lunas");

// 12. Test service payment (SVC-2607-002 has total_biaya 500k)
await db.query(`
  select public.record_service_payment('SVC-2607-002', 500000, 'service-full-1')
`);
const serviceReceivable = await db.query(`
  select total_dibayar, status from public.receivables
  where source_type = 'Servis' and source_id = 'SVC-2607-002'
`);
assert.equal(Number(serviceReceivable.rows[0].total_dibayar), 500000);
assert.equal(serviceReceivable.rows[0].status, "Lunas");

// 13. Test opex recording
const opexResult = await db.query(`
  select id_transaksi, jumlah, catatan from public.record_opex(
    150000, 'Biaya listrik dan internet'
  )
`);
assert.equal(Number(opexResult.rows[0].jumlah), 150000);
assert.equal(opexResult.rows[0].catatan, "Biaya listrik dan internet");

// 14. Test modal disetor
const modalResult = await db.query(`
  select jumlah from public.record_modal_disetor(5000000, 'Setoran awal owner')
`);
assert.equal(Number(modalResult.rows[0].jumlah), 5000000);

// 15. Test reversal
const reversalResult = await db.query(`
  select id_transaksi, is_reversal from public.reverse_transaction(
    $1, 'Koreksi: salah nominal'
  )
`, [opexResult.rows[0].id_transaksi]);
assert.equal(reversalResult.rows[0].is_reversal, true);

// 16. Verify double reversal rejected
await assert.rejects(
  () => db.query(`
    select public.reverse_transaction($1, 'Double reversal')
  `, [opexResult.rows[0].id_transaksi]),
  /sudah di-reversal/
);

// 17. Test process_return for service (SVC-2607-002)
await assert.rejects(
  () => db.query(`
    select public.process_return(
      'Sales', 'INV-2608-001', 'Refund melebihi pembayaran', 4200000
    )
  `),
  /pembayaran yang diterima/,
);
const serviceReturn = await db.query(`
  select id_retur from public.process_return(
    'Servis', 'SVC-2607-002', 'Tidak puas dengan hasil servis', 500000
  )
`);
const checkServiceReturn = await db.query(`
  select status, jumlah_refund from public.returns where id_retur = $1
`, [serviceReturn.rows[0].id_retur]);
assert.equal(checkServiceReturn.rows[0].status, "Selesai");
assert.equal(Number(checkServiceReturn.rows[0].jumlah_refund), 500000);
await assert.rejects(
  () => db.query(`
    select public.process_return(
      'Servis', 'SVC-2607-002', 'Retur duplikat', 500000
    )
  `),
  /sudah diretur/,
);

// 18. Test process_return for unit sale (INV-2601-001 = BJ-LENOVO)
const unitReturn = await db.query(`
  select id_retur from public.process_return(
    'Sales', 'INV-2601-001', 'Cacat produksi', 3500000
  )
`);
const checkUnitReturn = await db.query(`
  select status, jumlah_refund from public.returns where id_retur = $1
`, [unitReturn.rows[0].id_retur]);
assert.equal(checkUnitReturn.rows[0].status, "Selesai");
assert.equal(Number(checkUnitReturn.rows[0].jumlah_refund), 3500000);

// 19. Verify returned unit reverted to Ready
const returnedUnit = await db.query(`
  select status from public.units where id_unit = 'BJ-LENOVO-2607-003'
`);
assert.equal(returnedUnit.rows[0].status, "Ready");

// 20. Verify warranty expired after return
const returnedUnitWarranty = await db.query(`
  select count(*)::integer as cnt from public.warranty
  where id_unit = 'BJ-LENOVO-2607-003' and status = 'Aktif'
`);
assert.equal(returnedUnitWarranty.rows[0].cnt, 0);

// 21. RLS: teknisi denied access to all finance tables
await db.exec(`
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"teknisi@bjstock.test","app_metadata":{"role":"teknisi"}}', false);
`);
await db.exec("set role authenticated;");
for (const table of [
  "finance_transactions",
  "finance_accounts",
  "receivables",
  "finance_payments",
  "returns",
]) {
  const result = await db.query(`select * from public.${table} limit 1`);
  assert.equal(result.rows.length, 0);
  const privileges = await db.query(`
    select
      has_table_privilege(current_user, 'public.${table}', 'INSERT') as can_insert,
      has_table_privilege(current_user, 'public.${table}', 'UPDATE') as can_update,
      has_table_privilege(current_user, 'public.${table}', 'DELETE') as can_delete
  `);
  assert.deepEqual(privileges.rows[0], {
    can_insert: false,
    can_update: false,
    can_delete: false,
  });
}
await assert.rejects(() => db.query(`
  select public.record_finance_txn(
    'Masuk', 'Lainnya', gen_random_uuid(), 1,
    'Manual', null, null, 'forbidden', 'forbidden'
  )
`), /permission denied/);
await assert.rejects(
  () => db.query("select public.record_opex(1, 'forbidden')"),
  /Hanya admin/,
);
await assert.rejects(
  () => db.query("select * from public.get_receivables()"),
  /Hanya admin/,
);
await db.exec("reset role;");

// 22. Verify report functions work
await db.exec(`
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","email":"admin@bjstock.test","app_metadata":{"role":"admin"}}', false);
`);
const cashFlow = await db.query(`
  select * from public.get_cash_flow('2026-07-01', '2026-08-31')
`);
assert.ok(cashFlow.rows.length > 0);

const receivablesAging = await db.query(`
  select * from public.get_receivables()
`);
assert.ok(receivablesAging.rows.length > 0);

const profitLoss = await db.query(`
  select * from public.get_profit_loss('2026-07-01', '2026-08-31')
`);
assert.ok(profitLoss.rows.length > 0);
// 15M Sales + 950k Servis - 4M Retur - 11.25M HPP - 500k part - 0 opex net reversal = 200k.
assert.equal(Number(profitLoss.rows[0].pendapatan_sales), 15000000);
assert.equal(Number(profitLoss.rows[0].pendapatan_servis), 950000);
assert.equal(Number(profitLoss.rows[0].retur), 4000000);
assert.equal(Number(profitLoss.rows[0].hpp_unit), 11250000);
assert.equal(Number(profitLoss.rows[0].biaya_part_servis), 500000);
assert.equal(Number(profitLoss.rows[0].operasional), 0);
assert.equal(Number(profitLoss.rows[0].laba_bersih), 200000);

// 21. Dashboard summary — unit per status
const dashSummary = await db.query("select * from public.get_dashboard_summary()");
assert.ok(dashSummary.rows.length > 0);
const totalUnitsDash = dashSummary.rows.reduce((sum, r) => sum + Number(r.jumlah), 0);
assert.ok(totalUnitsDash > 0, "dashboard summary should have units");

// 22. Active services
const activeServices = await db.query("select * from public.get_active_services()");
// Seed service SVC-2607-001 is "Diambil" so it should NOT appear; test-created ones may vary
assert.ok(Array.isArray(activeServices.rows));

// 23. Warranty expiring
const warrantyExpiring = await db.query("select * from public.get_warranty_expiring(7)");
assert.ok(Array.isArray(warrantyExpiring.rows));

// 24. Margin report
const marginReport = await db.query("select * from public.get_margin_report('2026-01-01', '2026-12-31')");
assert.ok(marginReport.rows.length > 0, "margin report should have data");
// Seed sale: Dell 3.8M, margin 800k; test sales add more
const totalMargin = marginReport.rows.reduce((sum, r) => sum + Number(r.total_margin), 0);
assert.ok(totalMargin > 0, "total margin should be positive");

// 25. Stock turnover
const turnover = await db.query("select * from public.get_stock_turnover('2026-01-01', '2026-12-31')");
assert.ok(turnover.rows.length > 0, "stock turnover should have data");
// Each row should have a numeric rata_rata_hari (may be negative in test data with backdated sales)
for (const row of turnover.rows) {
  assert.ok(!Number.isNaN(Number(row.rata_rata_hari)), `rata_rata_hari should be numeric, got: ${row.rata_rata_hari}`);
}

// 26. Lead conversion
const leads = await db.query("select * from public.get_lead_conversion('2026-01-01', '2026-12-31')");
assert.ok(leads.rows.length > 0, "lead conversion should have data");
const totalLeadRevenue = leads.rows.reduce((sum, r) => sum + Number(r.total_revenue), 0);
assert.ok(totalLeadRevenue > 0, "total lead revenue should be positive");

// 27. Edge-case: opex dengan jumlah 0 harus ditolak
await assert.rejects(
  () => db.query("select public.record_opex(0, 'Test nol', '2026-07-11')"),
  /lebih dari 0/,
);
// 28. Edge-case: opex dengan catatan kosong harus ditolak
await assert.rejects(
  () => db.query("select public.record_opex(1000, '', '2026-07-11')"),
  /Catatan wajib diisi/,
);
// 29. Edge-case: modal disetor dengan jumlah negatif harus ditolak
await assert.rejects(
  () => db.query("select public.record_modal_disetor(-1000, 'Test negatif')"),
  /lebih dari 0/,
);
// 30. Edge-case: reversal terhadap transaksi yang sudah di-reversal harus ditolak
// (opexResult.rows[0].id_transaksi sudah di-reversal di test 15)
await assert.rejects(
  () => db.query("select public.reverse_transaction($1, 'Reversal ganda')", [opexResult.rows[0].id_transaksi]),
  /sudah di-reversal/,
);
// 31. Edge-case: retur dengan refund 0 harus ditolak
await assert.rejects(
  () => db.query("select public.process_return('Servis', 'SVC-2607-001', 'Refund nol', 0)"),
  /lebih dari 0/,
);
// 32. Edge-case: pembayaran cicilan idempotent dengan event key baru dipanggil 2x
const idemp1 = await db.query(`
  select id_transaksi from public.record_sale_payment('INV-2608-001', 500000, 'sale-idemp-test-1')
`);
assert.ok(idemp1.rows.length > 0);
const idempTxnId = idemp1.rows[0].id_transaksi;
// Calling again with same event_key + same data should return the same transaction (idempotent)
const idemp2 = await db.query(`
  select id_transaksi from public.record_sale_payment('INV-2608-001', 500000, 'sale-idemp-test-1')
`);
assert.equal(idemp2.rows[0].id_transaksi, idempTxnId);
// But calling with same event_key + different amount should be rejected
await assert.rejects(
  () => db.query(`
    select id_transaksi from public.record_sale_payment('INV-2608-001', 1, 'sale-idemp-test-1')
  `),
  /sudah dipakai dengan data berbeda/,
);

// 34. Delist unit — rusak (no reversal)
// BJ-DELL-2607-002 was sold (Terjual) so can't delist — use returned unit BJ-LENOVO-2607-003 (Ready after return)
const delistRusak = await db.query(`
  select status, delist_jenis from public.delist_unit(
    'BJ-LENOVO-2607-003', 'LCD pecah, tidak ekonomis diperbaiki', 'rusak'
  )
`);
assert.equal(delistRusak.rows[0].status, "Delisted");
assert.equal(delistRusak.rows[0].delist_jenis, "rusak");
// Verify no new reversal finance for 'rusak'
const rusakReversals = await db.query(`
  select count(*)::integer as cnt from public.finance_transactions
  where source_id = 'BJ-LENOVO-2607-003' and is_reversal = true
    and catatan like '%Delist unit%'
`);
assert.equal(rusakReversals.rows[0].cnt, 0);

// 35. Delist unit — retur_supplier (with reversal)
// Create a new unit for this test and capture its ID
const newAsus = await db.query(`
  select (public.create_unit(
    'Asus', 'ZenBook 14', 'SEED-ASUS-DELIST', 'Core i7', 'A', 'Normal',
    'Distributor', 2000000, '2026-07-11'
  )).id_unit as id_unit
`);
const asusId = newAsus.rows[0].id_unit;
// Advance to Ready so it can be delisted
await db.query(`select public.advance_unit_status('${asusId}')`); // Masuk -> QC
await db.query(`select public.advance_unit_status('${asusId}')`); // QC -> Ready
const delistSupplier = await db.query(`
  select status, delist_jenis from public.delist_unit(
    '${asusId}', 'Retur ke distributor, unit cacat pabrik', 'retur_supplier'
  )
`);
assert.equal(delistSupplier.rows[0].status, "Delisted");
assert.equal(delistSupplier.rows[0].delist_jenis, "retur_supplier");
// Verify reversal finance exists
const supplierReversals = await db.query(`
  select count(*)::integer as cnt from public.finance_transactions
  where source_id = '${asusId}' and is_reversal = true
`);
assert.ok(supplierReversals.rows[0].cnt > 0, "retur_supplier should create finance reversal");

// 36. Reactivate unit — from Delisted back to Ready
const reactivated = await db.query(`
  select status from public.reactivate_unit('${asusId}')
`);
assert.equal(reactivated.rows[0].status, "Ready");
// Verify new purchase transaction created (since it had reversal)
const reactivateFinance = await db.query(`
  select count(*)::integer as cnt from public.finance_transactions
  where source_id = '${asusId}' and is_reversal = false
    and catatan = 'Reactivate unit setelah delist'
`);
assert.ok(reactivateFinance.rows[0].cnt > 0, "reactivate should create new purchase txn");

// 37. Delist rejected for Terjual unit
await assert.rejects(
  () => db.query("select public.delist_unit('BJ-HP-2607-001', 'Test', 'rusak')"),
  /Ready atau Listed/,
);

// 38. Delist — salah_input (hard delete)
const newMsi = await db.query(`
  select (public.create_unit(
    'MSI', 'Modern 14', 'SEED-MSI-DELETE', 'Core i5', 'B', 'Normal',
    'Perorangan', 1500000, '2026-07-11'
  )).id_unit as id_unit
`);
const msiId = newMsi.rows[0].id_unit;
// Advance to Ready
await db.query(`select public.advance_unit_status('${msiId}')`); // Masuk -> QC
await db.query(`select public.advance_unit_status('${msiId}')`); // QC -> Ready
const delistDelete = await db.query(`
  select public.delist_unit('${msiId}', 'Salah input, unit tidak ada', 'salah_input')
`);
// salah_input returns null (unit deleted)
assert.equal(delistDelete.rows[0].delist_unit, null);
// Verify unit no longer exists
const deletedUnit = await db.query(`select count(*)::integer as cnt from public.units where id_unit = '${msiId}'`);
assert.equal(deletedUnit.rows[0].cnt, 0);

await db.close();
console.log("Valid: listing 4.200.000 → 3.900.000; garansi 45 hari → 2026-08-24 dan 14 hari → 2026-01-15; servis 300.000 + part 200.000 = 500.000; finance: 5 unit + 3 part + koreksi upgrade net 0 + 4 penjualan + cicilan idempotent + servis + opex + modal + 2 retur; RLS teknisi ditolak; dashboard & laporan terverifikasi; edge-case terverifikasi; delist (rusak/retur_supplier/salah_input) + reactivate terverifikasi.");
