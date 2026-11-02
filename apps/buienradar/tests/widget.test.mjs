import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SecondaryWidget: full-screen tile reached by swiping LEFT from watchface.
// AppWidget was a different, incorrect right-swipe shortcut card.
function launch(saved,stamp=Date.now()){
 let page=null;const widgets=[],routes=[];
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3},align:{CENTER_H:1},
  text_style:{WRAP:1},
  createWidget(type,props){widgets.push({type,props});return {type,props};}};
 const src=readFileSync(new URL('../secondary-widget/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(src,{
  ui,SecondaryWidget:v=>{page=v;},
  push:x=>routes.push(x),
  LocalStorage:class{getItem(){return saved?JSON.stringify({...saved,at:stamp}):null;}},
  Date,Number,String,Math,JSON,
 },{filename:'secondary-widget/index.js'});
 page.build();
 return {widgets,routes};
}
test('Full-screen native SecondaryWidget displays real cached rain and opens app',()=>{
 const result=launch({location:'Gent',summary120:{state:'incoming',headline:'REGEN OP KOMST',
  etaMinutes:20,totalMm:0.2}});
 assert.ok(result.widgets.some(x=>x.props.text==='Gent'));
 assert.ok(result.widgets.some(x=>x.props.text==='REGEN OVER 20 MIN'));
 assert.ok(result.widgets.some(x=>typeof x.props.text==='string'&&x.props.text.includes('0,2 mm')));
 const button=result.widgets.find(x=>x.type===2);
 assert.equal(button.props.w,450,'full-screen widget and not small shortcut card');
 button.props.click_func();
 assert.equal(result.routes[0].url,'page/index');
});
test('An expired forecast is not shown as current in the left-swipe widget',()=>{
 const result=launch({location:'Gent',summary120:{state:'dry',headline:'HET BLIJFT DROOG',totalMm:0}},Date.now()-60*60*1000);
 assert.ok(result.widgets.some(x=>x.props.text==='GEEN RECENTE DATA'));
 assert.ok(!result.widgets.some(x=>x.props.text==='DROOG'));
});
test('No data tells user to open app rather than fabricating rain forecast',()=>{
 const result=launch(null);
 assert.ok(result.widgets.some(x=>x.props.text==='GEEN RECENTE DATA'));
 assert.ok(result.widgets.some(x=>x.props.text==='Open de app om te vernieuwen'));
});
