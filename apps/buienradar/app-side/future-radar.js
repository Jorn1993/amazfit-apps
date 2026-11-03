// Direct forecast PNGs from the Belgian Royal Meteorological Institute (KMI).
// This is an independently sourced three-hour outlook, NOT Buienradar's GIF.
// The KMI mobile endpoint is undocumented and can change without notice.
import md5 from 'js-md5';

const API='https://app.meteo.be/services/appv4/';
const KMI_KEY_SEED='r9EnW374jkJ9acc';
export function kmiDate(date=new Date()){
 const formatter=new Intl.DateTimeFormat('en-GB',{
  day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Brussels'
 });
 const parts=formatter.formatToParts(date);
 const part=name=>parts.find(p=>p.type===name)?.value;
 return part('day')+'/'+part('month')+'/'+part('year');
}
export function kmiForecastUrl(location,date=new Date()){
 const key=md5(KMI_KEY_SEED+';getForecasts;'+kmiDate(date));
 const lat=Number(location.lat),lon=Number(location.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon))throw Error('Geen geldige locatie');
 return API+'?s=getForecasts&l=nl&lat='+encodeURIComponent(lat)+
  '&long='+encodeURIComponent(lon)+'&k='+key;
}
export function parseFutureFrames(raw,now=Date.now()){
 const body=typeof raw==='string'?JSON.parse(raw):raw;
 const animations=Array.isArray(body?.animation)?body.animation:[body?.animation];
 const items=animations.flatMap(a=>Array.isArray(a?.sequence)?a.sequence:[]);
 const all=items.map(x=>({
  time:x.time,validAt:Date.parse(x.time),
  uri:x.uri,mm:Number(x.value)
 })).filter(x=>Number.isFinite(x.validAt)&&
  x.validAt>now&&x.validAt<=now+3*3600000+10*60000&&
  typeof x.uri==='string'&&x.uri.startsWith(API)&&
  x.uri.includes('s=getIncaImage'));
 all.sort((a,b)=>a.validAt-b.validAt);
 if(all.length<3||all[0].validAt-now>30*60000)
  throw Error('Geen actuele toekomstige radarframes');
 // Nine frames over the full future interval, avoiding an excessive BLE backlog.
 const count=Math.min(9,all.length);
 const selected=[];
 for(let i=0;i<count;i++){
  const idx=Math.round(i*(all.length-1)/(count-1));
  if(!selected.some(x=>x.validAt===all[idx].validAt))selected.push(all[idx]);
 }
 return selected;
}
