import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const stamp='2026-11-02T20:00:00Z';
function launch(connected=true){
 let page,scroll,frame=null,callbacks={},stopped=0;
 const widgets=[],requests=[],cache=new Map();
 const add=(type,opts)=>{
  const w={type,values:{...opts},
   setProperty(key,val){this.values[key]=val;}};
  widgets.push(w);
  if(type===5)w.createWidget=(t,p)=>add(t,p);
  return w;
 };
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3,IMG:4,VIEW_CONTAINER:5},
  prop:{TEXT:'text',COLOR:'color',Y:'y',H:'h',VISIBLE:'visible',MORE:'more'},
  align:{CENTER_H:1},text_style:{WRAP:1},createWidget:add};
 class TransferFile{
  getInbox(){return {
   on(name,cb){callbacks[name]=cb;},getNextFile(){return frame;}
  };}
 }
 const forecast={ok:true,location:{name:'Antwerpen'},
  points:Array.from({length:24},(_,i)=>({time:'20:00',mmh:i>9?1:0})),
  summary:{headline:'REGEN OP KOMST',detail:'Regen over 50 min',rainingNow:false},
  nextHourMm:0.2,station:{station:'Deurne',distanceKm:6,
   temperature:12,direction:'NW',windKmh:8,gustKmh:14,
   weatherDescription:'Bewolkt'}};
 const source=fs.readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{ui,Page:v=>page=v,BasePage:v=>v,
  setScrollMode:v=>{scroll=v;return 1;},
  SCROLL_MODE_SWIPER_HORIZONTAL:'SWIPER_HORIZONTAL',
  TransferFile,push:()=>{},setAlarm:()=>1,cancelAlarm:()=>0,
  LocalStorage:class{getItem(k){return cache.get(k);}setItem(k,v){cache.set(k,v);}},
  setInterval:()=>11,clearInterval:()=>{stopped++;},
  setTimeout:()=>7,clearTimeout:()=>{},
  Date,Math,Number,String,JSON,Error,Array,Promise});
 page.messaging={request:async req=>{
  requests.push(req);
  if(req.method==='rain.forecast')return connected?forecast:{ok:false,error:'offline'};
  if(req.method==='radar.manifest')return {
   ok:true,generatedAt:stamp,frameCount:6,
   frames:Array.from({length:6},(_,i)=>'frame-'+i+'.png')
  };
  if(req.method==='radar.frame')return {ok:false,error:'Not paired in mock'};
  return {ok:false,error:'Unknown request'};
 }};
 return {page,widgets,requests,cache,
  getScroll:()=>scroll,
  swipe:index=>scroll.options.modeParams.on_page(index),
  receive(index){
   frame={params:{kind:'buienradar-frame',generatedAt:stamp,frameIndex:index},
    sessionId:'transfer-'+index,filePath:'data://download/updated-'+index+'.img',
    readyState:'transferred'};
   callbacks.NEWFILE();
  },
  stopped:()=>stopped
 };
}
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
test('Native 3-page smooth horizontal swiper replaces instant gesture switching',async()=>{
 const t=launch();t.page.build();await flush();
 const cfg=t.getScroll();
 assert.equal(cfg.mode,'SWIPER_HORIZONTAL');
 assert.equal(cfg.options.width,480);
 assert.equal(cfg.options.count,3);
 assert.equal(t.page.pageViews.length,3);
 assert.deepEqual(Array.from(t.page.pageViews,view=>view.values.page),[0,1,2]);
 assert.equal(t.page.screen,0);
 t.swipe(1);assert.equal(t.page.screen,1);
 t.swipe(2);assert.equal(t.page.screen,2);
 t.swipe(0);assert.equal(t.page.screen,0);
 t.page.onDestroy();assert.equal(t.stopped(),2);
});
test('Full-bleed radar is instant, covers 480x480 and contains no controls',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.radarWidget.values.x,0);
 assert.equal(t.page.radarWidget.values.y,0);
 assert.equal(t.page.radarWidget.values.w,480);
 assert.equal(t.page.radarWidget.values.h,480);
 assert.equal(t.page.radarWidget.values.src,'radar-frame-0.png');
 assert.equal(t.page.parts[0].filter(x=>x.type===2).length,2,'only + / - zoom buttons');
 t.page.nextRadarFrame();assert.equal(t.page.radarWidget.values.more.src,'radar-frame-1.png');
 assert.equal(t.page.city.values.text,'Antwerpen');
 t.page.onDestroy();
});
test('Actual BLE frames replace bundled animation only after 2 received',async()=>{
 const t=launch();t.page.build();await flush();
 t.receive(0);assert.equal(t.page.radarPaths.length,6);
 t.receive(1);assert.equal(t.page.radarPaths.length,2);
 assert.equal(t.page.radarPaths[0],'data://download/updated-0.img');
 assert.equal(t.page.radarPaths[1],'data://download/updated-1.img');
 assert.ok(t.cache.has('buienradar.radar-frames.v1'));
 t.page.onDestroy();
});
test('Useful third page: large temperature, precipitation and wind with genuine pictograms',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.temp.values.text,'12°');
 assert.equal(t.page.temp.values.text_size,62);
 assert.equal(t.page.amount.values.text,'0.2 mm');
 assert.match(t.page.wind.values.text,/NW/);
 assert.equal(t.page.station.values.text,'');
 assert.equal(t.page.weatherIcon.values.more.src,'weather-cloud.png');
 assert.ok(!t.page.parts[2].some(x=>x.values.src==='buienradar-logo.png'));
 assert.ok(t.page.parts[2].some(x=>x.values.src==='weather-drop.png'));
 t.page.onDestroy();
});
test('Missing forecast never fabricates readings',async()=>{
 const t=launch(false);t.page.build();await flush();
 assert.equal(t.page.rainState.values.text,'GEEN GEGEVENS');
 assert.equal(t.page.temp.values.text,'--°');
 assert.equal(t.page.amount.values.text,'-- mm');
 assert.equal(t.page.wind.values.text,'-- km/u');
 t.page.onDestroy();
});
