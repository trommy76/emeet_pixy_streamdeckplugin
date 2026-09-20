import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { setAutoPrivacy } from "../pixy-hid.js";

type Settings = {
  /** Timeout in seconds, as a string (Property Inspector <select> values are strings). "0" disables it. */
  seconds?: string;
  hidPath?: string;
};

/** Sets how long the EMEET PIXY waits with nobody in frame before switching to privacy mode (0 = disabled). */
@action({ UUID: "com.emeetpixy.pixycontrol.auto-privacy" })
export class AutoPrivacyAction extends SingletonAction<Settings> {
  async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { seconds = "30", hidPath } = ev.payload.settings;
    const value = Number.parseInt(seconds, 10);

    try {
      await setAutoPrivacy(value, hidPath);
      if (ev.action.isKey()) {
        await ev.action.showOk();
      }
    } catch (err) {
      streamDeck.logger.error(`[auto-privacy] Failed to set timeout "${seconds}": ${err instanceof Error ? err.message : err}`);
      await ev.action.showAlert();
    }
  }
}
