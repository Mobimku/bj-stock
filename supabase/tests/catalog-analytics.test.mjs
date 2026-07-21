import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = await readFile(
  new URL("../migrations/202607140015_fase9_1_catalog_analytics.sql", import.meta.url),
  "utf8",
);

await db.exec(`
  create schema auth;
  create role anon;
  create role authenticated;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function public.current_user_role() returns text language sql stable as $$
    select auth.jwt() -> 'app_metadata' ->> 'role'
  $$;
  create table public.units (
    id_unit text primary key,
    brand text not null,
    model text,
    status text not null
  );
  insert into public.units values ('BJ-HP-2607-001', 'HP', 'EliteBook', 'Listed');
`);
await db.exec(migration);
await db.exec(`
  create role app_user;
  grant authenticated to app_user;
  set role app_user;
  select set_config('request.jwt.claims', '{}', false);
`);

const visitor = "11111111-1111-4111-8111-111111111111";
const staff = "22222222-2222-4222-8222-222222222222";
await db.query("select public.record_catalog_event('catalog_view', $1, null)", [visitor]);
await db.query("select public.record_catalog_event('detail_view', $1, $2)", [visitor, "BJ-HP-2607-001"]);
await db.query("select public.record_catalog_event('whatsapp_click', $1, $2)", [visitor, "BJ-HP-2607-001"]);
const duplicate = await db.query("select public.record_catalog_event('detail_view', $1, $2) as inserted", [visitor, "BJ-HP-2607-001"]);
assert.equal(duplicate.rows[0].inserted, false);

await assert.rejects(
  () => db.query("select public.record_catalog_event('invalid', $1, null)", [visitor]),
  /Jenis event katalog tidak valid/,
);

await db.exec(`select set_config('request.jwt.claims', '{"app_metadata":{"role":"owner"}}', false);`);
await db.query("select public.record_catalog_event('detail_view', $1, $2)", [staff, "BJ-HP-2607-001"]);
const analytics = await db.query("select * from public.get_catalog_analytics(30)");
assert.deepEqual(analytics.rows[0], {
  unique_visitors: 1,
  detail_views: 1,
  whatsapp_clicks: 1,
  conversion_rate: "100.0",
  top_units: [{ id_unit: "BJ-HP-2607-001", brand: "HP", model: "EliteBook", detail_views: 1 }],
});

await db.exec(`select set_config('request.jwt.claims', '{"app_metadata":{"role":"teknisi"}}', false);`);
await assert.rejects(
  () => db.query("select * from public.get_catalog_analytics(7)"),
  /Hanya admin dan owner/,
);

await db.exec("reset role;");
await db.exec("select set_config('request.jwt.claims', '{}', false);");
const internal = await db.query("select is_internal from public.catalog_events where session_id = $1", [staff]);
assert.equal(internal.rows[0].is_internal, true);

// --- Fase 9.14: share analytics ---
// Requires migration 202607160002_fase9_14_report_exports.sql (adds share_click event type,
// share_clicks count, updates check constraint and analytics function).

const reportMigrationUrl = new URL("../migrations/202607160002_fase9_14_report_exports.sql", import.meta.url);
assert.ok(
  existsSync(fileURLToPath(reportMigrationUrl)),
  "Fase 9.14 migration 202607160002 must exist — adds share_click type and share_clicks to analytics",
);
const reportMigration = await readFile(reportMigrationUrl, "utf8");
await db.exec(reportMigration);

// share_click must be accepted, same-day duplicate returns false, non-Listed unit rejected
{
  const r = await db.query(
    "select public.record_catalog_event('share_click', $1, $2) as ok",
    [visitor, "BJ-HP-2607-001"],
  );
  assert.equal(r.rows[0].ok, true);
}
{
  const r = await db.query(
    "select public.record_catalog_event('share_click', $1, $2) as inserted",
    [visitor, "BJ-HP-2607-001"],
  );
  assert.equal(r.rows[0].inserted, false);
}
await assert.rejects(
  () => db.query("select public.record_catalog_event('share_click', $1, 'NONEXISTENT')", [visitor]),
  /Unit katalog tidak tersedia/,
);
// Also reject non-Listed target
await db.exec(`insert into public.units (id_unit, brand, status) values ('BJ-TEST-RM-001', 'Test', 'QC')`);
await assert.rejects(
  () => db.query("select public.record_catalog_event('share_click', $1, 'BJ-TEST-RM-001')", [visitor]),
  /Unit katalog tidak tersedia/,
);

// Internal staff (owner) share_click recorded
await db.exec(`select set_config('request.jwt.claims', '{"app_metadata":{"role":"owner"}}', false);`);
{
  const r = await db.query(
    "select public.record_catalog_event('share_click', $1, $2) as ok",
    [staff, "BJ-HP-2607-001"],
  );
  assert.equal(r.rows[0].ok, true);
}

// share_clicks in analytics; WhatsApp conversion unchanged
{
  const analytics = await db.query("select * from public.get_catalog_analytics(30)");
  assert.equal(analytics.rows[0].share_clicks, 1);
  assert.equal(analytics.rows[0].whatsapp_clicks, 1);
  assert.equal(analytics.rows[0].conversion_rate, "100.0");
}

await db.close();
console.log("catalog analytics migration tests passed");
