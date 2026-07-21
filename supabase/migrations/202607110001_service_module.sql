
create table public.service_orders (
  id_servis text primary key,
  public_token uuid not null unique default gen_random_uuid(),
  id_unit text references public.units(id_unit),
  id_customer uuid not null references public.customers(id_customer),
  id_klaim uuid unique references public.warranty_claim(id_klaim),
  jenis_servis text not null check (jenis_servis in ('Repair', 'Install', 'Cleaning')),
  brand_model text not null check (btrim(brand_model) <> ''),
  keluhan text not null check (btrim(keluhan) <> ''),
  diagnosa text,
  tindakan text,
  biaya_jasa numeric(14, 2) not null default 0 check (biaya_jasa >= 0),
  biaya_part numeric(14, 2) not null default 0 check (biaya_part >= 0),
  total_biaya numeric(14, 2) generated always as (biaya_jasa + biaya_part) stored,
  status text not null default 'Diterima'
    check (status in ('Diterima', 'Diagnosa', 'Dikerjakan', 'Selesai', 'Diambil')),
  garansi_servis_hari integer not null default 7 check (garansi_servis_hari between 1 and 365),
  tanggal_masuk date not null default current_date,
  estimasi_selesai date,
  tanggal_selesai date,
  tanggal_diambil date,
  qr_payload text not null,
  check (id_klaim is null or id_unit is not null),
  check (estimasi_selesai is null or estimasi_selesai >= tanggal_masuk),
  check (tanggal_selesai is null or tanggal_selesai >= tanggal_masuk),
  check (
    tanggal_diambil is null
    or (tanggal_selesai is not null and tanggal_diambil >= tanggal_selesai)
  )
);

create table public.service_part_log (
  id_log uuid primary key default gen_random_uuid(),
  id_servis text not null references public.service_orders(id_servis),
  id_part text not null references public.bank_stock(id_part),
  biaya numeric(14, 2) not null check (biaya >= 0),
  tanggal date not null default current_date
);

create index service_orders_id_unit_idx on public.service_orders(id_unit);

(Showing lines 1-40 of 590. Use offset=41 to continue.)