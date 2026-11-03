import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function launch(saved,stamp=Date.now()){
 let component;const widgets=[],routes=[],cache=new Map();
 if(saved)cache.set('buienradar.overview.v3',JSON.stringify({...saved,at:stamp}));
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3,IMG:4},
  align:{CENTER_H:1},text_style:{ELLIPSIS:1},createWidget(type,props){
   const w={type,props};widgets.push(w);return w;
  }};
 const src=readFileSync(new URL('../secondary-widget/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(src,{ui,SecondaryWidget:x=>component=x,push:x=>routes.push(x),
  LocalStorage:class{getItem(k){return cache.get(k);}},
  Date,Math,JSON,Number,String});
 component.build();return {widgets,routes};
}
const example={location:'Antwerpen',
 summary120:{state:'dry',totalMm:0,etaMinutes:null},
 temperature:9,windKmh:14,direction:'NNO',
 points:Array.from({length:24},()=>({mmh:0}))};
test('Widget shows unobstructed radar with one slim clickable status bar',()=>{
 const t=launch(example);
 const img=t.widgets.find(w=>w.type===4);
 assert.equal(img.props.w,480);assert.equal(img.props.h,480);
 assert.equal(t.widgets.filter(w=>w.type===3).length,1,'no huge opaque data panel');
 const bottom=t.widgets.find(w=>w.type===2&&w.props.y>300);
 assert.ok(bottom.props.h<=56,'radar must remain unobstructed');
 assert.match(bottom.props.text,/Droog/);
 bottom.props.click_func();assert.equal(t.routes[0].url,'page/index');
});
test('Widget stale state never describes old forecast as current',()=>{
 const t=launch(example,Date.now()-25*60000);
 const bottom=t.widgets.find(w=>w.type===2&&w.props.y>300);
 assert.match(bottom.props.text,/niet actueel/);
 assert.ok(!bottom.props.text.includes('Droog'));
});
test('Cold start still displays radar without fake readings',()=>{
 const t=launch(null);
 assert.ok(t.widgets.some(w=>w.type===4&&w.props.src==='radar-frame-2.png'));
 assert.ok(t.widgets.some(w=>w.type===2&&w.props.text.includes('niet actueel')));
});
test('Widget labels and touch surfaces remain inside circular safe zone',()=>{
 const t=launch(example);
 for(const w of t.widgets.filter(w=>w.type===2||w.type===1)){
  const r=w.props;
  for(const [x,y] of [[r.x,r.y],[r.x+r.w,r.y],
   [r.x,r.y+r.h],[r.x+r.w,r.y+r.h]])
   assert.ok(Math.hypot(x-240,y-240)<=239.9,`Clipped: ${r.text}`);
 }
});
