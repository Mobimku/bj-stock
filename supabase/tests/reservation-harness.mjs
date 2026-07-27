import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
export const OWNER_ID = "22222222-2222-4222-8222-222222222222";
export const CUSTOMER_ID = "33333333-3333-4333-8333-333333333333";
export const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const baselineMigrationUrl = new URL("../migrations/202607260001_dp_reservation.sql", import.meta.url);
const forwardMigrationUrl = new URL("../migrations/202607270001_sales_reservation_integration.sql", import.meta.url);

export async function applyForwardReservationMigration(db) {
  await db.exec(await readFile(forwardMigrationUrl, "utf8"));
}

export async function createReservationTestDatabase(options = {}) {
  const db = new PGlite();
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
    create function public.current_user_role() returns text language sql stable as $$
      select auth.jwt() -> 'app_metadata' ->> 'role'
    $$;
    create function public.require_owner() returns void language plpgsql security definer set search_path = '' as $$
    begin
      if public.current_user_role() is distinct from 'owner' then
        raise exception 'Aksi ini hanya dapat dilakukan oleh Owner.';
      end if;
    end;
    $$;
    create function public.normalize_whatsapp(p_value text) returns text language plpgsql immutable set search_path = '' as $$
    declare digits text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
    begin
      if digits = '' then return null; end if;
      if digits like '0%' then return '62' || substr(digits, 2); end if;
      return digits;
    end;
    $$;

    create table public.units (
      id_unit text primary key,
      total_modal numeric not null,
      status text not null check (status in ('Masuk','QC','Ready','Listed','Terjual','Selesai','Delisted')),
      updated_at timestamptz not null default now()
    );
    create table public.customers (
      id_customer uuid primary key default gen_random_uuid(),
      nama text not null,
      kontak_wa text unique,
      segmen text,
      sumber_lead text
    );
    create table public.finance_accounts (
      id_account uuid primary key default gen_random_uuid(),
      nama text not null,
      tipe text not null check (tipe in ('Kas','Bank','E-Wallet')),
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    );
    create table public.finance_transactions (
      id_transaksi uuid primary key default gen_random_uuid(),
      tanggal date not null default current_date,
      arah text not null check (arah in ('Masuk','Keluar')),
      kategori text not null,
      id_account uuid not null references public.finance_accounts(id_account),
      jumlah numeric not null check (jumlah > 0),
      source_module text not null,
      source_type text,
      source_id text,
      source_event_key text unique,
      is_reversal boolean not null default false,
      reversal_of uuid references public.finance_transactions(id_transaksi),
      catatan text,
      created_by uuid,
      created_at timestamptz not null default now()
    );
    create table public.sale_unit_tests (
      id_sale_test uuid primary key default gen_random_uuid(),
      id_unit text not null references public.units(id_unit),
      test_results jsonb not null,
      blocking_checks jsonb not null,
      location text not null,
      tester_user_id uuid,
      tester_email text,
      acknowledgement_text text not null,
      confirmed_at timestamptz not null,
      unique (id_sale_test, id_unit)
    );
    create table public.sales (
      id_invoice text primary key,
      id_unit text not null unique references public.units(id_unit),
      id_customer uuid not null references public.customers(id_customer),
      harga_jual numeric not null,
      margin numeric not null,
      channel text not null,
      metode_bayar text not null,
      tanggal_transaksi date not null,
      durasi_garansi_hari integer not null,
      id_sale_test uuid not null,
      status text not null default 'Aktif',
      foreign key (id_sale_test, id_unit) references public.sale_unit_tests(id_sale_test, id_unit)
    );
    create table public.warranty (
      id_garansi uuid primary key default gen_random_uuid(),
      id_unit text not null references public.units(id_unit),
      tanggal_mulai date not null,
      tanggal_berakhir date not null,
      status text not null default 'Aktif'
    );
    create table public.service_orders (
      status text not null,
      tanggal_diambil date,
      total_biaya numeric not null default 0,
      biaya_part numeric not null default 0
    );
    create table public.returns (
      source_type text not null,
      source_id text not null,
      status text not null,
      jumlah_refund numeric not null default 0,
      tanggal date not null default current_date
    );
    create view public.sales_current_state as
      select s.harga_jual as current_transaction_value,
        u.total_modal as current_unit_modal, s.tanggal_transaksi
      from public.sales s join public.units u on u.id_unit = s.id_unit
      where s.status = 'Aktif';
    create table public.admin_actions_log (
      id_log uuid primary key default gen_random_uuid(),
      aktor uuid not null,
      aktor_role text not null,
      aksi text not null check (aksi in (
        'create_account','deactivate_account','reactivate_account','update_app_setting',
        'finance_reversal','process_return','warranty_unit_replacement'
      )),
      target_type text,
      target_id text,
      detail jsonb,
      catatan text,
      created_at timestamptz not null default now()
    );

    create function public.enforce_unit_status_transition() returns trigger language plpgsql set search_path = '' as $$
    begin
      if new.status = old.status
        or (old.status = 'Ready' and new.status = 'Listed')
        or (old.status in ('Ready','Listed') and new.status = 'Terjual'
          and current_setting('app.sales_flow', true) = 'on') then
        new.updated_at := now();
        return new;
      end if;
      raise exception 'Transisi status unit dari % ke % tidak diizinkan', old.status, new.status;
    end;
    $$;
    create trigger enforce_unit_status_transition before update of status on public.units
      for each row execute function public.enforce_unit_status_transition();

    create function public.prepare_sale() returns trigger language plpgsql security definer set search_path = '' as $$
    declare v_status text; v_modal numeric;
    begin
      select status, total_modal into v_status, v_modal from public.units where id_unit = new.id_unit for update;
      if not found then raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan'; end if;
      if v_status not in ('Ready','Listed') then raise exception 'Unit harus berstatus Ready atau Listed untuk dijual'; end if;
      new.margin := new.harga_jual - v_modal;
      return new;
    end;
    $$;
    create trigger prepare_sale before insert on public.sales for each row execute function public.prepare_sale();

    create function public.complete_sale() returns trigger language plpgsql security definer set search_path = '' as $$
    declare v_account uuid;
    begin
      perform set_config('app.sales_flow', 'on', true);
      update public.units set status = 'Terjual' where id_unit = new.id_unit;
      select id_account into v_account from public.finance_accounts where nama = 'Kas Toko' and is_active limit 1;
      insert into public.warranty (id_unit, tanggal_mulai, tanggal_berakhir)
      values (new.id_unit, new.tanggal_transaksi, new.tanggal_transaksi + new.durasi_garansi_hari);
      insert into public.finance_transactions
        (arah, kategori, id_account, jumlah, source_module, source_type, source_id, source_event_key, created_by)
      values ('Masuk','Penjualan Unit',v_account,new.harga_jual,'Sales','SalesInvoice',new.id_invoice,
        'sale:' || new.id_invoice,auth.uid());
      return new;
    end;
    $$;
    create trigger complete_sale after insert on public.sales for each row execute function public.complete_sale();

    create sequence public.seq_invoice;
    create function public.create_sale(
      p_id_unit text, p_id_customer uuid, p_customer_name text, p_customer_wa text,
      p_customer_segment text, p_customer_source text, p_harga_jual numeric,
      p_channel text, p_metode_bayar text, p_tanggal_transaksi date,
      p_durasi_garansi_hari integer, p_test jsonb
    ) returns public.sales language plpgsql security definer set search_path = '' as $$
    declare v_test uuid; v_sale public.sales; v_invoice text;
    begin
      if public.current_user_role() not in ('admin','owner') then raise exception 'Hanya admin dan owner'; end if;
      if p_test -> 'acknowledged' <> 'true'::jsonb
        or (select count(*) from jsonb_object_keys(p_test -> 'test_results')) <> 12 then
        raise exception using errcode = '22023', message = 'Data pengujian unit tidak valid';
      end if;
      v_invoice := 'INV-TEST-' || lpad(nextval('public.seq_invoice')::text, 3, '0');
      insert into public.sale_unit_tests
        (id_unit,test_results,blocking_checks,location,tester_user_id,tester_email,acknowledgement_text,confirmed_at)
      values (p_id_unit,p_test->'test_results',p_test->'blocking_checks',p_test->>'location',auth.uid(),
        auth.jwt()->>'email','Persetujuan pembeli',clock_timestamp()) returning id_sale_test into v_test;
      insert into public.sales
        (id_invoice,id_unit,id_customer,harga_jual,margin,channel,metode_bayar,tanggal_transaksi,durasi_garansi_hari,id_sale_test)
      values (v_invoice,p_id_unit,p_id_customer,p_harga_jual,0,p_channel,p_metode_bayar,p_tanggal_transaksi,
        p_durasi_garansi_hari,v_test) returning * into v_sale;
      return v_sale;
    end;
    $$;

    insert into public.finance_accounts (id_account,nama,tipe) values ('${ACCOUNT_ID}','Kas Toko','Kas');
    insert into public.customers (id_customer,nama,kontak_wa) values ('${CUSTOMER_ID}','Customer Test','6281111111111');
    insert into public.units (id_unit,total_modal,status) values
      ('UNIT-RSV-01',3000000,'Listed'),('UNIT-RSV-02',2500000,'Ready'),
      ('UNIT-RSV-03',2200000,'Listed'),('UNIT-RSV-04',2100000,'Ready');
  `);

  await db.exec(await readFile(baselineMigrationUrl, "utf8"));
  if (options.applyForward !== false) {
    await applyForwardReservationMigration(db);
  }
  return db;
}

export async function setActor(db, role) {
  const sub = role === "owner" ? OWNER_ID : ADMIN_ID;
  const claims = JSON.stringify({ sub, email: `${role}@bjstock.test`, app_metadata: { role } });
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
}
