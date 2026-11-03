import {BaseSideService} from '@zeppos/zml/base-side';
import {parseRaintext,describe,normalLocation,REFRESH_MS} from './rain.js';
import {nearestStation,nextHourRain} from './weather.js';
import {RADAR_CACHE_BASE,parseFrameManifest,frameUrl} from './radar-feed.js';

const ENDPOINTS=['https://gpsgadget.buienradar.nl/data/raintext/',
 'https://gps.buienradar.nl/getrr.php'];
const WEATHER_FEED='https://data.buienradar.nl/2.0/feed/json';
// Official current single-image endpoint; independent of GitHub cron.
// Use when the verified animated feed is missing or older than 35 minutes.
// renderText=False: the single image has no misleading historical time label.
// The Belgium Buienradar documentation explicitly publishes PNG via the
// /image/animation endpoint. The /image/single variant is a compatibility
// backup if that PNG resource cannot be converted by Zepp.
const RADAR_SINGLE='https://image.buienradar.nl/2.0/image/animation/RadarMapRainWebmercatorBE'+
 '?height=320&width=320&extension=png&renderBackground=True&renderBranding=False&renderText=False';
const RADAR_SINGLE_BACKUP='https://image.buienradar.nl/2.0/image/single/RadarMapRainWebmercatorBE'+
 '?height=320&width=320&renderBackground=True&renderBranding=False&renderText=False';

let rainCache=null,weatherCache=null;
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
 const payload={ok:true,location,points,summary:describe(points,120),
  summary1h:describe(points,60),summary2h:describe(points,120),
  nextHourMm:nextHourRain(points),station,updatedAt:now};
 rainCache={key,at:now,payload};
 return {...payload,cached:false};
}
// Actual Buienradar animated GIF is decoded by GitHub Actions into PNG frames.
// Side Service can ONLY convert PNG, not GIF (Zepp OS limitation).
let radarBusy=false,radarGeneration=0,radarTask=null,radarManifest=null;
let radarState={stage:'idle',error:null,requestId:0,frameIndex:-1,updatedAt:0};
function updateRadar(stage,error=null,id=radarGeneration,index=radarState.frameIndex){
 if(id!==radarGeneration)return;
 radarState={stage,error,requestId:id,frameIndex:index,updatedAt:Date.now()};
 try{console.log('[Radar frames]',stage,'frame',index,error||'');}catch(_){}
}
function bounded(promise,ms,step,cancel){
 return new Promise((resolve,reject)=>{
  let done=false;
  const timer=setTimeout(()=>{
   if(done)return;done=true;
   try{if(cancel)cancel();}catch(_){}
   reject(Error(step+': timeout'));
  },ms);
  Promise.resolve(promise).then(data=>{
   if(done)return;done=true;clearTimeout(timer);resolve(data);
  },err=>{
   if(done)return;done=true;clearTimeout(timer);reject(err);
  });
 });
}
async function latestRadarManifest(){
 // Bust the CDN cache for mutable manifest references.
 const url=RADAR_CACHE_BASE+'/manifest.json?checked='+Math.floor(Date.now()/60000);
 const response=await fetch({url,method:'GET'});
 if(resultStatus(response)!==200)throw Error('CACHE: HTTP '+resultStatus(response));
 return parseFrameManifest(response.body);
}
function downloadFrame(url,index,id){
 return bounded(new Promise((resolve,reject)=>{
  if(typeof network==='undefined'||!network.downloader)
   return reject(Error('DOWNLOAD: Zepp downloader ontbreekt'));
  try{
   const task=network.downloader.downloadFile({
    url,timeout:20000,
    filePath:'data://download/br-frame-'+id+'-'+index+'.png'
   });
   radarTask=task;
   task.onSuccess=event=>{
    if(Number(event&&event.statusCode)!==200)
     reject(Error('DOWNLOAD: HTTP '+String(event&&event.statusCode||'?')));
    else if(!(event.filePath||event.tempFilePath))
     reject(Error('DOWNLOAD: geen bestand'));
    else resolve(event.filePath||event.tempFilePath);
   };
   task.onFail=event=>reject(Error('DOWNLOAD: '+String(event&&event.message||'netwerkfout')));
  }catch(err){reject(Error('DOWNLOAD: '+String(err&&err.message||err)));}
 }),25000,'DOWNLOAD',()=>{try{radarTask?.cancel?.();}catch(_){}});
}
function waitForTransfer(file){
 return bounded(new Promise((resolve,reject)=>{
  if(!file||typeof file.on!=='function')
   return reject(Error('TRANSFER: file object ontbreekt'));
  const check=state=>{
   if(state==='transferred')resolve();
   if(state==='error'||state==='canceled')reject(Error('TRANSFER: '+state));
  };
  file.on('change',event=>check(event&&event.data&&event.data.readyState||file.readyState));
  check(file.readyState);
 }),37000,'TRANSFER',()=>{try{file?.cancel?.();}catch(_){}});
}
async function sendFrame(index,id,snapshot=null){
 try{
  const file=snapshot?null:radarManifest.frames[index];
  updateRadar('download',null,id,index);
  const urls=snapshot?[
   RADAR_SINGLE+'&checked='+Math.floor(Date.now()/300000),
   RADAR_SINGLE_BACKUP+'&checked='+Math.floor(Date.now()/300000)
  ]:[frameUrl(file)+'?version='+encodeURIComponent(radarManifest.generatedAt)];
  let converted=null,lastError=null;
  for(const url of urls){
   try{
    const raw=await downloadFrame(url,index,id);
    updateRadar('convert',null,id,index);
    if(typeof image==='undefined'||typeof image.convert!=='function')
     throw Error('CONVERT: Zepp image converter ontbreekt');
    converted=await bounded(image.convert({filePath:raw}),15000,'CONVERT');
    if(converted?.targetFilePath)break;
   }catch(e){lastError=e;converted=null;}
  }
  if(!converted?.targetFilePath){
   const message=String(lastError&&lastError.message||'geen bruikbare PNG');
   throw Error(/^(?:DOWNLOAD|CONVERT):/.test(message)?
    message:'CONVERT: '+message);
  }
  updateRadar('transfer',null,id,index);
  if(typeof transferFile==='undefined'||typeof transferFile.getOutbox!=='function')
   throw Error('TRANSFER: Zepp Side Service ontbreekt');
  const outbox=transferFile.getOutbox();
  if(!outbox?.enqueueFile)throw Error('TRANSFER: ontbrekende outbox');
  const task=outbox.enqueueFile(converted.targetFilePath,{
   kind:snapshot?'buienradar-snapshot':'buienradar-frame',
   frameIndex:index,requestId:id,
   generatedAt:snapshot||radarManifest.generatedAt
  });
  await waitForTransfer(task);
  updateRadar('transferred',null,id,index);
 }catch(e){
  updateRadar('failed',String(e&&e.message||e).slice(0,100),id,index);
 }finally{radarBusy=false;radarTask=null;}
}
function beginFrame(index){
 if(radarBusy)return {...radarState,ok:false,error:'FRAME: overdracht bezig'};
 if(!radarManifest||index<0||index>=radarManifest.frameCount)
  return {ok:false,error:'FRAME: ongeldige reeks'};
 radarBusy=true;const id=++radarGeneration;
 updateRadar('starting',null,id,index);
 void sendFrame(index,id);
 return {...radarState,ok:true};
}
function beginSnapshot(){
 if(radarBusy)return {ok:false,error:'SNAPSHOT: overdracht bezig'};
 radarBusy=true;
 const id=++radarGeneration;
 const stamp=new Date().toISOString();
 updateRadar('snapshot',null,id,0);
 void sendFrame(0,id,stamp);
 return {ok:true,generatedAt:stamp,requestId:id};
}
function currentRadarState(){
 if(radarBusy&&Date.now()-radarState.updatedAt>75000){
  updateRadar('failed','FRAME: time-out');
  radarBusy=false;
 }
 return {...radarState,ok:true};
}
AppSideService(BaseSideService({
 async onRequest(req,res){
  try{
   if(!req)throw Error('Missing request');
   if(req.method==='config.get'){
    res(null,{ok:true,location:selectedLocation()});return;
   }
   if(req.method==='config.set'){
    const loc=normalLocation(req.params&&req.params.location);
    settings.settingsStorage.setItem('buienradar.location',JSON.stringify(loc));
    rainCache=null;
    res(null,{ok:true,location:loc});return;
   }
   if(req.method==='radar.manifest'){
    try{radarManifest=await latestRadarManifest();res(null,radarManifest);}
    catch(e){res(null,{ok:false,error:'CACHE: '+String(e&&e.message||e).slice(0,70)});}
    return;
   }
   if(req.method==='radar.frame'){
    res(null,beginFrame(Number(req.params&&req.params.index)));return;
   }
   if(req.method==='radar.snapshot'){
    res(null,beginSnapshot());return;
   }
   if(req.method==='radar.status'){
    res(null,currentRadarState());return;
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
