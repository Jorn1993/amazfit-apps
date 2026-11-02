import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function load(){
 const widgets=[];let page;
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3},prop:{TEXT:'text',COLOR:'color',
  Y:'y',H:'h'},align:{CENTER_H:1},text_style:{WRAP:1},
  createWidget(type,opts){
   const w={type,props:opts,values:{...opts},
    setProperty(k,v){this.values[k]=v;}};
   widgets.push(w);return w;
  }};
 const src=fs.readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 let timerCount=0,cleared=false,asked=[];
 vm.runInNewContext(src,{ui,Page:x=>page=x,BasePage:x=>x,Geolocation:class{},
  Number,Math,Date,String,Error,Array,JSON,
  setInterval:()=>{timerCount++;return 7;},clearInterval:()=>{cleared=true;},
  setTimeout:()=>8,clearTimeout:()=>{}});
 const data={ok:true,location:{name:'Gent'},
  points:Array.from({length:24},(_,i)=>({time:'10:00',mmh:i<6?0:1})),
  summary:{headline:'REGEN OP KOMST',detail:'Regen over ongeveer 30 min',
   rainingNow:false,etaMinutes:30}};
 page.messaging={request:async req=>{asked.push(req);return data;}};
 return {page,widgets,data,asked,timers:()=>timerCount,cleared:()=>cleared};
}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
test('Renders real 24-bar forecast and uses a 5-minute foreground timer',async()=>{
 const t=load();t.page.build();await flush();
 assert.equal(t.page.bars.length,24);
 assert.equal(t.timers(),1);
 assert.equal(t.page.headline.values.text,'REGEN OP KOMST');
 assert.equal(t.page.rain.points.length,24);
 assert.equal(t.page.bars[0].values.color,0x1b394d);
 assert.notEqual(t.page.bars[12].values.color,0x1b394d);
 t.page.onDestroy();assert.equal(t.cleared(),true);
});
test('Never fabricates weather when phone is unavailable',async()=>{
 const t=load();t.page.messaging={request:async()=>{throw Error('offline');}};
 t.page.build();await flush();
 assert.equal(t.page.headline.values.text,'GEEN DATA');
 assert.equal(t.page.rain.ok,false);
 t.page.onDestroy();
});
test('Refresh guards concurrent requests and never invokes GPS automatically',async()=>{
 const t=load();t.page.build();await flush();
 assert.ok(t.asked.every(x=>!x.params.gps));
 t.page.loading=true;await t.page.refresh();
 assert.equal(t.asked.length,1);
 t.page.onDestroy();
});
