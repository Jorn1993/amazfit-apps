import {BaseSideService} from '@zeppos/zml/base-side';
import {parseRaintext,describe,normalLocation,REFRESH_MS} from './rain.js';
import {nearestStation,nextHourRain} from './weather.js';
import {BuienradarGif} from '../page/gif-decoder.js';
import {encodeRgbPng} from './frame-png.js';

const ENDPOINTS=['https://gpsgadget.buienradar.nl/data/raintext/',
 'https://gps.buienradar.nl/getrr.php'];
const WEATHER_FEED='https://data.buienradar.nl/2.0/feed/json';
// Only Buienradar's Belgian precipitation forecast: current and future,
// no historical frames and no third-party radar source or GitHub runtime dependency.
const BUIENRADAR_GIF='https://image.buienradar.nl/2.0/image/animation/'+
 'RadarMapRainWebmercatorBE?height=320&width=320&renderBackground=True'+
 '&renderBranding=False&renderText=True&History=0&Forecast=19&skip=1';
const BUIENRADAR_CURRENT='https://image.buienradar.nl/2.0/image/single/'+
 'RadarMapRainBE?width=480&height=480&renderBackground=True'+
 '&renderBranding=False&renderText=False';

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
// The original GIF is decoded on the PHONE. Every future frame becomes
// standards-compliant PNG, converted with the OFFICIAL image.convert API,
// then transferred to the watch. Homemade Zepp TGA files were visually
// corrupt on Balance 2 and are never sent again.
let radarBusy=false,radarTask=null,radarGeneration=0;
let radarState={stage:'idle',error:null,updatedAt:0,snapshotError:null};
function radarProgress(stage,error=null){
 radarState={...radarState,stage,error,updatedAt:Date.now()};
}
function limited(job,ms,step,cancel){
 return new Promise((resolve,reject)=>{
  let ended=false;
  const timer=setTimeout(()=>{
   if(ended)return;ended=true;
   try{cancel?.();}catch(_){}
   reject(Error(step+': time-out'));
  },ms);
  Promise.resolve(job).then(value=>{
   if(ended)return;ended=true;clearTimeout(timer);resolve(value);
  },error=>{
   if(ended)return;ended=true;clearTimeout(timer);reject(error);
  });
 });
}
function downloadRadarFile(uri,filePath,timeout=28000){
 return limited(new Promise((resolve,reject)=>{
  if(!network?.downloader?.downloadFile)
   return reject(Error('DOWNLOAD: niet beschikbaar'));
  try{
   radarTask=network.downloader.downloadFile({
    url:uri,filePath,timeout
   });
   radarTask.onSuccess=ev=>{
    if(Number(ev?.statusCode)!==200)
     reject(Error('DOWNLOAD: HTTP '+ev?.statusCode));
    else if(!ev.filePath&&!ev.tempFilePath)
     reject(Error('DOWNLOAD: bestand ontbreekt'));
    else resolve(ev.filePath||ev.tempFilePath);
   };
   radarTask.onFail=ev=>reject(Error('DOWNLOAD: '+(ev?.message||'netwerk')));
  }catch(e){reject(Error('DOWNLOAD: '+String(e.message||e)));}
 }),timeout+5000,'DOWNLOAD',()=>{try{radarTask?.cancel?.();}catch(_){}});
}
function awaitTransfer(task){
 return limited(new Promise((resolve,reject)=>{
  if(!task||typeof task.on!=='function')
   return reject(Error('TRANSFER: geen taak'));
  const check=state=>{
   if(state==='transferred')resolve();
   else if(state==='error'||state==='canceled')
    reject(Error('TRANSFER: '+state));
  };
  task.on('change',event=>check(event?.data?.readyState||task.readyState));
  check(task.readyState);
 }),65000,'TRANSFER',()=>{try{task?.cancel?.();}catch(_){}});
}
async function sendFile(path,params){
 const outbox=transferFile?.getOutbox?.();
 if(!outbox?.enqueueFile)throw Error('TRANSFER: Zepp outbox ontbreekt');
 const task=outbox.enqueueFile(path,params);
 await awaitTransfer(task);
}
async function deliverBuienradarGif(generation){
 try{
  // First render something genuine on the watch. This is the *current*
  // Buienradar observation image, never mislabelled as forecast.
  try{
   radarProgress('snapshot-download');
   const png=await downloadRadarFile(
    BUIENRADAR_CURRENT+'&fresh='+Math.floor(Date.now()/300000),
    'data://download/buienradar-current-'+generation+'.png');
   if(!image?.convert)throw Error('CONVERT: niet beschikbaar');
   radarProgress('snapshot-convert');
   const native=await limited(image.convert({
    filePath:png,targetFilePath:'data://download/buienradar-current-'+generation+'-native.png'
   }),22000,'CONVERT');
   if(!native?.targetFilePath)throw Error('CONVERT: geen afbeelding');
   radarProgress('snapshot-transfer');
   await sendFile(native.targetFilePath,{
    kind:'buienradar-current-frame',source:'Buienradar',fetchedAt:Date.now(),
    generation
   });
  }catch(e){
   radarState={...radarState,snapshotError:String(e?.message||e).slice(0,90)};
  }
  radarProgress('gif-download');
  const path=await downloadRadarFile(
   BUIENRADAR_GIF+'&fresh='+Math.floor(Date.now()/300000),
   'data://download/buienradar-'+generation+'.gif',35000);
  // The Zepp Side Service file system accepts binary ArrayBuffer.
  // Do not assume the network response body contains GIF data: downloader
  // writes the source to a file, and fs.readFile reads that local file.
  if(typeof fs==='undefined'||!fs?.readFile||!fs?.writeFile)
   throw Error('GIF: Zepp-bestandssysteem niet beschikbaar');
  radarProgress('gif-read');
  const source=await limited(fs.readFile(path),20000,'GIF READ');
  const bytes=source?.data??source?.buffer??source;
  if(!bytes||(typeof bytes!=='object'))
   throw Error('GIF: geen binaire data uit telefoonopslag');
  const gif=new BuienradarGif(bytes);
  if(gif.width!==320||gif.height!==320)
   throw Error('GIF: onverwachte Buienradar afmetingen');
  let index=0,delivered=0;
  let frame;
  while((frame=gif.nextFrame())!==null){
   // All 17 genuine GIF frames are decoded. Transfer nine evenly spaced
   // forecast timestamps to limit Bluetooth traffic while preserving motion.
   const select=index===0||index%2===0;
   if(select){
    const frameNumber=index;
    radarProgress('gif-png-'+frameNumber);
    const pngBytes=encodeRgbPng(frame.width,frame.height,frame.rgb);
    const framePath='data://download/buienradar-'+generation+
     '-frame-'+frameNumber+'.png';
    await limited(fs.writeFile(framePath,pngBytes),20000,'PNG WRITE');
    if(!image?.convert)throw Error('Zepp image.convert ontbreekt');
    radarProgress('gif-convert-'+frameNumber);
    const converted=await limited(image.convert({filePath:framePath}),
     25000,'GIF-CONVERT');
    if(!converted?.targetFilePath)
     throw Error('GIF-CONVERT: geen native afbeelding');
    radarProgress('gif-transfer-'+frameNumber);
    await sendFile(converted.targetFilePath,{
     kind:'buienradar-native-frame',source:'Buienradar',
     frameIndex:frameNumber,frameCount:9,
     fetchedAt:Date.now(),horizonMinutes:180,generation
    });
    delivered++;
   }
   index++;
  }
  if(index<3||delivered<2)
   throw Error('GIF: te weinig toekomstige radarframes');
  radarProgress('transferred');
 }catch(e){
  radarProgress('failed',String(e?.message||e).slice(0,125));
 }finally{radarBusy=false;radarTask=null;}
}
function beginRadar(){
 if(radarBusy)return {ok:false,busy:true,error:'Radaroverdracht bezig'};
 radarBusy=true;
 const generation=++radarGeneration;
 radarProgress('starting');
 void deliverBuienradarGif(generation);
 return {ok:true,source:'Buienradar',horizonMinutes:180,generation};
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
   if(req.method==='radar.start'){res(null,beginRadar());return;}
   if(req.method==='radar.status'){
    res(null,{ok:true,...radarState,busy:radarBusy});return;
   }
   if(req.method==='rain.forecast'){
    const loc=req.params&&req.params.gps?
     normalLocation({...req.params.gps,name:'GPS-locatie'}):selectedLocation();
    res(null,await forecast(loc));return;
   }
   throw Error('Onbekende aanvraag: '+req.method);
  }catch(e){res(null,{ok:false,error:String(e.message||e).slice(0,135)});}
 }
}));
