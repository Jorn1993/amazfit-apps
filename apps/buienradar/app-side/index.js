import {BaseSideService} from '@zeppos/zml/base-side';
import {parseRaintext,describe,normalLocation,REFRESH_MS} from './rain.js';
import {nearestStation,nextHourRain,RADAR_BE} from './weather.js';

const ENDPOINTS=['https://gpsgadget.buienradar.nl/data/raintext/',
 'https://gps.buienradar.nl/getrr.php'];
const WEATHER_FEED='https://data.buienradar.nl/2.0/feed/json';
let rainCache=null,weatherCache=null,radarBusy=false,radarAt=0;
function responseBody(result){
 const b=result&&result.body;
 if(typeof b==='string')return b;
 if(b&&typeof b.data==='string')return b.data;
 throw Error('Ongeldig Buienradar antwoord');
}
function resultStatus(r){return Number(r&&((r.status??r.statusCode)??0));}
async function readRain(location){
 const query='lat='+encodeURIComponent(location.lat)+'&lon='+encodeURIComponent(location.lon);
 for(const host of ENDPOINTS){
  try{
   const result=await fetch({url:host+'?'+query,method:'GET',
    headers:{Accept:'text/plain'}});
   if(resultStatus(result)===200)return parseRaintext(responseBody(result));
  }catch(_){}
 }
 throw Error('Neerslagbron tijdelijk niet bereikbaar');
}
function selectedLocation(){
 try{
  const raw=settings.settingsStorage.getItem('buienradar.location');
  return normalLocation(raw?JSON.parse(raw):
   {name:'Antwerpen',lat:51.2194,lon:4.4025});
 }catch(_){return normalLocation({name:'Antwerpen',lat:51.2194,lon:4.4025});}
}
async function weather(location){
 if(weatherCache&&Date.now()-weatherCache.at<10*60*1000)
  return nearestStation(weatherCache.feed,location);
 try{
  const r=await fetch({url:WEATHER_FEED,method:'GET',
   headers:{Accept:'application/json'}});
  if(resultStatus(r)!==200)throw Error('No weather feed');
  const body=r.body&&typeof r.body==='object'?r.body:JSON.parse(responseBody(r));
  if(!body||!body.actual||!Array.isArray(body.actual.stationmeasurements))
   throw Error('Invalid weather feed');
  weatherCache={at:Date.now(),feed:body};
  return nearestStation(body,location);
 }catch(_){return null;}
}
async function forecast(location){
 const now=Date.now(),key=location.lat+','+location.lon;
 if(rainCache&&rainCache.key===key&&now-rainCache.at<REFRESH_MS)
  return {...rainCache.payload,cached:true};
 const points=await readRain(location);
 const station=await weather(location);
 const payload={ok:true,location,points,summary:describe(points),
  nextHourMm:nextHourRain(points),station,updatedAt:now};
 rainCache={key,at:now,payload};
 return {...payload,cached:false};
}
function downloadRadar(){
 return new Promise((resolve,reject)=>{
  if(typeof network==='undefined'||!network.downloader)
   return reject(Error('Downloader unavailable'));
  const task=network.downloader.downloadFile({
   url:RADAR_BE+'&t='+Math.floor(Date.now()/300000),timeout:25000,
   filePath:'data://download/buienradar-map.png'
  });
  task.onSuccess=event=>{
   if(event.statusCode!==200)return reject(Error('Radar HTTP '+event.statusCode));
   resolve(event.filePath||event.tempFilePath);
  };
  task.onFail=()=>reject(Error('Radar download unavailable'));
 });
}
async function sendRadar(){
 if(radarBusy)return {ok:true,queued:true};
 if(radarAt&&Date.now()-radarAt<REFRESH_MS)return {ok:true,cached:true};
 radarBusy=true;
 try{
  const downloaded=await downloadRadar();
  if(typeof image==='undefined'||typeof transferFile==='undefined')
   throw Error('Native Zepp file transfer unavailable');
  const converted=await image.convert({
   filePath:downloaded,targetFilePath:'data://download/buienradar-map-converted.png'
  });
  const path=converted&&converted.targetFilePath;
  if(!path)throw Error('Radar conversion failed');
  const object=transferFile.getOutbox().enqueueFile(path,{
   kind:'buienradar-radar',updatedAt:Date.now()
  });
  if(!object)throw Error('Radar transfer queue failed');
  radarAt=Date.now();
  return {ok:true,queued:true};
 }finally{radarBusy=false;}
}
AppSideService(BaseSideService({
 async onRequest(req,res){
  try{
   if(!req)throw Error('Missing request');
   if(req.method==='radar.refresh'){
    // Fire and forget: file transfer can finish after the response.
    void sendRadar().catch(()=>{});
    res(null,{ok:true,requested:true});return;
   }
   if(req.method!=='rain.forecast')
    throw Error('Unsupported request');
   const loc=req.params&&req.params.gps?
    normalLocation({...req.params.gps,name:'GPS-locatie'}):selectedLocation();
   res(null,await forecast(loc));
  }catch(_){
   res(null,{ok:false,error:'Buienradar niet bereikbaar. Probeer opnieuw.'});
  }
 }
}));
