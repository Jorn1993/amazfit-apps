import {BaseSideService} from '@zeppos/zml/base-side';
import {parseRaintext,describe,normalLocation,REFRESH_MS} from './rain.js';
import {nearestStation,nextHourRain,RADAR_BE} from './weather.js';

const ENDPOINTS=['https://gpsgadget.buienradar.nl/data/raintext/',
 'https://gps.buienradar.nl/getrr.php'];
const WEATHER_FEED='https://data.buienradar.nl/2.0/feed/json';
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
 const payload={ok:true,location,points,summary:describe(points),
  nextHourMm:nextHourRain(points),station,updatedAt:now};
 rainCache={key,at:now,payload};
 return {...payload,cached:false};
}
// Asynchronous, observable radar pipeline. onRequest never waits for file transfer.
// Buienradar officially uses RadarMapRainBE for the Belgian radar map.
const RADAR_MAX_MS=75000;
let radarState={stage:'idle',error:null,updatedAt:0,requestId:0};
let radarTask=null,radarBusy=false,radarGeneration=0;
function stage(name,error=null,requestId=radarGeneration){
 if(requestId!==radarGeneration)return;
 radarState={stage:name,error,updatedAt:Date.now(),requestId};
 try{console.log('[Buienradar radar]',name,error||'');}catch(_){}
}
function failAt(label,reason){
 const text=String(reason&&reason.message||reason||'unknown');
 throw Error(label+': '+text.slice(0,68));
}
function delayFail(promise,ms,label,onTimeout){
 return new Promise((resolve,reject)=>{
  let settled=false;
  const timer=setTimeout(()=>{
   if(settled)return;
   settled=true;
   try{if(typeof onTimeout==='function')onTimeout();}catch(_){}
   reject(Error(label+': timeout'));
  },ms);
  Promise.resolve(promise).then(result=>{
   if(settled)return;
   settled=true;clearTimeout(timer);resolve(result);
  },error=>{
   if(settled)return;
   settled=true;clearTimeout(timer);reject(error);
  });
 });
}
function downloadRadar(id){
 return delayFail(new Promise((resolve,reject)=>{
  if(typeof network==='undefined'||!network.downloader){
   reject(Error('DOWNLOAD: Zepp downloader ontbreekt'));return;
  }
  try{
   // Avoid introducing undocumented query parameters to Buienradar's image API.
   const task=network.downloader.downloadFile({
    url:RADAR_BE,
    timeout:22000,
    filePath:'data://download/buienradar-be-'+id+'.png'
   });
   radarTask=task;
   task.onSuccess=event=>{
    const status=Number(event&&event.statusCode);
    if(status!==200){
     reject(Error('DOWNLOAD: HTTP '+String(status||'?')));return;
    }
    const file=event.filePath||event.tempFilePath;
    if(!file){reject(Error('DOWNLOAD: leeg bestandspad'));return;}
    resolve(file);
   };
   task.onFail=ev=>{
    reject(Error('DOWNLOAD: '+String(ev&&ev.message||ev&&ev.code||'netwerkfout')));
   };
  }catch(e){reject(Error('DOWNLOAD: '+String(e&&e.message||e).slice(0,50)));}
 }),28000,'DOWNLOAD',()=>{if(radarTask&&radarTask.cancel)radarTask.cancel();});
}
function waitTransfer(file){
 return delayFail(new Promise((resolve,reject)=>{
  if(!file||typeof file.on!=='function'){
   reject(Error('TRANSFER: geen Zepp FileObject'));return;
  }
  const check=s=>{
   if(s==='transferred')resolve();
   else if(s==='error'||s==='canceled')reject(Error('TRANSFER: '+s));
  };
  file.on('change',ev=>check(ev&&ev.data&&ev.data.readyState||file.readyState));
  check(file.readyState);
 }),35000,'TRANSFER',()=>{try{if(file&&file.cancel)file.cancel();}catch(_){}});
}
async function runRadar(id){
 try{
  stage('download',null,id);
  const path=await downloadRadar(id);
  if(id!==radarGeneration)return;
  stage('convert',null,id);
  if(typeof image==='undefined'||typeof image.convert!=='function')
   throw Error('CONVERT: image.convert ontbreekt in Zepp');
  const converted=await delayFail(
   image.convert({filePath:path,targetFilePath:'data://download/buienradar-be-'+id+'.img'}),
   12000,'CONVERT');
  if(!converted||!converted.targetFilePath)
   throw Error('CONVERT: geen uitvoerbestand');
  stage('transfer',null,id);
  if(typeof transferFile==='undefined'||typeof transferFile.getOutbox!=='function')
   throw Error('TRANSFER: Side Service transferFile ontbreekt');
  const outbox=transferFile.getOutbox();
  if(!outbox||typeof outbox.enqueueFile!=='function')
   throw Error('TRANSFER: outbox ontbreekt');
  const file=outbox.enqueueFile(converted.targetFilePath,{
   kind:'buienradar-radar',requestId:id
  });
  await waitTransfer(file);
  if(id===radarGeneration)stage('transferred',null,id);
 }catch(e){
  stage('failed',String(e&&e.message||e).slice(0,100),id);
 }finally{
  radarTask=null;radarBusy=false;
 }
}
function startRadar(){
 if(radarBusy)return {...radarState,ok:true};
 radarGeneration++;
 radarBusy=true;
 const id=radarGeneration;
 stage('starting',null,id);
 void runRadar(id);
 return {...radarState,ok:true};
}
function radarStatus(){
 const state={...radarState,ok:true};
 if(radarBusy&&Date.now()-state.updatedAt>RADAR_MAX_MS){
  stage('failed','RADAR: geen reactie na 75 seconden');
  radarBusy=false;
  return {...radarState,ok:true};
 }
 return state;
}
AppSideService(BaseSideService({
 async onRequest(req,res){
  try{
   if(!req)throw Error('Missing request');
   if(req.method==='radar.refresh'){
    res(null,startRadar());return;
   }
   if(req.method==='radar.status'){
    res(null,radarStatus());return;
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
