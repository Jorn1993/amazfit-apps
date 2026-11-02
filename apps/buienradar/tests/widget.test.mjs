import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function run(saved,at=Date.now()){
 let widget=null,jumps=[],items=[];
 const ui={widget:{BUTTON:1,TEXT:2},align:{LEFT:1},text_style:{WRAP:1},
  createWidget(type,props){items.push({type,props});return {};}};
 const src=fs.readFileSync(new URL('../app-widget/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(src,{ui,AppWidget:x=>widget=x,
  getAppWidgetSize:()=>({w:420,h:205,radius:22}),
  push:x=>jumps.push(x),LocalStorage:class{getItem(){return saved?JSON.stringify({...saved,at}):null;}},
  Date,Math,JSON,Number,String});
 widget.build();
 return {items,jumps};
}
test('Quick card displays saved forecast and opens native mini program on tap',()=>{
 const t=run({location:'Gent',headline:'REGEN OP KOMST',detail:'Regen binnen 20 min'});
 assert.ok(t.items.some(x=>x.props.text==='Gent'));
 assert.ok(t.items.some(x=>x.props.text==='Regen binnen 20 min'));
 t.items[0].props.click_func();
 assert.equal(t.jumps[0].url,'page/index');
});
test('Old rainfall is never presented as current on shortcut card',()=>{
 const t=run({location:'Gent',detail:'Regen binnen 20 min'},Date.now()-60*60*1000);
 assert.ok(t.items.some(x=>x.props.text==='Open Buienradar'));
 assert.ok(!t.items.some(x=>x.props.text==='Regen binnen 20 min'));
});
