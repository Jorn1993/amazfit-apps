import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function launch({connected=true,cacheRadar=null,oldKmi=null}={}){
 let page,transferFile=null,callbacks={},crown,swipe,stopped=0;
 const requests=[],cache=new Map(),savedFiles=new Map();
 if(cacheRadar)cache.set('buienradar.animation.v2',JSON.stringify(cacheRadar));
 if(oldKmi)cache.set('buienradar.future-radar.v1',JSON.stringify(oldKmi));
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
 class TransferFile{
  getInbox(){return {on(event,cb){callbacks[event]=cb;},
   getNextFile(){return transferFile;}};}
 }
 const now=Date.now(),rain={ok:true,updatedAt:now,
  location:{name:'Antwerpen',lat:51.2194,lon:4.4025},
  summary1h:{state:'dry',totalMm:0},summary2h:{state:'dry',totalMm:0},
  points:Array.from({length:24},()=>({mmh:0,time:'18:00'})),
  nextHourMm:0,
  station:{temperature:11,windKmh:12,direction:'NO',weatherDescription:'Bewolkt'}};
 let uiPage=0;
 class FakeGif{
  constructor(data){assert.ok(data);this.width=320;this.height=320;this.i=0;}
  nextFrame(){
   if(this.i===3)return null;
   const f={width:320,height:320,rgb:new Uint8Array(320*320*3)};
   f.rgb.fill(++this.i*30);return f;
  }
 }
 const source=fs.readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  Page:x=>page=x,BasePage:x=>x,ui,
  setScrollMode:x=>{swipe=x;},getSwiperIndex:()=>uiPage+1,
  SCROLL_MODE_SWIPER_HORIZONTAL:'horizontal',TransferFile,push:()=>{},
  onDigitalCrown:({callback})=>{crown=callback;},offDigitalCrown:()=>{},KEY_HOME:1,
  LocalStorage:class{getItem(k){return cache.get(k);}setItem(k,v){cache.set(k,v);}},
  readFileSync:({path})=>{assert.equal(path,'data://download/radar.gif');return new Uint8Array([71,73,70]);},
  writeFileSync:({path,data})=>savedFiles.set(path,data),
  BuienradarGif:FakeGif,toZeppImage:(_,__,rgb)=>rgb.buffer,
  setInterval:()=>99,clearInterval:()=>{stopped++;},
  setTimeout:(fn,ms)=>{if(ms<=50)queueMicrotask(fn);return 22;},
  clearTimeout:()=>{},
  Date,Math,JSON,Number,String,Promise,Error,Array,Uint8Array
 });
 page.request=async request=>{
  requests.push(request);
  if(request.method==='rain.forecast')return connected?rain:{ok:false,error:'offline'};
  if(request.method==='radar.start')return connected?
   {ok:true,source:'Buienradar',generation:1}:{ok:false,error:'offline'};
  if(request.method==='radar.status')return {ok:true,stage:'transfer',busy:true};
  if(request.method==='config.get')return {ok:true,location:rain.location};
  return {ok:false,error:'unknown'};
 };
 const receive=(fetchedAt=Date.now())=>{
  transferFile={params:{kind:'buienradar-forecast-gif',source:'Buienradar',fetchedAt},
   sessionId:'gif-1',filePath:'data://download/radar.gif',readyState:'transferred'};
  callbacks.NEWFILE();
 };
 return {page,requests,cache,receive,swipe:()=>swipe,savedFiles,
  stopped:()=>stopped,crown:()=>crown,setUiPage:v=>uiPage=v};
}
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
test('Native 3-page UI preserves rain and weather services',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.swipe().options.count,3);
 assert.equal(t.page.rainState.values.text,'DROOG');
 assert.equal(t.page.temp.values.text,'11°');
 assert.ok(t.requests.some(x=>x.method==='rain.forecast'));
 assert.ok(t.requests.some(x=>x.method==='radar.start'));
 assert.equal(typeof t.crown(),'function');
 t.page.onDestroy();assert.equal(t.stopped(),3);
});
test('App starts with a neutral surface and never renders a KMI map',async()=>{
 const t=launch();t.page.build();await flush();
 assert.equal(t.page.radarBase.type,3);
 assert.equal(t.page.radarWidget.values.visible,false);
 assert.equal(t.page.radarTime.values.text,'BUIENRADAR · +3U');
 assert.ok(!t.requests.some(x=>x.method==='radar.forecast'||x.method==='radar.frame'));
 t.page.onDestroy();
});
test('One real GIF transfer yields multiple moving native radar images',async()=>{
 const t=launch();t.page.build();await flush();t.receive();await flush();
 assert.equal(t.savedFiles.size,3);
 assert.equal(t.page.radarWidget.values.visible,true);
 assert.equal(t.page.radarFrames.length,3);
 const paths=t.page.radarFrames.map(f=>f.path);
 assert.equal(new Set(paths).size,3);
 assert.equal(t.page.radarWidget.values.src,paths[0]);
 t.page.nextRadarFrame();
 assert.equal(t.page.radarWidget.values.src,paths[1]);
 const stored=JSON.parse(t.cache.get('buienradar.animation.v2'));
 assert.equal(stored.source,'Buienradar');
 assert.equal(stored.horizonMinutes,180);
 t.page.onDestroy();
});
test('KMI cache is rejected, recent Buienradar cache displays directly',async()=>{
 const now=Date.now();
 const oldKmi={source:'KMI',fetchedAt:now,frames:[{path:'data://stale.png',validAt:now+600000}]};
 const one=launch({oldKmi});one.page.build();await flush();
 assert.equal(one.page.radarWidget.values.visible,false);one.page.onDestroy();
 const fresh={source:'Buienradar',fetchedAt:now,horizonMinutes:180,
  frames:[{path:'data://first.png'},{path:'data://second.png'}]};
 const two=launch({cacheRadar:fresh});two.page.build();await flush();
 assert.equal(two.page.radarWidget.values.visible,true);
 assert.equal(two.page.radarWidget.values.src,'data://first.png');
 two.page.onDestroy();
 const three=launch({cacheRadar:{...fresh,fetchedAt:now-60*60000}});
 three.page.build();await flush();
 assert.equal(three.page.radarWidget.values.visible,false);
 three.page.onDestroy();
});
test('Offline errors remain visible instead of falsely showing a forecast',async()=>{
 const t=launch({connected:false});
 t.page.build();await flush();
 assert.equal(t.page.radarWidget.values.visible,false);
 assert.match(t.page.radarError,/offline/);
 assert.match(t.page.rainDetail.values.text,/offline/);
 t.page.onDestroy();
});
