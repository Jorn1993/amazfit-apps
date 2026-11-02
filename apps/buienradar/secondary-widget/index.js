// Composite radar/rain/weather widget. Never present stale precipitation as live.
import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';

const storage=new LocalStorage();
const BG=0x06121d, PANEL=0x0b2030, WHITE=0xf7fbff,
 SOFT=0xb5cbd8, BLUE=0x4dc5fc, DIM=0x6e8b9d;
const FRESH_MS=8*60*1000;
function snapshot(now=Date.now()){
 try{
  const d=JSON.parse(storage.getItem('buienradar.overview.v3')||'null');
  if(!d||!Number.isFinite(d.at)||!d.summary120||
   !Array.isArray(d.points)||d.points.length<24)return null;
  const age=now-d.at;
  if(age<0||age>24*60*60*1000)return null;
  return {...d,fresh:age<=FRESH_MS};
 }catch(_){return null;}
}
const number=n=>Number.isFinite(n)?String(Math.round(n)):'--';
const forecast=s=>!s?'OPEN VOOR REGEN':s.state==='dry'?'DROOG':
 s.state==='raining'?'HET REGENT':
 Number.isFinite(s.etaMinutes)?'REGEN OVER '+s.etaMinutes+' MIN':'REGEN';
SecondaryWidget({
 build(){
  const d=snapshot(),fresh=!!(d&&d.fresh),s=fresh?d.summary120:null;
  const add=(kind,props)=>ui.createWidget(kind,props);
  const text=(x,y,w,h,value,size,color=WHITE)=>add(ui.widget.TEXT,{
   x,y,w,h,text:value,text_size:size,color,
   align_h:ui.align.CENTER_H,text_style:ui.text_style.NONE
  });
  add(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
  // Large tap target behind non-interactive visual widgets.
  add(ui.widget.BUTTON,{x:65,y:25,w:350,h:410,text:'',
   normal_color:BG,press_color:0x153044,radius:35,
   click_func:()=>push({url:'page/index'})});
  add(ui.widget.IMG,{x:0,y:0,w:480,h:480,
   src:'radar-frame-2.png',auto_scale:true});
  add(ui.widget.FILL_RECT,{x:137,y:25,w:206,h:46,color:BG,radius:21});
  let city=d&&d.location||'Buienradar';
  try{
   const loc=JSON.parse(storage.getItem('buienradar.location')||'null');
   if(loc&&loc.name)city=loc.name;
  }catch(_){}
  text(145,29,190,35,String(city),25);
  add(ui.widget.FILL_RECT,{x:35,y:215,w:410,h:224,color:PANEL,radius:31});
  text(76,226,328,47,forecast(s),s?26:25);
  const sub=s?s.totalMm.toFixed(1).replace('.',',')+' mm · 2 uur':
   d?'VOORSPELLING VERLOPEN':'GEEN VOORSPELLING';
  text(103,272,274,31,sub,20,SOFT);
  const pts=d?d.points.slice(0,24):[];
  const max=Math.max(1,...pts.map(p=>Number(p.mmh)||0));
  for(let i=0;i<24;i++){
   const value=Number(pts[i]&&pts[i].mmh)||0;
   const h=value<0.03?3:Math.max(7,Math.round(Math.sqrt(value/max)*37));
   add(ui.widget.FILL_RECT,{x:89+i*13,y:363-h,w:9,h,radius:3,
    color:!fresh?DIM:value<0.03?0x345163:BLUE});
  }
  add(ui.widget.FILL_RECT,{x:87,y:367,w:313,h:2,color:0x315063});
  text(115,373,110,41,d?number(d.temperature)+'°':'--°',30);
  const wind=d?((d.direction||'')+' '+number(d.windKmh)+' km/u'):'-- km/u';
  text(232,382,164,32,wind,20,SOFT);
  if(!fresh)text(143,414,194,22,'LAATST BEKEND',16,DIM);
 }
});
