import {BaseSideService} from '@zeppos/zml/base-side';
import {parseRaintext,describe,normalLocation,REFRESH_MS} from './rain.js';
import {nearestStation,nextHourRain} from './weather.js';
import {kmiForecastUrl,parseFutureFrames} from './future-radar.js';

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
 const payload={ok:true,location,points,summary:describe(points,120),
  summary1h:describe(points,60),summary2h:describe(points,120),
  nextHourMm:nextHourRain(points),station,updatedAt:now};
 rainCache={key,at:now,payload};
 return {...payload,cached:false};
}
// A current, timestamped *future* precipitation map. No GitHub cache.
let radarFrames=[],radarBusy=false,radarTask=null,radarGeneration=0;
let radarState={stage:'idle',error:null,updatedAt:0,index:-1};
function radarProgress(stage,error=null,index=radarState.index){
 radarState={stage,error,index,updatedAt:Date.now()};
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
async function loadFutureForecast(){
 if(radarBusy)throw Error('RADAR: bezig met vorige overdracht');
 const location=selectedLocation();
 const response=await fetch({url:kmiForecastUrl(location),method:'GET'});
 if(resultStatus(response)!==200)throw Error('KMI: HTTP '+resultStatus(response));
 const frames=parseFutureFrames(response.body);
 radarFrames=frames;
 return {ok:true,source:'KMI',forecast:true,
  fetchedAt:Date.now(),
  frames:frames.map((f,index)=>({index,time:f.time,validAt:f.validAt})),
  frameCount:frames.length};
}
function downloadRadar(uri,index,id){
 return limited(new Promise((resolve,reject)=>{
  if(!network?.downloader?.downloadFile)
   return reject(Error('DOWNLOAD: niet ondersteund'));
  try{
   radarTask=network.downloader.downloadFile({
    url:uri,filePath:'data://download/kmi-future-'+id+'-'+index+'.png',
    timeout:18000
   });
   radarTask.onSuccess=ev=>{
    if(Number(ev?.statusCode)!==200)
     reject(Error('DOWNLOAD: HTTP '+ev?.statusCode));
    else if(!ev.filePath&&!ev.tempFilePath)
     reject(Error('DOWNLOAD: ontbrekend bestand'));
    else resolve(ev.filePath||ev.tempFilePath);
   };
   radarTask.onFail=ev=>reject(Error('DOWNLOAD: '+(ev?.message||'netwerk')));
  }catch(e){reject(Error('DOWNLOAD: '+String(e.message||e)));}
 }),22000,'DOWNLOAD',()=>{try{radarTask?.cancel?.();}catch(_){}});
}
function awaitTransfer(task){
 return limited(new Promise((resolve,reject)=>{
  if(!task||typeof task.on!=='function')
   return reject(Error('TRANSFER: onbekende taak'));
  const check=state=>{
   if(state==='transferred')resolve();
   else if(state==='error'||state==='canceled')
    reject(Error('TRANSFER: '+state));
  };
  task.on('change',event=>check(event?.data?.readyState||task.readyState));
  check(task.readyState);
 }),38000,'TRANSFER',()=>{try{task?.cancel?.();}catch(_){}});
}
async function transferFutureFrame(index,generation){
 try{
  const frame=radarFrames[index];
  if(!frame||frame.validAt<=Date.now())
   throw Error('RADAR: frame is niet meer in de toekomst');
  radarProgress('download',null,index);
  const input=await downloadRadar(frame.uri,index,generation);
  radarProgress('convert',null,index);
  if(!image?.convert)throw Error('CONVERT: niet ondersteund');
  const output=await limited(image.convert({filePath:input}),15000,'CONVERT');
  if(!output?.targetFilePath)throw Error('CONVERT: geen afbeelding');
  radarProgress('transfer',null,index);
  const outbox=transferFile?.getOutbox?.();
  if(!outbox?.enqueueFile)throw Error('TRANSFER: geen Zepp outbox');
  const task=outbox.enqueueFile(output.targetFilePath,{
   kind:'future-radar-frame',source:'KMI',frameIndex:index,
   validTime:frame.time,validAt:frame.validAt,
   fetchedAt:Date.now(),generation
  });
  await awaitTransfer(task);
  radarProgress('transferred',null,index);
 }catch(e){
  radarProgress('failed',String(e.message||e).slice(0,110),index);
 }finally{radarBusy=false;radarTask=null;}
}
function beginForecastFrame(index){
 if(radarBusy)return {ok:false,busy:true,error:'RADAR: overdracht bezig'};
 const frame=radarFrames[index];
 if(!Number.isInteger(index)||!frame||frame.validAt<=Date.now())
  return {ok:false,error:'RADAR: ongeldig of verlopen toekomstframe'};
 radarBusy=true;
 const generation=++radarGeneration;
 radarProgress('starting',null,index);
 void transferFutureFrame(index,generation);
 return {ok:true,index,validTime:frame.time};
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
   if(req.method==='radar.forecast'){
    try{res(null,await loadFutureForecast());}
    catch(e){res(null,{ok:false,error:String(e.message||e).slice(0,140)});}
    return;
   }
   if(req.method==='radar.frame'){
    res(null,beginForecastFrame(Number(req.params?.index)));return;
   }
   if(req.method==='radar.status'){
    res(null,{ok:true,...radarState,busy:radarBusy});return;
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
