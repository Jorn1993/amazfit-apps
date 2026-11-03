import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function launch({connected=true,cacheCurrent=null,cacheOld=null}={}){
 let page,crown,swipe,stopped=0;
 const requests=[],cache=new Map();
 if(cacheCurrent)cache.set('buienradar.current.v2',JSON.stringify(cacheCurrent));
 if(cacheOld)cache.set('buienradar.animation.v3',JSON.stringify(cacheOld));
 function makeWidget(type,props){
  const obj={type,values:{...props},setProperty(key,value){
   if(key==='more')Object.assign(this.values,value);
   else this.values[key]=value;
  }};
  if(type===5)obj.createWidget=makeWidget;
  return obj;
 }
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3,IMG:4,VIEW_CONTAINER:5},
  prop:{TEXT:'text',COLOR:'color',H:'h',Y:'y',VISIBLE:'visible',MORE:'more'},
  align:{CENTER_H:1},text_style:{WRAP:1},createWidget:makeWidget};
 const now=Date.now(),location={name:'Antwerpen',lat:51.2194,lon:4.4025};
 const rain={ok:true,updatedAt:now,location,
  summary1h:{state:'dry',totalMm:0},
  summary2h:{state:'dry',totalMm:0},
  points:Array.from({length:24},()=>({mmh:0,time:'18:00'})),
  nextHourMm:0,
  station:{temperature:11,windKmh:12,direction:'NO',weatherDescription:'Bewolkt'}};
 let selectedPage=0;
 const source=fs.readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  Page:x=>page=x,BasePage:x=>x,ui,
  setScrollMode:x=>swipe=x,getSwiperIndex:()=>selectedPage+1,
  SCROLL_MODE_SWIPER_HORIZONTAL:'horizontal',push:()=>{},
  onDigitalCrown:({callback})=>crown=callback,offDigitalCrown:()=>{},KEY_HOME:1,
  LocalStorage:class{getItem(k){return cache.get(k);}setItem(k,v){cache.set(k,v);}},
  setInterval:()=>99,clearInterval:()=>{stopped++;},
  setTimeout:(fn,ms)=>{if(ms<=50)queueMicrotask(fn);return 22;},
  clearTimeout:()=>{},Date,Math,JSON,Number,String,Promise,Error,Array
 });
 page.request=async req=>{
  requests.push(req);
  if(req.method==='rain.forecast')return connected?rain:{ok:false,error:'offline'};
  if(req.method==='radar.start')return connected?
   {ok:true,source:'Buienradar',mode:'current'}:{ok:false,error:'offline'};
  if(req.method==='radar.status')return {ok:true,stage:'transfer',busy:true};
  if(req.method==='config.get')return {ok:true,location};
  return {ok:false,error:'unknown'};
 };
 const receive=(fetchedAt=Date.now(),filePath='data://download/real-native.img')=>
  page.onReceivedFile({
   params:{kind:'buienradar-current-frame',source:'Buienradar',fetchedAt},
   sessionId:'observed-'+fetchedAt,filePath,readyState:'transferred'
  });
 return {page,requests,cache,receive,swipe:()=>swipe,stopped:()=>stopped,
  crown:()=>crown,setUiPage:x=>selectedPage=x};
}
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
test('Main app retains 3 pages: radar, 2h rain and weather',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.swipe().options.count,3);
 assert.equal(t.page.rainState.values.text,'DROOG');
 assert.equal(t.page.temp.values.text,'11°');
 assert.ok(t.requests.some(x=>x.method==='rain.forecast'));
 assert.ok(t.requests.some(x=>x.method==='radar.start'));
 assert.equal(typeof t.crown(),'function');
 t.page.onDestroy();
 assert.equal(t.stopped(),3);
});
test('Fullscreen 480x480, never a smaller inset',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.radarWidget.values.w,480);
 assert.equal(t.page.radarWidget.values.h,480);
 assert.equal(t.page.radarWidget.values.visible,false);
 t.receive();
 assert.equal(t.page.radarWidget.values.visible,true);
 assert.equal(t.page.radarWidget.values.src,'data://download/real-native.img');
 assert.equal(t.page.radarWidget.values.x,0);
 assert.equal(t.page.radarWidget.values.y,0);
 assert.equal(t.page.radarTime.values.text,'BUIENRADAR · ACTUEEL');
 assert.equal(t.page.radarLabel.values.visible,false);
 t.page.onDestroy();
});
test('A current observed radar is never labelled as a future forecast',async()=>{
 const t=launch();t.page.build();await flush();
 t.receive();
 assert.equal(t.page.radarTime.values.text,'BUIENRADAR · ACTUEEL');
 assert.ok(!t.page.radarTime.values.text.includes('+3U'));
 t.page.onDestroy();
});
test('Fresh converted image is cached for quick widget access',async()=>{
 const t=launch();t.page.build();await flush();
 t.receive();
 const saved=JSON.parse(t.cache.get('buienradar.current.v2'));
 assert.equal(saved.source,'Buienradar');
 assert.equal(saved.path,'data://download/real-native.img');
 assert.ok(Date.now()-saved.fetchedAt<5000);
 t.page.onDestroy();
});
test('Legacy potentially corrupt GIF cache is never loaded',async()=>{
 const t=launch({cacheOld:{source:'Buienradar',horizonMinutes:180,
  fetchedAt:Date.now(),frames:[{path:'data://green-noise.png'}]}});
 t.page.build();await flush();
 assert.equal(t.page.radarWidget.values.visible,false);
 t.page.onDestroy();
});
test('Recent current cached native image shows immediately',async()=>{
 const t=launch({cacheCurrent:{source:'Buienradar',fetchedAt:Date.now(),
  path:'data://download/known-good.img'}});
 t.page.build();await flush();
 assert.equal(t.page.radarWidget.values.src,'data://download/known-good.img');
 assert.equal(t.page.radarWidget.values.visible,true);
 t.page.onDestroy();
});
test('Expired image never appears as current',async()=>{
 const t=launch({cacheCurrent:{source:'Buienradar',
  fetchedAt:Date.now()-60*60000,path:'data://download/stale.img'}});
 t.page.build();await flush();
 assert.equal(t.page.radarWidget.values.visible,false);
 t.receive(Date.now()-60*60000);
 assert.equal(t.page.radarWidget.values.visible,false);
 t.page.onDestroy();
});
test('Out of order older image cannot overwrite newer native frame',async()=>{
 const t=launch();t.page.build();await flush();
 const now=Date.now();
 t.receive(now,'data://new.img');
 t.receive(now-5000,'data://old.img');
 assert.equal(t.page.radarWidget.values.src,'data://new.img');
 t.page.onDestroy();
});
test('ZML asynchronous BLE receiver waits for transfer completed',async()=>{
 const t=launch();t.page.build();await flush();
 let changed;
 const file={params:{kind:'buienradar-current-frame',source:'Buienradar',
  fetchedAt:Date.now()},sessionId:'async-current',filePath:null,
  readyState:'transferring',on(type,cb){if(type==='change')changed=cb;}};
 t.page.onReceivedFile(file);
 assert.equal(t.page.radarWidget.values.visible,false);
 file.filePath='data://converted-native.img';
 file.readyState='transferred';
 changed({data:{readyState:'transferred'}});
 assert.equal(t.page.radarWidget.values.src,'data://converted-native.img');
 t.page.onDestroy();
});
test('Broken Bluetooth is an explicit visible error rather than infinite loading',async()=>{
 const t=launch();t.page.build();await flush();
 let changed;
 const file={params:{kind:'buienradar-current-frame',source:'Buienradar',
  fetchedAt:Date.now()},sessionId:'broken',filePath:null,
  readyState:'transferring',on(type,cb){if(type==='change')changed=cb;}};
 t.page.onReceivedFile(file);
 changed({data:{readyState:'error'}});
 assert.match(t.page.radarError,/BLUETOOTH/);
 assert.equal(t.page.radarSyncing,false);
 assert.equal(t.page.radarLabel.values.text,'OPNIEUW PROBEREN');
 t.page.onDestroy();
});
test('Offline side service error is explicit and rain never looks fresh',async()=>{
 const t=launch({connected:false});t.page.build();await flush();
 assert.match(t.page.radarError,/offline/);
 assert.match(t.page.rainDetail.values.text,/offline/);
 t.page.onDestroy();
});
