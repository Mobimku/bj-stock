export const SALE_TEST_CATEGORIES = [
  { key: "identity_spec_serial", label: "Identitas/Spek/Serial" },
  { key: "physical_casing_hinges", label: "Fisik/Casing/Engsel" },
  { key: "display_dead_pixels", label: "Layar/Dead Pixel" },
  { key: "keyboard_touchpad", label: "Keyboard/Touchpad" },
  { key: "wifi_bluetooth", label: "Wi-Fi/Bluetooth" },
  { key: "av_devices", label: "Webcam/Mic/Speaker/Audio" },
  { key: "usb_ports", label: "USB/USB-C" },
  { key: "display_output", label: "HDMI/Display Output" },
  { key: "battery_charging_charger", label: "Baterai/Charger/Keamanan Charger" },
  { key: "storage_health", label: "Storage Health" },
  { key: "boot_os_locks", label: "Boot/OS/BIOS/MDM" },
  { key: "included_accessories", label: "Aksesoris Termasuk" },
] as const;

export const SALE_TEST_BLOCKERS = [
  { key: "identity_mismatch", label: "Identitas mismatch" },
  { key: "serial_mismatch", label: "Serial mismatch" },
  { key: "spec_mismatch", label: "Spek mismatch" },
  { key: "swollen_battery", label: "Baterai swollen" },
  { key: "bios_lock", label: "BIOS lock" },
  { key: "mdm_lock", label: "MDM lock" },
  { key: "unsafe_charger", label: "Charger tidak aman" },
] as const;

export const SALE_TEST_STATUSES = ["Lulus", "Ada Catatan", "Tidak Diuji"] as const;

export const SALE_TEST_STATUS_SHORT = {
  "Lulus": "L",
  "Ada Catatan": "AC",
  "Tidak Diuji": "TU",
} as const;

export const SALE_TEST_ACKNOWLEDGEMENT =
  "Pembeli telah menyaksikan atau menerima ringkasan hasil pengujian di atas sebelum pembayaran dan memahami setiap catatan atau bagian yang tidak diuji. Persetujuan ini tidak menghapus, mengurangi, atau membatasi garansi BJ Laptop maupun hak konsumen berdasarkan hukum yang berlaku.";

export type SaleTestCategoryKey = (typeof SALE_TEST_CATEGORIES)[number]["key"];
export type SaleTestBlockerKey = (typeof SALE_TEST_BLOCKERS)[number]["key"];
export type SaleTestStatus = (typeof SALE_TEST_STATUSES)[number];
