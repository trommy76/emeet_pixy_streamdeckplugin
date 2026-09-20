import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { setTracking, TrackingModeName } from "../pixy-hid.js";
import { refreshTrackingUI } from "../tracking-sync.js";

type Settings = {
  mode?: TrackingModeName;
  hidPath?: string;
};

/**
 * Sets the EMEET PIXY's tracking mode: idle (camera stays put), track
 * (AI auto-tracking follows you), or privacy (lens physically covered /
 * pointed away). The key also shows the camera's real current mode -- green
 * ("active") when this button's own mode is the one actually running, grey
 * ("inactive") otherwise -- and greys out every PTZ Nudge ("Move") key
 * whenever AI Track is engaged. This refreshes on appear and right after
 * every press, across every Tracking Mode and PTZ Nudge key on the deck, so
 * they can't drift out of sync with each other or with the camera.
 */
@action({ UUID: "com.emeetpixy.pixycontrol.tracking" })
export class TrackingModeAction extends SingletonAction<Settings> {
  async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    await refreshTrackingUI(ev.payload.settings.hidPath);
  }

  async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { mode = "track", hidPath } = ev.payload.settings;

    try {
      await setTracking(mode, hidPath);
      await refreshTrackingUI(hidPath);
      if (ev.action.isKey()) {
        await ev.action.showOk();
      }
    } catch (err) {
      streamDeck.logger.error(`[tracking] Failed to set mode "${mode}": ${err instanceof Error ? err.message : err}`);
      await ev.action.showAlert();
    }
  }
}
