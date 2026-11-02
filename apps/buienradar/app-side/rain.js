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
export function describe(points, minutes=120) {
  if (![60,120].includes(minutes)) throw Error('Onbekende vooruitzichtperiode');
  if (!Array.isArray(points) || points.length < minutes / 5)
    throw Error('Onvolledige neerslagperiode');
  const scope = points.slice(0,minutes / 5);
  const wet = scope.map(p=>Number.isFinite(p.mmh)&&p.mmh >= 0.03);
  const first=wet.indexOf(true),max=Math.max(...scope.map(p=>p.mmh||0));
  const total=Math.round(scope.reduce((n,p)=>n+(p.mmh||0)*5/60,0)*100)/100;
  let headline,detail,state,eta=null,endMinutes=null;
  if(first<0){
    state='dry';headline='HET BLIJFT DROOG';
    detail=minutes===60?'Geen regen komend uur':'Geen regen komende 2 uur';
  }else if(first===0){
    state='raining';headline='HET REGENT';
    const end=wet.indexOf(false);
    endMinutes=end<0?null:end*5;
    detail=endMinutes===null?'Regen blijft aanhouden':
      'Droog over '+endMinutes+' min';
  }else{
    state='incoming';eta=first*5;headline='REGEN OP KOMST';
    detail='Regen over '+eta+' min';
  }
  return {
    state,headline,detail,etaMinutes:eta,endMinutes,
    rainingNow:first===0,windowMinutes:minutes,
    nowMm:Math.round((scope[0].mmh||0)*10)/10,
    maxMm:Math.round(max*10)/10,totalMm:total
  };
}
// Server-side source timestamp must be sane before callers may call it "current".
export function freshForecast(data,now=Date.now(),ttlMs=8*60*1000){
  return Boolean(data&&data.ok===true&&Number.isFinite(data.updatedAt)&&
    data.updatedAt<=now+60000&&now-data.updatedAt>=0&&
    now-data.updatedAt<=ttlMs&&Array.isArray(data.points)&&data.points.length>=24);
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
