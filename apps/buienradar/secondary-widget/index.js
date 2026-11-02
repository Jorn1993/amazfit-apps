// SecondaryWidget (swipe left): same canonical 2-hour forecast as full app.
// Never show a 20-minute-old separate rain prediction.
import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';

const store=new LocalStorage();
const BG=0x061018,INK=0xf6fbff,MUTED=0x9aafbf,BLUE=0x4ebef5;
const MAX_AGE=8*60*1000;
function current(){
 try{
  const d=JSON.parse(store.getItem('buienradar.forecast.v2')||'null');
  const now=Date.now();
  if(!d||!Number.isFinite(d.at)||d.at>now+60000||now-d.at>MAX_AGE||
   !d.summary120||!d.summary120.headline||!d.location)return null;
  return d;
 }catch(_){return null;}
}
SecondaryWidget({
 build(){
  const d=current(),sum=d&&d.summary120;
  ui.createWidget(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
  ui.createWidget(ui.widget.BUTTON,{
   x:14,y:14,w:452,h:452,text:'',radius:35,
   normal_color:BG,press_color:0x102536,
   click_func:()=>push({url:'page/index'})
  });
  const label=(x,y,w,h,value,size,color=INK)=>ui.createWidget(ui.widget.TEXT,{
   x,y,w,h,text:value,text_size:size,color,
   align_h:ui.align.CENTER_H,text_style:ui.text_style.WRAP
  });
  let text='GEEN RECENTE DATA';
  if(sum){
   text=sum.state==='dry'?'DROOG':sum.state==='raining'?'HET REGENT':
    'REGEN OVER '+sum.etaMinutes+' MIN';
  }
  const quantity=sum?sum.totalMm.toFixed(1).replace('.',',')+' mm · komende 2 uur':
   'Open de app om te vernieuwen';
  label(90,85,300,46,d?String(d.location):'Buienradar',31,BLUE);
  label(36,167,408,76,text,32);
  label(84,263,312,58,quantity,23,MUTED);
 }
});
