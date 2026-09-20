import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { centerPtz } from "../pixy-uvc.js";

type Settings = {
  uvcTarget?: string;
};

/** Resets pan/tilt to their default position and zooms all the way out. */
@action({ UUID: "com.emeetpixy.pixycontrol.ptz-center" })
export class PtzCenterAction extends SingletonAction<Settings> {
  async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { uvcTarget } = ev.payload.settings;

    try {
      centerPtz(uvcTarget);
      if (ev.action.isKey()) {
        await ev.action.showOk();
      }
    } catch (err) {
      streamDeck.logger.error(`[ptz-center] Failed: ${err instanceof Error ? err.message : err}`);
      await ev.action.showAlert();
    }
  }
}
