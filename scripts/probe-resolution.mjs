#!/usr/bin/env node
/**
 * Diagnostic: probes the EMEET PIXY's vendor HID interface for a
 * "resolution" setting we don't have a byte-level command for yet.
 *
 * Every *known* feature this plugin controls (tracking, privacy, gesture,
 * audio, auto-privacy) was reverse-engineered by the open-source community
 * and follows the same template:
 *
 *   SET query: [0x09, GROUP, SUBID, 0x00, 0x00, LEN, 0x00, LEN, VALUE, ...]
 *   GET query: [0x09, GROUP, SUBID, 0x01]  ->  camera answers with the
 *              current value at response[8] (or response[9] for gesture)
 *
 * Known GROUP bytes: 0x01 tracking, 0x02 auto-privacy, 0x04 gesture,
 * 0x05 audio. Nobody has published what EMEET Studio's resolution picker
 * uses, so this script sends the same *GET*-style query (read-only, safe --
 * it only asks the camera to report a value, the same way Toggle Privacy
 * already does) across a range of GROUP bytes nobody's identified yet, and
 * prints whatever comes back.
 *
 * HOW TO USE THIS:
 *   1. Open EMEET Studio, set the resolution to one value (e.g. 4K).
 *   2. From the project root, run:  node scripts/probe-resolution.mjs
 *      and save/copy the output somewhere.
 *   3. In EMEET Studio, switch the resolution to a different value
 *      (e.g. 1080p). It doesn't matter whether EMEET Studio stays open.
 *   4. Run the script again, and compare the two outputs (or just send both
 *      to me). Whichever GROUP's response byte(s) changed between the two
 *      runs is almost certainly the resolution setting -- that tells us the
 *      GROUP/offset to build a real "Set Resolution" action around.
 *
 * This only ever sends GET (read) queries -- the same kind of harmless
 * "what's your current state?" request Toggle Privacy already relies on. It
 * does not send anything that could change a setting.
 */
import { devices, HID } from "node-hid";

const VENDOR_ID = 0x328f;
const REPORT_LENGTH = 32;
const QUERY_TIMEOUT_MS = 400;

// Every GROUP byte from 0x00-0x0f except the four already-known ones.
const KNOWN_GROUPS = new Set([0x01, 0x02, 0x04, 0x05]);
const CANDIDATE_GROUPS = Array.from({ length: 16 }, (_, i) => i).filter((g) => !KNOWN_GROUPS.has(g));
// A couple of known commands also use a non-0x01 SUBID (gesture uses 0x02);
// try both common SUBIDs for each candidate group to widen the net a bit.
const CANDIDATE_SUBIDS = [0x01, 0x02, 0x00];

function resolveDevicePath() {
  const matches = devices().filter((d) => d.vendorId === VENDOR_ID);
  if (matches.length === 0) {
    console.error("No EMEET PIXY was found on USB. Make sure the camera is plugged in.");
    process.exit(1);
  }
  matches.sort((a, b) => (a.interface ?? 0) - (b.interface ?? 0));
  return matches[0].path;
}

function pad(bytes) {
  const report = new Array(REPORT_LENGTH).fill(0);
  for (let i = 0; i < bytes.length; i++) report[i] = bytes[i];
  return report;
}

function toHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

function query(path, group, subId) {
  let hid;
  try {
    hid = new HID(path);
  } catch (err) {
    return { error: `couldn't open device: ${err.message}` };
  }
  try {
    hid.write(pad([0x09, group, subId, 0x01]));
    const response = hid.readTimeout(QUERY_TIMEOUT_MS);
    if (!response || response.length === 0) {
      return { timeout: true };
    }
    return { response };
  } catch (err) {
    return { error: err.message };
  } finally {
    hid.close();
  }
}

const path = resolveDevicePath();
console.log(`Probing EMEET PIXY at ${path}\n`);
console.log("group  subid  result");
console.log("-----  -----  ------");

for (const group of CANDIDATE_GROUPS) {
  for (const subId of CANDIDATE_SUBIDS) {
    const result = query(path, group, subId);
    const label = `0x${group.toString(16).padStart(2, "0")}   0x${subId.toString(16).padStart(2, "0")}  `;
    if (result.timeout) {
      console.log(`${label} (no response)`);
    } else if (result.error) {
      console.log(`${label} error: ${result.error}`);
    } else {
      console.log(`${label} ${toHex(result.response)}`);
    }
  }
}

console.log(
  "\nRun this once per resolution setting (e.g. once at 4K, once at 1080p) and compare the two\n" +
    "outputs -- whichever line's bytes changed is the resolution setting. Send both outputs back.",
);
