# EMEET PIXY Control (Stream Deck plugin)

A Stream Deck plugin for the [EMEET PIXY](https://www.emeet.com/) dual-camera
PTZ webcam, since EMEET doesn't ship one. Control tracking mode, privacy,
gesture control, microphone mode, pan/tilt/zoom, and image controls straight
from a Stream Deck.

There's a separate build for each OS, since the pan/tilt/zoom and image
control actions talk to the camera through a different low-level API on each
platform:

- **[MacOS/](MacOS/)** -- see [MacOS/README.md](MacOS/README.md) for full
  setup, usage, and troubleshooting.
- **[Windows/](Windows/)** -- see [Windows/README.md](Windows/README.md) for
  full setup, usage, and troubleshooting.

## Quick start

```bash
# macOS
cd MacOS
npm install
npm run build:native   # requires Xcode Command Line Tools; only needed for PTZ/Image Control actions
npm run build
cd com.emeetpixy.pixycontrol.sdPlugin && npm install --omit=dev && cd ..
npm install -g @elgato/cli
streamdeck link com.emeetpixy.pixycontrol.sdPlugin

# Windows
cd Windows
npm install
npm run build
cd com.emeetpixy.pixycontrol.sdPlugin && npm install --omit=dev && cd ..
npm run build:native:win   # requires the .NET 8 SDK; only needed for PTZ/Image Control actions
npm install -g @elgato/cli
streamdeck link com.emeetpixy.pixycontrol.sdPlugin
```

Then open the Stream Deck app -- "EMEET PIXY Control" appears as a category
in the actions list. See the platform-specific READMEs linked above for
what each action does and how to resolve common setup issues.

## How it works

EMEET doesn't publish a control API for the PIXY. This plugin talks to the
camera directly over two protocols: the camera's raw USB HID interface
(reverse-engineered by the community) for tracking/privacy/gesture/audio,
and standard USB Video Class (UVC) commands for pan/tilt/zoom and image
controls. See each platform README's "How it works" and "Credit" sections
for the full detail and attribution.

## License

[MIT](LICENSE)
