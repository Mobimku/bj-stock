import { randomUUID } from "node:crypto";
import { CUSTOMER_ID } from "./reservation-harness.mjs";

export const FUTURE_EXPIRY = "2099-08-26T17:00:00+07:00";

export function completeUnitTest() {
  return {
    test_results: Object.fromEntries([
      "identity_spec_serial", "physical_casing_hinges", "display_dead_pixels",
      "keyboard_touchpad", "wifi_bluetooth", "av_devices", "usb_ports",
      "display_output", "battery_charging_charger", "storage_health",
      "boot_os_locks", "included_accessories",
    ].map((key) => [key, { status: "Lulus" }])),
    blocking_checks: {
      identity_mismatch: false, serial_mismatch: false, spec_mismatch: false,
      swollen_battery: false, bios_lock: false, mdm_lock: false, unsafe_charger: false,
    },
    location: "Toko utama",
    acknowledged: true,
  };
}

export async function createReservation(db, options = {}) {
  return db.query(
    "select * from public.create_reservation($1,$2,$3,$4,$5,$6,$7)",
    [
      options.idempotencyKey ?? randomUUID(),
      options.unitId ?? "UNIT-RSV-01",
      CUSTOMER_ID,
      options.dpAmount ?? 500000,
      options.agreedPrice ?? 3500000,
      options.isRefundable ?? true,
      options.expiresAt ?? FUTURE_EXPIRY,
    ],
  );
}

export async function completeReservation(db, reservationId, options = {}) {
  return db.query(
    "select * from public.complete_reservation($1,$2::jsonb,$3,$4,$5,$6)",
    [reservationId, JSON.stringify(completeUnitTest()), options.paymentMethod ?? "Tunai",
      options.channel ?? "Offline", options.transactionDate ?? "2026-07-26", options.warrantyDays ?? 45],
  );
}
