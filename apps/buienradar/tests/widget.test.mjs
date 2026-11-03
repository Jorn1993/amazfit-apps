import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function launch(saved=null,stamp=Date.now()){
 let widget;const elements=[],routes=[],cache=new Map();
 if(saved)cache.set('buienradar.overview.v3',
  JSON.stringify({...saved,at:stamp}));
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3,IMG:4},
  prop:{TEXT:'text',COLOR:'color'},
  align:{CENTER_H:1},text_style:{ELLIPSIS:1},
  createWidget(type,props){
   const w={type,props:{...props},setProperty(key,value){
    this.props[key]=value;
   }};
   elements.push(w);return w;
  }};
 const code=readFileSync(new URL('../secondary-widget/index.js',import.meta.url),
  'utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(code,{
  ui,SecondaryWidget:x=>{widget=x;},push:x=>routes.push(x),
  LocalStorage:class{getItem(k){return cache.get(k);}},
  Date,Math,JSON,Number,String
 });
 widget.build();
 return {widget,elements,routes,cache};
}
const example={location:'Antwerpen',
 summary120:{state:'dry',totalMm:0,etaMinutes:null},
 temperature:9,windKmh:14,direction:'NNO',
 points:Array.from({length:24},()=>({mmh:0}))};

test('Single elegant capsule keeps the official radar timestamp fully visible',()=>{
 const t=launch(example);
 const radar=t.elements.find(w=>w.type===4);
 assert.equal(radar.props.src,'radar-frame-2.png');
 assert.equal(radar.props.w,480);
 assert.equal(radar.props.h,480);
 assert.equal(t.elements.filter(w=>w.type===3).length,1,
  'No large solid card can hide radar');
 const button=t.elements.find(w=>w.type===2);
 assert.equal(button.props.y,46);
 assert.equal(button.props.h,82);
 assert.ok(button.props.y+button.props.h<390);
 assert.ok(t.elements.filter(w=>w.type===1||w.type===2)
  .every(w=>w.props.y+w.props.h<390),
  'No controls can overlap embedded radar frame time (y≈398–443)');
 assert.ok(t.elements.some(w=>w.props.text==='9° · Droog'));
 button.props.click_func();assert.equal(t.routes[0].url,'page/index');
});
test('Old weather may be labelled last known, never stale radar',()=>{
 const t=launch(example,Date.now()-25*60000);
 assert.ok(t.elements.some(w=>w.props.text==='9° · laatst bekend'));
 assert.ok(!t.elements.some(w=>/Radar · niet actueel/.test(w.props.text||'')));
 assert.ok(!t.elements.some(w=>typeof w.props.text==='string'&&w.props.text.includes('Droog')));
});
test('No local forecast produces a useful open-app hint and unobstructed radar',()=>{
 const t=launch();
 assert.ok(t.elements.some(w=>w.props.text==='Open voor weer'));
 assert.equal(t.elements.find(w=>w.type===4).props.w,480);
});
test('Returning from main app refreshes location and forecast from LocalStorage',()=>{
 const t=launch();
 assert.equal(t.widget.weatherLabel.props.text,'Open voor weer');
 t.cache.set('buienradar.overview.v3',JSON.stringify({...example,at:Date.now()}));
 t.cache.set('buienradar.location',JSON.stringify({name:'Gent'}));
 t.widget.onResume();
 assert.equal(t.widget.weatherLabel.props.text,'9° · Droog');
 assert.equal(t.widget.locationLabel.props.text,'Gent');
});
test('When an existing widget ages, resuming cannot imply the rain is current',()=>{
 const t=launch(example);
 assert.equal(t.widget.weatherLabel.props.text,'9° · Droog');
 t.cache.set('buienradar.overview.v3',JSON.stringify({
  ...example,at:Date.now()-45*60000
 }));
 t.widget.onResume();
 assert.equal(t.widget.weatherLabel.props.text,'9° · laatst bekend');
});
test('All non-map widget elements fit safely within the circular display',()=>{
 const t=launch(example);
 for(const w of t.elements.filter(w=>w.type===1||w.type===2)){
  const r=w.props;
  for(const [x,y] of [[r.x,r.y],[r.x+r.w,r.y],
   [r.x,r.y+r.h],[r.x+r.w,r.y+r.h]]){
   assert.ok(Math.hypot(x-240,y-240)<240,
    'Clipped widget element '+(r.text||'tap capsule'));
  }
 }
});
