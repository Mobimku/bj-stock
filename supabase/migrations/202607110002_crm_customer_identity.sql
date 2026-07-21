
create function public.normalize_whatsapp(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
begin
  if digits = '' then return null; end if;
  if digits like '0%' then return '62' || substr(digits, 2); end if;
  return digits;
end;
$$;

do $$
begin
  if exists (
    select public.normalize_whatsapp(kontak_wa)
    from public.customers
    where kontak_wa is not null
    group by public.normalize_whatsapp(kontak_wa)
    having count(*) > 1
  ) then
    raise exception 'Customer memiliki nomor WhatsApp ekuivalen yang duplikat';
  end if;
end;
$$;

update public.customers
set kontak_wa = public.normalize_whatsapp(kontak_wa)
where kontak_wa is not null;

create function public.normalize_customer_whatsapp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.kontak_wa := public.normalize_whatsapp(new.kontak_wa);
  return new;
end;
$$;

create trigger normalize_customer_whatsapp
before insert or update of kontak_wa on public.customers
for each row execute function public.normalize_customer_whatsapp();

alter function public.create_sale(text, uuid, text, text, text, text, numeric, text, text, date)
rename to create_sale_before_crm;

create function public.create_sale(
  p_id_unit text,
  p_id_customer uuid,
  p_customer_name text,
  p_customer_wa text,
  p_customer_segment text,
  p_customer_source text,
  p_harga_jual numeric,
  p_channel text,
  p_metode_bayar text,
  p_tanggal_transaksi date
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_wa text := public.normalize_whatsapp(p_customer_wa);
  customer_id uuid := p_id_customer;
  new_sale public.sales;
begin
  if customer_id is null and normalized_wa is not null then
    perform pg_advisory_xact_lock(hashtext('customer:' || normalized_wa));
    select id_customer into customer_id
    from public.customers
    where kontak_wa = normalized_wa;
  end if;

  select * into new_sale
  from public.create_sale_before_crm(
    p_id_unit,
    customer_id,
    p_customer_name,
    normalized_wa,
    p_customer_segment,
    p_customer_source,
    p_harga_jual,
    p_channel,
    p_metode_bayar,
    p_tanggal_transaksi
  );

  return new_sale;
end;
$$;

alter function public.create_service_order(text, uuid, text, text, text, text, text, text, text, date, date, integer, boolean)
rename to create_service_order_before_crm;

create function public.create_service_order(
  p_id_unit text,
  p_id_customer uuid,
  p_customer_name text,
  p_customer_wa text,
  p_customer_segment text,
  p_customer_source text,
  p_jenis_servis text,
  p_brand_model text,
  p_keluhan text,
  p_tanggal_masuk date,
  p_estimasi_selesai date,
  p_garansi_servis_hari integer,
  p_create_claim boolean
)
returns public.service_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_order public.service_orders;
begin
  select * into new_order
  from public.create_service_order_before_crm(
    p_id_unit,
    p_id_customer,
    p_customer_name,
    public.normalize_whatsapp(p_customer_wa),
    p_customer_segment,
    p_customer_source,
    p_jenis_servis,
    p_brand_model,
    p_keluhan,
    p_tanggal_masuk,
    p_estimasi_selesai,
    p_garansi_servis_hari,
    p_create_claim
  );

  return new_order;
end;
$$;

revoke all on function public.normalize_whatsapp(text) from public;
revoke all on function public.normalize_customer_whatsapp() from public;
revoke all on function public.create_sale_before_crm(text, uuid, text, text, text, text, numeric, text, text, date) from public, authenticated;
revoke all on function public.create_service_order_before_crm(text, uuid, text, text, text, text, text, text, text, date, date, integer, boolean) from public, authenticated;
revoke all on function public.create_sale(text, uuid, text, text, text, text, numeric, text, text, date) from public;
revoke all on function public.create_service_order(text, uuid, text, text, text, text, text, text, text, date, date, integer, boolean) from public;

grant execute on function public.create_sale(text, uuid, text, text, text, text, numeric, text, text, date) to authenticated;
grant execute on function public.create_service_order(text, uuid, text, text, text, text, text, text, text, date, date, integer, boolean) to authenticated;
