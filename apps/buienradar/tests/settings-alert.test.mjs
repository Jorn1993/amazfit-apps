import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function watchSettings({connected=true}={}){
 const saved=new Map(),widgets=[],backCalls=[];
 let page;
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3},prop:{TEXT:'text',MORE:'more'},
  align:{CENTER_H:1},text_style:{WRAP:1},createWidget(type,opts){
   const obj={type,options:opts,values:{...opts},setProperty(k,v){this.values[k]=v;}};
   widgets.push(obj);return obj;
  }};
 const code=fs.readFileSync(new URL('../page/settings.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(code,{ui,Page:x=>page=x,BasePage:x=>x,
  back:()=>backCalls.push('back'),
  LocalStorage:class{getItem(k){return saved.get(k);}setItem(k,v){saved.set(k,v);}},
  notify:()=>5,cancelAlarm:()=>0,
  JSON,Number,String,Math});
 page.messaging={request:async req=>{
  if(!connected)throw Error('offline');
  return {ok:true,location:req.params.location};
 }};
 page.build();
 return {page,saved,backCalls,widgets};
}
test('Watch settings cycle through cities and persist the chosen location',async()=>{
 const w=watchSettings();
 assert.equal(w.page.place.values.text,'Antwerpen');
 w.page.pick(1);
 assert.equal(w.page.place.values.text,'Brussel');
 await w.page.save();
 assert.equal(JSON.parse(w.saved.get('buienradar.location')).name,'Brussel');
 assert.deepEqual(w.backCalls,['back']);
});
test('Rain alerts are opt-in with a selectable 5, 15 or 30-minute lead',async()=>{
 const w=watchSettings();
 assert.equal(w.page.alert.enabled,false);
 w.page.toggleAlert();
 w.page.changeLead(1);
 await w.page.save();
 assert.deepEqual(JSON.parse(w.saved.get('buienradar.alert')),{enabled:true,lead:30});
});
test('Failed phone synchronization never says the location was saved',async()=>{
 const w=watchSettings({connected:false});
 w.page.pick(1);
 await w.page.save();
 assert.equal(w.saved.has('buienradar.location'),false);
 assert.equal(w.page.status.values.text,'Geen verbinding met Zepp');
 assert.equal(w.backCalls.length,0);
});

function alertService(pref,options){
 const alerts=[],storage=new Map([['buienradar.alert',JSON.stringify(pref)]]);
 let service;
 const code=fs.readFileSync(new URL('../app-service/rain-alert.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(code,{AppService:x=>service=x,notify:x=>{alerts.push(x);return 1;},
  LocalStorage:class{getItem(k){return storage.get(k);}},
  JSON,Number,String,Date,Math});
 service.onInit(JSON.stringify(options));
 return alerts;
}
test('Enabled fresh rain onset creates exactly one native watch notification',()=>{
 const now=Date.now();
 const alerts=alertService({enabled:true,lead:15},{
  place:'Gent',onsetAt:now+15*60000,plannedAt:now-5*60000,lead:15
 });
 assert.equal(alerts.length,1);
 assert.equal(alerts[0].title,'Regen op komst');
 assert.ok(alerts[0].content.includes('Gent'));
});
test('Disabled and stale rain notices do not trigger an alert',()=>{
 const now=Date.now(),item={place:'Gent',onsetAt:now+300000,
  plannedAt:now-3*3600000};
 assert.equal(alertService({enabled:false,lead:15},item).length,0);
 assert.equal(alertService({enabled:true,lead:15},item).length,0);
});

test('User can explicitly send a test notification without waiting for rainfall',()=>{
 const w=watchSettings();w.page.testNotification();
 assert.equal(w.page.status.values.text,'Test naar meldingen gestuurd');
});

test('Watch setting action buttons fully fit round display',()=>{
 const {widgets}=watchSettings();
 const controls=widgets.filter(w=>w.type===2&&['TEST','OPSLAAN'].includes(w.values.text));
 assert.equal(controls.length,2);
 for(const {values:r} of controls){
  for(const [x,y] of [[r.x,r.y],[r.x+r.w,r.y],
   [r.x,r.y+r.h],[r.x+r.w,r.y+r.h]]){
   assert.ok(Math.hypot(x-240,y-240)<=240,
    'Action clipped by circular screen: '+r.text);
  }
 }
});
