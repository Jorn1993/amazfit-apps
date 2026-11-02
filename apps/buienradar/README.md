# Buienradar — Amazfit Balance 2

**Version 0.2.2 — unofficial Zepp OS 3 prototype.**

## Three full-screen pages

Swipe horizontally inside the app:

1. **Radar** — official live Belgium radar image (Buienradar's RadarMapRainBE single-image endpoint). Zepp's phone-side app downloads it, converts it to device image format, and transfers it to the watch. No artificial placeholder image.
2. **Rain forecast** — enlarged 24 × five-minute precipitation graph, now marker, clear two-hour timeline and rain arrival text from official Buienradar data.
3. **Next hour** — upcoming 60-minute rain total calculated from the 5-minute forecast, plus *current observed* temperature, wind and gusts from the nearest official Buienradar station. Observation station and distance are labelled explicitly; this is not a predicted next-hour temperature.

## Volledig scherm links van de wijzerplaat

Gebruik **Zepp SecondaryWidget**, niet AppWidget/Shortcut Cards. Veeg vanaf de wijzerplaat **naar links**. Voeg Buienradar toe via **Instellingen → Voorkeuren → Widgets → Toevoegen** (de menunamen kunnen per taal verschillen). De volledige, ronde 480×480-widget toont de laatst opgehaalde regenverwachting, locatie en een grote knop om de volledige Buienradar-app te openen.

De widget mag de Bluetooth-appsideverbinding niet onbeperkt op de achtergrond gebruiken. Daarom wordt de weersvoorspelling bij een leeftijd van meer dan 20 minuten als niet-actueel gemarkeerd en vraag je met één tik een nieuwe update op.

## Radarproblemen

De eerste versie kon eindeloos "laden" tonen omdat het downloaden, omzetten en de Bluetooth-overdracht onzichtbaar op de telefoon verliepen. Sinds 0.2.1 wacht de app expliciet op de overdracht, vernieuwt het IMG-widget correct via de Zepp MORE-property en toont een foutfase of time-out in plaats van een oneindige spinner. Voor verdere diagnose: open **Zepp → Developer Mode → Logs**, verzamel **Device App** en **Side Service**-logs terwijl je de radarpagina opent.

De radar gebruikt de officiële Buienradar-afbeeldingsbron. Het slagen van CI is **geen bewijs** dat de externe radardienst of de live overdracht op jouw Balance 2 bereikbaar is. Foutmeldingen op je horloge zijn leidend.

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

## Radar v0.2.2 diagnostics

The earlier app could remain on “loading” if the side-service network or file-transfer callback was absent. The radar now requests the Belgian `RadarMapRainBE` static-image endpoint, and uses a two-stage protocol: start immediately, then poll the real Zepp side-service state every few seconds. Messages identify **DOWNLOAD**, **CONVERT**, or **TRANSFER**. A missing response or stalled file transfer ends in an explicit error, not an endless loading message.

Automated tests simulate successful download, HTTP 404, download time-out, failed conversion and Bluetooth errors. They cannot verify the Buienradar image endpoint is reachable from an individual Android/Zepp phone; the real watch error now makes that distinguishable. Check Device App and Side Service logs in Zepp Developer Mode for further details if necessary.
