import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { console.error(`  FAIL  ${label}: ${detail}`); failures++; }
  else console.log(`  PASS  ${label}`);
}

function pureLOC(content) {
  return content.split("\n").filter((l) => l.trim() && !l.trim().match(/^\s*(\/\/|\/\*|\*)/)).length;
}

// ============================================================
// lib/csv.ts — behavioral generateCsv contract
// BOM, CRLF, quoting, escaping, formulas, Unicode
// ============================================================
console.log("\n--- lib/csv.ts ---");
{
  const csvPath = new URL("../../lib/csv.ts", import.meta.url);
  const filePath = fileURLToPath(csvPath);
  check("file exists", existsSync(filePath), "lib/csv.ts must exist — exports generateCsv");

  if (existsSync(filePath)) {
    const { generateCsv } = await import(csvPath.href);

    // Standard CSV with quoting edge cases
    const rows = [
      { a: "Alice", b: 30, c: "Jakarta" },
      { a: 'Bob "The Builder"', b: 25, c: "Bandung" },
    ];
    const csv = generateCsv(rows, { headers: ["a", "b", "c"] });

    check("BOM prefix", csv.startsWith("\uFEFF"), "CSV must start with \\uFEFF BOM");
    check("CRLF line endings", csv.includes("\r\n"), "lines delimited by \\r\\n");
    check("header row", csv.startsWith("\uFEFFa,b,c"), "BOM then header names");
    check("double-quote escaping", csv.includes('"Bob ""The Builder"""'), `embedded " escaped as ""`);

    // Comma / newline in field → quoted
    const complex = [
      { x: "hello, world" },
      { x: "line1\nline2" },
      { x: "plain" },
    ];
    const cCsv = generateCsv(complex, { headers: ["x"] });
    check("comma → quoted", cCsv.includes('"hello, world"'), "commas force quoting");
    check("newline → quoted", cCsv.includes('"line1'), "newlines force quoting");

    // Formula injection protection — prefix dangerous string cells with apostrophe
    const formulas = [
      { v: "=SUM(A1:A10)" },
      { v: "+1+1" },
      { v: "-1-1" },
      { v: "@D1" },
      { v: "  =SUM(B1)" },
      { v: -42 },
      { v: 0 },
    ];
    const fCsv = generateCsv(formulas, { headers: ["v"] });

    check("prefixes leading =",       fCsv.includes("'=SUM(A1:A10)"),  "leading '= prefixed with apostrophe");
    check("prefixes leading +",       fCsv.includes("'+1+1"),          "leading '+ prefixed with apostrophe");
    check("prefixes leading - (str)", fCsv.includes("'-1-1"),          "leading '- prefixed with apostrophe on strings");
    check("prefixes leading @",       fCsv.includes("'@D1"),           "leading '@ prefixed with apostrophe");
    check("whitespace+formula",       fCsv.includes("'  =SUM(B1)"),    "whitespace+prefix gets apostrophe before original text");
    check("preserves negative num",   fCsv.includes("-42"),            "numeric -42 preserved as-is");
    check("preserves zero",           /\b0\b/.test(fCsv),              "0 preserved");

    // Unicode round-trip
    const uRows = [{ n: "Zoë" }, { n: "東京" }, { n: "Jalur Gemilang" }];
    const uCsv = generateCsv(uRows, { headers: ["n"] });
    check("Unicode Latin",          uCsv.includes("Zoë"),           "Latin-1 supplement");
    check("Unicode CJK",            uCsv.includes("東京"),           "CJK ideographs");
    check("Unicode Malay",          uCsv.includes("Jalur Gemilang"), "Malay with spaces");
  }
}

// ============================================================
// app/api/reports/export/route.ts — auth + dataset + headers
// ============================================================
console.log("\n--- Reports export API route ---");
{
  const routePath = new URL("../../app/api/reports/export/route.ts", import.meta.url);
  const filePath = fileURLToPath(routePath);
  check("route file exists", existsSync(filePath), "app/api/reports/export/route.ts must exist");

  if (existsSync(filePath)) {
    const src = await readFile(routePath, "utf8");

    // Five query dataset names
    for (const name of ["margin", "turnover", "leads", "catalog-summary", "catalog-top-units"]) {
      check(`dataset "${name}"`, src.includes(name), `route must reference dataset name ${name}`);
    }
    // RPC names called for each dataset
    for (const rpc of ["get_margin_report", "get_stock_turnover", "get_lead_conversion", "get_catalog_analytics"]) {
      check(`RPC "${rpc}"`, src.includes(rpc), `route must call RPC ${rpc}`);
    }

    // Explicit auth status codes
    check("401 for anon",      src.includes("401"), "no user → 401");
    check("403 for teknisi",   src.includes("403"), "teknisi → 403");

    // CSV content type + no-store cache
    check("Content-Type text/csv", /text\/csv/.test(src), "response must set Content-Type: text/csv");
    check("Cache-Control no-store", /no-store/.test(src), "response must set Cache-Control: no-store");

    // Aggregate-only — must NOT expose raw event-level data
    check("no catalog_events leak", !src.includes("catalog_events"), "must expose aggregate data only, never raw catalog_events");
    check("no session_id leak",     !src.includes("session_id"),     "must not expose session_id");
  }
}

// ============================================================
// app/(dashboard)/reports/page.tsx — LOC gate + dataset RPCs
// ============================================================
console.log("\n--- Reports page ---");
{
  const pagePath = new URL("../../app/(dashboard)/reports/page.tsx", import.meta.url);
  const filePath = fileURLToPath(pagePath);
  check("page file exists", existsSync(filePath), "reports/page.tsx must exist");

  if (existsSync(filePath)) {
    const src = await readFile(pagePath, "utf8");
    const loc = pureLOC(src);
    check("pure LOC ≤ 250", loc <= 250, `reports/page.tsx = ${loc} pure LOC (must stay ≤ 250)`);
    for (const ds of ["get_margin_report", "get_stock_turnover", "get_lead_conversion", "get_catalog_analytics"]) {
      check(`RPC "${ds}" called`, src.includes(ds), `page must call ${ds} RPC`);
    }
  }
}

// ============================================================
// app/(dashboard)/reports/report-sections.tsx — responsive
// branches, all required fields, export links
// ============================================================
console.log("\n--- Report sections component ---");
{
  const sectionsPath = new URL("../../app/(dashboard)/reports/report-sections.tsx", import.meta.url);
  const filePath = fileURLToPath(sectionsPath);
  check("sections file exists", existsSync(filePath), "report-sections.tsx must exist — splits page into section components");

  if (existsSync(filePath)) {
    const src = await readFile(sectionsPath, "utf8");

    check("exports components", /export\s+(default\s+)?(function|const)/.test(src), "must export section components");

    // Mobile card branch and desktop table branch via responsive Tailwind classes
    check("mobile card branch",     /\bmd:hidden\b/.test(src), "mobile view uses md:hidden");
    check("desktop table branch",   /\bhidden\s+md:block\b/.test(src), "desktop view uses hidden md:block");

    // All required data fields (across margin / turnover / lead / catalog sections)
    const fields = [
      "brand", "unit_terjual", "total_revenue", "total_margin", "margin_rata_rata",
      "rata_rata_hari",
      "sumber_lead", "jumlah_customer", "konversi_sales", "konversi_servis",
      "unique_visitors", "detail_views", "whatsapp_clicks", "share_clicks", "conversion_rate", "top_units",
    ];
    for (const f of fields) {
      check(`field "${f}"`, src.includes(f), `section must reference ${f}`);
    }

    // Export / download link per section
    check("export links present", /(href|onClick|download|export).*csv|btn.*ekspor|tombol.*download/i.test(src), "each section must have a CSV export link");
  }
}

// ============================================================
// lib/report-contracts.ts — behavioral Zod schema validation
// Reject arbitrary/whitespace strings, accept numeric strings,
// transform to finite numbers, nullable round-trip
// ============================================================
console.log("\n--- lib/report-contracts.ts ---");
{
  const contractsPath = new URL("../../lib/report-contracts.ts", import.meta.url);
  const fp = fileURLToPath(contractsPath);
  check("file exists", existsSync(fp), "lib/report-contracts.ts must exist");

  if (existsSync(fp)) {
    const {
      reportNumberSchema,
      postgresNumberSchema,
      marginReportRowSchema,
      turnoverReportRowSchema,
    } = await import(contractsPath.href);

    // ================================================================
    // Every report numeric field uses one strict finite parser.
    // Both schemas must: reject arbitrary / empty / whitespace strings,
    // accept finite numbers and non-empty numeric strings, transform
    // numeric strings to numbers.
    // ================================================================

    // postgresNumberSchema — strict parse-don't-validate
    const rej = (v) => !postgresNumberSchema.safeParse(v).success;
    const acc = (v) => postgresNumberSchema.safeParse(v).success;
    check("rejects arbitrary string",    rej("abc"),        "\"abc\" must fail postgresNumberSchema");
    check("rejects whitespace-only",     rej("   "),        "whitespace-only must fail postgresNumberSchema");
    check("rejects empty string",        rej(""),           "empty string must fail postgresNumberSchema");
    check("accepts numeric string",      acc("123"),        "\"123\" must pass postgresNumberSchema");
    check("transforms to finite",        postgresNumberSchema.parse("123") === 123, "parse(\"123\") = 123");
    check("accepts number zero",         postgresNumberSchema.parse(0) === 0,       "0 passes");
    check("accepts decimal",             postgresNumberSchema.parse(42.5) === 42.5,  "42.5 passes");

    // reportNumberSchema must share the identical strict behavior
    check("R rejects arbitrary",  !reportNumberSchema.safeParse("abc").success,  "reportNumberSchema must reject non-numeric");
    check("R rejects whitespace", !reportNumberSchema.safeParse("   ").success,  "reportNumberSchema must reject whitespace-only");
    check("R rejects empty",      !reportNumberSchema.safeParse("").success,     "reportNumberSchema must reject empty");
    check("R accepts number",     reportNumberSchema.safeParse(123).success,     "reportNumberSchema must accept number");
    check("R accepts numeric str", reportNumberSchema.safeParse("123").success,  "reportNumberSchema must accept numeric string");
    check("R transforms to number", reportNumberSchema.parse("123") === 123,     "reportNumberSchema must transform \"123\" to 123");

    // marginReportRowSchema — all numeric fields reject abc, valid strings become numbers
    check(
      "margin rejects abc",
      !marginReportRowSchema.safeParse({
        brand: "T", unit_terjual: "abc", total_revenue: "1",
        total_margin: "1", margin_rata_rata: "1",
      }).success,
      "margin row with non-numeric field must fail",
    );
    {
      const m = marginReportRowSchema.parse({
        brand: "Test", unit_terjual: "5", total_revenue: "10000000",
        total_margin: "2000000", margin_rata_rata: "400000",
      });
      check("margin parses",                  !!m,                         "valid margin row accepted");
      check("margin unit_terjual is number",   typeof m.unit_terjual === "number",   "parse yields number");
      check("margin total_revenue is number",  typeof m.total_revenue === "number",  "parse yields number");
      check("margin total_margin is number",   typeof m.total_margin === "number",   "parse yields number");
      check("margin rata_rata is number",      typeof m.margin_rata_rata === "number","parse yields number");
    }

    // turnoverReportRowSchema — null only for rata_rata_hari, unit_terjual transforms
    {
      const t = turnoverReportRowSchema.parse({
        brand: "Test", unit_terjual: "3", rata_rata_hari: null,
      });
      check("turnover null ok",               t.rata_rata_hari === null,   "rata_rata_hari null round-trips");
      check("turnover unit_terjual is number", typeof t.unit_terjual === "number", "parse yields number");
    }
  }
}

// ============================================================
// report-sections.tsx — null branch for rata_rata_hari
// Must render — when null, never show 0 hari
// ============================================================
console.log("\n--- report-sections.tsx null branch ---");
{
  const sectionsPath = new URL("../../app/(dashboard)/reports/report-sections.tsx", import.meta.url);
  const fp = fileURLToPath(sectionsPath);
  check("sections file exists", existsSync(fp), "report-sections.tsx must exist");

  if (existsSync(fp)) {
    const src = await readFile(sectionsPath, "utf8");

    // TurnoverSection must render em-dash when rata_rata_hari is null
    //   {row.rata_rata_hari === null ? "\u2014" : `${Number(...).toFixed(0)} hari`}
    check(
      "rata_rata_hari null → em-dash",
      /\brata_rata_hari\b\s*===\s*null\s*\?\s*["'\u2014–]/.test(src),
      "must render — when rata_rata_hari is null to avoid 0 hari from Number(null)",
    );
    check(
      "ratio fallback includes hari",
      /\bnull\s*:.*hari/.test(src),
      "non-null branch must suffix with 'hari'",
    );
  }
}

// ============================================================
// reports/page.tsx — start/end ordering guard
// Must enforce start ≤ end (or swap) before RPC calls
// ============================================================
console.log("\n--- reports/page.tsx ordering guard ---");
{
  const pagePath = new URL("../../app/(dashboard)/reports/page.tsx", import.meta.url);
  const fp = fileURLToPath(pagePath);
  check("page file exists", existsSync(fp), "reports/page.tsx must exist");

  if (existsSync(fp)) {
    const src = await readFile(pagePath, "utf8");

    // Guard before RPC calls: if (start > end) swap or coerce
    // Must be specific enough not to pass on unrelated < characters
    check(
      "start/end ordering guard",
      /\bif\s*\(.*start\s*[>].*end\b/.test(src) || /\b(start|end)\b.*swap/.test(src) || /\[start,\s*end\]\s*=/.test(src),
      "page must guard start ≤ end (swap or clamp) before RPC calls",
    );
  }
}

// ============================================================
console.log(`\n${failures === 0 ? "✓ All report export source contracts passed." : `✗ ${failures} contract(s) failed — implementation not yet applied.`}`);
process.exit(failures > 0 ? 1 : 0);
