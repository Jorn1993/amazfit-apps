# Buienradar — Amazfit Balance 2

**v0.7.0 | Zepp OS 3 | Personal prototype**

## One forecast, consistent across all screens

The phone-side service obtains official **24 five-minute rainfall buckets** and derives both a **60-minute** and **120-minute** forecast from those **same buckets**. The graph header and rain amount change together when the user taps 1 uur / 2 uur. The Weather page is explicitly labelled **komend uur**, so a 0 mm next-hour amount does not contradict rain arriving later in the 2-hour forecast.

The watch only accepts responses carrying a valid timestamp, 24 data buckets and both forecast summaries. The swipe-left SecondaryWidget uses the watch's **same two-hour snapshot** (\`buienradar.forecast.v2\`), not a separately stored old prediction. Weather data older than **8 minutes** is marked unavailable rather than "dry". There is no invented fallback rain.

## Screens

- **Radar**: animated Belgian radar on the full display, zoom, and an indicative yellow location square. The authentic **time rendered into each official animation frame** is moved within the round watch's safe area while extracting frames. This is *radar frame time*, not device clock time. Radar animations can be delayed or older than the present time.
- **Rain**: one large state, a true 1-hour/2-hour switch, matching graph labels and amounts, no redundant headline/subtitle.
- **Weather**: large current temperature, **next-hour** precipitation, wind and gusts. Temperature/wind are latest readings from a station and are not weather forecasts. The station may be missing, in which case placeholders appear.
- **Settings on watch**: select a Belgian/Dutch city and opt into a rain reminder with a 5/15/30-minute lead. No companion Zepp Settings UI.
- **SecondaryWidget**: composite full-screen glance card with a radar image, the last fresh 2-hour summary, a 24-bar mini-rainfall chart, temperature and wind. An expired prediction is not presented as current; the last bundled radar remains visible. Tap the card to open the app.

All pages are designed for the 480px round Balance 2 and use Zepp's native horizontal swipe.

## Background notification limitation

An alarm can be scheduled from the latest two-hour forecast and may fire after closing the app. It **does not continuously check for changes** in the weather while the watch app is closed. Disable warnings from the watch settings to cancel a pending alarm. The watch Settings screen includes a **TEST** button which explicitly sends a Zepp OS system notification and reports whether Zepp accepted the request. This is useful for live device testing; notification delivery is not proven by a successful CI build.

## Radar image source

Official Buienradar Belgium animation: \`https://image.buienradar.nl/2.0/image/animation/RadarMapRainWebmercatorBE\`. GitHub Actions refreshes the validated animation frames in \`radar-cache\` every 15 minutes. The watch initially loops the six bundled frames, and can replace them via the Zepp phone-side Bluetooth file transfer. Radar zoom is display zoom of the Belgium map; the yellow square is an **approximation**, not map-projection-accurate geocoding.

## Installation and testing

A new version is built automatically by [GitHub Actions](../../.github/workflows/buienradar.yml), which publishes the [latest developer QR](public/install-qr.png) and versioned ZPK. Scan again to update sideloaded versions; Zepp developer apps do not silently auto-update.

Automated tests cover parser correctness, both forecast horizons, stale data, the radar and phone transfer mocks, swipe navigation, watch settings and one-shot rain notifications. Physical-watch behavior remains to be verified.

**Use and rights**: The app is independent, for private personal testing. Buienradar's published terms request authorization for mobile-app uses, including non-commercial use. Do not distribute or submit to the Zepp store without permission. [Buienradar source and terms](https://www.buienradar.be/overbuienradar/weerdata-op-uw-website).
