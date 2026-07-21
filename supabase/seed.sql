insert into public.units (
  id_unit,
  brand,
  model,
  serial_number,
  spek_awal,
  kondisi_fisik,
  kondisi_fungsi,
  sumber_beli,
  modal_awal,
  tanggal_masuk
) values (
  'BJ-HP-2607-001',
  'HP',
  'EliteBook 840 G5',
  'SEED-HP-001',
  'Core i5 / 8 GB / SSD 256 GB',
  'B',
  'Normal',
  'Trade-in',
  2500000,
  '2026-07-10'
);

insert into public.bank_stock (
  id_part,
  jenis_part,
  kondisi,
  stock_qty,
  modal_per_unit,
  sumber
) values (
  'BS-RAM-001',
  'RAM 8 GB DDR4',
  'Copotan',
  5,
  250000,
  'Unit donor'
);

insert into public.bank_stock (
  id_part,
  jenis_part,
  kondisi,
  stock_qty,
  modal_per_unit,
  sumber
) values (
  'BS-BATTERY-001',
  'Battery Laptop',
  'New',
  2,
  300000,
  'Distributor'
);

insert into public.customers (
  nama,
  kontak_wa,
  segmen,
  sumber_lead
) values (
  'Customer Seed',
  '6281234567890',
  'Pelajar',
  'Referral'
);

insert into public.service_orders (
  id_servis,
  id_customer,
  jenis_servis,
  brand_model,
  keluhan,
  diagnosa,
  tindakan,
  biaya_jasa,
  status,
  garansi_servis_hari,
  tanggal_masuk,
  estimasi_selesai,
  tanggal_selesai,
  tanggal_diambil,
  qr_payload
)
select
  'SVC-2607-001',
  id_customer,
  'Repair',
  'Asus VivoBook',
  'Laptop mati total',
  'Battery rusak',
  'Ganti battery',
  150000,
  'Diambil',
  7,
  '2026-07-10',
  '2026-07-10',
  '2026-07-10',
  '2026-07-10',
  '/s/SVC-2607-001'
from public.customers
where kontak_wa = '6281234567890';

insert into public.service_part_log (id_servis, id_part, biaya, tanggal)
values ('SVC-2607-001', 'BS-BATTERY-001', 0, '2026-07-10');

insert into public.upgrade_log (
  id_unit,
  id_part,
  jenis,
  biaya,
  tanggal,
  catatan
) values (
  'BJ-HP-2607-001',
  'BS-RAM-001',
  'part',
  250000,
  '2026-07-10',
  'Upgrade RAM seed'
);

insert into public.units (
  id_unit,
  brand,
  model,
  serial_number,
  spek_awal,
  kondisi_fisik,
  kondisi_fungsi,
  sumber_beli,
  modal_awal,
  harga_listing,
  status,
  tanggal_masuk
) values (
  'BJ-DELL-2607-002',
  'Dell',
  'Latitude 7490',
  'SEED-DELL-001',
  'Core i5 / 8 GB / SSD 256 GB',
  'B',
  'Normal',
  'Perorangan',
  3000000,
  3800000,
  'Listed',
  '2026-07-10'
);

with seeded_sale_test as (
  insert into public.sale_unit_tests (
    id_unit,
    test_results,
    blocking_checks,
    location,
    tester_user_id,
    tester_email,
    acknowledgement_text,
    confirmed_at
  ) values (
    'BJ-DELL-2607-002',
    '{
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
      "included_accessories":{"status":"Ada Catatan","note":"Data seed"}
    }'::jsonb,
    '{
      "identity_mismatch":false,
      "serial_mismatch":false,
      "spec_mismatch":false,
      "swollen_battery":false,
      "bios_lock":false,
      "mdm_lock":false,
      "unsafe_charger":false
    }'::jsonb,
    'Toko utama',
    '00000000-0000-4000-8000-000000000001',
    'seed@bjstock.test',
    'Pembeli telah menyaksikan atau menerima ringkasan hasil pengujian di atas sebelum pembayaran dan memahami setiap catatan atau bagian yang tidak diuji. Persetujuan ini tidak menghapus, mengurangi, atau membatasi garansi BJ Laptop maupun hak konsumen berdasarkan hukum yang berlaku.',
    '2026-07-10 09:00:00+07'
  )
  returning id_sale_test
)
insert into public.sales (
  id_invoice,
  id_unit,
  id_customer,
  harga_jual,
  margin,
  channel,
  metode_bayar,
  tanggal_transaksi,
  id_sale_test
)
select
  'INV-2607-001',
  'BJ-DELL-2607-002',
  id_customer,
  3800000,
  800000,
  'Offline',
  'Tunai',
  '2026-07-10',
  seeded_sale_test.id_sale_test
from public.customers cross join seeded_sale_test
where kontak_wa = '6281234567890';
