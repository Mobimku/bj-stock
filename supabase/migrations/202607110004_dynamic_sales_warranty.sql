alter table public.sales
add column durasi_garansi_hari integer not null default 30
check (durasi_garansi_hari > 0);

create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('default_warranty_unit_days', '30'),
  ('default_warranty_service_days', '7');

alter table public.app_settings enable row level security;
grant select, insert, update, delete on public.app_settings to authenticated;

(Showing lines 1-16 of 136. Use offset=17 to continue.)
