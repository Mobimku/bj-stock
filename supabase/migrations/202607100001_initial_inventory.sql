create table public.units (
  id_unit text primary key,
  brand text not null check (btrim(brand) <> ''),
  model text,
  serial_number text unique,
  spek_awal text,
  spek_saat_ini text,
  kondisi_fisik text check (kondisi_fisik in ('A', 'B', 'C')),
  kondisi_fungsi text,
  sumber_beli text,
  modal_awal numeric(14, 2) not null check (modal_awal > 0),
  total_modal numeric(14, 2) not null check (total_modal > 0),
  status text not null default 'Masuk'
    check (status in ('Masuk', 'QC', 'Ready', 'Listed', 'Terjual', 'Selesai')),
  tanggal_masuk date not null default current_date,
  foto_url text[],
  qr_payload text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bank_stock (
  id_part text primary key,
  jenis_part text not null check (btrim(jenis_part) <> ''),
  kondisi text check (kondisi in ('New', 'Copotan')),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  modal_per_unit numeric(14, 2) not null check (modal_per_unit >= 0),
  sumber text,
  created_at timestamptz not null default now()
);

create table public.upgrade_log (
  id_log uuid primary key default gen_random_uuid(),
  id_unit text not null references public.units(id_unit),
  id_part text references public.bank_stock(id_part),
  biaya numeric(14, 2) not null check (biaya >= 0),
  tanggal date not null default current_date,
  catatan text
);

create table public.customers (
  id_customer uuid primary key default gen_random_uuid(),
  nama text not null check (btrim(nama) <> ''),
  kontak_wa text unique,
  segmen text check (segmen in ('Pelajar', 'Orang Tua', 'Remote Worker', 'Lainnya')),
  sumber_lead text check (sumber_lead in ('TikTok', 'Reels', 'Instagram', 'WA', 'Referral', 'Lainnya')),
  created_at timestamptz not null default now()
);

create function public.set_unit_derived_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.total_modal := new.modal_awal;
  new.qr_payload := new.id_unit;
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_unit_derived_fields
before insert or update of modal_awal on public.units
for each row execute function public.set_unit_derived_fields();
