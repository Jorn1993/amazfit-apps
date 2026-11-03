import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function create({download=true,convert=true,transfer=true}={}){
 let service,sourceUrls=[],converted=[],sent=[];
 const downloader=(url,options)=>{
  sourceUrls.push({url,options});
  const task={onSuccess:null,onFail:null};
  queueMicrotask(()=>{
   if(download)task.onSuccess?.({statusCode:200,filePath:options.filePath});
   else task.onFail?.({code:-1,message:'Network failure'});
  });
  return task;
 };
 const outbox=(path,params)=>{
  sent.push({path,params});
  return {readyState:'pending',on(type,fn){
   if(type==='change')queueMicrotask(()=>
    fn({data:{readyState:transfer?'transferred':'error'}}));
  }};
 };
 const source=fs.readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  AppSideService:x=>service=x,BaseSideService:x=>x,
  convertLib:{convert:async({filePath})=>{
   converted.push(filePath);
   if(!convert)throw Error('No native converter');
   return {targetFilePath:filePath+'_converted',options:{size:40240}};
  }},
  parseRaintext:()=>Array.from({length:24},()=>({mmh:0,time:'12:00'})),
  describe:()=>({state:'dry',totalMm:0}),
  normalLocation:x=>x,REFRESH_MS:300000,
  nearestStation:()=>null,nextHourRain:()=>0,
  settings:{settingsStorage:{getItem:()=>null,setItem(){}}},
  fetch:async()=>({status:200,body:'000|12:00\n'.repeat(24)}),
  Date,Math,Number,String,JSON,Promise,Error,Array,
  setTimeout,clearTimeout
 });
 service.download=downloader;
 service.sendFile=outbox;
 const call=(method,params={})=>new Promise(resolve=>
  service.onRequest({method,params},(_,answer)=>resolve(answer)));
 const settle=async()=>{
  for(let i=0;i<100;i++)await Promise.resolve();
  await new Promise(resolve=>setTimeout(resolve,25));
 };
 return {call,settle,sourceUrls,converted,sent};
}

test('real current BE map uses the exact proven Zepp converter + BLE chain',async()=>{
 const x=create();
 assert.equal((await x.call('radar.start')).ok,true);
 await x.settle();
 assert.equal(x.sourceUrls.length,2);
 assert.match(x.sourceUrls[0].url,/image\/single\/RadarMapRainBE/);
 assert.match(x.sourceUrls[0].url,/width=320&height=320/);
 assert.equal(x.converted.length,1);
 assert.equal(x.sent.length,2);
 assert.match(x.sent[0].path,/_converted$/);
 assert.match(x.sourceUrls[1].url,/image\/animation\/RadarMapRainWebmercatorBE/);
 assert.match(x.sourceUrls[1].url,/History=0&Forecast=19/);
 assert.match(x.sent[1].path,/\.gif$/);
 assert.equal(x.sent[1].params.kind,'buienradar-forecast-gif');
 assert.equal(x.sent[0].params.kind,'buienradar-current-frame');
 assert.equal(x.sent[0].params.source,'Buienradar');
 const status=await x.call('radar.status');
 assert.equal(status.stage,'transferred');
 assert.equal(status.busy,false);
 assert.equal(status.mode,'current+forecast');
 assert.ok(status.lastFetchedAt>0);
});
test('request already underway never triggers a second overlapping BLE transfer',async()=>{
 const x=create();
 assert.equal((await x.call('radar.start')).ok,true);
 const next=await x.call('radar.start');
 assert.equal(next.ok,true);
 assert.equal(next.alreadyRunning,true);
 await x.settle();
 assert.equal(x.sent.length,2);
});
test('failed download is visible, does not fake success',async()=>{
 const x=create({download:false});
 await x.call('radar.start');await x.settle();
 assert.equal(x.sent.length,0);
 const status=await x.call('radar.status');
 assert.equal(status.stage,'failed');
 assert.match(status.error,/DOWNLOAD/);
});
test('official converter failure blocks transfer',async()=>{
 const x=create({convert:false});
 await x.call('radar.start');await x.settle();
 assert.equal(x.sent.length,1);
 assert.equal(x.sent[0].params.kind,'buienradar-forecast-gif');
 assert.equal((await x.call('radar.status')).stage,'transferred');
 assert.match((await x.call('radar.status')).staticError,/No native converter/);
});
test('Bluetooth transfer failure blocks success',async()=>{
 const x=create({transfer:false});
 await x.call('radar.start');await x.settle();
 assert.equal(x.sent.length,2);
 assert.equal((await x.call('radar.status')).stage,'failed');
 assert.match((await x.call('radar.status')).error,/BLUETOOTH/);
});
test('rain forecast and weather remain independent from radar',async()=>{
 const x=create();
 assert.equal((await x.call('rain.forecast')).ok,true);
 assert.equal((await x.call('config.get')).ok,true);
});
test('real future GIF is sent unmodified, no undocumented side filesystem or custom TGA',()=>{
 const s=fs.readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8');
 assert.match(s,/context\.download\(/);
 assert.match(s,/convertLib\.convert\(/);
 assert.match(s,/context\.sendFile\(/);
 assert.ok(!/\bfs\.readFile\b|\bfs\.writeFile\b|toZeppImage|kmi\.be|githubusercontent/.test(s));
 assert.match(s,/RadarMapRainWebmercatorBE/);
 assert.match(s,/kind:'buienradar-forecast-gif'/);
 assert.ok(!s.includes('encodeRgbPng'));
});
