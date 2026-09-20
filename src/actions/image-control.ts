import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { getRawValue, setRawValue } from "../pixy-uvc.js";

type Settings = {
  /** A standard UVC Processing Unit control name, e.g. "brightness". */
  control?: string;
  /** "default" / "minimum" / "maximum" / a 0-1 fraction / a raw integer. */
  value?: string;
  /** Overrides `value` when set -- lets a custom fraction or raw number be typed in. */
  customValue?: string;
  uvcTarget?: string;
};

/**
 * One flexible action for any standard UVC image control: brightness,
 * contrast, saturation, sharpness, gamma, gain, backlight compensation,
 * white balance temperature (and its auto toggle), and more. Not every
 * camera implements every control -- run "uvc-util -V 0x328f:0x00c0 -c"
 * (see README) to see exactly which ones the Pixy reports supporting.
 */
@action({ UUID: "com.emeetpixy.pixycontrol.image-control" })
export class ImageControlAction extends SingletonAction<Settings> {
  async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { control, value = "default", customValue, uvcTarget } = ev.payload.settings;
    const resolvedValue = customValue?.trim() || value;

    if (!control?.trim()) {
      streamDeck.logger.error("[image-control] No control name set -- open this button's settings and pick one.");
      await ev.action.showAlert();
      return;
    }

    try {
      setRawValue(control.trim(), resolvedValue, uvcTarget);
      if (ev.action.isKey()) {
        await ev.action.showOk();
      }
      // Best-effort confirmation in the log; a failed read-back shouldn't turn a successful set into a shown error.
      try {
        const current = getRawValue(control.trim(), uvcTarget);
        streamDeck.logger.info(`[image-control] Set "${control}" to ${resolvedValue} -- camera now reports ${current}`);
      } catch {
        // Ignore -- not every control supports GET.
      }
    } catch (err) {
      streamDeck.logger.error(`[image-control] Failed to set "${control}" to "${resolvedValue}": ${err instanceof Error ? err.message : err}`);
      await ev.action.showAlert();
    }
  }
}
