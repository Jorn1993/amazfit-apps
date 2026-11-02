import { BaseSideService } from '@zeppos/zml/base-side';
import { parseRaintext, describe, normalLocation, REFRESH_MS } from './rain.js';
const ENDPOINTS = [
  'https://gpsgadget.buienradar.nl/data/raintext/',
  'https://gps.buienradar.nl/getrr.php'
];
let cached = null;
function responseText(response) {
  const body = response && response.body;
  if (typeof body === 'string') return body;
  if (body && typeof body.data === 'string') return body.data;
  throw Error('Geen tekstdata ontvangen');
}
async function download(location) {
  const params = 'lat=' + encodeURIComponent(location.lat) +
    '&lon=' + encodeURIComponent(location.lon);
  for (const url of ENDPOINTS) {
    try {
      const response = await fetch({url: url + '?' + params, method: 'GET',
        headers: {'Accept': 'text/plain'}});
      if (Number(response.status || response.statusCode) !== 200)
        continue;
      return parseRaintext(responseText(response));
    } catch (_) { /* Some hosts reject non-browser clients; try second host. */ }
  }
  throw Error('Regengegevens niet bereikbaar');
}
function selectedLocation() {
  try {
    const raw = settings.settingsStorage.getItem('buienradar.location');
    return raw ? normalLocation(JSON.parse(raw)) :
      normalLocation({name:'Antwerpen',lat:51.2194,lon:4.4025});
  } catch (_) { return null; }
}
async function forecast(location) {
  const key = location.lat + ',' + location.lon, now = Date.now();
  if (cached && cached.key === key && now >= cached.at &&
    now - cached.at < REFRESH_MS) return {...cached.payload, cached: true};
  const points = await download(location);
  const payload = {ok:true, location, points, summary:describe(points), updatedAt:now};
  cached = {key, at:now, payload};
  return {...payload, cached:false};
}
AppSideService(BaseSideService({
  async onRequest(req, res) {
    if (!req || req.method !== 'rain.forecast') {
      res(null, {ok:false, error:'Onbekende aanvraag'}); return;
    }
    try {
      // GPS must be explicitly requested from the watch.
      const location = req.params && req.params.gps
        ? normalLocation({...req.params.gps, name:'GPS-locatie'})
        : selectedLocation();
      if (!location) {
        res(null,{ok:false,error:'Kies een stad in Zepp of tik GPS'});return;
      }
      res(null,await forecast(location));
    } catch (_) {
      res(null,{ok:false,error:'Buienradar niet bereikbaar. Vernieuw later.'});
    }
  }
}));
