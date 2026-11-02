# Buienradar — Amazfit Balance 2

**Version 0.2.0 — unofficial Zepp OS 3 prototype.**

## Three full-screen pages

Swipe horizontally inside the app:

1. **Radar** — official live Belgium radar image (Buienradar's RadarMapRainWebmercatorBE single-image endpoint). Zepp's phone-side app downloads it, converts it to device image format, and transfers it to the watch. No artificial placeholder image.
2. **Rain forecast** — enlarged 24 × five-minute precipitation graph, now marker, clear two-hour timeline and rain arrival text from official Buienradar data.
3. **Next hour** — upcoming 60-minute rain total calculated from the 5-minute forecast, plus *current observed* temperature, wind and gusts from the nearest official Buienradar station. Observation station and distance are labelled explicitly; this is not a predicted next-hour temperature.

## Shortcut card — swipe right from watchface

A native Zepp **AppWidget (Shortcut Card)** is included. Swipe right from the watchface, scroll to the end of the cards, tap **Edit / Settings → Add** and choose **Buienradar**. The card gives the last known precipitation outlook and location. Tap it to launch the full application.

Zepp's shortcut-card lifecycle cannot be assumed to support live Bluetooth requests at any time. Consequently the card reads the most recent value stored by the full app, and does not present old rainfall as current after 20 minutes. If data is absent or stale, it shows an invitation to open the app.

## Location and refresh

The first launch defaults to **Antwerpen**, explicitly configured and not GPS-derived. In Zepp Settings choose a city or custom coordinates. Manual watch GPS is activated only on request and stopped after a result or timeout.

Rain and radar requests are refreshed every five minutes **while the full watch app is open**. The phone-side service caches data to avoid excessive requests.

GitHub Actions automatically builds a new ZPK and installation QR when the source changes. Zepp developer-preview installations **do not silently auto-update**; use [the latest installation QR](public/install-qr.png) to install new releases.

## Sources and permissions

- Official Buienradar Belgian radar image: https://www.buienradar.be/overbuienradar/weerdata-op-uw-website
- Official Buienradar rain and current-station measurements: https://www.buienradar.nl/overbuienradar/gratis-weerdata
- Official Zepp OS shortcut cards: https://docs.zepp.com/docs/guides/framework/device/secondary-widget/
- Official Zepp OS image file transfer: https://docs.zepp.com/docs/guides/version-info/new-features-30/

**Buienradar's terms require permission for mobile-app usage, including non-commercial apps, plus source attribution.** Do not distribute or submit this app to the Zepp store until authorized.

## Testing

Automated tests simulate Zepp interface events, file-transfer completion, precipitation decoding, station selection and card display. Device and API compatibility must still be verified on a real Amazfit Balance 2. When live radar fails, the app reports the failure instead of substituting a fake radar.
