import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pageUrl = new URL("../../app/(dashboard)/units/page.tsx", import.meta.url);
const pageSource = await readFile(pageUrl, "utf8");

// --- Select fields: approved listing contract must be fetched ---
for (const field of ["harga_listing", "foto_url", "created_at"]) {
  assert.match(pageSource, new RegExp(`\\b${field}\\b`), `units page must select ${field}`);
}

// --- Sort values owned by the results toolbar ---
for (const sort of ["newest", "oldest", "price_asc", "price_desc", "az"]) {
  assert.match(pageSource, new RegExp(`["'\` ]${sort}\\b`), `units page must support sort=${sort}`);
}

// --- View values: card and list ---
for (const view of ["card", "list"]) {
  assert.match(pageSource, new RegExp(`["'\` ]${view}\\b`), `units page must support view=${view}`);
}

// --- Defaults: newest + card, nullsLast for both price directions ---
assert.match(pageSource, /nullsFirst:\s*false/, "price sort must set nullsFirst: false");
assert.match(pageSource, /price_asc[\s\S]{0,400}nullsFirst:\s*false/, "price_asc must set nullsFirst: false");
assert.match(pageSource, /price_desc[\s\S]{0,400}nullsFirst:\s*false/, "price_desc must set nullsFirst: false");

// --- Deterministic tie breakers ---
assert.match(pageSource, /order\(["']created_at["'],\s*\{[^}]*ascending:\s*false/);
assert.match(pageSource, /order\(["']id_unit["']/);

// --- next/image and 4:3 media frame ---
assert.match(pageSource, /next\/image/);
assert.match(pageSource, /aspect-[ ]*\[?4\s*\/\s*3\]?/);

// --- 72x54 list footprint ---
assert.match(pageSource, /72x54|72px|w-\[72px\]|h-\[54px\]/);

// --- Visible Indonesian labels ---
for (const label of ["Harga Listing", "Total Modal", "Belum diatur"]) {
  assert.match(pageSource, new RegExp(label), `units page must show label "${label}"`);
}

// --- Form/control names ---
for (const name of ["brand", "status", "sort", "view"]) {
  assert.match(pageSource, new RegExp(`name=["']${name}["']`), `units page must have control name="${name}"`);
}

// --- Direct Reset to /units ---
assert.match(pageSource, /href=["']\/units["']/);

// --- Meaningful image alt composition ---
assert.match(pageSource, /alt=/);
assert.match(pageSource, /alt=\{[^}]*(brand|model|id_unit)[^}]*\}/);

// --- Absence assertions: server component, no client storage, no margin calc, no public catalog import ---
assert.doesNotMatch(pageSource, /localStorage/);
assert.doesNotMatch(pageSource, /"use client"/);
assert.doesNotMatch(pageSource, /total_modal\s*[-+*/]/);
assert.doesNotMatch(pageSource, /from\s+["']@\/app\/katalog/);

console.log("unit listing presentation source contracts passed");
