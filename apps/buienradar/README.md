# Buienradar voor Amazfit Balance 2

## Versie 1.2.0 — schermvullende Buienradar, echte toekomstige beelden en regenverwachting

Een volledige native Zepp OS-app met een 480 × 480-schermvullende Belgische kaart, een tweede pagina voor de neerslagverwachting met 1/2-uur-grafiek, een weerpagina met temperatuur, regen en wind, instellingen voor locaties en regenmeldingen, en een schermvullende secundaire widget.

### Radararchitectuur

**1. Gegarandeerde actuele bron:** de Zepp Side Service haalt direct bij Buienradar België de officiële statische PNG op via `image/single/RadarMapRainBE`. Vervolgens gebruikt de app uitsluitend de **officiële Zepp-API's** die daadwerkelijk op een fysieke Balance 2 zijn getest:

- `BaseSideService.this.download()`
- `convertLib.convert({filePath})`
- `BaseSideService.this.sendFile()`
- `BasePage.onReceivedFile()` waarna `IMG` het native bestand fullscreen weergeeft

Deze vierstappenroute is bevestigd door een screenshot van de aparte **Radar Beeldtest** op een echte Amazfit Balance 2. De actuele afbeelding wordt iedere 5 minuten opnieuw opgehaald en verdwijnt wanneer ze ouder is dan 8 minuten. Geen historische kaart vermomd als toekomstige data.

**2. Toekomstige animatie:** na het actuele beeld haalt dezelfde Side Service rechtstreeks bij Buienradar de authentieke GIF op via `image/animation/RadarMapRainWebmercatorBE?History=0&Forecast=19&skip=1`. De ongewijzigde GIF wordt met Zepps ondersteunde `this.sendFile` naar het horloge verstuurd. De eigen getest GIF89a-decoder op het horloge pakt de RGB-kleuren uit en gebruikt de **officiële Zepp CANVAS** `drawRect({x1,y1,x2,y2,color})`-API om deze zichtbaar te maken. Een kleine 3-pixel-sample en verschillen tussen frames beperken de hoeveelheid tekenwerk. Een doorslaggevend verschil met de kapotte 1.1.x-versies: **er wordt geen zelfgemaakte native TGA/SOMH-afbeelding opgeslagen of gerenderd**, en geen ongedocumenteerde Side Service `fs.readFile` of `fs.writeFile` gebruikt.

De animatie verschijnt pas als ten minste twee echte toekomstige bronframes correct zijn uitgepakt en het eerste Canvas-beeld volledig is getekend; anders blijft de bewezen actuele kaart zichtbaar. De GUI toont dan **BUIENRADAR · VOORUIT**, nooit een verzonnen +3U-tijd. Bron-GIF met `renderText=True` bevat oorspronkelijke tijdstempels. De horizon is afhankelijk van daadwerkelijk geleverde bronframes.

### Stabiliteit en offlinegedrag

- Geen GitHub, KMI, Home Assistant, afzonderlijke Android-app of externe omzetserver **tijdens gebruik**; GitHub dient alleen om de Zepp-app te bouwen en de installatie-QR te hosten.
- Oude caches met corrupte groene afbeeldingsdata worden niet ingelezen. Een nieuwe actuele beeldcache `buienradar.current.v2` is maximaal 8 minuten geldig, en de GIF zelf `buienradar.gif.v1` ook.
- Fouten met download, Bluetooth, converter, GIF-decoder of Canvas worden weergegeven in plaats van stilzwijgend eeuwig laden. De werkende actuele kaart blijft terugval wanneer de toekomstige animatie faalt.
- De hoofdradar is 480×480. Via de digitale kroon kan ingezoomd worden. De secundaire widget toont het laatste *verse actuele* radarbeelduit de native Zepp-converter en compacte weer-/regenstatus; het widgetbeeld wordt niet valselijk als toekomstige animatie aangeduid.
- Regenverwachting, actuele weersomstandigheden, locaties, instellingen en regenmeldingen blijven van eerdere versies behouden.

### Validatie

Een echte Balance 2 heeft de *actuele PNG-route* bewezen. CI controleert de native Zepp-build, tientallen regressietests, de RGB-correctheid van het tekenalgoritme en de GIF-decoder op een live echte Buienradar-GIF. **De bewegende Canvas-animatie zelf moet nog op de fysieke Balance 2 worden bevestigd**, want een groene GitHub-build bewijst niet dat firmware het Canvas-prestatieniveau haalt. We benoemen deze beperking uitdrukkelijk en noemen deze niet reeds hardware-bewezen.

### Installatie en updates

De permanente QR in `public/install-qr.png` installeert `public/buienradar-latest.zpk`. Updates vragen opnieuw scannen van dezelfde ontwikkelaars-QR. GitHub is niet nodig om de reeds geïnstalleerde app te gebruiken.

### Gebruik en licentie

Onafhankelijk persoonlijk prototype, geen officiële Buienradar-app. Zie de [Buienradar-voorwaarden](https://www.buienradar.be/overbuienradar/weerdata-op-uw-website) voor toestemming bij distributie.
