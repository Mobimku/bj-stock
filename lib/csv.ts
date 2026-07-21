type CsvOptions = {
  readonly headers: readonly string[];
};

type CsvRow = Readonly<Record<string, unknown>>;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = typeof value === "string"
    ? /^\s*[=+\-@]/.test(value) ? `'${value}` : value
    : typeof value === "object" ? JSON.stringify(value) ?? "" : String(value);

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function generateCsv(rows: readonly CsvRow[], { headers }: CsvOptions): string {
  const lines = [headers.map(formatCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => formatCell(row[header])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}
