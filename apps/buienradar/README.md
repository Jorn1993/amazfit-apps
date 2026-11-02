# Buienradar · Amazfit Balance 2

Independent Zepp OS 3 mini-app, **version 0.5.0**. Private personal prototype.

## Watch experience

The three full-screen pages use native smooth horizontal swiping.

- **Radar:** genuine animated Buienradar Belgium-wide radar frames, full-bleed, with a subtle place label, indicative yellow location square and +/− zoom. The square uses an **approximate overlay transform**, not a georeferenced Buienradar coordinate projection. Avoid claiming pixel-level location precision.
- **Rain:** large 5-minute precipitation graph for the next **1 or 2 hours**, selectable directly on the watch. The official location-specific rain-text feed provides only two hours, so **3h/5h charts are intentionally not fabricated**. Radar images can show longer horizons, but they are a different product.
- **Weather:** compact large type and weather glyphs for measured temperature, expected one-hour precipitation and observed wind, with a settings gear. Tiny station metadata and all repeated Buienradar wordmarks have been removed.

Only the app launcher icon uses Buienradar branding. It has a transparent background outside the circular mark, replacing the former white square.

## All settings directly on the watch

On page 3 tap **⚙** to open \`page/settings\`. Use arrows to choose one of 12 Belgian/Dutch cities; save to both on-watch LocalStorage and Zepp's phone-side \`settingsStorage\` through an acknowledged \`config.set\` request. The app no longer registers a separate Zepp phone settings page.

On the same page enable/disable **Regenmelding**, with a configurable lead of **5, 15 or 30 minutes**. The app uses the real 2-hour precipitation forecast to schedule a **single** persistent Zepp OS alarm that invokes \`app-service/rain-alert\`, which posts a watch notification. Notifications are OFF by default. Turning them off cancels the scheduled alarm during the next active app sync.

**Alert limitations:** This is a scheduled reminder based on the most recent forecast received *while the app is open*, not continuous rain monitoring after the watch app exits. Reopening the app and syncing the forecast updates/cancels the scheduled reminder. Late changes to weather while the app is closed cannot be automatically detected in this release. Zepp OS notification and alarm permissions must be available on the device.

## Official source and background refresh

The raw 2-hour local rain data comes from Buienradar's official rain-text service. The radar is sourced from Buienradar's \`RadarMapRainWebmercatorBE\` animation. GitHub Actions extracts verified image frames every 15 minutes into \`radar-cache\`, then the release workflow bundles the latest six 480px frames into the watch app to animate immediately on launch. Phone-side BLE replaces the initial frames when newer verified images arrive.

The *radar* itself remains an overview of Belgium, not a georeferenced center-on-selected-city map. Zoom enlarges that official country map in watch coordinates.

## Install and test

- [Latest Zepp developer install QR](public/install-qr.png)
- [Source and build workflow](../../.github/workflows/buienradar.yml)
- [Official Buienradar terms and attribution](https://www.buienradar.nl/overbuienradar/gratis-weerdata)
- [Zepp native horizontal swiper](https://docs.zepp.com/docs/reference/device-app-api/newAPI/page/setScrollMode/)
- [Zepp system notification](https://docs.zepp.com/docs/reference/device-app-api/newAPI/notification/notify/)
- [Zepp persistent alarm](https://docs.zepp.com/docs/reference/device-app-api/newAPI/alarm/set/)

A developer installation does **not** automatically upgrade; each new version requires scanning the installation QR again. The rainfall forecast refreshes only while the full app is open.

Buienradar requires authorization to use its weather data in mobile apps, including non-commercial apps. The app is not affiliated with or endorsed by Buienradar. Do not publish publicly or distribute without their permission.

Automated tests cover parsing, download, BLE transfer mocks, UI interactions and notification scheduling. **Success in CI does not prove a background notification or zoom behaves identically on a physical Balance 2.**
