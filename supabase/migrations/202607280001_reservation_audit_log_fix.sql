-- Repair reservation audit writes against the canonical F-SET-03 log schema.

create or replace function public.create_reservation(
  p_idempotency_key uuid,
  p_id_unit text,
  p_id_customer uuid,
  p_customer_name text,
  p_customer_wa text,
  p_customer_segment text,
  p_customer_source text,
  p_dp_amount numeric,
  p_agreed_price numeric,
  p_is_refundable boolean,
  p_expires_at timestamptz
) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_customer_name text := nullif(btrim(p_customer_name), '');
  v_customer_wa text := public.normalize_whatsapp(p_customer_wa);
  v_customer_segment text := nullif(btrim(p_customer_segment), '');
  v_customer_source text := nullif(btrim(p_customer_source), '');
  v_customer_id uuid := p_id_customer;
  v_request jsonb;
  v_existing public.reservations;
  v_unit public.units;
  v_account uuid;
  v_reservation public.reservations;
  v_dp_transaction uuid;
begin
  perform public.require_admin_or_owner();

  if v_customer_wa ~ '^8[0-9]{8,12}$' then
    v_customer_wa := '62' || v_customer_wa;
  end if;

  if (v_customer_id is null) = (v_customer_name is null) then
    raise exception using errcode = '22023',
      message = 'Pilih customer existing atau isi customer baru, tepat salah satu';
  end if;
  if v_customer_id is not null and (v_customer_wa is not null
    or v_customer_segment is not null or v_customer_source is not null) then
    raise exception using errcode = '22023',
      message = 'Data customer baru tidak boleh dikirim untuk customer existing';
  end if;
  if v_customer_segment is not null and v_customer_segment not in (
    'Pelajar','Orang Tua','Remote Worker','Lainnya'
  ) then
    raise exception using errcode = '22023', message = 'Segmen customer tidak valid';
  end if;
  if v_customer_source is not null and v_customer_source not in (
    'TikTok','Reels','Instagram','Facebook Marketplace','WA','Referral','Lainnya'
  ) then
    raise exception using errcode = '22023', message = 'Sumber lead customer tidak valid';
  end if;

  v_request := jsonb_build_object(
    'id_unit', btrim(p_id_unit),
    'id_customer', v_customer_id,
    'customer_name', v_customer_name,
    'customer_wa', v_customer_wa,
    'customer_segment', v_customer_segment,
    'customer_source', v_customer_source,
    'dp_amount', p_dp_amount,
    'agreed_price', p_agreed_price,
    'is_refundable', p_is_refundable,
    'expires_at', p_expires_at
  );

  perform pg_advisory_xact_lock(hashtext('reservation:' || p_idempotency_key::text));
  select * into v_existing from public.reservations
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_payload is distinct from v_request then
      raise exception 'Idempotency key sudah digunakan dengan data berbeda';
    end if;
    return v_existing;
  end if;

  if p_dp_amount is null or p_agreed_price is null
    or p_dp_amount <= 0 or p_dp_amount >= p_agreed_price then
    raise exception 'DP harus lebih dari 0 dan lebih kecil dari harga kesepakatan';
  end if;
  if p_expires_at is null or p_expires_at <= clock_timestamp() then
    raise exception 'Batas waktu reservasi harus di masa depan';
  end if;

  if v_customer_id is not null then
    perform 1 from public.customers where id_customer = v_customer_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Customer tidak ditemukan';
    end if;
  elsif v_customer_wa is not null then
    perform pg_advisory_xact_lock(hashtext('customer:' || v_customer_wa));
    insert into public.customers (nama, kontak_wa, segmen, sumber_lead)
    values (v_customer_name, v_customer_wa, v_customer_segment, v_customer_source)
    on conflict (kontak_wa) do update set kontak_wa = excluded.kontak_wa
    returning id_customer into v_customer_id;
  else
    insert into public.customers (nama, segmen, sumber_lead)
    values (v_customer_name, v_customer_segment, v_customer_source)
    returning id_customer into v_customer_id;
  end if;

  select * into v_unit from public.units where id_unit = btrim(p_id_unit) for update;
  if not found then raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan'; end if;
  if v_unit.status not in ('Ready','Listed') then
    raise exception 'Unit sudah dipesan atau tidak tersedia';
  end if;
  select id_account into v_account from public.finance_accounts
  where nama = 'Kas Toko' and is_active order by created_at limit 1;
  if v_account is null then raise exception 'Akun Kas Toko aktif tidak ditemukan'; end if;

  insert into public.reservations (
    idempotency_key,id_unit,id_customer,dp_amount,agreed_price,is_refundable,
    previous_status,expires_at,request_payload,created_by
  ) values (
    p_idempotency_key,btrim(p_id_unit),v_customer_id,p_dp_amount,p_agreed_price,
    p_is_refundable,v_unit.status,p_expires_at,v_request,auth.uid()
  ) returning * into v_reservation;
  perform set_config('app.reservation_flow','on',true);
  update public.units set status = 'Dipesan' where id_unit = v_reservation.id_unit;
  insert into public.finance_transactions (
    arah,kategori,id_account,jumlah,source_module,source_type,source_id,
    source_event_key,created_by
  ) values (
    'Masuk','Uang Muka Reservasi',v_account,p_dp_amount,'Reservasi','ReservationDP',
    v_reservation.id_reservation::text,'reservation:dp:' || v_reservation.id_reservation,auth.uid()
  ) returning id_transaksi into v_dp_transaction;
  update public.reservations set id_dp_transaction = v_dp_transaction
  where id_reservation = v_reservation.id_reservation returning * into v_reservation;
  perform public.log_admin_action(
    'create_reservation',
    v_reservation.id_reservation::text,
    jsonb_build_object('id_unit',v_reservation.id_unit,'dp_amount',p_dp_amount)
  );
  return v_reservation;
end;
$$;

create or replace function public.complete_reservation(
  p_id_reservation uuid, p_test jsonb, p_metode_bayar text, p_channel text,
  p_tanggal_transaksi date, p_durasi_garansi_hari integer
) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations;
  v_customer public.customers;
  v_dp public.finance_transactions;
  v_sale public.sales;
  v_result public.reservations;
begin
  perform public.require_admin_or_owner();
  select * into v_reservation from public.reservations
  where id_reservation = p_id_reservation for update;
  if not found then raise exception using errcode = 'P0002', message = 'Reservasi tidak ditemukan'; end if;
  if v_reservation.status <> 'Dipesan' then raise exception 'Reservasi sudah diselesaikan'; end if;
  if v_reservation.expires_at < clock_timestamp() then raise exception 'Batas waktu reservasi sudah terlewati'; end if;
  if p_metode_bayar not in ('Tunai','Transfer') then raise exception 'Pelunasan hanya menerima Tunai atau Transfer'; end if;
  select * into v_customer from public.customers where id_customer = v_reservation.id_customer;
  select * into v_dp from public.finance_transactions where id_transaksi = v_reservation.id_dp_transaction;
  insert into public.finance_transactions (
    arah,kategori,id_account,jumlah,source_module,source_type,source_id,source_event_key,
    is_reversal,reversal_of,created_by
  ) values (
    'Keluar','Uang Muka Reservasi',v_dp.id_account,v_reservation.dp_amount,'Reservasi',
    'ReservationCompletion',v_reservation.id_reservation::text,
    'reservation:complete:' || v_reservation.id_reservation,true,v_dp.id_transaksi,auth.uid()
  );
  perform set_config('app.reservation_flow','on',true);
  select * into v_sale from public.create_sale(
    v_reservation.id_unit,v_reservation.id_customer,v_customer.nama,v_customer.kontak_wa,
    v_customer.segmen,v_customer.sumber_lead,v_reservation.agreed_price,p_channel,
    p_metode_bayar,p_tanggal_transaksi,p_durasi_garansi_hari,p_test
  );
  update public.reservations set status='Selesai',completed_at=clock_timestamp(),id_invoice=v_sale.id_invoice
  where id_reservation=p_id_reservation returning * into v_result;
  perform public.log_admin_action(
    'complete_reservation',
    p_id_reservation::text,
    jsonb_build_object('id_invoice',v_sale.id_invoice)
  );
  return v_result;
end;
$$;

create or replace function public.refund_reservation(p_id_reservation uuid)
returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations;
  v_dp public.finance_transactions;
  v_result public.reservations;
begin
  perform public.require_owner();
  select * into v_reservation from public.reservations where id_reservation=p_id_reservation for update;
  if not found then raise exception using errcode='P0002',message='Reservasi tidak ditemukan'; end if;
  if v_reservation.status <> 'Dipesan' then raise exception 'Reservasi sudah diselesaikan'; end if;
  if not v_reservation.is_refundable then raise exception 'Reservasi non-refundable tidak dapat di-refund'; end if;
  select * into v_dp from public.finance_transactions where id_transaksi=v_reservation.id_dp_transaction;
  insert into public.finance_transactions (
    arah,kategori,id_account,jumlah,source_module,source_type,source_id,source_event_key,
    is_reversal,reversal_of,created_by
  ) values (
    'Keluar','Uang Muka Reservasi',v_dp.id_account,v_reservation.dp_amount,'Reservasi',
    'ReservationRefund',v_reservation.id_reservation::text,'reservation:refund:' || v_reservation.id_reservation,
    true,v_dp.id_transaksi,auth.uid()
  );
  perform set_config('app.reservation_flow','on',true);
  update public.units set status=v_reservation.previous_status where id_unit=v_reservation.id_unit;
  update public.reservations set status='Dibatalkan',cancelled_at=clock_timestamp()
  where id_reservation=p_id_reservation returning * into v_result;
  perform public.log_admin_action('refund_reservation',p_id_reservation::text,null);
  return v_result;
end;
$$;

create or replace function public.forfeit_reservation(p_id_reservation uuid)
returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations;
  v_result public.reservations;
begin
  perform public.require_admin_or_owner();
  select * into v_reservation from public.reservations where id_reservation=p_id_reservation for update;
  if not found then raise exception using errcode='P0002',message='Reservasi tidak ditemukan'; end if;
  if v_reservation.status <> 'Dipesan' then raise exception 'Reservasi sudah diselesaikan'; end if;
  if v_reservation.is_refundable then raise exception 'Reservasi refundable tidak dapat dibuat hangus'; end if;
  perform set_config('app.reservation_flow','on',true);
  update public.units set status=v_reservation.previous_status where id_unit=v_reservation.id_unit;
  update public.reservations set status='Hangus',forfeited_at=clock_timestamp()
  where id_reservation=p_id_reservation returning * into v_result;
  perform public.log_admin_action('forfeit_reservation',p_id_reservation::text,null);
  return v_result;
end;
$$;

select pg_notify('pgrst', 'reload schema');
