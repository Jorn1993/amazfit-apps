import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function create({download=true,convert=true,transfer=true}={}){
 let service,conversionCalls=0;
 const urls=[],sent=[];
 const fetch=async()=>({status:200,body:'000|12:00\n'.repeat(24)});
 const downloader={downloadFile({url,filePath}){
  urls.push(url);
  assert.ok(filePath.startsWith('data://download/buienradar-'));
  const task={onSuccess:null,onFail:null,cancel(){}};
  queueMicrotask(()=>{
   if(download)task.onSuccess?.({statusCode:200,filePath});
   else task.onFail?.({message:'no data'});
  });
  return task;
 }};
 const transferFile={getOutbox(){return {enqueueFile(path,params){
  sent.push({path,params});
  assert.equal(params.source,'Buienradar');
  if(params.kind==='buienradar-forecast-gif'){
   assert.match(path,/\.gif$/);
   assert.equal(params.horizonMinutes,180);
  }else{
   assert.equal(params.kind,'buienradar-current-frame');
   assert.match(path,/-native\.png$/);
  }
  return {readyState:'pending',on(event,cb){
   if(event==='change')queueMicrotask(()=>cb({
    data:{readyState:transfer?'transferred':'error'}
   }));
  },cancel(){}};
 }};}};
 const source=fs.readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  AppSideService:x=>service=x,BaseSideService:x=>x,
  parseRaintext:()=>Array.from({length:24},()=>({mmh:0,time:'12:00'})),
  describe:()=>({state:'dry',totalMm:0}),normalLocation:x=>x,
  REFRESH_MS:300000,nearestStation:()=>null,nextHourRain:()=>0,
  settings:{settingsStorage:{getItem:()=>null,setItem(){}}},
  fetch,network:{downloader},image:{convert:async({targetFilePath})=>{
   conversionCalls++;
   if(!convert)throw Error('unsupported');
   return {targetFilePath};
  }},
  transferFile,Date,Math,Number,String,JSON,Promise,Error,Array,
  setTimeout,clearTimeout,console:{log(){}}
 });
 const call=(method,params={})=>new Promise(resolve=>
  service.onRequest({method,params},(_,answer)=>resolve(answer)));
 return {call,sent,urls,conversionCalls:()=>conversionCalls};
}
const settle=async()=>{
 for(let i=0;i<40;i++)await Promise.resolve();
 await new Promise(resolve=>setTimeout(resolve,30));
};
test('First sends REAL current Buienradar BE image, then REAL +3h animation',async()=>{
 const c=create();
 assert.equal((await c.call('radar.start')).ok,true);
 await settle();
 assert.equal(c.urls.length,2);
 assert.match(c.urls[0],/image\/single\/RadarMapRainBE/);
 assert.match(c.urls[1],/image\/animation\/RadarMapRainWebmercatorBE/);
 assert.match(c.urls[1],/History=0&Forecast=19/);
 assert.equal(c.sent.length,2);
 assert.deepEqual(c.sent.map(s=>s.params.kind),[
  'buienradar-current-frame','buienradar-forecast-gif'
 ]);
 assert.equal(c.conversionCalls(),1);
 assert.equal((await c.call('radar.status')).stage,'transferred');
});
test('If PNG conversion fails, original animated GIF is still delivered',async()=>{
 const c=create({convert:false});
 assert.equal((await c.call('radar.start')).ok,true);
 await settle();
 assert.equal(c.sent.length,1);
 assert.equal(c.sent[0].params.kind,'buienradar-forecast-gif');
 assert.match((await c.call('radar.status')).snapshotError,/unsupported/);
 assert.equal((await c.call('radar.status')).stage,'transferred');
});
test('Downloader and transfer errors are shown, not silent infinite loading',async()=>{
 const first=create({download:false});
 await first.call('radar.start');await settle();
 assert.equal(first.sent.length,0);
 assert.match((await first.call('radar.status')).error,/DOWNLOAD/);
 const second=create({transfer:false});
 await second.call('radar.start');await settle();
 assert.equal((await second.call('radar.status')).stage,'failed');
 assert.match((await second.call('radar.status')).error,/TRANSFER/);
});
test('A second transfer cannot start while the first is busy',async()=>{
 const c=create();
 assert.equal((await c.call('radar.start')).ok,true);
 assert.equal((await c.call('radar.start')).ok,false);
 await settle();
 assert.equal(c.sent.length,2);
});
test('Weather and rain still work without radar dependency',async()=>{
 const c=create();
 const r=await c.call('rain.forecast');
 assert.equal(r.ok,true);
 assert.equal(r.points.length,24);
 assert.equal((await c.call('config.get')).ok,true);
});
test('Runtime never uses a GitHub or KMI radar URL',()=>{
 const src=fs.readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8');
 assert.ok(!/raw\.githubusercontent\.com|KMI|kmiForecast|app\.meteo\.be/.test(src));
});
