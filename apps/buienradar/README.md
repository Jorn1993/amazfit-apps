# Buienradar — Amazfit Balance 2

**Version 0.3.0 — unofficial Zepp OS 3 prototype.**

## Animated radar v0.3.0

This edition replaces the static map with six real frames from Buienradar's
**official Belgian animation** \`RadarMapRainWebmercatorBE\`, requested from
the \`/2.0/image/animation/\` endpoint. A scheduled GitHub Actions job extracts
the real GIF frames every 15 minutes and publishes a replaceable, validated
PNG snapshot on the \`radar-cache\` branch.

The latest six frames are also bundled into each developer installation, so
the map **moves immediately** on opening without waiting for Bluetooth.
While open, the watch requests a verified new sequence automatically. The
Zepp phone service downloads and converts PNG frames, and the watch replaces
the bundled sequence once at least two fresh frames have really arrived.

**No manual GPS or refresh buttons.** The chosen location is read from
Zepp's Buienradar Settings. The displayed map is currently the country-wide
Belgian radar product, labelled with the chosen location, *not yet a
location-centered zoom*. Never imply it is precisely centered on that place
until a documented coordinate-aware map source is available.

Frame caches can be delayed by the 15-minute refresh schedule and Bluetooth;
the bundled fallback is marked as a preview until a fresh transfer.
A failed download cannot make up fictitious frames. The Side Service uses
Zepp's official PNG image converter, BLE file transfer, and both 'NEWFILE'
and 'FILE' receiver events.

This is a personal development prototype. Buienradar states that their data
requires permission for mobile-app use. Obtain permission before distributing
or listing it publicly.

## Three full-screen pages

Swipe horizontally inside the app:

1. **Radar** — official animated Belgium radar, six real frames with an immediately available bundled preview and automatic updates from Zepp.
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
