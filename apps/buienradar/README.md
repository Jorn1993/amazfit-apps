# Buienradar · Amazfit Balance 2

## 1.1.3 — echte radar zonder corrupte kleuren

**Oorzaak van de groen/blauwe ruis in 1.1.2:** de vorige versie bouwde op het horloge zelf een eigen, onofficieel TGA/SOMH-bestandsformaat uit GIF-pixels. Dit kon Pillow in CI lezen, maar werkte niet met de grafische renderer van de echte Balance 2. Dit was geen download- of Bluetoothprobleem.

**Oplossing 1.1.3:** de Zepp Side Service downloadt de officiële `RadarMapRainWebmercatorBE`-GIF rechtstreeks bij Buienradar België met `History=0&Forecast=19`. Een JavaScript-GIF-decoder pakt de bronframes uit *op de telefoon*. Een eigen PNG-encoder bewaart hun RGB-pixels zonder kleurverlies als standaard RGB PNG. **Elk PNG-frame wordt vervolgens door de officiële Zepp `image.convert()` op de telefoon omgezet naar het door het horloge ondersteunde native formaat.** Alleen die native frames worden via ZML/TransferFile aan het horloge overgedragen. Geen zelfgemaakte apparaatbeelden, geen KMI, geen GitHub of andere conversieserver tijdens gebruik.

Voor de Bluetooth-overdracht worden maximaal negen opeenvolgende, echt toekomstige bronframes gekozen uit de 17 GIF-frames (indices 0,2,…,16), zodat een animatie opgebouwd wordt zonder nog grotere transferkosten. De echte bron-GIF bevat zijn eigen tijdsaanduidingen. Zodra twee beelden zijn ontvangen, begint de animatie. De volledige kaart blijft 480×480 schermvullend. Het eerste actuele Buienradar-PNG-beeld wordt apart van de GIF opgehaald en wordt uitsluitend aangeduid als **ACTUEEL**, niet als prognose.

De kapotte GIF-beeldcache van 1.1.2 wordt **niet** hergebruikt. Er wordt een nieuwe cache key `buienradar.animation.v3` gebruikt. De widget leest dezelfde nieuwe cache.

## Validatie
CI controleert de decoder op een live Buienradar-GIF, en verifieert dat omgezette PNG's geldig zijn en dezelfde RGB-pixels bevatten als de originele GIF. De side-service-tests eisen expliciet dat er alleen via `image.convert()` gemaakte bestanden naar het horloge gaan; raw GIF- en zelfgemaakte TGA-bestanden zijn uitgesloten. Net als voorheen kan alleen een test op een echte Balance 2 bevestigen dat de native converter en file transfer op jouw toestel werken; groene CI-tests bewijzen dit niet.

## Installatie
[Vaste QR-code](public/install-qr.png) · [Altijd nieuwste ZPK](public/buienradar-latest.zpk) · [Release-info](public/latest.json).

De QR verandert niet; dezelfde QR-code installeert na de build de nieuwste versie. Voor private developer-builds is opnieuw scannen noodzakelijk.

## Bron
[Buienradar België](https://www.buienradar.be/overbuienradar/weerdata-op-uw-website), onafhankelijk Zepp OS-privéprototype.
