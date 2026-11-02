// Full-screen, swipe-left Zepp SecondaryWidget: radar + forecast + mini chart.
// Uses one shared saved snapshot. Widget itself cannot initiate phone BLE fetch.
import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';

const store=new LocalStorage();
const BG=0x06111b,INK=0xf6fbff,SECONDARY=0xb2c5d1,BLUE=0x52bdf6;
const MAX_AGE=8*60*1000;
function snapshot(now=Date.now()){
 try{
  const d=JSON.parse(store.getItem('buienradar.overview.v3')||'null');
  if(!d||!Number.isFinite(d.at)||d.at>now+60000||!d.summary120||
   !Array.isArray(d.points)||d.points.length<24)return null;
  return {...d,fresh:now-d.at<MAX_AGE&&now-d.at>=0};
 }catch(_){return null;}
}
function fmt(n){return typeof n==='number'&&Number.isFinite(n)?
 Math.round(n).toString():'--';}
SecondaryWidget({
 build(){
  const d=snapshot(),active=!!(d&&d.fresh);
  const summary=active?d.summary120:null;
  const add=(kind,props)=>ui.createWidget(kind,props);
  const txt=(x,y,w,h,value,size,color=INK)=>add(ui.widget.TEXT,{
   x,y,w,h,text:value,text_size:size,color,
   align_h:ui.align.CENTER_H,text_style:ui.text_style.WRAP
  });
  add(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
  // Always useful: bundled radar still visible when local nowcast is old.
  add(ui.widget.IMG,{
   x:0,y:0,w:480,h:480,src:'radar-frame-2.png',auto_scale:true
  });
  // No opaque full-screen button over image/text: the page remains tap-to-open.
  add(ui.widget.FILL_RECT,{
   x:0,y:214,w:480,h:266,color:BG,radius:28
  });
  add(ui.widget.FILL_RECT,{
   x:136,y:28,w:208,h:48,color:BG,radius:21
  });
  let loc='Buienradar';
  try{
   const preferred=JSON.parse(store.getItem('buienradar.location')||'null');
   loc=preferred&&preferred.name||d&&d.location||'Buienradar';
  }catch(_){loc=d&&d.location||'Buienradar';}
  txt(144,32,192,40,String(loc),26);
  const message=!active?'OPEN VOOR ACTUELE REGEN':
   summary.state==='dry'?'DROOG':
   summary.state==='raining'?'HET REGENT':
   'REGEN OVER '+summary.etaMinutes+' MIN';
  txt(62,231,356,56,message,active?29:24,INK);
  if(active){
   const rain=summary.totalMm.toFixed(1).replace('.',',')+' mm · 2 uur';
   txt(96,284,288,35,rain,22,SECONDARY);
   const points=d.points.slice(0,24),max=Math.max(1,...points.map(p=>p.mmh||0));
   for(let i=0;i<24;i++){
    const mm=Number(points[i].mmh)||0;
    const height=mm<0.03?4:Math.max(7,Math.round(Math.sqrt(mm/max)*47));
    add(ui.widget.FILL_RECT,{
     x:79+i*14,y:384-height,w:10,h:height,
     radius:3,color:mm<0.03?0x345060:BLUE
    });
   }
   add(ui.widget.FILL_RECT,{x:81,y:397,w:318,h:2,color:0x2a4150});
   txt(74,408,165,37,fmt(d.temperature)+'°',31,INK);
   txt(239,413,185,33,
    (d.direction||'')+' '+fmt(d.windKmh)+' km/u',21,SECONDARY);
  }else{
   txt(88,299,304,44,'Tik voor de nieuwste voorspelling',21,SECONDARY);
   txt(96,391,288,36,'RADAR · BELGIË',19,SECONDARY);
  }
  add(ui.widget.BUTTON,{
   x:12,y:12,w:456,h:456,text:'',normal_color:0x000000,
   press_color:0x112536,radius:42,
   click_func:()=>push({url:'page/index'})
  });
 }
});
