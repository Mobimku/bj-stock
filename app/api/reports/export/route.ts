import { NextResponse } from "next/server";
import { z } from "zod";
import { generateCsv } from "@/lib/csv";
import {
  catalogAnalyticsSchema,
  leadSchema,
  marginSchema,
  turnoverSchema,
} from "@/lib/report-contracts";
import { createClient } from "@/lib/supabase/server";

const dateQuerySchema = z.strictObject({
  dataset: z.enum(["margin", "turnover", "leads"]),
  start: z.iso.date(),
  end: z.iso.date(),
}).refine(({ start, end }) => start <= end, {
  message: "Tanggal mulai tidak boleh setelah tanggal akhir.",
  path: ["end"],
}).readonly();

const catalogQuerySchema = z.strictObject({
  dataset: z.enum(["catalog-summary", "catalog-top-units", "catalog-top-sources"]),
  days: z.enum(["7", "30"]).transform(Number),
}).readonly();

const exportQuerySchema = z.union([dateQuerySchema, catalogQuerySchema]);

const MARGIN_HEADERS = [
  "Brand",
  "Unit Terjual",
  "Total Revenue",
  "Total Margin",
  "Margin Rata-rata",
] as const;
const TURNOVER_HEADERS = ["Brand", "Unit Terjual", "Rata-rata Hari"] as const;
const LEAD_HEADERS = [
  "Sumber Lead",
  "Jumlah Customer",
  "Konversi Sales",
  "Konversi Servis",
  "Total Revenue",
] as const;
const CATALOG_SUMMARY_HEADERS = [
  "Periode (Hari)",
  "Pengunjung Unik",
  "Detail Dilihat",
  "Klik WhatsApp",
  "Klik Bagikan",
  "Konversi WhatsApp (%)",
] as const;
const CATALOG_TOP_UNIT_HEADERS = ["ID Unit", "Brand", "Model", "Detail Dilihat"] as const;
const CATALOG_TOP_SOURCE_HEADERS = [
  "Sumber",
  "Pengunjung",
  "Detail Dilihat",
  "Klik WhatsApp",
] as const;

type CsvRow = Readonly<Record<string, unknown>>;

function csvResponse(filename: string, headers: readonly string[], rows: readonly CsvRow[]) {
  return new NextResponse(generateCsv(rows, { headers }), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function serverError() {
  return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "owner"].includes(authData.user.app_metadata.role)) {
      return NextResponse.json(
        { error: "Hanya admin dan owner yang dapat mengekspor laporan." },
        { status: 403 },
      );
    }

    const searchParams = new URL(request.url).searchParams;
    if (new Set(searchParams.keys()).size !== searchParams.size) {
      return NextResponse.json({ error: "Parameter ekspor laporan tidak valid." }, { status: 400 });
    }

    const input = exportQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Parameter ekspor laporan tidak valid." },
        { status: 400 },
      );
    }

    const query = input.data;
    switch (query.dataset) {
      case "margin": {
        const result = await supabase.rpc("get_margin_report", {
          p_start_date: query.start,
          p_end_date: query.end,
        });
        const rows = marginSchema.safeParse(result.data);
        if (result.error || !rows.success) return serverError();
        return csvResponse(
          `laporan-margin-${query.start}-${query.end}.csv`,
          MARGIN_HEADERS,
          rows.data.map((row) => ({
            Brand: row.brand,
            "Unit Terjual": row.unit_terjual,
            "Total Revenue": row.total_revenue,
            "Total Margin": row.total_margin,
            "Margin Rata-rata": row.margin_rata_rata,
          })),
        );
      }
      case "turnover": {
        const result = await supabase.rpc("get_stock_turnover", {
          p_start_date: query.start,
          p_end_date: query.end,
        });
        const rows = turnoverSchema.safeParse(result.data);
        if (result.error || !rows.success) return serverError();
        return csvResponse(
          `laporan-perputaran-stok-${query.start}-${query.end}.csv`,
          TURNOVER_HEADERS,
          rows.data.map((row) => ({
            Brand: row.brand,
            "Unit Terjual": row.unit_terjual,
            "Rata-rata Hari": row.rata_rata_hari,
          })),
        );
      }
      case "leads": {
        const result = await supabase.rpc("get_lead_conversion", {
          p_start_date: query.start,
          p_end_date: query.end,
        });
        const rows = leadSchema.safeParse(result.data);
        if (result.error || !rows.success) return serverError();
        return csvResponse(
          `laporan-sumber-lead-${query.start}-${query.end}.csv`,
          LEAD_HEADERS,
          rows.data.map((row) => ({
            "Sumber Lead": row.sumber_lead ?? "Tanpa sumber",
            "Jumlah Customer": row.jumlah_customer,
            "Konversi Sales": row.konversi_sales,
            "Konversi Servis": row.konversi_servis,
            "Total Revenue": row.total_revenue,
          })),
        );
      }
      case "catalog-summary": {
        const result = await supabase.rpc("get_catalog_analytics", { p_days: query.days });
        const parsed = catalogAnalyticsSchema.safeParse(result.data);
        const analytics = parsed.success ? parsed.data[0] : undefined;
        if (result.error || !analytics) return serverError();
        return csvResponse(
          `laporan-ringkasan-katalog-${query.days}-hari.csv`,
          CATALOG_SUMMARY_HEADERS,
          [{
            "Periode (Hari)": query.days,
            "Pengunjung Unik": analytics.unique_visitors,
            "Detail Dilihat": analytics.detail_views,
            "Klik WhatsApp": analytics.whatsapp_clicks,
            "Klik Bagikan": analytics.share_clicks,
            "Konversi WhatsApp (%)": analytics.conversion_rate,
          }],
        );
      }
      case "catalog-top-units": {
        const result = await supabase.rpc("get_catalog_analytics", { p_days: query.days });
        const parsed = catalogAnalyticsSchema.safeParse(result.data);
        const analytics = parsed.success ? parsed.data[0] : undefined;
        if (result.error || !analytics) return serverError();
        return csvResponse(
          `laporan-unit-katalog-teratas-${query.days}-hari.csv`,
          CATALOG_TOP_UNIT_HEADERS,
          analytics.top_units.map((unit) => ({
            "ID Unit": unit.id_unit,
            Brand: unit.brand,
            Model: unit.model ?? "",
            "Detail Dilihat": unit.detail_views,
          })),
        );
      }
      case "catalog-top-sources": {
        const result = await supabase.rpc("get_catalog_analytics", { p_days: query.days });
        const parsed = catalogAnalyticsSchema.safeParse(result.data);
        const analytics = parsed.success ? parsed.data[0] : undefined;
        if (result.error || !analytics) return serverError();
        return csvResponse(
          `laporan-sumber-trafik-katalog-${query.days}-hari.csv`,
          CATALOG_TOP_SOURCE_HEADERS,
          (analytics.top_sources ?? []).map((row) => ({
            Sumber: row.source,
            Pengunjung: row.visitors,
            "Detail Dilihat": row.detail_views,
            "Klik WhatsApp": row.whatsapp_clicks,
          })),
        );
      }
      default:
        query satisfies never;
        return serverError();
    }
  } catch (error) {
    console.error("GET /api/reports/export failed", error);
    return serverError();
  }
}
