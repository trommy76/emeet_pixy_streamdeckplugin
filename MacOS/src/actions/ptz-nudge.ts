import streamDeck, { action, DidReceiveSettingsEvent, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { nudgePanOrTilt, nudgeZoom } from "../pixy-uvc.js";
import { refreshTrackingUI } from "../tracking-sync.js";

type Settings = {
  control?: "pan" | "tilt" | "zoom";
  /** "increase" = right / down / in; "decrease" = left / up / out. */
  direction?: "increase" | "decrease";
  /** Raw uvc-util units. Defaults are rough starting points -- see README. */
  step?: string;
  uvcTarget?: string;
};

const DEFAULT_STEP: Record<NonNullable<Settings["control"]>, number> = {
  pan: 3600,
  tilt: 3600,
  zoom: 5,
};

// Pan increase/decrease -> right/left arrow, tilt increase/decrease ->
// up/down arrow, zoom increase/decrease -> zoom-in/zoom-out magnifier. Each
// has an "-disabled" (dim grey) counterpart generated alongside it -- see
// scripts/generate_icons.py's NUDGE_COMBOS.
const ICON_BY_COMBO: Record<string, string> = {
  "pan-increase": "ptz-nudge-pan-increase",
  "pan-decrease": "ptz-nudge-pan-decrease",
  "tilt-increase": "ptz-nudge-tilt-increase",
  "tilt-decrease": "ptz-nudge-tilt-decrease",
  "zoom-increase": "ptz-nudge-zoom-increase",
  "zoom-decrease": "ptz-nudge-zoom-decrease",
};

/**
 * A single flexible "move the camera a bit" action: pick pan, tilt, or zoom,
 * pick a direction, and a step size in raw uvc-util units. Add one of these
 * per direction you want a button for (e.g. one set to pan/increase for
 * "right", another to pan/decrease for "left"). The key's icon matches
 * whichever direction it's configured for (a right arrow for pan/increase,
 * an up arrow for tilt/increase, a zoom-in magnifier for zoom/increase, and
 * so on), and greys itself out whenever AI Track is actively engaged
 * (refreshed on appear and whenever a Tracking Mode or Toggle Privacy key
 * changes the camera's mode), since a manual nudge just fights the
 * auto-tracking motor while that's on -- the button still works if pressed,
 * this is a visual heads-up only.
 */
@action({ UUID: "com.emeetpixy.pixycontrol.ptz-nudge" })
export class PtzNudgeAction extends SingletonAction<Settings> {
  private async applyIcon(ev: WillAppearEvent<Settings> | DidReceiveSettingsEvent<Settings>): Promise<void> {
    if (!ev.action.isKey()) return;
    const { control = "pan", direction = "increase" } = ev.payload.settings;
    const base = ICON_BY_COMBO[`${control}-${direction}`] ?? "ptz-nudge";
    await ev.action.setImage(`imgs/states/${base}`, { state: 0 });
    await ev.action.setImage(`imgs/states/${base}-disabled`, { state: 1 });
  }

  async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    await this.applyIcon(ev);
    await refreshTrackingUI();
  }

  async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
    await this.applyIcon(ev);
  }

  async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { control = "pan", direction = "increase", step: stepSetting, uvcTarget } = ev.payload.settings;

    // Lenient on purpose: pull the first integer out of whatever was typed
    // (so a stray label like "pan: 100" still works), rather than failing
    // outright the way Number.parseInt would on a non-numeric prefix.
    const digits = stepSetting?.match(/-?\d+/)?.[0];
    const magnitude = digits !== undefined ? Number.parseInt(digits, 10) : DEFAULT_STEP[control];
    if (stepSetting?.trim() && digits === undefined) {
      await ev.action.showAlert();
      streamDeck.logger.error(`[ptz-nudge] Step size "${stepSetting}" has no number in it -- type just a number, e.g. 3600, with no label.`);
      return;
    }
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      await ev.action.showAlert();
      streamDeck.logger.error(`[ptz-nudge] Step size must be a positive number, got "${stepSetting}".`);
      return;
    }
    const signedStep = direction === "increase" ? magnitude : -magnitude;

    try {
      if (control === "zoom") {
        nudgeZoom(signedStep, uvcTarget);
      } else {
        nudgePanOrTilt(control, signedStep, uvcTarget);
      }
      if (ev.action.isKey()) {
        await ev.action.showOk();
      }
    } catch (err) {
      streamDeck.logger.error(`[ptz-nudge] Failed (${control} ${direction} by ${magnitude}): ${err instanceof Error ? err.message : err}`);
      await ev.action.showAlert();
    }
  }
}
