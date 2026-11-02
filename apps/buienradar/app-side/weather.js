// Nearest Buienradar observation station, explicitly labelled (not local forecast).
const rad=x=>x*Math.PI/180;
export function distanceKm(a,b,c,d){
 const deltaLat=rad(c-a),deltaLon=rad(d-b);
 const h=Math.sin(deltaLat/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*
  Math.sin(deltaLon/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function nearestStation(feed,location){
 const stations=feed&&feed.actual&&feed.actual.stationmeasurements;
 if(!Array.isArray(stations))return null;
 const available=stations.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon));
 if(!available.length)return null;
 let best=available[0],min=Infinity;
 for(const s of available){
  const d=distanceKm(location.lat,location.lon,s.lat,s.lon);
  if(d<min){best=s;min=d;}
 }
 // Stations can be Dutch even for a Belgian location; do not imply locality.
 if(min>125)return null;
 const valid=n=>typeof n==='number'&&Number.isFinite(n);
 const choose=(...values)=>values.find(valid)??null;
 const text=v=>typeof v==='string'?v.slice(0,30):null;
 return {station:text(best.stationname)||'Weerstation',
  distanceKm:Math.round(min),
  temperature:choose(best.temperature),
  windKmh:valid(best.windspeed)?Math.round(best.windspeed*3.6*10)/10:null,
  gustKmh:valid(best.windgusts)?Math.round(best.windgusts*3.6*10)/10:null,
  direction:text(best.winddirection),
  weatherDescription:text(best.weatherdescription)};
}
export function nextHourRain(points){
 if(!Array.isArray(points)||points.length<12)return null;
 return Math.round(points.slice(0,12).reduce((sum,p)=>
  sum+(Number.isFinite(p.mmh)?p.mmh:0)*5/60,0)*10)/10;
}
export const RADAR_BE=
 'https://image.buienradar.nl/2.0/image/single/RadarMapRainWebmercatorBE'+
 '?height=320&width=320&renderBackground=True'+
 '&renderBranding=False&renderText=False';
