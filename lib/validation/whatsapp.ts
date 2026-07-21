import { z } from "zod";

/** Canonical store format: digits only, leading 62 (e.g. 6281234567890). */
export function normalizeWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  // WhatsApp sometimes stores 8… without country code
  if (digits.startsWith("8") && digits.length >= 9 && digits.length <= 13) {
    return `62${digits}`;
  }
  return digits;
}

function isValidCanonicalWa(value: string) {
  // Indonesia mobile after normalize: 62 + 8–15 more digits
  return /^62[0-9]{8,15}$/.test(value);
}

export const whatsappSchema = z
  .string()
  .trim()
  .max(40) // allow paste with + / spaces / dashes before strip
  .transform(normalizeWhatsapp)
  .refine((value) => isValidCanonicalWa(value), {
    message: "Nomor WhatsApp tidak valid. Contoh: 6281234567890",
  });

export const optionalWhatsappSchema = z
  .string()
  .trim()
  .max(40)
  .transform((value) => {
    if (!value) return null;
    const normalized = normalizeWhatsapp(value);
    return normalized || null;
  })
  .refine((value) => value === null || isValidCanonicalWa(value), {
    message: "Nomor WhatsApp tidak valid. Contoh: 6281234567890",
  });
