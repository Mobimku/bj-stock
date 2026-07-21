import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export const CUSTOMER_ID = "33333333-3333-4333-8333-333333333333";
export const TESTER_ID = "11111111-1111-4111-8111-111111111111";
export const SALE_TEST_MIGRATION_URL = new URL(
  "../migrations/202607150001_f_sls_02_reconciliation.sql",
  import.meta.url,
);
export const SALE_TEST_RELEASE_FIX_MIGRATION_URL = new URL(
  "../migrations/202607150003_release_contract_alignment.sql",
  import.meta.url,
);

export const completeUnitTest = {
  test_results: {
    identity_spec_serial: { status: "Lulus" },
    physical_casing_hinges: { status: "Lulus" },
    display_dead_pixels: { status: "Lulus" },
    keyboard_touchpad: { status: "Lulus" },
    wifi_bluetooth: { status: "Lulus" },
    av_devices: { status: "Lulus" },
    usb_ports: { status: "Lulus" },
    display_output: { status: "Lulus" },
    battery_charging_charger: { status: "Lulus" },
    storage_health: { status: "Lulus" },
    boot_os_locks: { status: "Lulus" },
    included_accessories: { status: "Ada Catatan", note: "Dus tidak tersedia" },
  },
  blocking_checks: {
    identity_mismatch: false,
    serial_mismatch: false,
    spec_mismatch: false,
    swollen_battery: false,
    bios_lock: false,
    mdm_lock: false,
    unsafe_charger: false,
  },
  location: "Toko utama",
  acknowledged: true,
};

export async function createSaleUnitTestDatabase({ applyMigration = true } = {}) {
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
    grant usage on schema auth to authenticated;
    grant execute on function auth.jwt(), auth.uid() to authenticated;

    create function public.current_user_role() returns text language sql stable as $$
      select auth.jwt() -> 'app_metadata' ->> 'role'
    $$;

    create table public.units (
      id_unit text primary key,
      brand text,
      model text,
      total_modal numeric not null,
      status text not null,
      updated_at timestamptz not null default now()
    );
    create table public.customers (
      id_customer uuid primary key default gen_random_uuid(),
      nama text not null,
      kontak_wa text unique,
      segmen text,
      sumber_lead text
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
      durasi_garansi_hari integer not null default 30,
      status text not null default 'Aktif'
    );
    create table public.warranty (
      id_garansi uuid primary key default gen_random_uuid(),
      id_unit text not null references public.units(id_unit),
      tanggal_mulai date not null,
      tanggal_berakhir date not null,
      status text not null default 'Aktif'
    );
    create table public.warranty_replacements (
      id_invoice text not null,
      replacement_unit_id text not null,
      replacement_transaction_value numeric,
      replacement_unit_modal numeric,
      adjusted_margin numeric,
      new_warranty_id uuid,
      sequence_no integer not null
    );
    create table public.returns (
      source_type text not null,
      source_id text not null,
      status text not null
    );
    create table public.finance_transactions (
      id_transaksi uuid primary key default gen_random_uuid(),
      jumlah numeric not null,
      source_module text not null,
      source_type text,
      source_id text
    );
    create table public.receivables (
      id_receivable uuid primary key default gen_random_uuid(),
      source_type text not null,
      source_id text not null,
      id_customer uuid references public.customers(id_customer),
      total_tagihan numeric not null
    );

    alter table public.sales enable row level security;
    grant select on public.sales, public.units, public.customers, public.warranty,
      public.finance_transactions, public.receivables to authenticated;
    create policy "authenticated users read sales" on public.sales for select to authenticated
      using (public.current_user_role() in ('admin', 'teknisi', 'owner'));

    create function public.normalize_whatsapp(p_value text) returns text
    language plpgsql immutable set search_path = '' as $$
    declare digits text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
    begin
      if digits = '' then return null; end if;
      if digits like '0%' then return '62' || substr(digits, 2); end if;
      return digits;
    end;
    $$;

    create function public.prepare_sale() returns trigger
    language plpgsql security definer set search_path = '' as $$
    declare unit_status text; unit_capital numeric;
    begin
      select status, total_modal into unit_status, unit_capital
      from public.units where id_unit = new.id_unit for update;
      if not found then
        raise exception using errcode = 'P0002', message = 'Unit tidak ditemukan';
      end if;
      if unit_status not in ('Ready', 'Listed') then
        raise exception 'Unit harus berstatus Ready atau Listed untuk dijual';
      end if;
      new.margin := new.harga_jual - unit_capital;
      return new;
    end;
    $$;
    create trigger prepare_sale before insert on public.sales
      for each row execute function public.prepare_sale();

    create function public.complete_sale() returns trigger
    language plpgsql security definer set search_path = '' as $$
    begin
      update public.units set status = 'Terjual' where id_unit = new.id_unit;
      insert into public.warranty (id_unit, tanggal_mulai, tanggal_berakhir)
      values (new.id_unit, new.tanggal_transaksi, new.tanggal_transaksi + new.durasi_garansi_hari);
      if new.metode_bayar in ('Tunai', 'Transfer') then
        insert into public.finance_transactions (jumlah, source_module, source_type, source_id)
        values (new.harga_jual, 'Sales', 'SalesInvoice', new.id_invoice);
      else
        insert into public.receivables (source_type, source_id, id_customer, total_tagihan)
        values ('Sales', new.id_invoice, new.id_customer, new.harga_jual);
      end if;
      return new;
    end;
    $$;
    create trigger complete_sale after insert on public.sales
      for each row execute function public.complete_sale();

    create function public.create_sale(
      text, uuid, text, text, text, text, numeric, text, text, date
    ) returns public.sales language plpgsql security definer set search_path = '' as $$
    begin raise exception 'legacy ten argument sale'; end;
    $$;
    create function public.create_sale(
      text, uuid, text, text, text, text, numeric, text, text, date, integer
    ) returns public.sales language plpgsql security definer set search_path = '' as $$
    begin raise exception 'legacy eleven argument sale'; end;
    $$;
    grant execute on function public.create_sale(text, uuid, text, text, text, text, numeric, text, text, date) to authenticated;
    grant execute on function public.create_sale(text, uuid, text, text, text, text, numeric, text, text, date, integer) to authenticated;

    insert into public.customers (id_customer, nama, kontak_wa, segmen, sumber_lead)
    values ('${CUSTOMER_ID}', 'Customer Tetap', '6281234567890', 'Pelajar', 'Referral');
    insert into public.units (id_unit, total_modal, status) values
      ('UNIT-ADMIN', 3000000, 'Listed'),
      ('UNIT-OWNER', 2500000, 'Ready'),
      ('UNIT-INVALID', 2000000, 'Ready');
  `);

  if (applyMigration) {
    await applySaleUnitTestMigration(db);
    await applySaleUnitTestReleaseFixMigration(db);
  }
  await db.exec("create role app_user; grant authenticated to app_user; set role app_user;");
  return db;
}

export async function applySaleUnitTestMigration(db) {
  await db.exec(await readFile(SALE_TEST_MIGRATION_URL, "utf8"));
}

export async function applySaleUnitTestReleaseFixMigration(db) {
  await db.exec(await readFile(SALE_TEST_RELEASE_FIX_MIGRATION_URL, "utf8"));
}

export async function setActor(db, role, email = "tester@bjstock.test") {
  const claims = JSON.stringify({ sub: TESTER_ID, email, app_metadata: { role } });
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
}

export async function createSale(db, unitId, unitTest, options = {}) {
  return db.query(
    `select * from public.create_sale(
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
    )`,
    [
      unitId,
      options.customerId ?? CUSTOMER_ID,
      options.customerName ?? null,
      options.customerWa ?? null,
      options.customerSegment ?? null,
      options.customerSource ?? null,
      options.salePrice ?? 4000000,
      options.channel ?? "Offline",
      options.paymentMethod ?? "Tunai",
      options.transactionDate ?? "2026-07-14",
      options.warrantyDays ?? 45,
      JSON.stringify(unitTest),
    ],
  );
}
