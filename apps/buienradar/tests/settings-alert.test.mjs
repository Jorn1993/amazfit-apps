import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function settings(){
 let page;const widgets=[],memory=new Map(),calls=[];
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3},prop:{TEXT:'text',MORE:'more'},
  align:{CENTER_H:1},text_style:{ELLIPSIS:1},
  createWidget(type,opts){
   const v={type,values:{...opts},setProperty(key,value){
    if(key==='more')Object.assign(this.values,value);
    else this.values[key]=value;
   }};widgets.push(v);return v;
  }};
 const script=readFileSync(new URL('../page/settings.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(script,{
  Page:v=>page=v,BasePage:v=>v,ui,push:v=>calls.push(v),
  LocalStorage:class{getItem(k){return memory.get(k);}setItem(k,v){memory.set(k,v);}},
  notify:()=>7,cancelAlarm:()=>true,JSON,Number,String,Math
 });
 page.build();return {page,widgets,memory,calls};
}
test('On-watch rain settings save instantly without an additional Save button',()=>{
 const t=settings();assert.equal(t.page.alert.enabled,false);
 t.page.toggleAlert();
 assert.equal(JSON.parse(t.memory.get('buienradar.alert')).enabled,true);
 t.page.changeLead(1);
 assert.equal(JSON.parse(t.memory.get('buienradar.alert')).lead,30);
 assert.ok(!t.widgets.some(w=>w.values.text==='OPSLAAN'));
});
test('City row opens a dedicated native city selection page',()=>{
 const t=settings();
 t.page.place.values.click_func();
 assert.equal(t.calls[0].url,'page/locations');
});
test('Test notification has real on-watch dispatch and user-visible result',()=>{
 const t=settings();t.page.testNotification();
 assert.equal(t.page.testButton.values.text,'Verzonden');
});
test('Essential settings controls fit within round display',()=>{
 const t=settings();
 for(const w of t.widgets.filter(w=>w.type===2)){
  const r=w.values;
  for(const [x,y] of [[r.x,r.y],[r.x+r.w,r.y],
   [r.x,r.y+r.h],[r.x+r.w,r.y+r.h]]){
   assert.ok(Math.hypot(x-240,y-240)<240,`Clipped button ${r.text}`);
  }
 }
});
function locations(connected=true){
 let page;const views=[],memory=new Map(),routes=[];
 const create=(type,props)=>{
  const widget={type,props,createWidget:create};views.push(widget);return widget;
 };
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3,VIEW_CONTAINER:5},
  align:{CENTER_H:1},createWidget:create};
 const source=readFileSync(new URL('../page/locations.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  ui,Page:x=>page=x,BasePage:x=>x,back:()=>routes.push('back'),
  setScrollMode:()=>1,SCROLL_MODE_SWIPER_HORIZONTAL:'horizontal',
  LocalStorage:class{getItem(k){return memory.get(k);}setItem(k,v){memory.set(k,v);}},
  JSON,Number,String
 });
 page.request=async req=>connected?
  {ok:true,location:req.params.location}:{ok:false};
 page.build();return {page,views,memory,routes};
}
test('Native location picker gives 12 direct city actions',async()=>{
 const t=locations();
 assert.equal(t.views.filter(w=>w.type===2).length,12);
 await t.page.choose({name:'Gent',lat:51.0543,lon:3.7174});
 assert.equal(JSON.parse(t.memory.get('buienradar.location')).name,'Gent');
 assert.equal(t.routes[0],'back');
});
test('No false saved location after phone sync fails',async()=>{
 const t=locations(false);
 await t.page.choose({name:'Gent',lat:51.0543,lon:3.7174});
 assert.equal(t.memory.has('buienradar.location'),false);
 assert.equal(t.routes.length,0);
});
function alertService(pref,options){
 const alerts=[],memory=new Map([['buienradar.alert',JSON.stringify(pref)]]);
 let app;
 const source=readFileSync(new URL('../app-service/rain-alert.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  AppService:x=>app=x,notify:x=>{alerts.push(x);return 1;},
  LocalStorage:class{getItem(k){return memory.get(k);}},
  JSON,Number,String,Date,Math,console:{log(){}}
 });
 app.onInit(JSON.stringify(options));return alerts;
}
test('An enabled alert can fire after the app exits but is never continuous monitoring',()=>{
 const now=Date.now();
 const opts={place:'Gent',onsetAt:now+12*60000,
  plannedAt:now-3*60000,lead:15};
 assert.equal(alertService({enabled:true},opts).length,1);
 assert.equal(alertService({enabled:false},opts).length,0);
 assert.equal(alertService({enabled:true},{...opts,plannedAt:now-4*3600000}).length,0);
});

test('Alarm callback accepts Zepp wrapper with param string',()=>{
 const now=Date.now();
 // Direct invocation test for wrapper form; expected to be a single delivery.
 let called=0,svc;
 const source=readFileSync(new URL('../app-service/rain-alert.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  AppService:x=>svc=x,notify:()=>{called++;return 1;},
  LocalStorage:class{getItem(k){return k==='buienradar.alert'?
   JSON.stringify({enabled:true,lead:15}):null;}},
  JSON,Number,String,Date,Math,console:{log(){}}
 });
 svc.onInit({param:JSON.stringify({
  place:'Antwerpen',onsetAt:now+900000,plannedAt:now-5000,lead:15
 })});
 assert.equal(called,1);
});
test('The rain-alert service has no invalid notification action pointing to a page',()=>{
 const source=readFileSync(new URL('../app-service/rain-alert.js',import.meta.url),'utf8');
 assert.ok(!source.includes("file:'page/index'"));
});


