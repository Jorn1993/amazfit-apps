# Buienradar · Amazfit Balance 2

**1.1.2 — ZML Bluetooth-bestandsontvangst hersteld, schermvullende Buienradar (privéprototype)**

## Radar
De +3 uur-radar komt **uitsluitend van Buienradar België**, via
`https://image.buienradar.nl/2.0/image/animation/RadarMapRainWebmercatorBE?height=320&width=320&renderBackground=True&renderBranding=False&renderText=True&History=0&Forecast=19&skip=1`.

Vanaf 1.1.1 haalt de Zepp-telefoonservice **eerst een echte actuele Belgische Buienradar-PNG** op (`RadarMapRainBE`) en zet die met de officiële `image.convert` om. Zo kan de 480×480-radarkaart al zichtbaar worden voordat de grotere animatie via Bluetooth is aangekomen. Dit beeld wordt expliciet **ACTUEEL** genoemd en nooit als toekomstvoorspelling voorgesteld. De reden van een mislukte download, conversie of overdracht verschijnt op het radarscherm; het laden mag niet eindeloos onverklaard duren.

De kaart op de hoofdapp en secundaire widget is nu volledig **480×480, rand-tot-rand**. Alleen compacte locatie- en tijdsaanduidingen liggen bovenop de kaart, niet ernaast.

Daarna downloadt de bestaande Zepp-telefoonservice de officiële GIF rechtstreeks bij Buienradar en draagt het GIF-bestand **ongewijzigd via Bluetooth** over naar de Balance 2. Op het horloge leest een GIF/LZW-decoder de geanimeerde frames en schrijft elk frame weg als Zepp-compatibele, paletgebaseerde TGA/SOMH-afbeelding. De radar wisselt de frames af op het scherm. **Geen KMI, GitHub tijdens gebruik, externe afbeeldingsconverter of aparte Android-app.**

Buienradar levert zelf de tijdsaanduidingen binnen de GIF (`renderText=True`). De app verzint geen voorspellingstijden. Een recent ontvangen reeks blijft tot maximaal 12 minuten beschikbaar en de app vraagt na circa 8 minuten nieuwe gegevens op. Onbetrouwbare, mislukte of verlopen bronnen worden als fout getoond in plaats van een oude radar. Widget toont het eerste recente frame als preview; de volledige animatie loopt in de hoofdapp.

## Regen en weer
De afzonderlijke pagina’s **Regen** (1/2 uur) en **Weer** blijven Buienradar rechtstreeks raadplegen. Instellingen, stadkeuze en regenmeldingen blijven native op het horloge aanwezig. De Zepp Side Service maakt deel uit van de mini-app en gebruikt de bestaande Zepp-telefoonapp; er is geen andere app nodig.

## Teststatus
De eigen GIF-decoder is in GitHub Actions op een live Buienradar Belgium GIF gecontroleerd. Alle frames zijn succesvol uitgelezen, de animatieframes verschillen van elkaar, en de gecodeerde TGA/SOMH-bestanden zijn leesbaar. **Bluetooth-overdracht, GPU-weergave en prestaties op een fysieke Amazfit Balance 2 zijn nog niet bevestigd.** De tests simuleren die interacties, zodat een echte horlogetest noodzakelijk blijft. Dit is geen reden om KMI of een stilstaand beeld als werkende vervanging te presenteren.

## Installatie
[Vaste QR-code](public/install-qr.png) · [Nieuwste app-pakket](public/buienradar-latest.zpk) · [Versiemetadata](public/latest.json).

Dezelfde QR-code verwijst altijd naar `buienradar-latest.zpk`. Bij een nieuwe developerrelease moet je die opnieuw scannen; automatische updates in de private preview zijn niet ondersteund.

## Bronnen en voorwaarden
Neerslag, radar en weer: [Buienradar](https://www.buienradar.be/overbuienradar/weerdata-op-uw-website). Gebruik en verdere verspreiding van hun beelden vallen onder hun voorwaarden en kunnen toestemming vereisen. Onafhankelijk privéprototype, niet gelieerd aan Buienradar of Amazfit.

## Fix 1.1.2: bestandsoverdracht op Zepp zelf

De eerdere implementatie creëerde naast de ZML-Bluetooth-ontvangst een tweede zelfstandige `TransferFile().getInbox()`. ZML initialiseert de oorspronkelijke Inbox bij het starten van de app en haalt zelf de ontvangen FileObject uit de wachtrij. Daardoor kon de tweede ontvanger geen beeld krijgen. De app gebruikt nu uitsluitend de gedocumenteerde ZML `onReceivedFile(file)`-callback van `BasePage`, ontvangt daar het FileObject en wacht op `readyState='transferred'` vooraleer het bestand te tonen of de GIF uit te pakken. Fouten met downloaden, verwerken of verzenden blijven zichtbaar. De app toont bovendien de live status van de telefoonservice en meldt een hangende overdracht vóór de vroegere wachttijd van 105 seconden.

De decoder is met een echte Buienradar-GIF getest en de end-to-end ZML-dispatch is nu opgenomen in de regressietests. Op een fysieke Balance 2 is de uitkomst nog te bevestigen; CI simuleert BLE-gebeurtenissen en kan de firmware-omgeving niet volledig representeren.
