import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function launch({connected=true,cacheFuture=null,frameEnabled=false}={}){
 let page,frame=null,callbacks={},crown,swipe,stopped=0;
 const requests=[],cache=new Map();
 if(cacheFuture)cache.set('buienradar.future-radar.v1',JSON.stringify(cacheFuture));
 let setUiPage=0;
 function createWidget(type,options){
  const widget={type,values:{...options},setProperty(key,value){
   if(key==='more')Object.assign(this.values,value);
   else this.values[key]=value;
  }};
  if(type===5)widget.createWidget=createWidget;
  return widget;
 }
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3,IMG:4,VIEW_CONTAINER:5},
  prop:{TEXT:'text',COLOR:'color',H:'h',Y:'y',VISIBLE:'visible',MORE:'more'},
  align:{CENTER_H:1},text_style:{WRAP:1},createWidget};
 class TransferFile{getInbox(){return {
  on(event,cb){callbacks[event]=cb;},
  getNextFile(){return frame;}
 };}}
 const now=Date.now();
 const forecast={ok:true,location:{name:'Antwerpen',lat:51.2194,lon:4.4025},
  updatedAt:now,
  summary1h:{state:'dry',totalMm:0},summary2h:{state:'dry',totalMm:0},
  nextHourMm:0,
  points:Array.from({length:24},()=>({mmh:0,time:'17:00'})),
  station:{temperature:11,windKmh:12,direction:'NO',weatherDescription:'Bewolkt'}};
 const times=[10,30,50,70,90,110].map(minutes=>now+minutes*60000);
 const raw=fs.readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(raw,{
  Page:x=>page=x,BasePage:x=>x,ui,
  setScrollMode:x=>{swipe=x;},getSwiperIndex:()=>setUiPage+1,
  SCROLL_MODE_SWIPER_HORIZONTAL:'horizontal',
  TransferFile,push:()=>{},
  onDigitalCrown:({callback})=>{crown=callback;},offDigitalCrown:()=>{},KEY_HOME:1,
  LocalStorage:class{getItem(k){return cache.get(k);}setItem(k,v){cache.set(k,v);}},
  setAlarm:()=>1,cancelAlarm:()=>0,
  setInterval:()=>99,clearInterval:()=>{stopped++;},
  setTimeout:()=>22,clearTimeout:()=>{},
  Date,Math,JSON,Number,String,Promise,Error,Array
 });
 page.messaging={request:async request=>{
  requests.push(request);
  if(request.method==='rain.forecast')return connected?forecast:{ok:false};
  if(request.method==='radar.forecast')return connected?
   {ok:true,source:'KMI',fetchedAt:Date.now(),
    frames:times.map((validAt,index)=>({
     validAt,index,time:new Date(validAt).toISOString()
    }))}:{ok:false,error:'offline'};
  if(request.method==='radar.frame')return frameEnabled?{ok:true}:{ok:false,error:'mock BLE'};
  return {ok:true,stage:'idle'};
 }};
 const receive=(index=0,time=times[index],path='data://future.img')=>{
  frame={params:{kind:'future-radar-frame',source:'KMI',frameIndex:index,
   validAt:time,validTime:new Date(time).toISOString()},
   sessionId:'f-'+index,filePath:path,readyState:'transferred'};
  callbacks.NEWFILE();
 };
 return {page,requests,cache,receive,times,stop:()=>stopped,crown:()=>crown,
  getSwipe:()=>swipe,setUiPage:next=>setUiPage=next};
}
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
test('Three horizontally swiped pages, weather data not compromised',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.getSwipe().options.count,3);
 assert.equal(t.page.rainState.values.text,'DROOG');
 assert.equal(t.page.temp.values.text,'11°');
 assert.equal(t.page.wind.values.text,'12 km/u');
 t.page.onDestroy();assert.equal(t.stop(),3);
});
test('First launch shows ONLY static Belgian map, no historical rain imagery',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.radarBase.values.src,'kmi-be-map.png');
 assert.equal(t.page.radarWidget.values.src,'kmi-clear.png');
 assert.ok(t.page.radarFrames.filter(Boolean).length===0);
 assert.ok(t.requests.some(x=>x.method==='radar.forecast'));
 assert.ok(!t.requests.some(x=>x.method==='radar.manifest'||x.method==='radar.snapshot'));
 t.page.onDestroy();
});
test('Received future PNG becomes visible and persists for immediate reuse',async()=>{
 const t=launch();t.page.build();await flush();
 t.receive();
 assert.equal(t.page.radarWidget.values.src,'data://future.img');
 const saved=JSON.parse(t.cache.get('buienradar.future-radar.v1'));
 assert.equal(saved.source,'KMI');
 assert.equal(saved.frames[0].validAt,t.times[0]);
 t.page.onDestroy();
});
test('Past radar BLE frames are rejected and never displayed',async()=>{
 const t=launch();t.page.build();await flush();
 t.receive(0,Date.now()-3600000,'data://old.png');
 assert.equal(t.page.radarWidget.values.src,'kmi-clear.png');
 t.page.onDestroy();
});
test('Cached current future forecast renders instantly; stale cache never does',async()=>{
 const now=Date.now();
 const good={source:'KMI',fetchedAt:now-60000,
  frames:[{validAt:now+600000,path:'data://good.img'}]};
 const old={...good,fetchedAt:now-2*3600000};
 const first=launch({cacheFuture:good});first.page.build();await flush();
 assert.equal(first.page.radarWidget.values.src,'data://good.img');
 first.page.onDestroy();
 const second=launch({cacheFuture:old});second.page.build();await flush();
 assert.equal(second.page.radarWidget.values.src,'kmi-clear.png');
 second.page.onDestroy();
});
test('Radar has no permanent tiny zoom buttons and crown exists',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(typeof t.crown(),'function');
 assert.equal(t.page.parts[0].filter(x=>x.type===2).length,2);
 t.page.onDestroy();
});


test('Proactive refresh keeps a valid future image visible until the first replacement arrives',async()=>{
 const now=Date.now();
 const old={source:'KMI',fetchedAt:now-9*60000,
  frames:[{validAt:now+45*60000,path:'data://prior.img'}]};
 const t=launch({cacheFuture:old});t.page.build();await flush();
 assert.ok(t.requests.some(r=>r.method==='radar.forecast'));
 assert.equal(t.page.radarWidget.values.src,'data://prior.img');
 t.receive(0,t.times[0],'data://replacement.img');
 assert.equal(t.page.radarWidget.values.src,'data://replacement.img');
 assert.equal(t.page.radarFallback,null);
 t.page.onDestroy();
});
test('Manual refresh also preserves a recent future image if BLE fails',async()=>{
 const now=Date.now();
 const good={source:'KMI',fetchedAt:now-60000,
  frames:[{validAt:now+45*60000,path:'data://still-good.img'}]};
 const t=launch({cacheFuture:good});t.page.build();await flush();
 await t.page.requestRadar(true);await flush();
 assert.equal(t.page.radarWidget.values.src,'data://still-good.img');
 t.page.onDestroy();
});
test('Radar frame timeout invalidation does not leave an expired image on screen',async()=>{
 const now=Date.now();
 const t=launch({cacheFuture:{source:'KMI',fetchedAt:now-60000,
  frames:[{validAt:now+3600000,path:'data://prior.img'}]}});
 t.page.build();await flush();
 assert.equal(t.page.radarDisplayed,true);
 // A controlled stale-cache scenario verifies blanking on the next animation tick.
 t.page.radarFetchedAt=now-13*60000;
 t.page.nextRadarFrame();
 assert.equal(t.page.radarWidget.values.src,'kmi-clear.png');
 t.page.onDestroy();
});
