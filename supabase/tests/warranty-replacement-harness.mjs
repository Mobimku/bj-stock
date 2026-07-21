import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  ACTIVE_ACCOUNT_ID,
  INACTIVE_ACCOUNT_ID,
  OWNER_ID,
} from "./warranty-replacement-fixtures.mjs";

export {
  ACTIVE_ACCOUNT_ID,
  INACTIVE_ACCOUNT_ID,
  OWNER_ID,
  addClaimService,
  seedWarrantySale,
} from "./warranty-replacement-fixtures.mjs";

export async function createWarrantyDatabase({ includeHistoricalSale = false } = {}) {
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
      brand text not null,
      model text,
      modal_awal numeric not null check (modal_awal > 0),
      total_modal numeric not null check (total_modal > 0),
      status text not null check (status in ('Masuk','QC','Ready','Listed','Terjual','Selesai','Delisted')),
      harga_listing numeric,
      tanggal_masuk date not null default '2026-06-01',
      updated_at timestamptz not null default now()
    );
    create table public.sale_unit_tests (
      id_sale_test uuid primary key default gen_random_uuid(),
      id_unit text not null references public.units(id_unit),
      confirmed_at timestamptz not null default now(),
      unique (id_sale_test, id_unit)
    );
    create function public.enforce_unit_status_transition() returns trigger
    language plpgsql set search_path = '' as $$
    begin
      if new.status = old.status then return new; end if;
      raise exception 'Transisi status unit tidak diizinkan';
    end;
    $$;
    create trigger enforce_unit_status_transition before update of status on public.units
      for each row execute function public.enforce_unit_status_transition();

    create table public.customers (
      id_customer uuid primary key default gen_random_uuid(),
      nama text not null,
      sumber_lead text
    );
    insert into public.customers (id_customer, nama, sumber_lead)
    values ('33333333-3333-4333-8333-333333333333', 'Customer Test', 'Referral');
    create table public.sales (
      id_invoice text primary key,
      id_unit text not null unique references public.units(id_unit),
      id_customer uuid references public.customers(id_customer),
      harga_jual numeric not null check (harga_jual > 0),
      margin numeric,
      channel text not null,
      metode_bayar text not null,
      durasi_garansi_hari integer not null default 30,
      tanggal_transaksi date not null,
      id_sale_test uuid,
      foreign key (id_sale_test, id_unit)
        references public.sale_unit_tests(id_sale_test, id_unit)
    );
    create table public.warranty (
      id_garansi uuid primary key default gen_random_uuid(),
      id_unit text not null references public.units(id_unit),
      tanggal_mulai date not null,
      tanggal_berakhir date not null,
      status text not null check (status in ('Aktif','Habis'))
    );
    create table public.warranty_claim (
      id_klaim uuid primary key default gen_random_uuid(),
      id_garansi uuid not null references public.warranty(id_garansi),
      tanggal date not null,
      keluhan text not null,
      tindakan text,
      biaya numeric not null default 0
    );
    create table public.service_orders (
      id_servis text primary key,
      public_token uuid not null unique default gen_random_uuid(),
      id_unit text references public.units(id_unit),
      id_customer uuid not null references public.customers(id_customer),
      id_klaim uuid unique references public.warranty_claim(id_klaim),
      jenis_servis text not null check (jenis_servis in ('Repair','Install','Cleaning')),
      brand_model text not null,
      keluhan text not null,
      diagnosa text,
      tindakan text,
      biaya_jasa numeric not null default 0,
      biaya_part numeric not null default 0,
      total_biaya numeric generated always as (biaya_jasa + biaya_part) stored,
      status text not null check (status in ('Diterima','Diagnosa','Dikerjakan','Selesai','Diambil','Dibatalkan')),
      garansi_servis_hari integer not null default 7,
      tanggal_masuk date not null,
      estimasi_selesai date,
      tanggal_selesai date,
      tanggal_diambil date,
      qr_payload text not null
    );
    create function public.enforce_service_status_transition() returns trigger
    language plpgsql security definer set search_path = '' as $$
    begin
      if new.status = old.status then return new; end if;
      raise exception 'Transisi status servis tidak diizinkan';
    end;
    $$;
    create trigger enforce_service_status_transition
      before update of status, tanggal_selesai, tanggal_diambil on public.service_orders
      for each row execute function public.enforce_service_status_transition();

    create table public.app_settings (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    );
    create table public.finance_accounts (
      id_account uuid primary key,
      nama text not null,
      tipe text not null,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    );
    insert into public.finance_accounts (id_account, nama, tipe, is_active) values
      ('${ACTIVE_ACCOUNT_ID}', 'Kas Aktif', 'Kas', true),
      ('${INACTIVE_ACCOUNT_ID}', 'Kas Nonaktif', 'Kas', false);
    create table public.finance_transactions (
      id_transaksi uuid primary key default gen_random_uuid(),
      tanggal date not null,
      arah text not null check (arah in ('Masuk','Keluar')),
      kategori text not null check (kategori in (
        'Pembelian Unit','Pembelian Part','Biaya Upgrade Eksternal','Penjualan Unit',
        'Pendapatan Servis','Operasional','Modal Disetor','Retur Unit','Retur Servis','Lainnya'
      )),
      id_account uuid not null references public.finance_accounts(id_account),
      jumlah numeric not null check (jumlah > 0),
      source_module text not null check (source_module in ('Stock','BankStock','Sales','Servis','Manual','Retur')),
      source_type text,
      source_id text,
      source_event_key text unique,
      is_reversal boolean not null default false,
      reversal_of uuid references public.finance_transactions(id_transaksi),
      catatan text,
      created_by uuid,
      created_at timestamptz not null default now()
    );
    create function public.record_finance_txn(
      p_arah text, p_kategori text, p_id_account uuid, p_jumlah numeric,
      p_source_module text, p_source_type text default null, p_source_id text default null,
      p_source_event_key text default null, p_catatan text default null,
      p_tanggal date default current_date
    ) returns public.finance_transactions language plpgsql security definer set search_path = '' as $$
    declare txn public.finance_transactions;
    begin
      insert into public.finance_transactions (
        tanggal, arah, kategori, id_account, jumlah, source_module,
        source_type, source_id, source_event_key, catatan
      ) values (
        p_tanggal, p_arah, p_kategori, p_id_account, p_jumlah, p_source_module,
        p_source_type, p_source_id, p_source_event_key, p_catatan
      ) returning * into txn;
      return txn;
    end;
    $$;
    revoke all on function public.record_finance_txn(text,text,uuid,numeric,text,text,text,text,text,date) from public;

    create table public.receivables (
      id_receivable uuid primary key default gen_random_uuid(),
      source_type text not null,
      source_id text not null,
      status text not null default 'Belum Lunas'
    );
    create table public.returns (
      id_retur uuid primary key default gen_random_uuid(),
      source_type text not null,
      source_id text not null,
      alasan text not null,
      jumlah_refund numeric not null,
      status text not null,
      tanggal date not null default current_date
    );
    create table public.admin_actions_log (
      id_log uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      user_role text not null,
      aksi text not null check (aksi in (
        'create_account','deactivate_account','reactivate_account','update_app_setting',
        'finance_reversal','process_return'
      )),
      target text,
      detail jsonb,
      created_at timestamptz not null default now()
    );
    create function public.require_owner() returns void language plpgsql security definer set search_path = '' as $$
    begin
      if auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'owner' then
        raise exception 'Aksi ini hanya dapat dilakukan oleh Owner.';
      end if;
    end;
    $$;
    create function public.log_admin_action(p_aksi text, p_target text default null, p_detail jsonb default null)
    returns void language plpgsql security definer set search_path = '' as $$
    begin
      insert into public.admin_actions_log (user_id, user_role, aksi, target, detail)
      values (auth.uid(), coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'unknown'), p_aksi, p_target, p_detail);
    end;
    $$;
  `);

  if (includeHistoricalSale) {
    await db.exec(`
      insert into public.units (
        id_unit, brand, model, modal_awal, total_modal, status, tanggal_masuk
      ) values (
        'HISTORICAL-NULL-MARGIN', 'Acer', 'Aspire Historical',
        2000000, 2000000, 'Terjual', '2026-06-20'
      );
      insert into public.sales (
        id_invoice, id_unit, id_customer, harga_jual, margin, channel,
        metode_bayar, durasi_garansi_hari, tanggal_transaksi
      ) values (
        'INV-HISTORICAL-NULL', 'HISTORICAL-NULL-MARGIN', null, 3000000, null,
        'Offline', 'Tunai', 30, '2026-07-10'
      );
    `);
  }

  const warrantyReplacementMigration = await readFile(
    new URL("../migrations/202607140016_warranty_unit_replacement.sql", import.meta.url),
    "utf8",
  );
  const postReviewMigration = await readFile(
    new URL("../migrations/202607142158_fase9_2_post_review.sql", import.meta.url),
    "utf8",
  );
  const saleUnitTestMigration = await readFile(
    new URL("../migrations/202607150001_f_sls_02_reconciliation.sql", import.meta.url),
    "utf8",
  );
  const releaseFixMigration = await readFile(
    new URL("../migrations/202607150002_fase9_2_release_fix.sql", import.meta.url),
    "utf8",
  );
  const combinedReleaseFixMigration = await readFile(
    new URL("../migrations/202607150003_release_contract_alignment.sql", import.meta.url),
    "utf8",
  );
  await db.exec(warrantyReplacementMigration);
  await db.exec(postReviewMigration);
  await db.exec(saleUnitTestMigration);
  await db.exec(releaseFixMigration);
  await db.exec(combinedReleaseFixMigration);
  return db;
}

export async function setActor(db, role) {
  const claims = JSON.stringify({ sub: OWNER_ID, app_metadata: { role } });
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
}

export async function replaceWarrantyUnit(db, request) {
  return db.query(
    `select * from public.replace_warranty_unit($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      request.idempotencyKey,
      request.invoiceId,
      request.claimId,
      request.replacementUnitId,
      request.replacementValue,
      request.replacementDate,
      request.reason,
      request.accountId ?? null,
    ],
  );
}
