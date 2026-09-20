import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { queryTracking, setTracking, TrackingModeName } from "../pixy-hid.js";
import { refreshTrackingUI } from "../tracking-sync.js";

type Settings = {
  /** Mode to restore when turning privacy *off* (it's currently on). */
  restoreMode?: Exclude<TrackingModeName, "privacy">;
  hidPath?: string;
};

// State 0 = "Visible" icon (imgs/states/toggle-privacy-visible), state 1 =
// "Hidden" icon (imgs/states/toggle-privacy-hidden) -- see manifest.json.
const STATE_VISIBLE = 0;
const STATE_HIDDEN = 1;

/**
 * A real toggle: it asks the camera for its actual current tracking state
 * over HID (rather than guessing or remembering a locally-cached one), then
 * flips between privacy and whichever mode you'd like restored. The key
 * icon itself also reflects the camera's real, live state -- an open-eye
 * icon when the camera can see you, a slashed eye when it's in privacy mode
 * -- refreshed whenever the key appears and right after every successful
 * toggle, so it can't drift out of sync with the actual device.
 */
@action({ UUID: "com.emeetpixy.pixycontrol.toggle-privacy" })
export class TogglePrivacyAction extends SingletonAction<Settings> {
  async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    const { hidPath } = ev.payload.settings;
    try {
      const current = await queryTracking(hidPath);
      if (ev.action.isKey()) {
        await ev.action.setState(current === "privacy" ? STATE_HIDDEN : STATE_VISIBLE);
      }
    } catch {
      // Camera not plugged in yet, or unreadable -- leave whatever state the
      // key already shows rather than throwing an alert on a passive appear.
    }
  }

  async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { restoreMode = "track", hidPath } = ev.payload.settings;

    try {
      const current = await queryTracking(hidPath);
      const next = current === "privacy" ? restoreMode : "privacy";
      await setTracking(next, hidPath);
      if (ev.action.isKey()) {
        await ev.action.setState(next === "privacy" ? STATE_HIDDEN : STATE_VISIBLE);
        await ev.action.showOk();
      }
      // Privacy shares the same underlying tracking mode as AI Track / Idle,
      // so this toggle can also flip their active/inactive coloring and the
      // Move keys' greyed-out state -- keep every key in sync.
      await refreshTrackingUI(hidPath);
    } catch (err) {
      streamDeck.logger.error(`[toggle-privacy] Failed: ${err instanceof Error ? err.message : err}`);
      await ev.action.showAlert();
    }
  }
}
