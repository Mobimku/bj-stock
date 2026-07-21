import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const catalogMigrationUrl = new URL("../migrations/202607130013_fase9_catalog.sql", import.meta.url);
const settingMigrationUrl = new URL("../migrations/202607130014_fase9b_warranty_setting.sql", import.meta.url);
const presentationMigrationUrl = new URL("../migrations/202607160001_catalog_presentation_settings.sql", import.meta.url);

assert.ok(existsSync(fileURLToPath(presentationMigrationUrl)), "catalog presentation migration must exist");

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create table public.app_settings (
    key text primary key,
    value text not null,
    updated_at timestamptz not null default now()
  );
  create table public.units (
    id_unit text primary key,
    brand text not null,
    model text,
    spek_saat_ini text,
    kondisi_fisik text,
    kondisi_fungsi text,
    harga_listing numeric,
    foto_url text[],
    status text not null,
    tanggal_masuk date not null,
    updated_at timestamptz not null
  );
`);

await db.exec(await readFile(catalogMigrationUrl, "utf8"));
await db.exec(await readFile(settingMigrationUrl, "utf8"));
await db.exec(await readFile(presentationMigrationUrl, "utf8"));
await db.exec(`
  insert into public.units (
    id_unit, brand, model, spek_saat_ini, kondisi_fisik, kondisi_fungsi,
    harga_listing, status, tanggal_masuk, updated_at
  ) values
    ('BJ-OLD', 'Acer', 'Old', 'RAM 4 GB', 'A', 'Normal', 1999999, 'Listed', '2026-01-01', '2026-01-01T00:00:00Z'),
    ('BJ-NEW', 'Lenovo', 'New', 'RAM 8 GB', 'B', 'Normal', 5000001, 'Listed', '2026-07-16', '2026-07-16T00:00:00Z');
`);

const list = await db.query("select * from public.get_catalog_units()");
assert.deepEqual(list.rows.map((row) => row.id_unit), ["BJ-NEW", "BJ-OLD"]);
assert.ok("updated_at" in list.rows[0]);
assert.ok(!("kondisi_fisik" in list.rows[0]));

const detail = await db.query("select * from public.get_catalog_unit('BJ-NEW')");
assert.ok(!("kondisi_fisik" in detail.rows[0]));
assert.equal(detail.rows[0].kondisi_fungsi, "Normal");

const internalGrade = await db.query("select kondisi_fisik from public.units where id_unit = 'BJ-NEW'");
assert.equal(internalGrade.rows[0].kondisi_fisik, "B");

const mapsSetting = await db.query("select public.get_store_setting('store_google_maps_url') as value");
assert.equal(mapsSetting.rows[0].value, "");

const catalogPage = await readFile(new URL("../../app/katalog/page.tsx", import.meta.url), "utf8");
const filterBar = await readFile(new URL("../../app/katalog/filter-bar.tsx", import.meta.url), "utf8");
const sortSheet = await readFile(new URL("../../app/katalog/sort-sheet.tsx", import.meta.url), "utf8");
const detailPage = await readFile(new URL("../../app/katalog/[id_unit]/page.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../../app/katalog/[id_unit]/floating-actions.tsx", import.meta.url), "utf8");
const publicCatalogSource = [catalogPage, filterBar, sortSheet, detailPage].join("\n");

assert.match(catalogPage, /Katalog lengkap dan update\./);
for (const label of ["Semua harga", "< Rp2jt", "Rp2–5jt", "> Rp5jt"]) assert.match(filterBar, new RegExp(label));
for (const label of ["Termurah", "Termahal", "Terbaru", "Terlama"]) assert.match(sortSheet, new RegExp(label));
assert.doesNotMatch(publicCatalogSource, /GRADE|Grade A|Grade B|Grade C|kondisi_fisik/);
assert.match(actions, /navigator\.share/);
assert.match(actions, /navigator\.clipboard\.writeText/);
assert.match(actions, /Buka lokasi/);

console.log("catalog presentation migration and source contracts passed");
