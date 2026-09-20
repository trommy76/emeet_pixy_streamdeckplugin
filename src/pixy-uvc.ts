/**
 * Pan/tilt/zoom control for the EMEET PIXY, via its *standard* USB Video
 * Class (UVC) camera controls -- a different control plane from the
 * vendor-specific HID commands in pixy-hid.ts.
 *
 * There's no public (or reverse-engineered) macOS/Windows API for absolute
 * UVC pan-tilt-zoom that's simple to call from Node, and no evidence the
 * PIXY stores named presets on-device -- EMEET Studio's own presets are
 * almost certainly just saved pan/tilt/zoom numbers, recalled by re-sending
 * an absolute move, exactly like this file does. Rather than reimplement
 * low-level USB control transfers directly (real, but easy to get subtly
 * wrong without hardware to test against), this shells out to a locally
 * built helper binary named "uvc-util" that already does this correctly:
 * on macOS, that's a locally-built copy of the real uvc-util (MIT licensed,
 * see third_party/uvc-util), which talks to IOKit; on Windows, it's this
 * project's own uvc-util-win (see native/uvc-util-win), which talks to the
 * same standard UVC controls via DirectShow's IAMCameraControl/
 * IAMVideoProcAmp instead. Both speak the exact same command-line interface
 * (-V/-o/-s/-S/-c), so everything below this point is 100% platform-agnostic.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** Default USB vendor:product ID for the EMEET PIXY (hex, as uvc-util expects). */
const DEFAULT_TARGET = "0x328f:0x00c0";

export class PixyUvcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PixyUvcError";
  }
}

export type Position = {
  pan: number;
  tilt: number;
  zoom: number;
};

function uvcUtilPath(): string {
  // plugin.js lives at <sdPlugin>/bin/plugin.js; uvc-util (or uvc-util.exe on
  // Windows) is built to the same bin/ folder by `npm run build:native`
  // (macOS: scripts/build-uvc-util.sh) or `npm run build:native:win`
  // (Windows: scripts/build-uvc-util-win.ps1). __dirname is valid here
  // because the build output is bundled as CommonJS (see package.json's
  // "build" script) -- not because the source is written as CommonJS.
  const binaryName = process.platform === "win32" ? "uvc-util.exe" : "uvc-util";
  return path.join(__dirname, binaryName);
}

function ensureBinaryExists(binaryPath: string): void {
  if (!existsSync(binaryPath)) {
    const buildCommand = process.platform === "win32" ? "npm run build:native:win" : "npm run build:native";
    const requirement = process.platform === "win32" ? "the .NET 8 SDK" : "Xcode Command Line Tools";
    throw new PixyUvcError(
      `uvc-util isn't built yet (expected at "${binaryPath}"). From the project root, run "${buildCommand}" ` +
        `(requires ${requirement}), then reinstall/restart the plugin. See the README's PTZ Presets section.`,
    );
  }
}

function run(args: string[]): string {
  const binaryPath = uvcUtilPath();
  ensureBinaryExists(binaryPath);

  try {
    return execFileSync(binaryPath, args, { encoding: "utf8", timeout: 5000 }).trim();
  } catch (err: unknown) {
    const stderr = (err as { stderr?: Buffer | string })?.stderr;
    const detail = stderr ? stderr.toString().trim() : err instanceof Error ? err.message : String(err);
    throw new PixyUvcError(`uvc-util failed: ${detail || "unknown error"}`);
  }
}

function targetArgs(target: string | undefined): string[] {
  return ["-V", target?.trim() || DEFAULT_TARGET];
}

function parseSingleValue(output: string, controlName: string): number {
  const value = Number.parseInt(output, 10);
  if (Number.isNaN(value)) {
    throw new PixyUvcError(`Couldn't parse uvc-util's "${controlName}" output: "${output}"`);
  }
  return value;
}

function parseField(output: string, field: string, controlName: string): number {
  const match = output.match(new RegExp(`${field}\\s*=\\s*(-?\\d+)`));
  if (!match) {
    throw new PixyUvcError(`Couldn't parse uvc-util's "${controlName}" output: "${output}"`);
  }
  return Number.parseInt(match[1], 10);
}

/** Reads the camera's current pan/tilt/zoom position. */
export function getPosition(target?: string): Position {
  const panTilt = run([...targetArgs(target), "-o", "pan-tilt-abs"]);
  const zoom = run([...targetArgs(target), "-o", "zoom-abs"]);

  return {
    pan: parseField(panTilt, "pan", "pan-tilt-abs"),
    tilt: parseField(panTilt, "tilt", "pan-tilt-abs"),
    zoom: parseSingleValue(zoom, "zoom-abs"),
  };
}

/** Moves the camera to an absolute pan/tilt/zoom position. */
export function setPosition(position: Position, target?: string): void {
  if (![position.pan, position.tilt, position.zoom].every(Number.isInteger)) {
    throw new PixyUvcError("Preset position must have integer pan, tilt, and zoom values.");
  }
  run([...targetArgs(target), "-s", `pan-tilt-abs={pan=${position.pan},tilt=${position.tilt}}`]);
  run([...targetArgs(target), "-s", `zoom-abs=${position.zoom}`]);
}

// --- Generic UVC control access ---------------------------------------------
//
// uvc-util implements every standard UVC 1.1/1.2 Terminal and Processing Unit
// control (brightness, contrast, saturation, white balance, gain, and so on),
// not just pan/tilt/zoom. These two functions expose that generically, so a
// single flexible action (ImageControlAction) can drive any of them by name,
// without this file needing a typed wrapper per control. `-c` (list-controls)
// against a real device shows exactly which of these it actually implements.

/** Reads the raw (unparsed) string uvc-util reports for any control by name. */
export function getRawValue(controlName: string, target?: string): string {
  return run([...targetArgs(target), "-o", controlName]);
}

/**
 * Sets any control by name. `value` is passed through to uvc-util's `-s`
 * exactly as given -- a bare integer, a fraction in [0,1] (relative to the
 * control's real range), or the literal strings "default"/"minimum"/"maximum".
 * For multi-component controls, `value` must already be brace-wrapped, e.g.
 * "{pan=0.5,tilt=0.5}".
 */
export function setRawValue(controlName: string, value: string, target?: string): void {
  run([...targetArgs(target), "-s", `${controlName}=${value}`]);
}

const PAN_TILT_STEP_HINT =
  "If this feels too fast, too slow, or doesn't move at all, run " +
  '"uvc-util -V 0x328f:0x00c0 -S pan-tilt-abs" (see README) to see the real range and adjust the step size setting.';
const ZOOM_STEP_HINT =
  "If this feels too fast, too slow, or doesn't move at all, run " +
  '"uvc-util -V 0x328f:0x00c0 -S zoom-abs" (see README) to see the real range and adjust the step size setting.';

/** Nudges pan or tilt by `step` raw units (sign of `step` gives direction). */
export function nudgePanOrTilt(axis: "pan" | "tilt", step: number, target?: string): void {
  const current = getPosition(target);
  const next = { ...current, [axis]: current[axis] + step };
  try {
    setPosition(next, target);
  } catch (err) {
    throw new PixyUvcError(`${err instanceof Error ? err.message : String(err)} ${PAN_TILT_STEP_HINT}`);
  }
}

/** Nudges zoom by `step` raw units (sign of `step` gives direction). */
export function nudgeZoom(step: number, target?: string): void {
  const current = parseSingleValue(getRawValue("zoom-abs", target), "zoom-abs");
  try {
    setRawValue("zoom-abs", String(current + step), target);
  } catch (err) {
    throw new PixyUvcError(`${err instanceof Error ? err.message : String(err)} ${ZOOM_STEP_HINT}`);
  }
}

/** Returns pan/tilt to their default position and zoom to fully wide. */
export function centerPtz(target?: string): void {
  setRawValue("pan-tilt-abs", "default", target);
  setRawValue("zoom-abs", "minimum", target);
}
