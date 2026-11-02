# Buienradar voor Amazfit Balance 2

**Versie 0.4.0 · privéprototype · Zepp OS 3**

Een compacte Nederlandstalige weerapp met drie schermen:

1. **Radar** — officiële, bewegende Belgische Buienradar-beelden in een volledig 480 × 480 px scherm, met jouw gekozen plaats als titel. De zes echte radarframes zitten in de installatie en spelen meteen af.
2. **Neerslag** — een grote grafiek van 24 intervallen van vijf minuten, met status en voorspelling.
3. **Weer** — grotere temperatuur, regen komende 60 minuten en wind, met iconen. Temperatuur en wind zijn **metingen van een weerstation**, niet voorspellingen voor het komende uur.

De navigatie gebruikt [Zepp's native horizontale swiper](https://docs.zepp.com/docs/reference/device-app-api/newAPI/page/setScrollMode/) met drie VIEW_CONTAINER-pagina's. De pagina's volgen je vinger tijdens het swipen. Er zijn geen GPS- of vernieuwknoppen.

## Locatie instellen

Kies in **Zepp → Buienradar → Instellingen** een plaats in België/Nederland of geef eigen coördinaten op. De app gebruikt die plaats voor regenverwachting en meetstations. De radar zelf is het officiële **overzicht van België**. Een locatiegerichte zoom en marker op de kaart zijn nog niet beschikbaar, dus de kaart is niet exact gecentreerd op de gekozen plaats.

## Automatische radarupdate

De officiële Buienradar-bron is:

\`https://image.buienradar.nl/2.0/image/animation/RadarMapRainWebmercatorBE\`

De \`.github/workflows/buienradar-radar.yml\` workflow haalt om de 15 minuten de officiële bewegende GIF op, controleert de frames en publiceert een momentopname in de \`radar-cache\` branch. De app-build gebruikt de laatste gevalideerde momentopname en verpakt zes PNG-frames op schermresolutie in de ZPK.

De ingebouwde animatie is onmiddellijk zichtbaar, ook zonder telefoon. Terwijl de app open is kunnen nieuwe geverifieerde frames via de telefoon en Zepp BLE worden ontvangen. Het kan enkele minuten duren voordat ze zijn bijgewerkt. Bij een fout blijft de bestaande animatie beschikbaar, zonder fictieve neerslagdata te tonen.

## Eigen widget

Naast de drie appschermen is er een volledige **SecondaryWidget**, voor de kaarten links van de wijzerplaat. Die toont de laatst bekende neerslagverwachting en opent de volledige app bij een tik. Na twintig minuten verschijnt geen verouderde voorspelling meer.

## Merk en logo

Een bestaand Buienradar-logo is gebruikt uit een publieke logospiegel, omdat Wikimedia's afbeeldingsserver het automatische verzoek soms afwijst. Het project is onafhankelijk en niet gelieerd aan Buienradar. De build heeft een visuele fallback als beide logobronnen ontbreken.

## Installeren en bijwerken

Na een geslaagde CI-run: [nieuwste installatie-QR](public/install-qr.png). Scan in Zepp Developer Mode. De \`buienradar-vX.Y.Z.zpk\` staat in dezelfde \`public/\` map.

De regenverwachting wordt automatisch bijgewerkt terwijl de app geopend is. **Nieuwe developer-appversies installeren niet stilletjes**: scan voor een nieuwe versie opnieuw de QR-code.

## Bronnen en beperkingen

- [Buienradar — weerdata en gebruiksvoorwaarden](https://www.buienradar.be/overbuienradar/weerdata-op-uw-website)
- [Zepp OS — Native Swiper](https://docs.zepp.com/docs/reference/device-app-api/newAPI/page/setScrollMode/)
- [Zepp OS — VIEW_CONTAINER](https://docs.zepp.com/docs/reference/device-app-api/newAPI/ui/widget/VIEW_CONTAINER/)
- [Zepp OS — Secondary Widget](https://docs.zepp.com/docs/guides/framework/device/secondary-widget/)

Buienradar vereist toestemming voor het gebruik van weerdata in mobiele apps, ook bij niet-commercieel gebruik. Deze repository is uitsluitend als persoonlijk prototype bedoeld en heeft geen toestemming voor publieke verspreiding.

Alle 23 mock- en unit-tests slaagden voor de v0.4.0-build. Dat bevestigt de pakketbouw, **niet** de werkelijke animatie- of swipeprestaties op het fysieke Balance 2-horloge.
