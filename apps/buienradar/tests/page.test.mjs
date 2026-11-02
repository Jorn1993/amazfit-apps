import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const stamp='2026-11-02T20:00:00Z';
function launch(available=true){
 let page,gesture,frame=null,callbacks={},stopped=false,disconnected=false;
 const widgets=[],requests=[],dataStore=new Map();
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3,IMG:4},
  prop:{TEXT:'text',COLOR:'color',Y:'y',H:'h',VISIBLE:'visible',MORE:'more'},
  align:{CENTER_H:1},text_style:{WRAP:1},
  createWidget(type,opts){
   const widget={type,values:{...opts},setProperty(key,value){this.values[key]=value;}};
   widgets.push(widget);return widget;
  }};
 class TransferFile{
  getInbox(){return {
   on(name,cb){callbacks[name]=cb;},
   getNextFile(){return frame;}
  };}
 }
 const forecast={ok:true,location:{name:'Antwerpen'},
  points:Array.from({length:24},(_,i)=>({time:'20:00',mmh:i>9?1:0})),
  summary:{headline:'REGEN OP KOMST',detail:'Regen over 50 min',rainingNow:false},
  nextHourMm:0.2,station:{station:'Deurne',distanceKm:6,
   temperature:12,direction:'NW',windKmh:8,gustKmh:14}};
 const source=fs.readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{ui,Page:v=>page=v,BasePage:v=>v,
  TransferFile,LocalStorage:class{getItem(k){return dataStore.get(k);}setItem(k,v){dataStore.set(k,v);}},
  onGesture:({callback})=>{gesture=callback;},offGesture:()=>{disconnected=true;},
  GESTURE_LEFT:5,GESTURE_RIGHT:6,
  setInterval:()=>1,clearInterval:()=>{stopped=true;},
  setTimeout:()=>2,clearTimeout:()=>{},
  Date,Math,Number,String,JSON,Error,Array,Promise});
 page.messaging={request:async req=>{
  requests.push(req);
  if(req.method==='rain.forecast')return available?forecast:{ok:false,error:'offline'};
  if(req.method==='radar.manifest')return {
   ok:true,generatedAt:stamp,frameCount:6,frames:Array.from({length:6},(_,i)=>'frame-'+i+'.png')
  };
  if(req.method==='radar.frame')return {ok:false,error:'Transfer is unavailable in mock'};
  return {ok:false,error:'Unknown method'};
 }};
 return {page,widgets,requests,store:dataStore,
  swipe:value=>gesture(value),
  receive(index){
   frame={params:{kind:'buienradar-frame',generatedAt:stamp,frameIndex:index},
    sessionId:index+100,filePath:'data://download/live-'+index+'.img',
    readyState:'transferred'};
   callbacks.NEWFILE();
  },
  done:()=>stopped&&disconnected};
}
const flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
test('Animated radar page exists immediately without GPS or refresh buttons',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.screen,0);
 assert.equal(t.page.radarWidget.values.src,'radar-frame-0.png');
 const page0=t.page.parts[0];
 assert.equal(page0.filter(x=>x.type===2).length,0,'no manual controls');
 assert.ok(t.requests.some(x=>x.method==='radar.manifest'));
 t.page.nextRadarFrame();
 assert.equal(t.page.radarWidget.values.more.src,'radar-frame-1.png');
 t.page.onDestroy();
 assert.ok(t.done());
});
test('Three large pages respond to gestures',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.swipe(5),true);assert.equal(t.page.screen,1);
 assert.equal(t.swipe(5),true);assert.equal(t.page.screen,2);
 assert.equal(t.swipe(5),false);
 assert.equal(t.swipe(6),true);assert.equal(t.page.screen,1);
 assert.equal(t.page.bars.length,24);
 t.page.onDestroy();
});
test('Actual BLE frame replaces bundled animation and saves cached paths',async()=>{
 const t=launch();t.page.build();await flush();
 t.receive(0);t.receive(1);
 assert.equal(t.page.radarPaths.length,2);
 assert.equal(t.page.radarPaths[0],'data://download/live-0.img');
 assert.equal(t.page.radarPaths[1],'data://download/live-1.img');
 assert.ok(t.store.has('buienradar.radar-frames.v1'));
 t.page.onDestroy();
});
test('Rainfall data and current station measurements still appear',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.city.values.text,'Antwerpen');
 assert.equal(t.page.rainState.values.text,'REGEN OP KOMST');
 assert.equal(t.page.temp.values.text,'12 °C');
 assert.equal(t.page.amount.values.text,'0.2 mm');
 assert.match(t.page.station.values.text,/Deurne/);
 assert.ok(t.store.has('buienradar.shortcut'));
 t.page.onDestroy();
});
test('Missing phone weather cannot invent readings',async()=>{
 const t=launch(false);t.page.build();await flush();
 assert.equal(t.page.rainState.values.text,'GEEN NEERSLAGDATA');
 assert.equal(t.page.temp.values.text,'-- °C');
 assert.equal(t.page.amount.values.text,'-- mm');
 t.page.onDestroy();
});
