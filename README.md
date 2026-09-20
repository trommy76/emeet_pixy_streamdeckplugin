# EMEET PIXY Control (Stream Deck plugin)

A Stream Deck plugin for the EMEET PIXY dual-camera PTZ webcam, since EMEET
doesn't ship one. It adds nine actions:

- **Tracking Mode** -- Track / Idle / Privacy, with each key showing green when *its* mode is the one actually running and grey otherwise
- **Toggle Privacy** -- flips privacy on/off based on the camera's real current state
- **Gesture Control** -- On / Off
- **Audio Mode** -- Noise cancelling / Live / Original
- **Auto-Privacy Timeout** -- Off / 10s / 30s / 60s
- **PTZ Preset** -- one button: tap to recall a saved pan/tilt/zoom position, hold it down (~half a second) to save the camera's current position into it instead (needs one extra build step -- see "UVC features" below)
- **PTZ Nudge** -- move pan/tilt/zoom by a step, one direction per button (same extra step); the icon matches the direction you configured (right/left arrow for pan, up/down arrow for tilt, a zoom-in/zoom-out magnifier for zoom) and greys itself out whenever AI Track is engaged, since a manual nudge fights the auto-tracking motor (the button still works if you press it -- this is a visual heads-up, not a lock)
- **PTZ Center** -- reset pan/tilt to default and zoom all the way out (same extra step)
- **Image Control** -- brightness, contrast, white balance, and other standard camera image controls (same extra step)

Each button is one action with settings, so for most of these you drag the
action onto the Stream Deck once per mode/direction/control you want (e.g.
one key set to "Track", another to "Idle", another to "Privacy"; one key set
to pan/increase for "right", another to pan/decrease for "left").

Tracking Mode, Toggle Privacy, and PTZ Nudge all stay in sync with each
other and with the camera's real state: picking a Tracking Mode key re-reads
the camera afterward and updates every visible Tracking Mode key (green for
the mode that's actually active, grey for the others) and every visible PTZ
Nudge key (greyed out while Track is active); toggling privacy does the
same, since privacy is just another tracking mode under the hood. This also
runs when a key first appears (profile switch, Stream Deck restart), so
opening a profile always shows the camera's actual state rather than a
stale guess.

## How it works (and its limits)

EMEET doesn't publish a control API for the PIXY, so this plugin talks to
two different control planes on the camera directly:

- **Tracking, Toggle Privacy, Gesture Control, Audio Mode, Auto-Privacy** go
  over the camera's raw, vendor-specific USB HID interface, using command
  sequences the open-source community reverse-engineered (see
  `src/pixy-hid.ts` for the byte-level detail, and credit below). Toggle
  Privacy actually *asks the camera* for its current state over HID before
  deciding which way to flip, rather than guessing.
- **PTZ Preset, PTZ Nudge, PTZ Center, and Image Control** move the camera or
  adjust its image by sending standard USB Video Class (UVC) commands -- a
  completely different, non-proprietary path from the HID side above. There's
  no evidence the camera stores presets by name on-device (EMEET Studio's own
  presets are almost certainly just saved numbers, recalled by moving there
  again), so PTZ Preset keeps its own preset slots instead. See "UVC
  features" below.

Because the HID side reverse-engineers an undocumented protocol, EMEET could
change it in a future firmware update and break those buttons. If one stops
working after a firmware update, that's the most likely reason.

## UVC features: PTZ Preset, PTZ Nudge, PTZ Center, Image Control (extra setup required)

These four actions talk to the camera's standard UVC controls, which neither
macOS nor Windows lets a plugin reach directly without going through a
fairly low-level platform API (IOKit on macOS, DirectShow on Windows).
Rather than reimplement that from scratch, they shell out to a small local
helper binary named `uvc-util` that already does this correctly, and that
also happens to implement every standard UVC image control (brightness,
contrast, white balance, and so on) -- not just pan/tilt/zoom. Both
platforms' helpers speak the exact same command-line interface, so the
plugin code itself (`src/pixy-uvc.ts` and every action that uses it) is
identical either way -- only the helper differs:

- **macOS:** a locally-built copy of the real
  [uvc-util](https://github.com/jtfrey/uvc-util) by Jeffrey Frey (MIT
  licensed, vendored unmodified in `third_party/uvc-util`), which talks to
  IOKit.
- **Windows:** this project's own `uvc-util-win` (source in
  `native/uvc-util-win`), which talks to the same standard UVC controls via
  DirectShow's `IAMCameraControl`/`IAMVideoProcAmp` interfaces instead.

You build it once, locally, on whichever OS you're running the plugin on:

```bash
npm run build:native        # macOS -- requires Xcode Command Line Tools
npm run build:native:win    # Windows -- requires the .NET 8 SDK
```

This compiles the right helper into
`com.emeetpixy.pixycontrol.sdPlugin/bin/uvc-util` (or `uvc-util.exe` on
Windows). Every other action in this plugin works fine without this step;
only these four need it, and they'll show a clear "not built yet" error
until you do.

**PTZ Preset:** by default, one button does both directions -- add it, leave
its "Action" setting on "Tap to Recall, Hold to Save", point the camera
where you want it, and press-and-hold that button for about half a second
to capture the position into slot 1. From then on, a quick tap moves the
camera back there. Prefer two separate buttons instead? Set one's "Action"
to "Save only" and another's to "Recall only", both on the same slot number.
Presets are stored in the plugin's global settings (shared across all your
buttons, and they survive Stream Deck restarts) -- not on the camera itself.

**PTZ Nudge:** pick pan, tilt, or zoom, a direction (increase/decrease), and
a step size in raw uvc-util units (not degrees -- there's no confirmed
conversion between this camera's raw UVC values and real-world degrees, so
the defaults are rough starting points). Add one button per direction you
want, e.g. pan/increase for "right" and pan/decrease for "left". Run:

```bash
com.emeetpixy.pixycontrol.sdPlugin/bin/uvc-util -V 0x328f:0x00c0 -S pan-tilt-abs
com.emeetpixy.pixycontrol.sdPlugin/bin/uvc-util -V 0x328f:0x00c0 -S zoom-abs
```

(on Windows, that's `uvc-util.exe` in the same folder, same arguments) to
see the camera's real minimum/maximum/step-size for each, and tune the step
setting to taste.

**PTZ Center:** no settings -- resets pan/tilt to default and zooms all the
way out.

**Image Control:** pick a control (brightness, contrast, saturation,
sharpness, gamma, gain, backlight compensation, white balance temperature
and its auto toggle, hue, auto hue, auto contrast) and a value (default /
minimum / maximum / a percentage, or a custom value in Advanced). Not every
camera implements every control -- run:

```bash
com.emeetpixy.pixycontrol.sdPlugin/bin/uvc-util -V 0x328f:0x00c0 -c
```

(`uvc-util.exe` on Windows) once the camera's plugged in to see exactly
which ones the Pixy reports supporting. A button for an unsupported control
will just show a failed alert with uvc-util's own error message in the
plugin's log -- harmless, just means that particular control isn't there.

## Requirements

- macOS 12+ or Windows 10+
- Stream Deck app 6.6+
- [Node.js](https://nodejs.org/) 20 or later (for building the plugin)
- On macOS, Xcode Command Line Tools are usually **not** needed -- `node-hid`
  ships prebuilt binaries for Mac (Intel and Apple Silicon), so
  `npm install` should just work.
- On Windows, `node-hid` similarly ships a prebuilt binary, so
  You need npm installed:  https://nodejs.org/en/download/
  You need .net SDK https://dotnet.microsoft.com/en-us/download
  `npm install` should just work there too.
  
  
## Setup

1. **Install dependencies and build:**

   ```bash
   npm install
   npm run build
   ```

   This compiles `src/` into `com.emeetpixy.pixycontrol.sdPlugin/bin/plugin.js`
   -- identical on macOS and Windows.

2. **Install node-hid where the plugin actually runs from.** Stream Deck
   runs the plugin directly out of the `.sdPlugin` folder, so it needs its
   own copy of `node-hid` (matching your machine's OS/CPU) inside that
   folder:

   ```bash
   cd com.emeetpixy.pixycontrol.sdPlugin
   npm install --omit=dev
   cd ..
   ```

3. **Install the plugin into Stream Deck.** Easiest way is the Stream Deck
   CLI:

   ```bash
   npm install -g @elgato/cli
   streamdeck link com.emeetpixy.pixycontrol.sdPlugin
   ```

   Then open the Stream Deck app -- "EMEET PIXY Control" should appear as a
   category in the actions list on the right. Drag the actions you want onto
   your Stream Deck and pick a mode for each one in its settings panel.

   (No CLI? You can instead copy the whole `com.emeetpixy.pixycontrol.sdPlugin`
   folder into `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
   on macOS, or `%APPDATA%\Elgato\StreamDeck\Plugins\` on Windows, and
   restart the Stream Deck app.)

4. **Plug in the PIXY and test a button.** A successful press shows a brief
   green checkmark on the key; a failure shows a yellow "!" and logs the
   reason to `com.emeetpixy.pixycontrol.sdPlugin/logs/`.

5. **(Optional, for PTZ Preset/Nudge/Center/Image Control) Build the UVC
   helper** -- see "UVC features" above (`npm run build:native` on macOS,
   `npm run build:native:win` on Windows). Every other action works without
   this step.

## Troubleshooting

**Button shows a yellow "!" (alert) icon.**
Check the plugin's log file under `com.emeetpixy.pixycontrol.sdPlugin/logs/` for
the specific error. The most likely causes:

- *"No EMEET PIXY was found on USB"* -- the camera isn't plugged in, or the
  OS hasn't granted HID access yet (see below).
- *"Could not open the EMEET PIXY HID device... permissions"* (macOS) --
  macOS is blocking raw HID access for the Stream Deck process. Open
  **System Settings > Privacy & Security > Input Monitoring**, and if Stream
  Deck isn't listed (or is unchecked), add/enable it, then restart the
  Stream Deck app. (Some macOS versions gate HID device access behind this
  setting even for non-keyboard devices.)
- On Windows, HID access generally doesn't need an extra permissions step,
  but antivirus/endpoint software occasionally blocks raw HID writes from
  unsigned executables -- if every HID-based action fails identically,
  check there first.

**A button seems to do nothing, with no error.**
The camera likely exposes more than one HID interface under the same USB
vendor ID, and auto-detection picked the wrong one. Run the diagnostic
script from the project root:

```bash
node scripts/list-hid-devices.mjs
```

This lists every HID interface matching the PIXY's vendor ID (`0x328f`)
with its `path`. If there's more than one, try each `path` in turn by
pasting it into that action's Property Inspector, under **Advanced > HID
Device Path**, then re-test.

**`npm install` inside `com.emeetpixy.pixycontrol.sdPlugin` tries to compile
node-hid from source instead of downloading a prebuilt binary.**
This means no prebuild matched your exact Node/OS/CPU combination. On
macOS, install Xcode Command Line Tools (`xcode-select --install`) and try
again -- that gives `node-gyp` what it needs to compile the native module
locally. On Windows, installing the "Desktop development with C++" workload
via Visual Studio's Build Tools serves the same purpose.

**A button shows a yellow "!" for PTZ Preset, PTZ Nudge, PTZ Center, or
Image Control, saying uvc-util isn't built.**
Run `npm run build:native` (macOS) or `npm run build:native:win` (Windows)
from the project root, then try the button again (no need to
reinstall/relink the plugin).

**One of those four fails with an error from uvc-util itself.**
Run `com.emeetpixy.pixycontrol.sdPlugin/bin/uvc-util --list-devices` (or
`uvc-util.exe --list-devices` on Windows) directly in a terminal -- if the
PIXY isn't listed, or is listed under a different vendor/product ID than
`0x328f:0x00c0`, paste the real ID (shown by `--list-devices`) into that
action's Advanced > UVC Target Override field. If instead it's a specific
control (e.g. Image Control set to "hue") that fails while others work,
that control likely just isn't implemented by this camera -- confirm with
`uvc-util -V 0x328f:0x00c0 -c`.

**On Windows, a UVC action fails even though the camera clearly supports
that control (e.g. via EMEET Studio).**
Some drivers only expose a control while nothing else has an open capture
session, or briefly lock it while one does -- close any other app currently
using the camera's video feed (EMEET Studio, Zoom, Teams, browser tabs,
etc.) and try again. If it still fails, run `uvc-util.exe -V 0x328f:0x00c0
-S <control>` directly to see the exact DirectShow error.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # one-off build
npm run watch        # rebuild on change (pair with `streamdeck dev` / restart)
```

`streamdeck validate com.emeetpixy.pixycontrol.sdPlugin` (from the Stream Deck
CLI) checks the manifest and icon assets are all in order.

## Resolution (no button for this yet)

Zoom stops doing anything once the camera's active resolution is at its
max (4K) -- there's likely no sensor headroom left to digitally crop into.
EMEET Studio's own resolution picker is a genuine device-level setting
(it persists into Zoom/Teams/Meet even after closing EMEET Studio), but the
exact command it sends hasn't been reverse-engineered by anyone publicly, so
this plugin can't drive it yet the way it drives tracking/privacy/gesture.

`scripts/probe-resolution.mjs` is a safe, read-only diagnostic that probes
the camera's vendor HID interface for a response that changes between two
resolution settings (run it once at 4K, once at 1080p, and compare). If that
turns up the right group/value, a "Set Resolution" action can be added the
same way Toggle Privacy was.

## Credit

The HID command sequences used for Tracking, Toggle Privacy, Gesture
Control, Audio Mode, and Auto-Privacy were not published by EMEET. They come
from community reverse-engineering, specifically the `cam_ptz.sh` /
`pixy_control.py` scripts in
[nick0413/Emeet_pixy_for_linux](https://github.com/nick0413/Emeet_pixy_for_linux)
and the annotated protocol notes in
[YesserLab/pixyctl](https://github.com/YesserLab/pixyctl)'s `Camera.cpp`
(which also confirmed the HID state-query used by Toggle Privacy). This
plugin re-implements the same HID reports with `node-hid` so they work from
a Stream Deck plugin on macOS and Windows.

PTZ Preset, PTZ Nudge, PTZ Center, and Image Control all use a locally-built
UVC helper binary. On macOS, that's a vendored, unmodified copy of
[uvc-util](https://github.com/jtfrey/uvc-util) by Jeffrey Frey (MIT license,
see `third_party/uvc-util/LICENSE`), which talks to the camera's standard
UVC controls via IOKit. On Windows, that's `uvc-util-win` (source in
`native/uvc-util-win`), an original tool written for this project that
talks to the same standard UVC controls via DirectShow's
`IAMCameraControl`/`IAMVideoProcAmp` instead, matching uvc-util's
command-line interface so the rest of the plugin doesn't need to know or
care which platform it's running on.

## License

[MIT](LICENSE)
