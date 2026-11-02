import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function create({download='success',convert='success',transfer='success'}={}){
 let service,downloaderUrl=null,transfers=0;
 const delays=new Set();
 const delayed=(fn,ms)=>{
  const t=setTimeout(()=>{delays.delete(t);fn();},ms>500?15:ms);
  delays.add(t);return t;
 };
 const clear=t=>{clearTimeout(t);delays.delete(t);};
 const req={onSuccess:null,onFail:null,cancel(){}};
 const network={downloader:{downloadFile(options){
  downloaderUrl=options.url;
  delayed(()=>{
   if(download==='success')req.onSuccess?.({statusCode:200,filePath:'data://download/frame.png'});
   else req.onFail?.({code:42,message:'download failed'});
  },4);
  return req;
 }}};
 const manifest={version:1,source:'Buienradar.nl',
  product:'RadarMapRainWebmercatorBE',generatedAt:new Date().toISOString(),
  frameCount:6,frames:Array.from({length:6},(_,i)=>'frame-'+i+'.png')};
 const image={convert:async()=>convert==='success'?{targetFilePath:'data://download/converted.img'}:
  Promise.reject(Error('bad PNG'))};
 const transferFile={getOutbox(){return {enqueueFile(_,params){
  assert.equal(params.kind,'buienradar-frame');
  transfers++;return {readyState:'pending',on(name,cb){
   if(name==='change')delayed(()=>cb({data:{readyState:transfer==='success'?
    'transferred':'error'}}),4);
  },cancel(){}};
 }};}};
 const source=fs.readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  AppSideService:v=>service=v,BaseSideService:v=>v,
  parseRaintext:()=>[],describe:()=>({}),normalLocation:x=>x,REFRESH_MS:300000,
  nearestStation:()=>null,nextHourRain:()=>0,
  RADAR_CACHE_BASE:'https://raw.githubusercontent.com/Jorn1993/amazfit-apps/radar-cache/radar',
  parseFrameManifest:x=>({...x,ok:true}),
  frameUrl:n=>'https://raw.githubusercontent.com/Jorn1993/amazfit-apps/radar-cache/radar/'+n,
  fetch:async ({url})=>url.includes('manifest')?{status:200,body:manifest}:{status:404},
  settings:{settingsStorage:{getItem:()=>null}},
  network,image,transferFile,
  setTimeout:delayed,clearTimeout:clear,
  Date,Math,Error,Number,String,JSON,Promise,console:{log(){}}
 });
 const call=method=>new Promise(done=>service.onRequest({method,
  params:method==='radar.frame'?{index:0}:{}},(_,response)=>done(response)));
 return {call,getUrl:()=>downloaderUrl,count:()=>transfers,
  cleanup:()=>{for(const d of delays)clearTimeout(d);}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,65));
test('Latest verified official animation manifest is fetched',async()=>{
 const sim=create();try{
  const result=await sim.call('radar.manifest');
  assert.equal(result.ok,true);
  assert.equal(result.frameCount,6);
 }finally{sim.cleanup();}
});
test('Individual PNG frames are converted and transferred',async()=>{
 const sim=create();try{
  await sim.call('radar.manifest');
  assert.equal((await sim.call('radar.frame')).ok,true);
  await settle();
  assert.match(sim.getUrl(),/radar-cache\/radar\/frame-0\.png/);
  assert.equal((await sim.call('radar.status')).stage,'transferred');
  assert.equal(sim.count(),1);
 }finally{sim.cleanup();}
});
test('Broken image conversion shows a specific failure stage',async()=>{
 const sim=create({convert:'fail'});try{
  await sim.call('radar.manifest');await sim.call('radar.frame');await settle();
  const state=await sim.call('radar.status');
  assert.equal(state.stage,'failed');assert.match(state.error,/CONVERT/);
 }finally{sim.cleanup();}
});
test('Bluetooth failure is reported rather than showing unverified success',async()=>{
 const sim=create({transfer:'fail'});try{
  await sim.call('radar.manifest');await sim.call('radar.frame');await settle();
  const state=await sim.call('radar.status');
  assert.equal(state.stage,'failed');assert.match(state.error,/TRANSFER/);
 }finally{sim.cleanup();}
});
test('Failed network download does not enqueue a blank frame',async()=>{
 const sim=create({download:'fail'});try{
  await sim.call('radar.manifest');await sim.call('radar.frame');await settle();
  const state=await sim.call('radar.status');
  assert.equal(state.stage,'failed');assert.match(state.error,/DOWNLOAD/);
  assert.equal(sim.count(),0);
 }finally{sim.cleanup();}
});
