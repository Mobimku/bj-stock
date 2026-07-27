import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const componentUrl = new URL(
  "../../app/(dashboard)/sales/new/transaction-type-primitive.tsx",
  import.meta.url,
);
const sourceText = await readFile(componentUrl, "utf8");
const source = ts.createSourceFile(
  componentUrl.pathname,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

let selectedUnitPreviewClasses = "";
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.text === "className") {
    const value = node.initializer;
    if (value && ts.isStringLiteral(value) && value.text.includes("bg-stone-950")) {
      selectedUnitPreviewClasses = value.text;
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);

assert.ok(selectedUnitPreviewClasses, "Selected-unit preview card must exist");
assert.match(
  selectedUnitPreviewClasses,
  /(?:^|\s)md:hidden(?:\s|$)/,
  "Selected-unit preview must stay visible on mobile but not consume desktop form height",
);

console.log("sales reservation responsive layout contract OK");
