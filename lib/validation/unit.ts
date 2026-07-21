import { z } from "zod";

const optionalText = z.string().trim().max(2000).transform((value) => value || null);

export const unitSchema = z.object({
  brand: z
    .string()
    .trim()
    .min(1, "Brand wajib diisi.")
    .max(50)
    .regex(/[a-z0-9]/i, "Brand harus memuat huruf atau angka."),
  model: z.string().trim().max(100).transform((value) => value || null),
  serialNumber: z.string().trim().max(100).transform((value) => value || null),
  initialSpecs: optionalText,
  physicalCondition: z.enum(["A", "B", "C"]),
  functionalCondition: optionalText,
  purchaseSource: z.string().trim().max(200).transform((value) => value || null),
  initialCapital: z.coerce.number().positive("Modal awal wajib lebih dari 0."),
  entryDate: z.iso.date(),
});

export type UnitInput = z.infer<typeof unitSchema>;

export const unitDetailSchema = z.object({
  id_unit: z.string(),
  brand: z.string(),
  model: z.string().nullable(),
  serial_number: z.string().nullable(),
  spek_awal: z.string().nullable(),
  spek_saat_ini: z.string().nullable(),
  kondisi_fisik: z.enum(["A", "B", "C"]).nullable(),
  kondisi_fungsi: z.string().nullable(),
  sumber_beli: z.string().nullable(),
  modal_awal: z.union([z.number(), z.string()]),
  total_modal: z.union([z.number(), z.string()]),
  harga_listing: z.union([z.number(), z.string()]).nullable(),
  status: z.enum(["Masuk", "QC", "Ready", "Listed", "Terjual", "Selesai", "Delisted"]),
  tanggal_masuk: z.string(),
  foto_url: z.array(z.string().url()).nullable(),
  qr_payload: z.string().nullable(),
  delist_jenis: z.enum(["rusak", "retur_supplier", "salah_input", "hilang"]).nullable().optional(),
  delist_alasan: z.string().nullable().optional(),
  delist_tanggal: z.string().nullable().optional(),
});

export const upgradeHistorySchema = z.array(
  z.object({
    id_log: z.string().uuid(),
    id_part: z.string().nullable(),
    jenis: z.enum(["part", "service", "downgrade"]),
    biaya: z.union([z.number(), z.string()]),
    spek_setelah: z.string().nullable(),
    tanggal: z.string(),
    catatan: z.string().nullable(),
  }),
);

export const specHistorySchema = z.array(
  z.object({
    id_history: z.string().uuid(),
    id_unit: z.string(),
    spek_saat_ini: z.string().nullable(),
    kondisi_fisik: z.enum(["A", "B", "C"]).nullable(),
    kondisi_fungsi: z.string().nullable(),
    changed_by: z.string().uuid().nullable(),
    changed_at: z.string(),
    catatan: z.string().nullable(),
  }),
);
