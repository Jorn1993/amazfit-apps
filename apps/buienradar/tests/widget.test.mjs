import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function launch(cached=null){
 let component;const widgets=[],paths=[],cache=new Map();
 if(cached)cache.set('buienradar.future-radar.v1',JSON.stringify(cached));
 const ui={widget:{IMG:1,TEXT:2,FILL_RECT:3,BUTTON:4},
  prop:{TEXT:'text',MORE:'more'},align:{CENTER_H:1},
  text_style:{ELLIPSIS:1},
  createWidget(type,props){
   const widget={type,props:{...props},setProperty(k,v){this.props[k]=v;}};
   widgets.push(widget);return widget;
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
test('Widget never displays bundled historical radar, even when weather is offline',()=>{
 const t=launch();
 const images=t.widgets.filter(w=>w.type===1);
 assert.equal(images[0].props.src,'kmi-be-map.png');
 assert.equal(images[1].props.src,'kmi-clear.png');
 assert.equal(t.component.emptyLabel.props.text,'OPEN VOOR +3U RADAR');
});
test('Widget displays verified current future frame and its timestamp',()=>{
 const t=launch({source:'KMI',fetchedAt:Date.now(),
  frames:[{validAt:Date.now()+30*60000,path:'data://fresh.img'}]});
 assert.equal(t.component.rainLayer.props.src,'data://fresh.img');
 assert.equal(t.component.emptyLabel.props.text,'');
});
test('Expired cached forecast is blank rather than shown as present rain',()=>{
 const t=launch({source:'KMI',fetchedAt:Date.now()-3*3600000,
  frames:[{validAt:Date.now()+30*60000,path:'data://old.img'}]});
 assert.equal(t.component.rainLayer.props.src,'kmi-clear.png');
});
test('Widget refreshes on resume after visiting main app',()=>{
 const t=launch();
 t.cache.set('buienradar.future-radar.v1',JSON.stringify({
  source:'KMI',fetchedAt:Date.now(),
  frames:[{validAt:Date.now()+40*60000,path:'data://new.img'}]
 }));
 t.component.onResume();
 assert.equal(t.component.rainLayer.props.more.src,'data://new.img');
 assert.equal(t.component.emptyLabel.props.text,'');
});
