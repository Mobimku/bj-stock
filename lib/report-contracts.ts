import { z } from "zod";

export const reportNumberSchema = z.union([
  z.number().finite(),
  z.string().trim().min(1).transform((s, ctx) => {
    const n = Number(s);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Not a finite number" });
      return z.NEVER;
    }
    return n;
  }),
]);

export const postgresNumberSchema = reportNumberSchema;

export const marginReportRowSchema = z.object({
  brand: z.string(),
  unit_terjual: reportNumberSchema,
  total_revenue: reportNumberSchema,
  total_margin: reportNumberSchema,
  margin_rata_rata: reportNumberSchema,
}).readonly();
export const marginSchema = z.array(marginReportRowSchema).readonly();

export const turnoverReportRowSchema = z.object({
  brand: z.string(),
  unit_terjual: reportNumberSchema,
  rata_rata_hari: reportNumberSchema.nullable(),
}).readonly();
export const turnoverSchema = z.array(turnoverReportRowSchema).readonly();

export const leadReportRowSchema = z.object({
  sumber_lead: z.string().nullable(),
  jumlah_customer: reportNumberSchema,
  konversi_sales: reportNumberSchema,
  konversi_servis: reportNumberSchema,
  total_revenue: reportNumberSchema,
}).readonly();
export const leadSchema = z.array(leadReportRowSchema).readonly();

export const catalogTopUnitSchema = z.object({
  id_unit: z.string(),
  brand: z.string(),
  model: z.string().nullable(),
  detail_views: postgresNumberSchema,
}).readonly();

export const catalogTopSourceSchema = z.object({
  source: z.string(),
  visitors: postgresNumberSchema,
  detail_views: postgresNumberSchema,
  whatsapp_clicks: postgresNumberSchema,
}).readonly();

export const catalogAnalyticsRowSchema = z.object({
  unique_visitors: postgresNumberSchema,
  detail_views: postgresNumberSchema,
  whatsapp_clicks: postgresNumberSchema,
  share_clicks: postgresNumberSchema,
  conversion_rate: postgresNumberSchema,
  top_units: z.array(catalogTopUnitSchema).readonly(),
  top_sources: z.array(catalogTopSourceSchema).readonly().default([]),
}).readonly();
export const catalogAnalyticsSchema = z.array(catalogAnalyticsRowSchema).readonly();

export type MarginReportRow = z.infer<typeof marginReportRowSchema>;
export type TurnoverReportRow = z.infer<typeof turnoverReportRowSchema>;
export type LeadReportRow = z.infer<typeof leadReportRowSchema>;
export type CatalogTopUnit = z.infer<typeof catalogTopUnitSchema>;
export type CatalogTopSource = z.infer<typeof catalogTopSourceSchema>;
export type CatalogAnalytics = z.infer<typeof catalogAnalyticsRowSchema>;
