import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function launch(response){
 let page,gesture=null,disabled=false,cleared=false,requests=[],newfile=null;
 const widgets=[];
 const ui={
  widget:{TEXT:1,BUTTON:2,FILL_RECT:3,IMG:4},
  prop:{TEXT:'TEXT',COLOR:'COLOR',Y:'Y',H:'H',VISIBLE:'VISIBLE',SRC:'SRC'},
  align:{CENTER_H:1},text_style:{WRAP:1},
  createWidget(type,params){
   const w={type,values:{...params},setProperty(prop,value){
    this.values[prop.toLowerCase()]=value;
   }};
   widgets.push(w);return w;
  }
 };
 class TransferFile{
  getInbox(){return {on(event,cb){if(event==='NEWFILE')newfile=cb;},
   getNextFile(){return {params:{kind:'buienradar-radar'},
    filePath:'data://download/live-radar.png',
    on(name,cb){if(name==='change')cb({data:{readyState:'transferred'}});}};}};}
 }
 const store=new Map();
 const data=response===undefined?{ok:true,location:{name:'Gent'},
  points:Array.from({length:24},(_,i)=>({mmh:i<6?0:1,time:'10:00'})),
  summary:{headline:'REGEN OP KOMST',detail:'Regen over 30 minuten',rainingNow:false},
  nextHourMm:0.5,station:{station:'Vlissingen',distanceKm:49,
   temperature:16,windKmh:14,gustKmh:23,direction:'ZW'}}:response;
 const src=fs.readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(src,{ui,Page:x=>page=x,BasePage:x=>x,Geolocation:class{},
  TransferFile,LocalStorage:class{setItem(k,v){store.set(k,v);}getItem(k){return store.get(k);}},
  onGesture:x=>{gesture=x.callback;},offGesture:()=>{disabled=true;},
  GESTURE_LEFT:5,GESTURE_RIGHT:6,
  Number,Math,Date,String,Error,Array,JSON,
  setInterval:()=>1,clearInterval:()=>{cleared=true;},
  setTimeout:()=>7,clearTimeout:()=>{}},{filename:'page/index.js'});
 page.messaging={request:async(req)=>{
  requests.push(req);
  return req.method==='radar.refresh'?{ok:true,requested:true}:data;
 }};
 return {page,widgets,requests,store,trigger:()=>newfile&&newfile(),
  gesture:event=>gesture(event),disabled:()=>disabled,cleared:()=>cleared};
}
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
test('Three dedicated screens navigate on left/right swipes and hide inactive widgets',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.screen,0);
 assert.equal(t.page.bars.length,24);
 assert.equal(t.gesture(5),true);
 assert.equal(t.page.screen,1);
 assert.equal(t.gesture(5),true);
 assert.equal(t.page.screen,2);
 assert.equal(t.gesture(5),false);
 assert.equal(t.gesture(6),true);
 assert.equal(t.page.screen,1);
 assert.equal(t.page.parts[2].every(w=>w.values.visible===false),true);
 t.page.onDestroy();assert.ok(t.disabled());assert.ok(t.cleared());
});
test('Graph scales real 5-minute rainfall; weather stations are explicitly identified',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.rainState.values.text,'REGEN OP KOMST');
 assert.equal(t.page.bars[0].values.color,0x202020);
 assert.equal(t.page.bars[12].values.color,0x339de2);
 assert.equal(t.page.temp.values.text,'16 °C');
 assert.equal(t.page.amount.values.text,'0.5 mm');
 assert.match(t.page.station.values.text,/Vlissingen/);
 assert.equal(t.page.city.values.text,'Gent');
 assert.ok(t.store.has('buienradar.shortcut'));
 t.page.onDestroy();
});
test('Official radar is requested and only displayed after transferred file arrives',async()=>{
 const t=launch();t.page.build();await flush();
 assert.ok(t.requests.some(x=>x.method==='radar.refresh'));
 assert.equal(t.page.radarWidget,null);
 t.trigger();
 assert.equal(t.page.radarWidget.values.src,'data://download/live-radar.png');
 assert.equal(t.page.radarMessage.values.visible,false);
 t.page.setPage(1);
 assert.equal(t.page.radarWidget.values.visible,false);
 t.page.onDestroy();
});
test('Missing data never appears as weather values and cache is not written',async()=>{
 const t=launch({ok:false,error:'offline'});t.page.build();await flush();
 assert.equal(t.page.rainState.values.text,'GEEN NEERSLAGDATA');
 assert.equal(t.page.temp.values.text,'-- °C');
 assert.equal(t.page.amount.values.text,'-- mm');
 assert.equal(t.store.has('buienradar.shortcut'),false);
 t.page.onDestroy();
});
test('Refresh requires phone response; no GPS is requested without tapping GPS',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.requests.filter(x=>x.method==='rain.forecast').length,1);
 assert.equal(t.requests.filter(x=>x.method==='rain.forecast').every(x=>!x.params.gps),true);
 t.page.loading=true;await t.page.refresh();
 assert.equal(t.requests.filter(x=>x.method==='rain.forecast').length,1);
 t.page.onDestroy();
});
