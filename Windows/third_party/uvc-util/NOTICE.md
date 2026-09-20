# uvc-util (vendored)

This directory contains a copy of [uvc-util](https://github.com/jtfrey/uvc-util)
by Jeffrey Frey, used unmodified under the MIT license (see `LICENSE`).

It's a macOS command-line tool that talks to standard USB Video Class (UVC)
camera controls -- including pan/tilt/zoom absolute position -- via IOKit.
The EMEET PIXY Control Stream Deck plugin shells out to a locally-built copy
of this tool to implement PTZ presets, since pan/tilt/zoom on this camera is
a standard UVC control (unlike tracking/gesture/audio, which are EMEET's own
HID commands -- see `src/pixy-hid.ts`).

Fetched from the `master` branch of https://github.com/jtfrey/uvc-util.
Build it with `npm run build:native` from the project root (macOS + Xcode
Command Line Tools required); see the main README for details.
