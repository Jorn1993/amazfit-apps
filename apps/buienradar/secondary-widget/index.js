// Full-screen Widget reached by swiping LEFT from the watchface.
// Distinct from AppWidget: short cards on the swipe-right negative screen.
import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';

const cache=new LocalStorage();
const WHITE=0xf7f8f8,MUTED=0x9eb5c2,BLUE=0x42baf8,BG=0x061018;
function summary(){
 try{
  const raw=cache.getItem('buienradar.shortcut');
  if(!raw)return null;
  const d=JSON.parse(raw),now=Date.now();
  if(!d||!Number.isFinite(d.at)||d.at>now+60000||now-d.at>20*60*1000)
   return null;
  return d;
 }catch(_){return null;}
}
SecondaryWidget({
 build(){
  try{
   const d=summary();
   ui.createWidget(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
   ui.createWidget(ui.widget.BUTTON,{
    x:15,y:18,w:450,h:443,radius:35,text:'',
    normal_color:BG,press_color:0x132a3c,click_func:()=>push({url:'page/index'})
   });
   const label=(y,h,value,size,color=WHITE)=>ui.createWidget(ui.widget.TEXT,{
    x:54,y,w:372,h,text:value,text_size:size,color,
    align_h:ui.align.CENTER_H,text_style:ui.text_style.WRAP
   });
   label(64,44,'BUIENRADAR',29,BLUE);
   label(124,47,d?String(d.location||''): 'REGENVERWACHTING',27);
   label(200,70,d?String(d.headline||''): 'GEEN ACTUELE DATA',34);
   label(282,68,d?String(d.detail||''): 'Open de app om te vernieuwen',24,MUTED);
   label(395,40,'TIK VOOR RADAR EN GRAFIEK',17,BLUE);
  }catch(_){
   ui.createWidget(ui.widget.TEXT,{
    x:55,y:190,w:370,h:70,text:'Open Buienradar',text_size:32,
    color:WHITE,align_h:ui.align.CENTER_H
   });
  }
 }
});
