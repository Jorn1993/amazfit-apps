// Buienradar's 5-minute precipitation timeline. No fabricated fallback data.
export function intensity(value) {
  if (!Number.isInteger(value) || value < 0 || value > 255)
    throw Error('Ongeldige neerslagwaarde');
  if (value === 0) return 0;
  return Math.round(Math.pow(10, (value - 109) / 32) * 1000) / 1000;
}
export function parseRaintext(input) {
  if (typeof input !== 'string' || input.length > 12000)
    throw Error('Ongeldig Buienradar-antwoord');
  const lines = input.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  if (lines.length < 20 || lines.length > 26)
    throw Error('Onvolledige neerslagverwachting');
  let previous = null;
  return lines.map(line => {
    const match = /^(\d{1,3})\|([01]\d|2[0-3]):([0-5]\d)$/.exec(line);
    if (!match) throw Error('Onbekend neerslagformaat');
    const raw = Number(match[1]), time = match[2] + ':' + match[3];
    const minute = Number(match[2]) * 60 + Number(match[3]);
    if (raw > 255 || (previous !== null && (minute - previous + 1440) % 1440 !== 5))
      throw Error('Onregelmatig 5-minuteninterval');
    previous = minute;
    return { time, raw, mmh: intensity(raw) };
  });
}
export function describe(points) {
  if (!Array.isArray(points) || !points.length) throw Error('Geen neerslagdata');
  const wet = points.map(p => p.mmh >= 0.03);
  const first = wet.indexOf(true), maximum = Math.max(...points.map(p => p.mmh));
  let headline, detail, eta = null;
  if (first === -1) {
    headline = 'HET BLIJFT DROOG'; detail = 'De komende 2 uur geen regen';
  } else if (first === 0) {
    headline = 'HET REGENT';
    const end = wet.indexOf(false);
    if (end < 0) detail = 'Voorlopig geen droge periode';
    else { eta = end * 5; detail = 'Droog over ongeveer ' + eta + ' min'; }
  } else {
    headline = 'REGEN OP KOMST'; eta = first * 5;
    detail = 'Regen over ongeveer ' + eta + ' min';
  }
  return {
    headline, detail, etaMinutes: eta, rainingNow: first === 0,
    nowMm: Math.round(points[0].mmh * 10) / 10,
    maxMm: Math.round(maximum * 10) / 10,
    totalMm: Math.round(points.reduce((n, p) => n + p.mmh * 5 / 60, 0) * 100) / 100
  };
}
export function normalLocation(loc) {
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)
    || loc.lat < 49 || loc.lat > 54 || loc.lon < 2 || loc.lon > 8)
    throw Error('Locatie buiten Benelux of ongeldig');
  const name = String(loc.name || 'GPS-locatie').trim().slice(0, 28);
  return {
    name: name || 'GPS-locatie',
    lat: Math.round(loc.lat * 10000) / 10000,
    lon: Math.round(loc.lon * 10000) / 10000
  };
}
export const REFRESH_MS = 5 * 60 * 1000;
