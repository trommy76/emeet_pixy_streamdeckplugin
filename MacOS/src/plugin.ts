import streamDeck from "@elgato/streamdeck";
import { TrackingModeAction } from "./actions/tracking-mode.js";
import { GestureControlAction } from "./actions/gesture-control.js";
import { AudioModeAction } from "./actions/audio-mode.js";
import { AutoPrivacyAction } from "./actions/auto-privacy.js";
import { TogglePrivacyAction } from "./actions/toggle-privacy.js";
import { PtzPresetAction } from "./actions/ptz-preset.js";
import { PtzNudgeAction } from "./actions/ptz-nudge.js";
import { PtzCenterAction } from "./actions/ptz-center.js";
import { ImageControlAction } from "./actions/image-control.js";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new TrackingModeAction());
streamDeck.actions.registerAction(new GestureControlAction());
streamDeck.actions.registerAction(new AudioModeAction());
streamDeck.actions.registerAction(new AutoPrivacyAction());
streamDeck.actions.registerAction(new TogglePrivacyAction());
streamDeck.actions.registerAction(new PtzPresetAction());
streamDeck.actions.registerAction(new PtzNudgeAction());
streamDeck.actions.registerAction(new PtzCenterAction());
streamDeck.actions.registerAction(new ImageControlAction());

streamDeck.connect();
