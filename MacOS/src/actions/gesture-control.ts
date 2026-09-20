import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { setGesture, GestureModeName } from "../pixy-hid.js";

type Settings = {
  mode?: GestureModeName;
  hidPath?: string;
};

/** Turns the EMEET PIXY's gesture control (hand-gesture camera commands) on or off. */
@action({ UUID: "com.emeetpixy.pixycontrol.gesture" })
export class GestureControlAction extends SingletonAction<Settings> {
  async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { mode = "on", hidPath } = ev.payload.settings;

    try {
      await setGesture(mode, hidPath);
      if (ev.action.isKey()) {
        await ev.action.showOk();
      }
    } catch (err) {
      streamDeck.logger.error(`[gesture] Failed to set mode "${mode}": ${err instanceof Error ? err.message : err}`);
      await ev.action.showAlert();
    }
  }
}
