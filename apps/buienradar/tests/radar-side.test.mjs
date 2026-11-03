import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function create({download=true,convert=true,transfer=true,phoneFs=true}={}){
 let service,conversions=[],sourceUrls=[],sent=[],written=[];
 const fetch=async()=>({status:200,body:'000|12:00\n'.repeat(24)});
 class FakeGif{
  constructor(data){
   assert.ok(data);
   this.width=320;this.height=320;this.i=0;
  }
  nextFrame(){
   if(this.i>=17)return null;
   const frame={width:320,height:320,rgb:new Uint8Array(320*320*3)};
   frame.rgb.fill(++this.i*7);
   return frame;
  }
 }
 const downloader={downloadFile({url,filePath}){
  sourceUrls.push(url);
  const task={onSuccess:null,onFail:null,cancel(){}};
  queueMicrotask(()=>{
   if(download)task.onSuccess?.({statusCode:200,filePath});
   else task.onFail?.({message:'network failure'});
  });return task;
 }};
 const transferFile={getOutbox(){return {enqueueFile(path,params){
  sent.push({path,params});
  assert.equal(params.source,'Buienradar');
  assert.ok(params.kind==='buienradar-native-frame'||
    params.kind==='buienradar-current-frame');
  // Never send raw GIFs or guessed/native format headers.
  assert.ok(!/\.gif$/.test(path));
  return {readyState:'pending',on(type,callback){
   if(type==='change')queueMicrotask(()=>callback({
    data:{readyState:transfer?'transferred':'error'}
   }));
  },cancel(){}};
 }};}};
 const filesystem={readFile:async()=>new Uint8Array([71,73,70]),
  writeFile:async(path,bytes)=>{written.push({path,bytes});}};
 const source=fs.readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 const globals={
  AppSideService:x=>service=x,BaseSideService:x=>x,
  parseRaintext:()=>Array.from({length:24},()=>({mmh:0,time:'12:00'})),
  describe:()=>({state:'dry',totalMm:0}),normalLocation:x=>x,
  REFRESH_MS:300000,nearestStation:()=>null,nextHourRain:()=>0,
  BuienradarGif:FakeGif,
  encodeRgbPng:(w,h,rgb)=>{
   assert.equal(w,320);assert.equal(h,320);
   assert.equal(rgb.byteLength,320*320*3);
   return Uint8Array.from([137,80,78,71]).buffer;
  },
  settings:{settingsStorage:{getItem:()=>null,setItem(){}}},
  fetch,network:{downloader},
  image:{convert:async({filePath,targetFilePath})=>{
   conversions.push(filePath);
   if(!convert)throw Error('conversion unsupported');
   return {targetFilePath:targetFilePath||filePath+'_converted'};
  }},
  transferFile,Date,Math,Number,String,JSON,Promise,Error,Array,
  Uint8Array,setTimeout,clearTimeout,console:{log(){}}
 };
 if(phoneFs)globals.fs=filesystem;
 vm.runInNewContext(source,globals);
 const call=(method,params={})=>new Promise(resolve=>
  service.onRequest({method,params},(_,answer)=>resolve(answer)));
 return {call,sourceUrls,sent,written,conversions};
}
const settle=async()=>{
 for(let i=0;i<200;i++)await Promise.resolve();
 await new Promise(resolve=>setTimeout(resolve,30));
};
test('Current Buienradar map uses Zepp official image.convert before transfer',async()=>{
 const t=create();
 assert.equal((await t.call('radar.start')).ok,true);
 await settle();
 assert.match(t.sourceUrls[0],/image\/single\/RadarMapRainBE/);
 assert.ok(t.sent.some(x=>x.params.kind==='buienradar-current-frame'));
 assert.ok(t.conversions.some(x=>/current-.+\.png$/.test(x)));
});
test('17 real GIF frames are decoded to 9 native-converted forecast frames',async()=>{
 const t=create();
 await t.call('radar.start');await settle();
 assert.equal(t.sourceUrls.length,2);
 assert.match(t.sourceUrls[1],/image\/animation\/RadarMapRainWebmercatorBE/);
 assert.match(t.sourceUrls[1],/History=0&Forecast=19/);
 const forecast=t.sent.filter(x=>x.params.kind==='buienradar-native-frame');
 assert.equal(forecast.length,9);
 assert.deepEqual(forecast.map(x=>x.params.frameIndex),[0,2,4,6,8,10,12,14,16]);
 assert.equal(t.written.length,9);
 assert.equal(t.conversions.length,10);
 for(const entry of t.written){
  assert.match(entry.path,/\.png$/);
  assert.deepEqual(Array.from(new Uint8Array(entry.bytes)),[137,80,78,71]);
 }
 assert.equal((await t.call('radar.status')).stage,'transferred');
});
test('Phone-side image.convert failures never send corrupt frames',async()=>{
 const t=create({convert:false});
 await t.call('radar.start');await settle();
 assert.equal(t.sent.length,0);
 assert.match((await t.call('radar.status')).error,/conversion unsupported/);
});
test('Unsupported phone filesystem fails visibly after current radar',async()=>{
 const t=create({phoneFs:false});
 await t.call('radar.start');await settle();
 assert.equal(t.sent.filter(x=>x.params.kind==='buienradar-native-frame').length,0);
 assert.match((await t.call('radar.status')).error,/bestandssysteem/);
});
test('Transfer errors do not falsely report complete future animation',async()=>{
 const t=create({transfer:false});
 await t.call('radar.start');await settle();
 assert.equal((await t.call('radar.status')).stage,'failed');
});
test('Rain and weather endpoints still work',async()=>{
 const t=create();
 assert.equal((await t.call('rain.forecast')).ok,true);
 assert.equal((await t.call('config.get')).ok,true);
});
test('No runtime GitHub, KMI or direct raw-GIF watch transfers',()=>{
 const source=fs.readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8');
 assert.ok(!/raw\.githubusercontent\.com|KMI|kmiForecast|app\.meteo\.be/.test(source));
 assert.ok(!source.includes("kind:'buienradar-forecast-gif'"));
});
