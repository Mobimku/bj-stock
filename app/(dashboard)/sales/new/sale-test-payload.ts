import type { SaleTestBlockerKey, SaleTestCategoryKey } from "../sale-test-contract";

function result(values: FormData, key: SaleTestCategoryKey) {
  const note = values.get(`test.${key}.note`);
  return {
    status: values.get(`test.${key}.status`),
    note: typeof note === "string" && note.trim() ? note : null,
  };
}

function blocker(values: FormData, key: SaleTestBlockerKey) {
  const value = values.get(`blocker.${key}`);
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

export function buildSaleTestPayload(values: FormData) {
  return {
    testResults: {
      identity_spec_serial: result(values, "identity_spec_serial"),
      physical_casing_hinges: result(values, "physical_casing_hinges"),
      display_dead_pixels: result(values, "display_dead_pixels"),
      keyboard_touchpad: result(values, "keyboard_touchpad"),
      wifi_bluetooth: result(values, "wifi_bluetooth"),
      av_devices: result(values, "av_devices"),
      usb_ports: result(values, "usb_ports"),
      display_output: result(values, "display_output"),
      battery_charging_charger: result(values, "battery_charging_charger"),
      storage_health: result(values, "storage_health"),
      boot_os_locks: result(values, "boot_os_locks"),
      included_accessories: result(values, "included_accessories"),
    },
    blockingChecks: {
      identity_mismatch: blocker(values, "identity_mismatch"),
      serial_mismatch: blocker(values, "serial_mismatch"),
      spec_mismatch: blocker(values, "spec_mismatch"),
      swollen_battery: blocker(values, "swollen_battery"),
      bios_lock: blocker(values, "bios_lock"),
      mdm_lock: blocker(values, "mdm_lock"),
      unsafe_charger: blocker(values, "unsafe_charger"),
    },
    location: values.get("testLocation"),
    acknowledged: values.get("buyerAcknowledged") === "on",
  };
}
