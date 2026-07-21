import { NextResponse } from "next/server";
import { generateCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";

const EXPORTABLE_TABLES = [
  "units",
  "bank_stock",
  "upgrade_log",
  "sales",
  "warranty",
  "warranty_claim",
  "service_orders",
  "service_part_log",
  "customers",
  "finance_accounts",
  "finance_transactions",
  "receivables",
  "finance_payments",
  "returns",
  "bank_stock_restock",
] as const;

type TableName = (typeof EXPORTABLE_TABLES)[number];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ table: string }> },
) {
  const { table } = await params;

  if (!EXPORTABLE_TABLES.includes(table as TableName)) {
    return NextResponse.json(
      { error: `Tabel '${table}' tidak dapat di-export.` },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
  }
  if (!["admin", "owner"].includes(authData.user.app_metadata.role)) {
    return NextResponse.json(
      { error: "Hanya admin dan owner yang dapat export data." },
      { status: 403 },
    );
  }

  const { data, error } = await supabase.from(table).select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const csv = generateCsv(rows, { headers });
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${table}-${today}.csv"`,
    },
  });
}
