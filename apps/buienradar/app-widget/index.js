import * as ui from '@zos/ui';
import {getAppWidgetSize} from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';

const store=new LocalStorage();
function readShort(){
 try{
  const raw=store.getItem('buienradar.shortcut');
  if(!raw)return null;
  const data=JSON.parse(raw);
  // A stale cached forecast must never be shown as the current rain prediction.
  if(!data||!Number.isFinite(data.at)||Date.now()-data.at>20*60*1000 ||
   data.at>Date.now()+60*1000)return null;
  return data;
 }catch(_){return null;}
}
AppWidget({
 build(){
  const size=getAppWidgetSize();
  const w=size.w||410,h=size.h||210;
  const small=Math.max(16,Math.round(w/22));
  const data=readShort();
  const title='BUIENRADAR';
  const detail=data?data.detail:'Tik om het weer te bekijken';
  const place=data?data.location:'Open Buienradar';
  ui.createWidget(ui.widget.BUTTON,{
   x:0,y:0,w,h,radius:size.radius||24,
   text:'',normal_color:0x15202a,press_color:0x253947,
   click_func:()=>push({url:'page/index'})
  });
  const label=(y,t,sz,color)=>ui.createWidget(ui.widget.TEXT,{
   x:20,y,w:w-40,h:38,text:t,text_size:sz,color,
   align_h:ui.align.LEFT,text_style:ui.text_style.WRAP
  });
  label(Math.max(10,h*0.1),title,small,0x54b9ff);
  label(Math.max(55,h*0.32),place,Math.round(w/17),0xffffff);
  label(Math.max(99,h*0.56),detail,Math.round(w/20),0xc7d3dd);
 }
});
