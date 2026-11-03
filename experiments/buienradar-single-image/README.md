# Buienradar single-image watch probe

A **separate** native Zepp app, never installed over the existing Buienradar.
App ID **991936821**, app name **Radar Beeldtest**, version **0.1.0**.

This isolates ONE supported operation using the official
[Zepp OS 3.0 download sample](https://github.com/zepp-health/zeppos-samples/tree/main/application/3.0/download):

1. Watch draws a bundled full-screen (480x480) red/green/blue calibration image.
2. Watch requests a **current static Buienradar Belgium radar PNG** on phone.
3. Zepp BaseSideService downloads the PNG using `this.download`.
4. Zepp official `convertLib.convert` returns device-native format.
5. Zepp BaseSideService sends it with `this.sendFile`.
6. Zepp BasePage receives native file via `onReceivedFile` and swaps image src.

No custom file formats, no GIF parser, no animations, no background server, no
GitHub runtime requests. Current radar is **not** falsely labelled as future.
The screen shows stage-specific errors if download, conversion or BLE fails.

## Installation
Download the separate ZPK and QR from **the probe branch**, not the main
Buienradar release. The app has a different app ID and will coexist with the
main Buienradar. A GitHub Actions workflow builds and publishes ONLY to
this branch's `experiments/buienradar-single-image/public/` directory.

## Acceptance
A **real Balance 2 screenshot** must show an actual geographical Buienradar
map, not the colourful built-in calibration bars or broken-green-noise data.
Automated tests and build success alone do not count as image validation.
