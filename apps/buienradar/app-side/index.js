import {BaseSideService,convertLib} from '@zeppos/zml/base-side';
import {parseRaintext,describe,normalLocation,REFRESH_MS} from './rain.js';
import {nearestStation,nextHourRain} from './weather.js';

const ENDPOINTS=['https://gpsgadget.buienradar.nl/data/raintext/',
 'https://gps.buienradar.nl/getrr.php'];
const WEATHER_FEED='https://data.buienradar.nl/2.0/feed/json';
// Proven on an actual Amazfit Balance 2 via the isolated Radar Beeldtest.
// Never label a single observation as a future forecast.
const BUIENRADAR_CURRENT='https://image.buienradar.nl/2.0/image/single/'+
 'RadarMapRainBE?width=320&height=320&renderBackground=True'+
 '&renderBranding=False&renderText=False';
const BUIENRADAR_FORECAST='https://image.buienradar.nl/2.0/image/animation/'+
 'RadarMapRainWebmercatorBE?width=320&height=320&renderBackground=True'+
 '&renderBranding=False&renderText=True&History=0&Forecast=19&skip=1';

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
// A deliberately small, hardware-proven Zepp pipeline:
// this.download -> convertLib.convert -> this.sendFile -> BasePage.onReceivedFile.
// Zepp SideService does not document binary read/write of arbitrary GIF frames;
// using imaginary phone-side binary file APIs caused 1.1.3 to fail.
let radarBusy=false,radarGeneration=0;
let radarState={stage:'idle',error:null,updatedAt:0,lastFetchedAt:0};
function radarProgress(stage,error=null){
 radarState={...radarState,stage,error,updatedAt:Date.now()};
}
function limited(job,ms,label){
 return new Promise((resolve,reject)=>{
  let finished=false;
  const t=setTimeout(()=>{
   if(finished)return;
   finished=true;reject(Error(label+': time-out'));
  },ms);
  Promise.resolve(job).then(v=>{
   if(finished)return;
   finished=true;clearTimeout(t);resolve(v);
  },e=>{
   if(finished)return;
   finished=true;clearTimeout(t);reject(e);
  });
 });
}
function downloadBuienradar(context,uri,path){
 return limited(new Promise((resolve,reject)=>{
  let task;
  try{
   task=context.download(uri,{headers:{},timeout:45000,filePath:path});
   if(!task)throw Error('DOWNLOAD: Zepp downloader ontbreekt');
   task.onSuccess=e=>{
    if(Number(e?.statusCode)!==200)
     return reject(Error('DOWNLOAD: HTTP '+e?.statusCode));
    const p=e.filePath||e.tempFilePath;
    if(!p)reject(Error('DOWNLOAD: bestand ontbreekt'));
    else resolve(p);
   };
   task.onFail=e=>reject(Error('DOWNLOAD: '+(e?.message||'niet bereikbaar')));
  }catch(e){reject(e);}
 }),52000,'DOWNLOAD');
}
function sendRadar(context,path,params){
 return limited(new Promise((resolve,reject)=>{
  try{
   const task=context.sendFile(path,params);
   if(!task||typeof task.on!=='function')
    throw Error('BLUETOOTH: geen bestandstaak');
   let done=false;
   const update=stage=>{
    if(done)return;
    if(stage==='transferred'){done=true;resolve();}
    else if(stage==='error'||stage==='canceled'){
     done=true;reject(Error('BLUETOOTH: '+stage));
    }
   };
   task.on('change',event=>update(event?.data?.readyState||task.readyState));
   update(task.readyState);
  }catch(e){reject(e);}
 }),65000,'BLUETOOTH');
}
async function deliverCurrent(context,generation){
 let sentCurrent=false;
 let staticFailure=null;
 try{
  // First: native, hardware-proven fullscreen current image.
  radarProgress('download');
  const path='data://download/buienradar-current-'+generation+'.png';
  const src=await downloadBuienradar(context,
   BUIENRADAR_CURRENT+'&fresh='+Math.floor(Date.now()/300000),path);
  radarProgress('convert');
  const native=await limited(convertLib.convert({filePath:src}),
   30000,'CONVERT');
  if(!native?.targetFilePath)throw Error('CONVERT: geen native bestand');
  if(native.options?.size!==undefined&&Number(native.options.size)<=0)
   throw Error('CONVERT: leeg bestand');
  radarProgress('transfer');
  const fetchedAt=Date.now();
  await sendRadar(context,native.targetFilePath,{
   kind:'buienradar-current-frame',source:'Buienradar',
   generation,fetchedAt
  });
  sentCurrent=true;radarState.lastFetchedAt=fetchedAt;
  radarProgress('current-ready');
 }catch(e){
  staticFailure=String(e?.message||e).slice(0,100);
  radarState.staticError=staticFailure;
 }
 try{
  // Next: transfer the ORIGINAL Buienradar future-GIF unmodified.
  // The watch decodes GIF and paints the verified RGB pixels using its
  // documented Canvas API. There is NO invented phone-side filesystem.
  radarProgress('gif-download');
  const gifPath=await downloadBuienradar(context,
   BUIENRADAR_FORECAST+'&fresh='+Math.floor(Date.now()/300000),
   'data://download/buienradar-future-'+generation+'.gif');
  radarProgress('gif-transfer');
  await sendRadar(context,gifPath,{
   kind:'buienradar-forecast-gif',source:'Buienradar',
   fetchedAt:Date.now(),requestedHorizonMinutes:180,generation
  });
  radarProgress('transferred');
 }catch(e){
  const error=String(e?.message||e).slice(0,125);
  radarState.gifError=error;
  radarProgress(sentCurrent?'current-only':'failed',
   sentCurrent?null:(staticFailure?staticFailure+'; ':'')+error);
 }finally{radarBusy=false;}
}
function beginRadar(context){
 if(radarBusy)return {ok:true,alreadyRunning:true,source:'Buienradar'};
 radarBusy=true;
 const generation=++radarGeneration;
 radarProgress('starting');
 void deliverCurrent(context,generation);
 return {ok:true,source:'Buienradar',mode:'current+forecast',generation};
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
   if(req.method==='radar.start'){res(null,beginRadar(this));return;}
   if(req.method==='radar.status'){
    res(null,{ok:true,source:'Buienradar',mode:'current+forecast',...radarState,busy:radarBusy});return;
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
