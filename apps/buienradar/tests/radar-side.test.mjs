import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function create({download=true,convert=true,transfer=true}={}){
 let service,sourceUrl='',count=0;
 const future=Date.now()+20*60000,validTime=new Date(future).toISOString();
 const data={animation:[{sequence:[0,1,2,3].map((_,i)=>({
  time:new Date(future+i*600000).toISOString(),
  uri:'https://app.meteo.be/services/appv4/?s=getIncaImage&i='+i
 }))}]};
 const fetch=async({url})=>({status:200,body:data});
 const downloader={downloadFile({url}){
  sourceUrl=url;
  const task={onSuccess:null,onFail:null,cancel(){}};
  queueMicrotask(()=>{
   if(download)task.onSuccess?.({statusCode:200,filePath:'data://download/future.png'});
   else task.onFail?.({message:'no data'});
  });
  return task;
 }};
 const image={convert:async()=>convert?
  {targetFilePath:'data://download/future.img'}:
  Promise.reject(Error('unsupported'))};
 const transferFile={getOutbox(){return {enqueueFile(_path,params){
  assert.equal(params.kind,'future-radar-frame');
  assert.equal(params.source,'KMI');
  assert.ok(params.validAt>Date.now());
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
  parseRaintext:()=>[],describe:()=>({}),normalLocation:x=>x,
  REFRESH_MS:300000,nearestStation:()=>null,nextHourRain:()=>0,
  kmiForecastUrl:()=> 'https://app.meteo.be/services/appv4/?s=getForecasts',
  parseFutureFrames:()=>data.animation[0].sequence.map(x=>({
   time:x.time,uri:x.uri,validAt:Date.parse(x.time)
  })),
  settings:{settingsStorage:{getItem:()=>null}},
  fetch,network:{downloader},image,transferFile,
  Date,Math,Number,String,JSON,Promise,Error,Array,
  setTimeout,clearTimeout,console:{log(){}}
 });
 const call=(method,params={})=>new Promise(resolve=>
  service.onRequest({method,params},(_,answer)=>resolve(answer)));
 return {call,sourceUrl:()=>sourceUrl,count:()=>count};
}
const settle=async()=>{
 for(let i=0;i<20;i++)await Promise.resolve();
 await new Promise(resolve=>setTimeout(resolve,15));
};
test('Phone retrieves future-verified KMI PNG forecast metadata directly',async()=>{
 const s=create(),r=await s.call('radar.forecast');
 assert.equal(r.ok,true);
 assert.equal(r.source,'KMI');
 assert.equal(r.frameCount,4);
 assert.ok(r.frames.every(f=>f.validAt>Date.now()));
});
test('Forecast frame is converted and sent by BLE without GitHub',async()=>{
 const s=create();await s.call('radar.forecast');
 assert.equal((await s.call('radar.frame',{index:0})).ok,true);
 await settle();
 assert.match(s.sourceUrl(),/^https:\/\/app\.meteo\.be\/services\/appv4\//);
 assert.equal((await s.call('radar.status')).stage,'transferred');
 assert.equal(s.count(),1);
});
test('Failed download never transfers a nonexistent future frame',async()=>{
 const s=create({download:false});await s.call('radar.forecast');
 await s.call('radar.frame',{index:0});await settle();
 const r=await s.call('radar.status');
 assert.equal(r.stage,'failed');assert.match(r.error,/DOWNLOAD/);
 assert.equal(s.count(),0);
});
test('Failed PNG conversion is reported',async()=>{
 const s=create({convert:false});await s.call('radar.forecast');
 await s.call('radar.frame',{index:0});await settle();
 assert.match((await s.call('radar.status')).error,/unsupported/);
});
test('Failed BLE transfer is reported instead of claiming success',async()=>{
 const s=create({transfer:false});await s.call('radar.forecast');
 await s.call('radar.frame',{index:0});await settle();
 assert.match((await s.call('radar.status')).error,/TRANSFER/);
});
test('No past or unknown frame index may start a transfer',async()=>{
 const s=create();await s.call('radar.forecast');
 assert.equal((await s.call('radar.frame',{index:99})).ok,false);
 assert.equal(s.count(),0);
});
test('Source code never uses a GitHub runtime radar cache',()=>{
 const src=fs.readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8');
 assert.ok(!/raw\.githubusercontent\.com|RADAR_CACHE_BASE|radar\.manifest/.test(src));
});


test('Phone compatibility probe fetches the genuine Buienradar GIF, not KMI',async()=>{
 const s=create();
 const response=await s.call('radar.gifTest');
 assert.equal(response.ok,true);
 assert.equal(response.stage,'converted');
 assert.match(s.sourceUrl(),/^https:\/\/image\.buienradar\.nl\/2\.0\/image\/animation\//);
 assert.match(s.sourceUrl(),/History=0&Forecast=19/);
 assert.equal(s.count(),0); // Never treat GIF conversion as actual BLE animation.
});
test('GIF conversion error is reported separately from radar forecast',async()=>{
 const s=create({convert:false});
 const answer=await s.call('radar.gifTest');
 assert.equal(answer.ok,false);
 assert.match(answer.error,/unsupported/);
});
