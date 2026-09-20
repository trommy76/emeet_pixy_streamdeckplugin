import streamDeck, { action, KeyDownEvent, KeyUpEvent, SingletonAction, WillDisappearEvent } from "@elgato/streamdeck";
import { getPosition, setPosition, Position } from "../pixy-uvc.js";

type Settings = {
  /**
   * "hold" (recommended): one button does both -- a quick tap recalls the
   * preset, holding it down for longer saves the camera's current position
   * into it. "recall" / "save" fix a button to just one of those, for a
   * classic two-button (one Save, one Recall) setup instead.
   */
  mode?: "hold" | "recall" | "save";
  /** Preset slot number, as a string (Property Inspector <select> values are strings). */
  slot?: string;
  /** Advanced: overrides the "-V vendor:product" uvc-util target selector. */
  uvcTarget?: string;
};

type GlobalSettings = {
  presets?: Record<string, Position>;
};

/** How long, in "hold" mode, a press has to last before it counts as a save
 * instead of a recall. */
const LONG_PRESS_MS = 500;

/** Press-start timestamps, keyed by action instance id, for "hold" mode --
 * module-level since a SingletonAction is shared across every button using
 * this action, and each button (each key) needs its own timer. */
const pressStartedAt = new Map<string, number>();

/**
 * There's no known way to recall a *named* preset stored on the camera
 * itself -- EMEET Studio's presets are (as far as anyone's reverse-engineered)
 * just saved pan/tilt/zoom numbers. So this action keeps its own presets,
 * stored in the plugin's global settings (shared across every instance of
 * this action, and persisted across Stream Deck restarts).
 *
 * By default one button handles both directions: tap it to recall the
 * preset, hold it down for half a second or more to save the camera's
 * current position into it instead. Switch a button's "Action" setting to a
 * fixed "Save" or "Recall" if you'd rather use two separate buttons.
 */
@action({ UUID: "com.emeetpixy.pixycontrol.ptz-preset" })
export class PtzPresetAction extends SingletonAction<Settings> {
  async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { mode = "hold" } = ev.payload.settings;
    if (mode === "hold") {
      // Can't know yet whether this will be a tap or a hold -- that's only
      // decided on release, in onKeyUp.
      pressStartedAt.set(ev.action.id, Date.now());
      return;
    }
    await this.run(ev, mode);
  }

  async onKeyUp(ev: KeyUpEvent<Settings>): Promise<void> {
    const { mode = "hold" } = ev.payload.settings;
    if (mode !== "hold") {
      return;
    }
    const startedAt = pressStartedAt.get(ev.action.id);
    pressStartedAt.delete(ev.action.id);
    const held = startedAt !== undefined && Date.now() - startedAt >= LONG_PRESS_MS;
    await this.run(ev, held ? "save" : "recall");
  }

  async onWillDisappear(ev: WillDisappearEvent<Settings>): Promise<void> {
    pressStartedAt.delete(ev.action.id);
  }

  private async run(ev: KeyDownEvent<Settings> | KeyUpEvent<Settings>, mode: "recall" | "save"): Promise<void> {
    const { slot = "1", uvcTarget } = ev.payload.settings;

    try {
      if (mode === "save") {
        const position = getPosition(uvcTarget);
        const globalSettings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
        const presets = { ...globalSettings.presets, [slot]: position };
        await streamDeck.settings.setGlobalSettings<GlobalSettings>({ ...globalSettings, presets });
        streamDeck.logger.info(`[ptz-preset] Saved slot ${slot}: pan=${position.pan} tilt=${position.tilt} zoom=${position.zoom}`);
      } else {
        const globalSettings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
        const saved = globalSettings.presets?.[slot];
        if (!saved) {
          throw new Error(
            `No preset saved in slot ${slot} yet. Hold this button down while the camera is where you want it ` +
              `(or add a separate "Save" button set to slot ${slot}), then a tap will have somewhere to go.`,
          );
        }
        setPosition(saved, uvcTarget);
      }

      if (ev.action.isKey()) {
        await ev.action.showOk();
      }
    } catch (err) {
      streamDeck.logger.error(`[ptz-preset] Failed (${mode}, slot ${slot}): ${err instanceof Error ? err.message : err}`);
      await ev.action.showAlert();
    }
  }
}
