import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const surfaces = [
  "../../app/(dashboard)/units/page.tsx",
  "../../app/(dashboard)/units/[id]/photo-gallery.tsx",
  "../../app/katalog/page.tsx",
  "../../app/katalog/[id_unit]/client.tsx",
];

for (const surface of surfaces) {
  const source = await readFile(new URL(surface, import.meta.url), "utf8");
  assert.match(source, /next\/image/, `${surface} must use next/image`);
  assert.doesNotMatch(source, /\bunoptimized\b/, `${surface} must keep the Next image optimizer enabled`);
  assert.match(source, /\bsizes=/, `${surface} must declare responsive image sizes`);
}

const configSource = await readFile(new URL("../../next.config.ts", import.meta.url), "utf8");
assert.match(configSource, /remotePatterns/);
assert.match(configSource, /new URL\(["']\/storage\/v1\/object\/public\/unit-photos\/\*\*["']/);

console.log("unit photo optimization source contracts passed");
