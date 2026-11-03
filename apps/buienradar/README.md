# Buienradar for Amazfit Balance 2

**1.0.3 · Zepp OS 3 · privéprototype**

## Radar: uitsluitend toekomstige beelden, zonder GitHub

De radar toont een **+3 uur-neerslagvoorspelling van het Koninklijk Meteorologisch Instituut (KMI)**. We gebruiken bewust een andere kaartbron dan de lokale neerslagvoorspelling van Buienradar: de officiële Buienradar-voorspelling is wel als geanimeerde GIF beschikbaar, maar niet als afzonderlijke PNG's, en de Zepp Side Service kan die GIF niet rechtstreeks decoderen. KMI publiceert een reeks afzonderlijke PNG-overlays met echte toekomstige tijdstippen.

De dataflow is **horloge ↔ Zepp op telefoon ↔ KMI**, zonder GitHub tijdens het gebruik. De telefoon haalt de KMI-tijdlijn en de gekozen PNG-overlays rechtstreeks op, zet de overlays om naar het Zepp-formaat en verstuurt ze via Bluetooth. De kaartachtergrond voor België zit in het installatiepakket. Een nieuwe reeks wordt tijdens het gebruik periodiek opgehaald. Vanaf 1.0.1 start de verversing vóór de 12-minutengrens. Een nog geldige toekomst-overlay blijft zichtbaar tijdens downloaden en Bluetooth-overdracht van de vervangende reeks. Zodra de geldigheidsduur verstrijkt verdwijnt de overlay ook zonder internet.

**Geen oude radar als fallback.** Alleen afbeeldingen met een tijdstip ná nu en met een recent ontvangen voorspelling mogen worden getoond. Een in de app opgeslagen, geldige reeks van minder dan 12 minuten oud kan direct bij het openen getoond worden. Zonder zo'n cache is de ondergrond zichtbaar terwijl de eerste PNG gedownload en via BLE doorgestuurd wordt; bij netwerkfouten blijft de overlay leeg, met een herhaalactie. Een *actuele* voorspelling bij een volledig koude start kan niet fysiek instant zijn.

De **tijd** onderaan is het voorspelde tijdstip van het zichtbare frame; niet de tijd waarop de foto werd gedownload. Dit is een toekomstvoorspelling, geen historische waarnemingsanimatie. De radar gebruikt het Belgische KMI-overzicht en de app staat voor KMI als bron vermeld, niet alsof Buienradar deze kaart levert.

**Belangrijk:** de KMI-app-API is niet publiek stabiel gedocumenteerd. De PNG-API en de mapuitlijning zijn op een echte server gecontroleerd, maar overdracht en daadwerkelijke frameweergave op een fysiek Balance 2 zijn nog niet bevestigd. De volledige beweging op het horloge werkt alleen zodra meer dan één frame via Bluetooth ontvangen is.

## Telefoonverbinding (1.0.2)

Versie 1.0.2 herstelt de directe `BasePage.request()`-aanroepen voor regen, weer, locatie en radarmetadata. De oude `this.messaging.request()` bestaat niet in de publieke ZML BasePage API en veroorzaakte een appbrede datastoring. De regenpagina toont nu de werkelijke foutreden in plaats van een generieke melding. Dit is nog geen bevestiging van correcte aflevering op een fysiek horloge.

**Bronkeuze:** de huidige KMI-radar is niet de gewenste Buienradar-animatie. Deze code wordt niet als oplossing voor de echte Buienradar +3u-radar beschouwd: de officiële Buienradar-GIF vraagt een betrouwbare frameconverter voordat Zepp de toekomstige frames als afbeeldingen kan tonen.

## Buienradar GIF-compatibiliteitsproef (1.0.3)

In **Instellingen → GIF-test** kan de gebruiker nu de officiële Buienradar Belgium +3u-GIF via de Zepp-telefoonservice downloaden en door de native `image.convert()` laten verwerken. Het horloge toont `GIF gelezen` of de echte fout (bijvoorbeeld `GIF-CONVERT`). Dit is uitdrukkelijk **geen bewijs dat de animatie kan worden afgespeeld**: zelfs een geslaagde conversie kan alleen het eerste frame opleveren. De volledige Buienradar GIF-naar-frames-implementatie blijft een open issue. CI-tests gebruiken mocks en kunnen de native decoder niet valideren.

## De andere schermen

- **Regen**: neerslagverwachting voor één of twee uur uit Buienradars officiële regenpunten voor de gekozen locatie, met een compacte grafiek.
- **Weer**: actuele temperatuur, wind en neerslaghoeveelheid uit Buienradars metingen/regenpunten.
- **Instellingen**: rechtstreeks op het horloge, inclusief locatie en optionele regenmeldingen. Geen losse Zepp-instellingenpagina.
- **Widget links op het horloge**: dezelfde kaart met alleen een nog geldige toekomstige KMI-overlay uit de horlogecache; nooit een ingebouwde oude radarafbeelding.

De lokale neerslag en actuele weersinformatie blijven rechtstreeks bij **Buienradar** vandaan komen. De neerslagkaart is **KMI**. De widget kan het internet niet zelfstandig via de Zepp-telefoonservice vernieuwen; open de hoofdapp om nieuwe radarbeelden te halen.

## Regenmeldingen

Optioneel, met 5/15/30 minuten voorsprong. Een gepland alarm is gebaseerd op de laatst ontvangen Buienradar-regenverwachting. Dit is **geen constante weerscontrole in de achtergrond**. De testknop op het horloge stuurt een afzonderlijke Zepp-notificatie; een geslaagde build bewijst niet dat deze op het horloge afgeleverd is.

## Installatie en distributie

[Vaste QR-code voor alle versies](public/install-qr.png) · [Altijd nieuwste ZPK](public/buienradar-latest.zpk) · [Versie-informatie](public/latest.json).

De QR-code bevat voortaan een **vaste URL** naar `buienradar-latest.zpk`. Nieuwe builds overschrijven dit bestand op dezelfde URL en bewaren daarnaast het genummerde pakket. De QR-inhoud verandert dus niet meer bij iedere nieuwe versie; opnieuw scannen blijft nodig om een developer-update te installeren. GitHub Raw kan het bestand kort cachen: gebruik bij vertraging de versiegebonden ZPK uit `latest.json`.

GitHub wordt enkel gebruikt om de Zepp-app te **bouwen en als ZPK te verspreiden**. Geen GitHub-link, GH Actions, GitHub API of radar-cache is tijdens het draaien van de app nodig. Een nieuwe developer-build moet opnieuw geïnstalleerd worden; automatische ZPK-updates zijn niet beschikbaar.

### Bronnen en rechten

- Radarlagen: KMI, via de mobiele \`getForecasts\`/\`getIncaImage\`-service van \`app.meteo.be\`. Deze reverse-engineerde API heeft geen gegarandeerde compatibiliteit, servicevoorwaarden of distributierecht.
- Statische Belgische kaartachtergrond: \`be_black.png\` uit [jdejaegh/irm-kmi-ha](https://github.com/jdejaegh/irm-kmi-ha), MIT-licentie, copyright © 2023–2026 Jules Dejaeghere. [MIT-licentietekst](https://github.com/jdejaegh/irm-kmi-ha/blob/main/LICENSE).
- Regenverwachting en weerdata: [Buienradar](https://www.buienradar.be/overbuienradar/weerdata-op-uw-website). Voor toepassingen in mobiele apps kunnen toestemming en bronvermelding vereist zijn.

Dit is een onafhankelijk prototype voor privégebruik. Het is niet officieel gelieerd aan Buienradar of KMI. Publicatie of verspreiding zonder toestemming van de betrokken dataleveranciers wordt niet aanbevolen.
