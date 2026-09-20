/**
 * Low-level control of the EMEET PIXY dual-camera PTZ webcam over its raw USB
 * HID interface.
 *
 * The camera's pan/tilt/zoom motors are exposed as standard UVC/V4L2 camera
 * controls (out of scope here). Tracking mode, privacy mode, gesture
 * control, audio mode, and the auto-privacy timeout are instead controlled
 * through vendor-specific HID reports. The byte sequences below were not
 * published by EMEET; they come from community reverse-engineering of the
 * camera (see the "cam_ptz.sh" script in nick0413/Emeet_pixy_for_linux, and
 * YesserLab/pixyctl), which this plugin re-implements using node-hid so it
 * works from a Stream Deck plugin on macOS.
 *
 * Every report is a fixed 32-byte HID output report; the first byte is
 * always the HID report ID (0x09) followed by a small command header and
 * payload, zero-padded to 32 bytes.
 */
import { devices, HID } from "node-hid";

/** USB vendor ID shared by every known EMEET PIXY HID interface. */
const VENDOR_ID = 0x328f;

/** Fixed HID output report size used by the camera's control interface. */
const REPORT_LENGTH = 32;

/** Delay between the "set" and "commit" reports that some commands require. */
const COMMIT_DELAY_MS = 200;

export class PixyDeviceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PixyDeviceError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pad(bytes: readonly number[]): number[] {
  if (bytes.length > REPORT_LENGTH) {
    throw new PixyDeviceError(`Internal error: HID report of ${bytes.length} bytes exceeds the ${REPORT_LENGTH}-byte limit.`);
  }
  const report = new Array(REPORT_LENGTH).fill(0);
  for (let i = 0; i < bytes.length; i++) {
    report[i] = bytes[i];
  }
  return report;
}

/**
 * Finds the HID device path to use, honoring a manual override (set in an
 * action's Property Inspector under "Advanced") before falling back to
 * auto-detection by vendor ID.
 */
function resolveDevicePath(overridePath?: string): string {
  const trimmedOverride = overridePath?.trim();
  if (trimmedOverride) {
    return trimmedOverride;
  }

  const matches = devices().filter((d) => d.vendorId === VENDOR_ID);
  if (matches.length === 0) {
    throw new PixyDeviceError(
      "No EMEET PIXY was found on USB. Make sure the camera is plugged in and try again. " +
        "If it is plugged in, run the plugin's list-hid-devices diagnostic script (see the README) " +
        "and paste the correct device path into this action's Advanced › HID Device Path field.",
    );
  }

  // Every known EMEET PIXY control tool talks to a single vendor-specific
  // HID interface; when more than one shows up under this vendor ID, the
  // lowest interface number has matched in practice.
  matches.sort((a, b) => (a.interface ?? 0) - (b.interface ?? 0));
  const path = matches[0].path;
  if (!path) {
    throw new PixyDeviceError("Found an EMEET PIXY HID interface, but the operating system did not report a usable device path.");
  }
  return path;
}

function sendReport(path: string, bytes: readonly number[]): void {
  let hid: HID;
  try {
    hid = new HID(path);
  } catch (err) {
    throw new PixyDeviceError(
      `Could not open the EMEET PIXY HID device at "${path}": ${describeError(err)}. ` +
        "On macOS this is often a permissions issue — see the README's troubleshooting section.",
    );
  }

  try {
    hid.write(pad(bytes));
  } catch (err) {
    throw new PixyDeviceError(`Failed to send a command to the EMEET PIXY: ${describeError(err)}`);
  } finally {
    hid.close();
  }
}

async function sendSequence(overridePath: string | undefined, reports: readonly (readonly number[])[]): Promise<void> {
  const path = resolveDevicePath(overridePath);
  for (let i = 0; i < reports.length; i++) {
    sendReport(path, reports[i]);
    if (i < reports.length - 1) {
      await delay(COMMIT_DELAY_MS);
    }
  }
}

/** How long to wait for the camera to answer a HID query before giving up. */
const QUERY_TIMEOUT_MS = 500;

/**
 * Sends a query report and returns the camera's reply (up to 64 bytes), or
 * throws if it doesn't answer in time. Mirrors pixyctl's Camera::hidQuery.
 */
function queryReport(path: string, bytes: readonly number[]): number[] {
  let hid: HID;
  try {
    hid = new HID(path);
  } catch (err) {
    throw new PixyDeviceError(
      `Could not open the EMEET PIXY HID device at "${path}": ${describeError(err)}. ` +
        "On macOS this is often a permissions issue — see the README's troubleshooting section.",
    );
  }

  try {
    hid.write(pad(bytes));
    const response = hid.readTimeout(QUERY_TIMEOUT_MS);
    if (!response || response.length < 9) {
      throw new PixyDeviceError("The EMEET PIXY did not answer a status query in time (or answered with a short reply).");
    }
    return response;
  } catch (err) {
    if (err instanceof PixyDeviceError) {
      throw err;
    }
    throw new PixyDeviceError(`Failed to query the EMEET PIXY: ${describeError(err)}`);
  } finally {
    hid.close();
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Tracking mode values, as sent to the camera's HID interface. */
export const TRACKING_MODES = { idle: 0x00, track: 0x01, privacy: 0x02 } as const;
export type TrackingModeName = keyof typeof TRACKING_MODES;

/** Sets tracking to idle, active tracking, or privacy (lens-covered) mode. */
export async function setTracking(mode: TrackingModeName, overridePath?: string): Promise<void> {
  const value = TRACKING_MODES[mode];
  await sendSequence(overridePath, [
    [0x09, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, value],
    [0x09, 0x01, 0x01, 0x01],
  ]);
}

/**
 * Reads back the camera's *actual* current tracking mode over HID (the same
 * query the vendor app uses internally), rather than assuming or caching it.
 * This is what makes a reliable "Toggle Privacy" button possible.
 */
export async function queryTracking(overridePath?: string): Promise<TrackingModeName> {
  const path = resolveDevicePath(overridePath);
  const response = queryReport(path, [0x09, 0x01, 0x01, 0x01]);
  switch (response[8]) {
    case 0x01:
      return "track";
    case 0x02:
      return "privacy";
    default:
      return "idle";
  }
}

/** Gesture control values, as sent to the camera's HID interface. */
export const GESTURE_MODES = { off: 0x00, on: 0x01 } as const;
export type GestureModeName = keyof typeof GESTURE_MODES;

/** Turns gesture control on or off. */
export async function setGesture(mode: GestureModeName, overridePath?: string): Promise<void> {
  const value = GESTURE_MODES[mode];
  await sendSequence(overridePath, [
    [0x09, 0x04, 0x02, 0x00, 0x00, 0x02, 0x00, 0x02, 0x02, value],
    [0x09, 0x04, 0x02, 0x01, 0x00, 0x01, 0x00, 0x01, 0x02],
  ]);
}

/** Audio mode values, as sent to the camera's HID interface. */
export const AUDIO_MODES = { nc: 0x01, live: 0x02, org: 0x03 } as const;
export type AudioModeName = keyof typeof AUDIO_MODES;

/** Sets the microphone processing mode: noise cancelling, live, or original. */
export async function setAudioMode(mode: AudioModeName, overridePath?: string): Promise<void> {
  const value = AUDIO_MODES[mode];
  await sendSequence(overridePath, [[0x09, 0x05, 0x00, 0x03, 0x00, 0x01, 0x00, 0x01, value]]);
}

/** Sets the auto-privacy timeout, in seconds (0 disables it). Range: 0-255. */
export async function setAutoPrivacy(seconds: number, overridePath?: string): Promise<void> {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 255) {
    throw new PixyDeviceError("Auto-privacy timeout must be a whole number of seconds between 0 and 255.");
  }
  await sendSequence(overridePath, [
    [0x09, 0x02, 0x01, 0x00, 0x00, 0x04, 0x00, 0x04, seconds],
    [0x09, 0x02, 0x01, 0x01],
  ]);
}
