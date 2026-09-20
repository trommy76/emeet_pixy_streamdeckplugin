import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { setAudioMode, AudioModeName } from "../pixy-hid.js";

type Settings = {
  mode?: AudioModeName;
  hidPath?: string;
};

/** Sets the EMEET PIXY's microphone processing mode: noise-cancelling, live, or original. */
@action({ UUID: "com.emeetpixy.pixycontrol.audio" })
export class AudioModeAction extends SingletonAction<Settings> {
  async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { mode = "nc", hidPath } = ev.payload.settings;

    try {
      await setAudioMode(mode, hidPath);
      if (ev.action.isKey()) {
        await ev.action.showOk();
      }
    } catch (err) {
      streamDeck.logger.error(`[audio] Failed to set mode "${mode}": ${err instanceof Error ? err.message : err}`);
      await ev.action.showAlert();
    }
  }
}
