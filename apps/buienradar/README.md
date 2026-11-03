# Buienradar · Amazfit Balance 2

**Release 0.9.3 · Zepp OS 3 · privéprototype**

## Ontwerp (alle schermen als één systeem)

Het ontwerp is volledig opgebouwd voor een rond scherm van **480 × 480 px**, met een veilige zone voor interactie en leesbare typografie. De app heeft drie native horizontaal swipebare schermen:

1. **Radar**: schermvullende, automatisch bewegende Belgische Buienradar-animatie. De **werkelijke tijd uit ieder frame** wordt tijdens het verwerken naar een veilige, subtiele strook onderaan het ronde scherm verplaatst. Geen grote klok, onjuiste marker of permanente zoomknoppen. Draai aan de **kroon** om in of uit te zoomen (gecentreerd op de kaart, niet op een verzonnen GPS-punt).
2. **Regen**: één status, één hoeveelheid en één grafiek voor 1 of 2 uur, afgeleid van exact dezelfde officiële 5-minuten-neerslagpunten. Geen niet-ondersteunde +3u of +5u voorspellingen.
3. **Weer**: actuele temperatuur als hoofdwaarde, daaronder twee lichte infoblokken voor **regen komend uur** en wind. Geen dubbel weerlogo, zware kaartstapel, kleine technische teksten of instellingenicoon boven de temperatuur.

Op **elk scherm** opent een tik op de locatienaam de instellingen. Daar kies je via een **echte lijst van 12 locaties** (verdeeld over drie vlot swipebare pagina's) je plaats. De gekozen locatie wordt pas opgeslagen na bevestiging door de Zepp-telefoonservice.

De aparte widget links van het horloge heeft **radar als hoofdinhoud**. De widget toont een **enkele compacte informatiecapsule bovenaan** met de gekozen locatie en actuele weersamenvatting. Daardoor is de originele Buienradar-frameklok **onderaan volledig leesbaar**; de capsule bedekt het radarbeeld niet op die plek. Als de lokale voorspelling verlopen is, wordt een oude temperatuur als *laatst bekend* aangeduid in plaats van de radar zelf foutief als niet actueel te bestempelen. Een tik op de capsule opent de app.

Na terugkeer van de hoofdapp gebruikt de widget `SecondaryWidget.onResume` om het gedeelde `LocalStorage`-momentbeeld opnieuw in te lezen. Het horloge kan in de widget geen nieuwe Bluetooth-opvraag starten: de weersamenvatting wordt alleen vernieuwd nadat de hoofdapp werkelijk data heeft opgehaald.

## Automatische update

- De officiële GIF komt van Buienradar België, product \`RadarMapRainWebmercatorBE\`.
- GitHub Actions verzamelt en valideert de frames elke 15 minuten, zonder eerdere beelden voor actuele data uit te geven.
- Zes geverifieerde frames worden in de watch-app verpakt, zodat de animatie direct start.
- Nieuwe frames worden alleen terwijl de app actief is via Zepp telefoonservice en BLE bijgewerkt.
- De 2-uurs regenvoorspelling wordt elke 5 minuten opgehaald terwijl de hoofdapp open is.
- De widget kan **niet zelfstandig** het internet via de telefoon raadplegen als de app niet actief is. Daardoor blijven de radarbeelden zichtbaar, maar verlopen de regenwaarden na acht minuten.

De officiële rasterdienst publiceert geen betrouwbaar gegeorefereerde hoekcoördinaten voor dit vaste radarbeeld. Daarom wordt er **geen onnauwkeurig geel locatiekader** meer getoond. Het optische inzoomen zoomt rond het beeldcentrum. Nauwkeurige puntlocatie kan pas na betrouwbare kaartgeoreferentie.

## Regenmelding op het horloge

In Instellingen staat een aan/uit-schakelaar en kun je 5, 15 of 30 minuten vooraf kiezen. Beide instellingen worden onmiddellijk lokaal bewaard, zonder extra knop OPSLAAN. Bij uitschakelen wordt een eventueel gepland alarm geannuleerd.

Bij een verse voorspelling die regen aankondigt maakt de app één **persistente Zepp-alarmtaak**, die de notificatieservice kan activeren als de hoofdapp al afgesloten is. De sleutel van de voorspelde regenaanvang wordt opgeslagen om dubbele meldingen na heropenen te vermijden. Het tijdstip is gebaseerd op de bronvoorspelling, niet op de laatste weergave.

De knop **Test melding** gebruikt direct de gedocumenteerde Zepp-notificatie-API. Dat controleert de ontvangst op je eigen Balance 2; een geslaagde GitHub-build alleen bewijst niets over fysieke aflevering.

**Beperking:** dit is géén continue achtergrondbewaking van de nieuwste regenvoorspelling. De alarmmelding is gebaseerd op de laatst opgehaalde gegevens. Zepp's AppService kan wel door een alarm worden gewekt, maar heeft beperkte toegang tot netwerkfuncties. We doen geen onbevestigde belofte over automatische controles wanneer de app gesloten is.

## Codekwaliteit

Tests omvatten:
- horizon-consistentie en stale-data-gedrag;
- native swiper, schermgeometrie en grote touch targets;
- correcte opslag van locatie en notificatievoorkeuren;
- foutgevallen voor BLE-radaroverdracht;
- planning, annulering en validatie van een regenmelding.

De echte Balance 2 kan visuele verschillen tonen met de mocks. Controleer daarom na installatie alle pagina's en gebruik de testmelding om fysieke ontvangst vast te stellen.

[Buienradar — regels voor hergebruik van data](https://www.buienradar.be/overbuienradar/weerdata-op-uw-website). Buienradar geeft aan dat mobiele toepassing vooraf toestemming vereist, ook voor niet-commercieel gebruik. Dit is een onafhankelijk privéprototype; publiceer of verspreid het niet als officiële Buienradar-app.

## Installatie

Na de groene CI-build:
- [Installatie-QR](public/install-qr.png)
- [Versieoverzicht](public/latest.json)

Nieuwe sideloaded developer-appversies moeten opnieuw met de QR worden geïnstalleerd.
