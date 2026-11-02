import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function launch(saved,at=Date.now()){
 let component;const widgets=[],routes=[];
 const cache=new Map();
 if(saved)cache.set('buienradar.overview.v3',JSON.stringify({...saved,at}));
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3,IMG:4},
  align:{CENTER_H:1},text_style:{WRAP:1},
  createWidget(type,props){
   const result={type,props};widgets.push(result);return result;
  }};
 const source=readFileSync(new URL('../secondary-widget/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  ui,SecondaryWidget:v=>{component=v;},push:value=>routes.push(value),
  LocalStorage:class{getItem(k){return cache.get(k);}},
  Date,Number,String,Math,JSON
 });
 component.build();
 return {widgets,routes};
}
const example={location:'Gent',
 summary120:{state:'incoming',etaMinutes:20,totalMm:0.2},
 temperature:12,windKmh:11,direction:'NW',
 points:Array.from({length:24},(_,i)=>({mmh:i<5?0:i/12}))
};
test('SecondaryWidget combines radar, upcoming rain, graph and current station metrics',()=>{
 const {widgets,routes}=launch(example);
 assert.ok(widgets.some(w=>w.type===4&&w.props.src==='radar-frame-2.png'));
 assert.ok(widgets.some(w=>w.props.text==='Gent'));
 assert.ok(widgets.some(w=>w.props.text==='REGEN OVER 20 MIN'));
 assert.ok(widgets.some(w=>w.props.text==='0,2 mm · 2 uur'));
 assert.ok(widgets.some(w=>w.props.text==='12°'));
 assert.ok(widgets.some(w=>w.props.text==='NW 11 km/u'));
 assert.ok(widgets.filter(w=>w.type===3&&w.props.w===10).length===24);
 const button=widgets.find(w=>w.type===2);button.props.click_func();
 assert.equal(routes[0].url,'page/index');
});
test('After stale forecasts widget retains a radar preview and does not lie about rain',()=>{
 const {widgets}=launch(example,Date.now()-30*60*1000);
 assert.ok(widgets.some(w=>w.type===4&&w.props.src==='radar-frame-2.png'));
 assert.ok(widgets.some(w=>w.props.text==='OPEN VOOR ACTUELE REGEN'));
 assert.ok(!widgets.some(w=>w.props.text==='REGEN OVER 20 MIN'));
});
test('Cold startup always shows the radar, never a blank stale-data wall',()=>{
 const {widgets}=launch(null);
 assert.ok(widgets.some(w=>w.type===4));
 assert.ok(widgets.some(w=>w.props.text==='Tik voor de nieuwste voorspelling'));
});
