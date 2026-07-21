
create table public.sales (
  id_invoice text primary key,
  id_unit text not null unique references public.units(id_unit),
  id_customer uuid not null references public.customers(id_customer),
  harga_jual numeric(14, 2) not null check (harga_jual > 0),
  margin numeric(14, 2) not null,
  channel text not null check (channel in ('Offline', 'Marketplace', 'Instagram', 'TikTok', 'WA')),
  metode_bayar text not null check (metode_bayar in ('Tunai', 'Transfer', 'Cicilan')),
  tanggal_transaksi date not null default current_date
);

create table public.warranty (
  id_garansi uuid primary key default gen_random_uuid(),
  id_unit text not null references public.units(id_unit),
  tanggal_mulai date not null,
  tanggal_berakhir date not null check (tanggal_berakhir >= tanggal_mulai),
  status text not null default 'Aktif' check (status in ('Aktif', 'Habis'))
);

create table public.warranty_claim (
  id_klaim uuid primary key default gen_random_uuid(),
  id_garansi uuid not null references public.warranty(id_garansi),
  tanggal date not null default current_date,
  keluhan text not null check (btrim(keluhan) <> ''),
  tindakan text,
  biaya numeric(14, 2) not null default 0 check (biaya >= 0)
);

create index sales_id_customer_idx on public.sales(id_customer);
create index warranty_id_unit_idx on public.warranty(id_unit);
create index warranty_claim_id_garansi_idx on public.warranty_claim(id_garansi);

alter table public.sales enable row level security;
alter table public.warranty enable row level security;
alter table public.warranty_claim enable row level security;

grant select on public.sales, public.warranty, public.warranty_claim to authenticated;

create policy "authenticated users read sales"
on public.sales for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi'));

create policy "authenticated users read warranties"
on public.warranty for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi'));

create policy "authenticated users read warranty claims"
on public.warranty_claim for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi'));

create or replace function public.enforce_unit_status_transition()
returns trigger

(Showing lines 1-52 of 287. Use offset=53 to continue.)