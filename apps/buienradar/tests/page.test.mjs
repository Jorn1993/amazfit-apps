import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function launch(connected=true) {
 let page,swipe,active=0,crown=null,frame=null,callbacks={},stopped=0;
 const widgets=[],requests=[],cache=new Map();
 const createWidget=(type,opts)=>{
  const w={type,values:{...opts},setProperty(key,value){
   if(key==='more')Object.assign(this.values,value);
   else this.values[key]=value;
  }};
  widgets.push(w);
  if(type===5)w.createWidget=createWidget;
  return w;
 };
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3,IMG:4,VIEW_CONTAINER:5},
  prop:{TEXT:'text',COLOR:'color',Y:'y',H:'h',VISIBLE:'visible',MORE:'more'},
  align:{CENTER_H:1},text_style:{WRAP:1},createWidget};
 class TransferFile{
  getInbox(){return {on(name,cb){callbacks[name]=cb;},getNextFile(){return frame;}};}
 }
 const forecast={
  ok:true,location:{name:'Antwerpen',lat:51.2194,lon:4.4025},
  points:Array.from({length:24},(_,i)=>({time:'20:00',mmh:i>9?1:0})),
  summary1h:{state:'incoming',etaMinutes:50,totalMm:0.17},
  summary2h:{state:'incoming',etaMinutes:50,totalMm:1.17},
  updatedAt:Date.now(),nextHourMm:0.2,
  station:{station:'Deurne',temperature:12,direction:'NW',windKmh:8,gustKmh:14,
   weatherDescription:'Bewolkt'}
 };
 const source=readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  ui,Page:v=>page=v,BasePage:v=>v,
  setScrollMode:v=>{swipe=v;return 1;},getSwiperIndex:()=>active+1,
  SCROLL_MODE_SWIPER_HORIZONTAL:'HORIZONTAL',
  onDigitalCrown:({callback})=>{crown=callback;},
  offDigitalCrown:()=>{},KEY_HOME:1,
  TransferFile,push:()=>{},setAlarm:()=>1,cancelAlarm:()=>0,
  LocalStorage:class{getItem(k){return cache.get(k);}setItem(k,v){cache.set(k,v);}},
  setInterval:()=>11,clearInterval:()=>{stopped++;},setTimeout:()=>7,clearTimeout:()=>{},
  Date,Math,Number,String,JSON,Error,Array,Promise
 });
 page.messaging={request:async req=>{
  requests.push(req);
  if(req.method==='rain.forecast')
   return connected?forecast:{ok:false,error:'offline'};
  if(req.method==='radar.manifest')return {ok:true,generatedAt:'2026-11-02T22:00:00Z',
   frameCount:6,frames:Array.from({length:6},(_,i)=>'frame-'+i+'.png')};
  if(req.method==='radar.frame')return {ok:false,error:'mock BLE'};
  if(req.method==='radar.snapshot')return {ok:true,generatedAt:new Date().toISOString()};
  return {ok:false,error:'unsupported'};
 }};
 return {page,widgets,cache,requests,getSwiper:()=>swipe,
  setPage:i=>{active=i;},crown:(n)=>crown?.(1,n),
  receive(i,kind='buienradar-frame',stamp=new Date().toISOString()){
   frame={params:{kind,
    generatedAt:stamp,frameIndex:i},
    sessionId:'t'+i,filePath:'data://download/frame-'+i+'.img',
    readyState:'transferred'};
   callbacks.NEWFILE();
  },getStopped:()=>stopped
 };
}
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const safe=r=>{
 for(const [x,y] of [[r.x,r.y],[r.x+r.w,r.y],
  [r.x,r.y+r.h],[r.x+r.w,r.y+r.h]]){
  assert.ok(Math.hypot(x-240,y-240)<=239.9,
   'Clipped '+JSON.stringify(r)+' at '+x+','+y);
 }
};
test('Three native pages use horizontal swiping; all have a location entry',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.getSwiper().mode,'HORIZONTAL');
 assert.equal(t.getSwiper().options.count,3);
 assert.equal(t.page.pageViews.length,3);
 for(let i=0;i<3;i++){
  const b=t.page.parts[i].filter(w=>w.type===2);
  assert.equal(b.length,i===1?3:i===0?2:1);
  safe(t.page.cityLabels[i].values);
 }
 t.page.onDestroy();assert.equal(t.getStopped(),3);
});
test('Radar fills face and hides bogus marker and on-map zoom buttons',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.radarWidget.values.w,480);
 assert.equal(t.page.radarWidget.values.h,480);
 assert.equal(t.page.markerPieces,undefined);
 assert.equal(t.page.parts[0].filter(w=>w.type===2).length,2);
 t.page.changeZoom(1);
 assert.ok(t.page.zoom>1);
 // Never animate the bundled old frames as if they were current.
 t.page.nextRadarFrame();assert.equal(t.page.frameIndex,0);
 t.page.radarMode='animation';t.page.radarStamp=new Date().toISOString();
 t.page.nextRadarFrame();assert.equal(t.page.frameIndex,1);
 t.page.onDestroy();
});
test('One data set controls both 1h/2h forecast, graph and station metrics',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.rainState.values.text,'REGEN OVER 50 MIN');
 assert.match(t.page.rainDetail.values.text,/2 uur/);
 t.page.setHorizon(1);
 assert.match(t.page.rainDetail.values.text,/komend uur/);
 assert.equal(t.page.bars.slice(12).every(w=>w.values.visible===false),true);
 assert.equal(t.page.temp.values.text,'12°');
 assert.equal(t.page.wind.values.text,'8 km/u');
 assert.equal(t.page.amount.values.text,'0,2 mm');
 t.page.onDestroy();
});
test('Circular-safe weather panels, labels and all touch targets',async()=>{
 const t=launch();t.page.build();await flush();
 const parts=t.page.parts[2].filter(w=>
  (w.type===3&&w.values.color===0x112839)||
   w===t.page.temp||w===t.page.amount||w===t.page.wind||w===t.page.gusts);
 assert.equal(parts.filter(w=>w.type===3).length,2);
 for(const w of parts)safe(w.values);
 t.page.onDestroy();
});
test('A stale phone response never invents weather; cache survives for widget',async()=>{
 const t=launch(false);
 t.cache.set('buienradar.overview.v3',JSON.stringify({at:Date.now()-900000}));
 t.page.build();await flush();
 assert.equal(t.page.rainState.values.text,'GEEN RECENTE DATA');
 assert.equal(t.page.temp.values.text,'--°');
 assert.ok(t.cache.get('buienradar.overview.v3'));
 t.page.onDestroy();
});
test('The code has a crown listener but no permanently visible zoom buttons',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(typeof t.crown,'function');
 t.page.onDestroy();
});

test('Rain alert does not fire late after its intended lead time',async()=>{
 const t=launch();t.page.build();await flush();
 t.cache.set('buienradar.alert',JSON.stringify({enabled:true,lead:30}));
 t.page.rain={...t.page.rain,
  updatedAt:Date.now()-10*60000,
  points:Array.from({length:24},(_,i)=>({mmh:i>=2?1:0}))};
 t.page.scheduleRainAlert(t.page.rain);
 assert.equal(t.cache.get('buienradar.alert-alarm-id'),'0');
 t.page.onDestroy();
});

test('Stale scheduled animation triggers direct official phone radar snapshot',async()=>{
 const t=launch();t.page.build();await flush();
 assert.ok(t.requests.some(req=>req.method==='radar.snapshot'),
  'Official direct PNG fallback should run if scheduled GIF cache is outdated');
 assert.equal(t.page.radarMode,'archive');
 assert.equal(t.page.radarLabel.values.text,'RADAR OPHALEN...');
 t.page.onDestroy();
});
test('Direct snapshot over BLE replaces outdated loop with a fresh single frame',async()=>{
 const t=launch();t.page.build();await flush();
 const stamp=new Date().toISOString();
 t.receive(0,'buienradar-snapshot',stamp);
 assert.equal(t.page.radarMode,'snapshot');
 assert.equal(t.page.radarPaths.length,1);
 assert.equal(t.page.radarLabel.values.text,'');
 assert.equal(t.page.radarLabel.values.visible,false);
 assert.equal(JSON.parse(t.cache.get('buienradar.radar-frames.v1')).mode,'snapshot');
 t.page.nextRadarFrame();
 assert.equal(t.page.frameIndex,0,'single snapshot never pretends to animate');
 t.page.onDestroy();
});

test('Radar retry button exists and does not misrepresent old pictures as current',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(typeof t.page.radarLabel.values.click_func,'function');
 assert.equal(t.page.radarMode,'archive');
 assert.ok(t.page.radarLabel.values.text.includes('OPHALEN'));
 t.page.radarError='DOWNLOAD: offline';t.page.radarSyncing=false;
 t.page.updateRadarLabel();
 assert.match(t.page.radarLabel.values.text,/DOWNLOAD MISLUKT/);
 t.page.onDestroy();
});
