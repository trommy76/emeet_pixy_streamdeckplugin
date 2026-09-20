#!/usr/bin/env node
/**
 * Diagnostic: lists every USB HID interface whose vendor ID matches the
 * EMEET PIXY (0x328f), so you can see exactly what the plugin sees.
 *
 * Run this from the project root, after `npm install`:
 *
 *   node scripts/list-hid-devices.mjs
 *
 * If the plugin's auto-detection picks the wrong interface (rare -- only
 * happens if the camera exposes more than one HID interface under this
 * vendor ID), copy the "path" of the correct one from this output and paste
 * it into the action's Property Inspector under Advanced > HID Device Path.
 */
import { devices } from "node-hid";

const VENDOR_ID = 0x328f;

const all = devices();
const matches = all.filter((d) => d.vendorId === VENDOR_ID);

console.log(`Found ${all.length} HID device(s) total, ${matches.length} matching EMEET PIXY vendor ID 0x${VENDOR_ID.toString(16)}.\n`);

if (matches.length === 0) {
  console.log("No EMEET PIXY HID interface found. Make sure the camera is plugged in.");
  console.log("If it's plugged in and this still says nothing, macOS may be blocking HID access --");
  console.log("see the README's 'macOS permissions' section.");
  process.exit(1);
}

for (const d of matches) {
  console.log("-----------------------------------------");
  console.log(`  path:        ${d.path}`);
  console.log(`  vendorId:    0x${d.vendorId.toString(16)}`);
  console.log(`  productId:   0x${d.productId.toString(16)}`);
  console.log(`  interface:   ${d.interface}`);
  console.log(`  usagePage:   ${d.usagePage ?? "(unknown)"}`);
  console.log(`  usage:       ${d.usage ?? "(unknown)"}`);
  console.log(`  product:     ${d.product ?? "(unknown)"}`);
  console.log(`  manufacturer:${d.manufacturer ?? "(unknown)"}`);
}
console.log("-----------------------------------------");

if (matches.length === 1) {
  console.log("\nOnly one match -- the plugin's auto-detection should find this automatically. No action needed.");
} else {
  console.log(
    "\nMultiple matches found. The plugin auto-selects the lowest 'interface' number above. " +
      "If a button doesn't seem to do anything, try pasting a different 'path' value into the " +
      "action's Advanced > HID Device Path setting.",
  );
}
