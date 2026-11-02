import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const filepath=new URL('../app-side/index.js',import.meta.url);
function start({download='success',convert='success',transfer='success'}={}){
 let side,transferUsed=0,downloadUrl=null,convertPath=null;
 const events=[],timers=new Set();
 const customTimeout=(fn,ms)=>{
  const t=setTimeout(()=>{timers.delete(t);fn();},ms>1000?20:ms);
  timers.add(t);return t;
 };
 const customClear=t=>{clearTimeout(t);timers.delete(t);};
 const task={onSuccess:null,onFail:null,cancel(){}};
 const network={downloader:{downloadFile(options){
  downloadUrl=options.url;
  if(download!=='silent')customTimeout(()=>{
   if(download==='success')task.onSuccess?.({statusCode:200,filePath:'data://download/radar.png'});
   else if(download==='404')task.onSuccess?.({statusCode:404,filePath:'data://download/radar.png'});
   else task.onFail?.({code:42,message:'network failed'});
  },2);
  return task;
 }}};
 const image={convert:async ({filePath})=>{
  convertPath=filePath;
  if(convert==='fail')throw Error('bad image');
  return {targetFilePath:'data://download/radar-converted.img'};
 }};
 const transferFile={getOutbox(){return {enqueueFile(file,params){
  transferUsed++;assert.equal(params.kind,'buienradar-radar');
  return {readyState:'pending',on(type,cb){
   if(type==='change'&&transfer!=='silent')customTimeout(()=>
    cb({data:{readyState:transfer==='success'?'transferred':'error'}}),2);
  },cancel(){}};
 }};}};
 const src=fs.readFileSync(filepath,'utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(src,{
  AppSideService:v=>side=v,BaseSideService:v=>v,
  parseRaintext:()=>[],describe:()=>({}),normalLocation:x=>x,REFRESH_MS:300000,
  nearestStation:()=>null,nextHourRain:()=>0,
  RADAR_BE:'https://image.buienradar.nl/2.0/image/single/RadarMapRainBE?height=320',
  network,image,transferFile,
  settings:{settingsStorage:{getItem:()=>null}},
  fetch:async()=>({status:404}),console:{log:(...xs)=>events.push(xs)},
  setTimeout:customTimeout,clearTimeout:customClear,
  Date,Math,Error,Number,String,Promise,JSON,
 });
 const call=(method)=>new Promise(resolve=>side.onRequest({method},(_,response)=>resolve(response)));
 return {call,events,getUrl:()=>downloadUrl,getConvert:()=>convertPath,
  transferCount:()=>transferUsed,cleanup:()=>{for(const timer of timers)clearTimeout(timer);}};
}
const wait=()=>new Promise(done=>setTimeout(done,65));
test('Radar request responds immediately, then reports completion after real transfer',async()=>{
 const sim=start();try{
  const result=await sim.call('radar.refresh');
  assert.equal(result.ok,true);
  assert.equal(result.stage,'download');
  assert.match(sim.getUrl(),/RadarMapRainBE/);
  await wait();
  const last=await sim.call('radar.status');
  assert.equal(last.stage,'transferred');
  assert.equal(sim.getConvert(),'data://download/radar.png');
  assert.equal(sim.transferCount(),1);
 }finally{sim.cleanup();}
});
test('HTTP 404 is a visible download failure, not endless loading',async()=>{
 const sim=start({download:'404'});try{
  await sim.call('radar.refresh');await wait();
  const result=await sim.call('radar.status');
  assert.equal(result.stage,'failed');assert.match(result.error,/DOWNLOAD: HTTP 404/);
  assert.equal(sim.transferCount(),0);
 }finally{sim.cleanup();}
});
test('Image-conversion failures are reported before sending to watch',async()=>{
 const sim=start({convert:'fail'});try{
  await sim.call('radar.refresh');await wait();
  const result=await sim.call('radar.status');
  assert.equal(result.stage,'failed');assert.match(result.error,/CONVERT/);
  assert.equal(sim.transferCount(),0);
 }finally{sim.cleanup();}
});
test('Bluetooth transfer failure is visible to watch',async()=>{
 const sim=start({transfer:'error'});try{
  await sim.call('radar.refresh');await wait();
  const result=await sim.call('radar.status');
  assert.equal(result.stage,'failed');assert.match(result.error,/TRANSFER: error/);
 }finally{sim.cleanup();}
});
test('No download callbacks times out and reports exact download phase',async()=>{
 const sim=start({download:'silent'});try{
  await sim.call('radar.refresh');await wait();
  const result=await sim.call('radar.status');
  assert.equal(result.stage,'failed');assert.match(result.error,/DOWNLOAD: timeout/);
 }finally{sim.cleanup();}
});
