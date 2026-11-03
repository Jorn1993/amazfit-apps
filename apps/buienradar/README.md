# Buienradar voor Amazfit Balance 2

## Versie 1.2.0 — hardware-bewezen radarweergave

Deze versie vervangt de gebroken beeldroute van 1.1.3 door de werkende
[officiële Zepp OS 3-downloadtest](https://github.com/zepp-health/zeppos-samples/tree/main/application/3.0/download), die op een fysieke Amazfit Balance 2 is bevestigd.

**Radar:** de Zepp Side Service downloadt rechtstreeks de echte *actuele*
Belgische Buienradar-kaart (`image/single/RadarMapRainBE`), zet die om met
`convertLib.convert`, stuurt het native bestand via `this.sendFile` en de
watch ontvangt het via `BasePage.onReceivedFile`. Geen extra Android-app,
geen Home Assistant, geen KMI, geen omzetserver en geen GitHub bij gebruik.

**Scherm:** 480 × 480 pixels, volledig schermvullend, met compacte
locatie- en actuele-tijdaanduiding. Horlogekroon zoomt. De native
radarafbeelding blijft hoogstens 8 minuten beschikbaar; ophalen gebeurt
opnieuw na 5 minuten. Oude GIF-cache of foute groen-blauwe frames worden
nooit opnieuw geladen. Problemen met download, converter of BLE
krijgen een concrete foutstatus.

**Overige schermen:** regenverwachting met 1/2 uur neerslaggrafiek,
actueel weer, locaties, instellingen en regenmeldingen blijven behouden.
De secundaire widget gebruikt dezelfde actuele kaart en neerslagstatus.

### Grenzen van deze release

**De bewegende +3-uursradar is nog niet werkend bewezen en is daarom
niet aanwezig in deze release.** De oude GIF-implementatie werkte niet:
zij gebruikte niet-gedocumenteerde bestandsbewerkingen in de Zepp
telefoonservice. Een actuele radarafbeelding mag niet als toekomstig
radarframe worden aangeduid. Een echte bewegende toekomstanimatie
vereist nog een ondersteunde manier om losse Buienradar-GIF-frames op de
telefoon in native Zepp-bestanden om te zetten, of een aantoonbaar
werkend alternatief zonder externe conversieserver.

### Bouw en validatie

De aparte `Radar Beeldtest` heeft de volledige downloader → converter
→ Bluetooth → beeldweergave daadwerkelijk op een Balance 2 laten zien.
GitHub Actions controleert daarnaast broncode, regressietests, de
live Buienradar-PNG en het Zepp ZPK-pakket. Een groene CI-check bewijst
niet zelfstandig een werkende smartwatch.

### Installatie

Dezelfde permanente installatie-QR wordt hergebruikt:
`public/install-qr.png`, met `public/buienradar-latest.zpk`.
De QR bouwt de app niet bij iedere start; om de app bij te werken moet
de ontwikkelaars-ZPK via de QR opnieuw geïnstalleerd worden.

### Bron / licentie

[Buienradar België](https://www.buienradar.be/overbuienradar/weerdata-op-uw-website).
Dit is een persoonlijk, onafhankelijk prototype, geen officiële Buienradar-app.
De voorwaarden van Buienradar vragen afzonderlijke toestemming voor mobiele
toepassingen; gebruik en eventuele verspreiding moeten daarmee overeenstemmen.
