import {BaseSideService} from '@zeppos/zml/base-side';
import {parseRaintext,describe,normalLocation,REFRESH_MS} from './rain.js';
import {nearestStation,nextHourRain,RADAR_BE} from './weather.js';

const ENDPOINTS=['https://gpsgadget.buienradar.nl/data/raintext/',
 'https://gps.buienradar.nl/getrr.php'];
const WEATHER_FEED='https://data.buienradar.nl/2.0/feed/json';
let rainCache=null,weatherCache=null;
let radarBusy=false,radarLastDelivered=0,radarTransfer=null;
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
// Radar URL originates from Buienradar's own official PNG image service.
function downloadRadar(){
 return new Promise((resolve,reject)=>{
  if(typeof network==='undefined'||!network.downloader){
   reject(Error('DOWNLOAD: Zepp downloader niet beschikbaar'));return;
  }
  try{
   const task=network.downloader.downloadFile({
    url:RADAR_BE+'&_v='+Math.floor(Date.now()/300000),
    timeout:22000,
    filePath:'data://download/buienradar-radar-'+Date.now()+'.png'
   });
   task.onSuccess=event=>{
    if(!event||Number(event.statusCode)!==200){
     reject(Error('DOWNLOAD: HTTP '+String(event&&event.statusCode||'?')));return;
    }
    const path=event.filePath||event.tempFilePath;
    if(!path){reject(Error('DOWNLOAD: geen bestand ontvangen'));return;}
    resolve(path);
   };
   task.onFail=event=>reject(Error('DOWNLOAD: netwerkfout '+String(event&&event.code||'')));
  }catch(_){reject(Error('DOWNLOAD: Zepp downloadfout'));}
 });
}
function waitForTransfer(file){
 return new Promise((resolve,reject)=>{
  if(!file||typeof file.on!=='function'){
   reject(Error('OVERDRACHT: geen bestandsobject'));return;
  }
  let done=false;
  const timeout=setTimeout(()=>{
   if(done)return;done=true;
   try{if(typeof file.cancel==='function')file.cancel();}catch(_){}
   reject(Error('OVERDRACHT: time-out'));
  },35000);
  const finish=(error)=>{
   if(done)return;done=true;clearTimeout(timeout);
   if(error)reject(Error(error));else resolve();
  };
  file.on('change',event=>{
   const state=(event&&event.data&&event.data.readyState)||file.readyState;
   if(state==='transferred')finish();
   else if(state==='error'||state==='canceled')finish('OVERDRACHT: '+state);
  });
  if(file.readyState==='transferred')finish();
 });
}
async function sendRadar(){
 if(radarBusy)throw Error('Radaroverdracht is al bezig');
 // Always transfer to the CURRENT watch app session; a previous transfer is not a cache hit.
 radarBusy=true;
 try{
  const path=await downloadRadar();
  if(typeof image==='undefined'||typeof image.convert!=='function')
   throw Error('OMZETTEN: Zepp afbeeldingsconverter ontbreekt');
  let converted;
  try{converted=await image.convert({filePath:path});}
  catch(_){throw Error('OMZETTEN: radarbeelddownload is geen bruikbare PNG');}
  if(!converted||!converted.targetFilePath)
   throw Error('OMZETTEN: geen uitvoerbestand');
  if(typeof transferFile==='undefined'||typeof transferFile.getOutbox!=='function')
   throw Error('OVERDRACHT: Zepp telefoonservice ontbreekt');
  const outbox=transferFile.getOutbox();
  if(!outbox||typeof outbox.enqueueFile!=='function')
   throw Error('OVERDRACHT: wachtrij niet beschikbaar');
  const file=outbox.enqueueFile(converted.targetFilePath,
   {kind:'buienradar-radar',updatedAt:Date.now()});
  radarTransfer=file;
  await waitForTransfer(file);
  radarLastDelivered=Date.now();
  return {ok:true,transferred:true};
 }finally{radarBusy=false;radarTransfer=null;}
}
AppSideService(BaseSideService({
 async onRequest(req,res){
  try{
   if(!req)throw Error('Missing request');
   if(req.method==='radar.refresh'){
    // Return only after an actual transfer or a concrete failure.
    try{res(null,await sendRadar());}
    catch(e){res(null,{ok:false,error:String(e&&e.message||e).slice(0,100)});}
    return;
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
