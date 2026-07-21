export const APP_SETTINGS = [
  { key: "default_warranty_unit_days", label: "Garansi Unit (hari)", kind: "number" },
  { key: "default_warranty_service_days", label: "Garansi Servis (hari)", kind: "number" },
  { key: "replacement_grace_days", label: "Masa Minimum Garansi Pengganti (hari)", kind: "number" },
  { key: "stock_aging_alert_days", label: "Alert Stok Menua (hari)", kind: "number" },
  { key: "store_whatsapp_number", label: "Nomor WhatsApp Toko", kind: "text" },
  { key: "store_google_maps_url", label: "URL Google Maps Toko", kind: "text" },
] as const;

export const allowedKeys: readonly string[] = APP_SETTINGS.map((s) => s.key);

export const numericKeys: readonly string[] = APP_SETTINGS.filter((s) => s.kind === "number").map((s) => s.key);

export const settingLabels = Object.fromEntries(
  APP_SETTINGS.map((s) => [s.key, s.label]),
);
