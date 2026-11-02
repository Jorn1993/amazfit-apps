# Buienradar for Amazfit Balance 2

**Version 0.1.0 — independent personal-development prototype.**

Two-hour Buienradar rainfall forecast, 24 five-minute bars, a rain-arrival estimate, and manual refresh. The Zepp phone-side service downloads real Buienradar rain text. No fabricated weather data.

## Location

The first launch explicitly defaults to Antwerpen. Change this in the Zepp Buienradar settings to another Dutch/Belgian city or enter latitude/longitude in the Benelux. The **GPS LOCATIE** button requests a WGS-84 watch GPS fix only when tapped, stops GPS when the fix is acquired or after 25 seconds, and does not store a location history.

## Automatic updates

- **Weather:** Refreshes automatically every 5 minutes while the watch app is open. Opening and the **VERNIEUW** button refresh it as well. The phone service caches a successful response for 5 minutes.
- **Application builds:** GitHub Actions automatically tests and builds a new developer ZPK and installation QR on source changes.
- **App installation:** Developer/preview Zepp installs do not have a confirmed silent-update mechanism. When the application version changes, scan the latest QR again. Zepp-managed store updates may be possible only after official submission.

## Developer installation

After successful CI, open the [installation QR](public/install-qr.png) on a second screen and scan it in Zepp Developer Mode. Zepp developer mode is enabled by tapping the Zepp logo 7 times under Profile → Settings → About. Keep your Zepp app and watch connected.

The [GitHub Action](../../.github/workflows/buienradar.yml) also uploads the generated package and QR.

## Buienradar data licensing

Source and attribution: [Buienradar.nl](https://www.buienradar.nl/overbuienradar/gratis-weerdata).

**Buienradar's published terms require permission for use in mobile apps, including non-commercial apps.** This is a development prototype, not an official Buienradar product. Obtain authorization before distributing or listing it in the Zepp store.

Buienradar supplies a 0–255 rain scale and 5-minute slots. The intensity in mm/hour is 10 raised to the power of ((value - 109) / 32), with 0 always meaning dry. The primary endpoint has a trailing slash to avoid a documented HTTP 302 issue. When the API cannot be parsed, the watch shows unavailable instead of an invented forecast.

## Code

- Watch UI: page/index.js
- Phone network service: app-side/index.js
- Parser and forecast summary: app-side/rain.js
- Zepp location settings: setting/index.js
- Automated tests: tests/
- Icon generation: prepare-assets.mjs
- GitHub workflow: ../../.github/workflows/buienradar.yml

The software and phone/watch interface have automated tests, but actual Zepp/Balance 2 connectivity and Buienradar API access must still be confirmed on the real device.
