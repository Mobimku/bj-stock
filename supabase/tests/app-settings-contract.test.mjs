import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROUTE_PATH = new URL("../../app/api/settings/app-settings/route.ts", import.meta.url);
const FORM_PATH = new URL("../../app/(dashboard)/settings/app-settings/app-settings-form.tsx", import.meta.url);
const CONTRACT_PATH = new URL("../../lib/app-settings.ts", import.meta.url);

const EXPECTED_KEYS = [
  "default_warranty_unit_days",
  "default_warranty_service_days",
  "replacement_grace_days",
  "stock_aging_alert_days",
  "store_whatsapp_number",
  "store_google_maps_url",
];

const EXPECTED_NUMERIC = [
  "default_warranty_unit_days",
  "default_warranty_service_days",
  "replacement_grace_days",
  "stock_aging_alert_days",
];

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { console.error(`  FAIL  ${label}: ${detail}`); failures++; }
  else console.log(`  PASS  ${label}`);
}

function arraysMatch(a, b) {
  return a.length === b.length && a.every((v) => b.includes(v)) && b.every((v) => a.includes(v));
}

// ============================================================
// lib/app-settings.ts — shared contract with exports
// ============================================================
console.log("\n--- lib/app-settings.ts shared contract ---");
{
  const fp = fileURLToPath(CONTRACT_PATH);
  check("shared contract module exists", existsSync(fp), "lib/app-settings.ts must exist");

  if (existsSync(fp)) {
    const mod = await import(CONTRACT_PATH.href);

    check(
      "exports allowedKeys",
      Array.isArray(mod.allowedKeys),
      "must export allowedKeys array",
    );
    check(
      "exports numericKeys",
      Array.isArray(mod.numericKeys),
      "must export numericKeys array",
    );
    check(
      "exports settingLabels",
      mod.settingLabels && typeof mod.settingLabels === "object",
      "must export settingLabels object",
    );

    check(
      "allowedKeys length is 6",
      mod.allowedKeys.length === 6,
      `expected 6 keys, got ${mod.allowedKeys.length}`,
    );
    check(
      "allowedKeys includes replacement_grace_days",
      mod.allowedKeys.includes("replacement_grace_days"),
      "allowedKeys must include replacement_grace_days",
    );
    check(
      "allowedKeys matches expected set",
      arraysMatch(mod.allowedKeys, EXPECTED_KEYS),
      `allowedKeys must contain exactly: ${EXPECTED_KEYS.join(", ")}`,
    );

    check(
      "numericKeys length is 4",
      mod.numericKeys.length === 4,
      `expected 4 numeric keys, got ${mod.numericKeys.length}`,
    );
    check(
      "numericKeys includes replacement_grace_days",
      mod.numericKeys.includes("replacement_grace_days"),
      "numericKeys must include replacement_grace_days",
    );
    check(
      "numericKeys matches expected day keys",
      arraysMatch(mod.numericKeys, EXPECTED_NUMERIC),
      `numericKeys must contain exactly: ${EXPECTED_NUMERIC.join(", ")}`,
    );

    check(
      "settingLabels has 6 entries",
      Object.keys(mod.settingLabels).length === 6,
      `expected 6 labels, got ${Object.keys(mod.settingLabels).length}`,
    );
    check(
      "settingLabels includes replacement_grace_days",
      "replacement_grace_days" in mod.settingLabels,
      "settingLabels must include a label for replacement_grace_days",
    );
    check(
      "all settingLabels are non-empty",
      Object.values(mod.settingLabels).every((l) => typeof l === "string" && l.length > 0),
      "every label must be a non-empty string",
    );
  }
}

// ============================================================
// Route — must import contract, not define locals
// ============================================================
console.log("\n--- Route contract compliance ---");
{
  const fp = fileURLToPath(ROUTE_PATH);
  check("route file exists", existsSync(fp), "route.ts must exist");

  if (existsSync(fp)) {
    const src = await readFile(fp, "utf8");
    check(
      "route imports from lib/app-settings",
      src.includes('from "@/lib/app-settings"'),
      "route must import allowedKeys/numericKeys from lib/app-settings",
    );
    check(
      "route no local allowedKeys",
      !/const\s+allowedKeys\s*=/.test(src),
      "route must not define allowedKeys locally",
    );
    check(
      "route no local numericKeys",
      !/const\s+numericKeys\s*=/.test(src),
      "route must not define numericKeys locally",
    );
  }
}

// ============================================================
// Form — must import contract, not define locals
// ============================================================
console.log("\n--- Form contract compliance ---");
{
  const fp = fileURLToPath(FORM_PATH);
  check("form file exists", existsSync(fp), "app-settings-form.tsx must exist");

  if (existsSync(fp)) {
    const src = await readFile(fp, "utf8");
    check(
      "form imports from lib/app-settings",
      src.includes('from "@/lib/app-settings"'),
      "form must import settingLabels/numericKeys from lib/app-settings",
    );
    check(
      "form no local settingLabels",
      !/const\s+settingLabels\s*[:=]/.test(src),
      "form must not define settingLabels locally",
    );
    check(
      "form no local numericKeys",
      !/const\s+numericKeys\s*=/.test(src),
      "form must not define numericKeys locally",
    );
  }
}

// ============================================================
console.log(
  `\n${failures === 0 ? "✓ All app-settings contract checks passed." : `✗ ${failures} contract(s) failed — implementation not yet applied.`}`,
);
process.exit(failures > 0 ? 1 : 0);
