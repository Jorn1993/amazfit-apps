import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function create({download=true,transfer=true}={}){
 let service,sourceUrl='',count=0,conversionCalls=0;
 const fetch=async()=>({status:200,body:'000|12:00\n'.repeat(24)});
 const downloader={downloadFile({url,filePath}){
  sourceUrl=url;
  assert.match(filePath,/\.gif$/);
  const task={onSuccess:null,onFail:null,cancel(){}};
  queueMicrotask(()=>{
   if(download)task.onSuccess?.({statusCode:200,filePath});
   else task.onFail?.({message:'no data'});
  });
  return task;
 }};
 const transferFile={getOutbox(){return {enqueueFile(path,params){
  assert.match(path,/\.gif$/);
  assert.equal(params.kind,'buienradar-forecast-gif');
  assert.equal(params.source,'Buienradar');
  assert.equal(params.horizonMinutes,180);
  count++;
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
  parseRaintext:()=>Array.from({length:24},(_,i)=>({mmh:0,time:'12:00'})),
  describe:()=>({state:'dry',totalMm:0}),normalLocation:x=>x,
  REFRESH_MS:300000,nearestStation:()=>null,nextHourRain:()=>0,
  settings:{settingsStorage:{getItem:()=>null,setItem(){}}},
  fetch,network:{downloader},image:{convert(){conversionCalls++;throw Error('unexpected');}},
  transferFile,Date,Math,Number,String,JSON,Promise,Error,Array,
  setTimeout,clearTimeout,console:{log(){}}
 });
 const call=(method,params={})=>new Promise(resolve=>
  service.onRequest({method,params},(_,answer)=>resolve(answer)));
 return {call,count:()=>count,url:()=>sourceUrl,conversionCalls:()=>conversionCalls};
}
const settle=async()=>{
 for(let i=0;i<30;i++)await Promise.resolve();
 await new Promise(resolve=>setTimeout(resolve,20));
};
test('Downloads ONLY official Buienradar Belgium future animation (not KMI)',async()=>{
 const c=create();
 assert.equal((await c.call('radar.start')).ok,true);
 await settle();
 assert.match(c.url(),/^https:\/\/image\.buienradar\.nl\/2\.0\/image\/animation\//);
 assert.match(c.url(),/RadarMapRainWebmercatorBE/);
 assert.match(c.url(),/History=0&Forecast=19/);
 assert.equal(c.count(),1);
 assert.equal(c.conversionCalls(),0);
 assert.equal((await c.call('radar.status')).stage,'transferred');
});
test('Downloader and transfer errors are reported rather than claiming success',async()=>{
 const first=create({download:false});
 await first.call('radar.start');await settle();
 assert.equal(first.count(),0);
 assert.match((await first.call('radar.status')).error,/DOWNLOAD/);
 const second=create({transfer:false});
 await second.call('radar.start');await settle();
 assert.match((await second.call('radar.status')).error,/TRANSFER/);
});
test('One active transfer at a time prevents overwriting live images',async()=>{
 const c=create();
 assert.equal((await c.call('radar.start')).ok,true);
 assert.equal((await c.call('radar.start')).ok,false);
 await settle();assert.equal(c.count(),1);
});
test('Rain and weather endpoints still work and remain independent of radar',async()=>{
 const c=create();
 const r=await c.call('rain.forecast');
 assert.equal(r.ok,true);
 assert.equal(r.points.length,24);
 assert.equal((await c.call('config.get')).ok,true);
});
test('Never uses runtime GitHub cache or KMI imagery',()=>{
 const src=fs.readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8');
 assert.ok(!/raw\.githubusercontent\.com|KMI|kmiForecast|app\.meteo\.be/.test(src));
});
