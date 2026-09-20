import streamDeck from "@elgato/streamdeck";
import { queryTracking, TrackingModeName } from "./pixy-hid.js";

const TRACKING_UUID = "com.emeetpixy.pixycontrol.tracking";
const PTZ_NUDGE_UUID = "com.emeetpixy.pixycontrol.ptz-nudge";

// Tracking Mode key states (manifest.json): 0 = inactive (grey), 1 = active (green).
const TRACKING_STATE_INACTIVE = 0;
const TRACKING_STATE_ACTIVE = 1;

// PTZ Nudge ("Move") key states: 0 = enabled (normal color), 1 = disabled (greyed out).
const NUDGE_STATE_ENABLED = 0;
const NUDGE_STATE_DISABLED = 1;

export const TRACKING_MODE_LABEL: Record<TrackingModeName, string> = {
  track: "AI Track",
  idle: "Idle",
  privacy: "Privacy",
};

type TrackingSettings = { mode?: TrackingModeName };

/**
 * Re-reads the camera's real tracking mode over HID and pushes the result to
 * every currently visible key that cares about it:
 *  - Tracking Mode keys light up green when *their* configured mode matches
 *    the camera's actual mode, and go grey otherwise (their title is also
 *    set to match, e.g. "AI Track" / "Idle" / "Privacy", so one generic
 *    action UUID can drive differently-labeled buttons).
 *  - PTZ Nudge ("Move") keys grey themselves out while AI Track is actively
 *    engaged, since manual nudges fight the auto-tracking motor.
 *
 * This is called after anything that might change the camera's tracking
 * mode (Tracking Mode's own presses, Toggle Privacy's presses) and when any
 * of these keys appears, so every key on the deck converges on the camera's
 * real state rather than a locally-guessed one. It quietly no-ops if the
 * camera can't be reached right now, rather than raising an alert -- this is
 * a passive UI refresh, not a user-initiated action.
 */
export async function refreshTrackingUI(hidPath?: string): Promise<void> {
  let current: TrackingModeName;
  try {
    current = await queryTracking(hidPath);
  } catch {
    return;
  }

  const updates: Promise<void>[] = [];

  for (const trackingAction of streamDeck.actions.filter((a) => a.manifestId === TRACKING_UUID)) {
    if (!trackingAction.isKey()) continue;
    updates.push(
      (async () => {
        const settings = await trackingAction.getSettings<TrackingSettings>();
        const mode = settings.mode ?? "track";
        await trackingAction.setTitle(TRACKING_MODE_LABEL[mode]);
        await trackingAction.setState(current === mode ? TRACKING_STATE_ACTIVE : TRACKING_STATE_INACTIVE);
      })(),
    );
  }

  for (const nudgeAction of streamDeck.actions.filter((a) => a.manifestId === PTZ_NUDGE_UUID)) {
    if (!nudgeAction.isKey()) continue;
    updates.push(nudgeAction.setState(current === "track" ? NUDGE_STATE_DISABLED : NUDGE_STATE_ENABLED));
  }

  await Promise.allSettled(updates);
}
