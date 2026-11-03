import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function launch(cached=null){
 let component;const widgets=[],paths=[],cache=new Map();
 if(cached)cache.set('buienradar.current.v2',JSON.stringify(cached));
 const ui={widget:{IMG:1,TEXT:2,FILL_RECT:3,BUTTON:4},
  prop:{TEXT:'text',MORE:'more',VISIBLE:'visible'},align:{CENTER_H:1},
  text_style:{ELLIPSIS:1},
  createWidget(type,props){
   const w={type,props:{...props},setProperty(key,value){
    if(key==='more')Object.assign(this.props,value);
    else this.props[key]=value;
   }};widgets.push(w);return w;
  }};
 const source=fs.readFileSync(new URL('../secondary-widget/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,{
  ui,SecondaryWidget:x=>component=x,push:x=>paths.push(x),
  LocalStorage:class{getItem(k){return cache.get(k);}},
  Date,Math,Number,String,JSON,Array
 });
 component.build();return {component,widgets,paths,cache};
}
test('Offline widget is neutral, never an old KMI radar',()=>{
 const t=launch();
 assert.equal(t.component.rainLayer.props.visible,false);
 assert.equal(t.component.emptyLabel.props.text,'OPEN VOOR RADAR');
});
test('Widget displays recent full-screen actual Buienradar image',()=>{
 const t=launch({source:'Buienradar',fetchedAt:Date.now(),
  path:'data://new-native.img'});
 assert.equal(t.component.rainLayer.props.src,'data://new-native.img');
 assert.equal(t.component.rainLayer.props.w,480);
 assert.equal(t.component.rainLayer.props.h,480);
 assert.equal(t.component.rainLayer.props.visible,true);
 assert.equal(t.component.timeLabel.props.text,'Buienradar · actueel');
});
test('Widget refreshes observed image after returning from app',()=>{
 const t=launch();
 t.cache.set('buienradar.current.v2',JSON.stringify({
  source:'Buienradar',fetchedAt:Date.now(),path:'data://refresh.img'
 }));
 t.component.onResume();
 assert.equal(t.component.rainLayer.props.src,'data://refresh.img');
 assert.equal(t.component.rainLayer.props.visible,true);
});
test('Widget rejects old native GIF frames even when their timestamps appear fresh',()=>{
 const t=launch();
 t.cache.set('buienradar.animation.v3',JSON.stringify({
  source:'Buienradar',horizonMinutes:180,fetchedAt:Date.now(),
  frames:[{path:'data://corrupt-green.png'}]
 }));
 t.component.onResume();
 assert.equal(t.component.rainLayer.props.visible,false);
});
test('Widget uses same strict freshness as main app',()=>{
 const t=launch();
 t.cache.set('buienradar.current.v2',JSON.stringify({
  source:'Buienradar',fetchedAt:Date.now(),path:'data://current.img'
 }));
 t.component.onResume();
 assert.equal(t.component.rainLayer.props.visible,true);
 assert.equal(t.component.timeLabel.props.text,'Buienradar · actueel');
});
test('Widget never shows stale current radar',()=>{
 const t=launch();
 t.cache.set('buienradar.current.v2',JSON.stringify({
  source:'Buienradar',fetchedAt:Date.now()-3600000,path:'data://old.img'
 }));
 t.component.onResume();
 assert.equal(t.component.rainLayer.props.visible,false);
});
