// Buienradar — radar-first secondary widget for Zepp OS 3.
// The last-known forecast is NEVER presented as a live measurement.
import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';

const store=new LocalStorage();
const BG=0x071b2a,SOFT=0xb8cfdb,WHITE=0xf6fafc,BLUE=0x72d2ff;
function read(now=Date.now()){
 try{
  const data=JSON.parse(store.getItem('buienradar.overview.v3')||'null');
  if(!data||!Number.isFinite(data.at)||!data.summary120)return null;
  const age=now-data.at;
  if(age<0||age>24*3600000)return null;
  return {...data,fresh:age<=8*60000};
 }catch(_){return null;}
}
function status(d){
 if(!d||!d.fresh)return 'Bijwerken';
 const s=d.summary120;
 if(s.state==='dry')return 'Droog';
 if(s.state==='raining')return 'Regen';
 if(s.state==='incoming'&&Number.isFinite(s.etaMinutes))
  return 'Regen in '+s.etaMinutes+'m';
 return 'Weer';
}
SecondaryWidget({
 build(){
  const data=read();
  const make=(type,props)=>ui.createWidget(type,props);
  const label=(x,y,w,h,text,size,color=WHITE)=>make(ui.widget.TEXT,{
   x,y,w,h,text,text_size:size,color,
   align_h:ui.align.CENTER_H,text_style:ui.text_style.ELLIPSIS
  });
  make(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
  make(ui.widget.IMG,{x:0,y:0,w:480,h:480,src:'radar-frame-2.png',auto_scale:true});
  let city=data&&data.location||'Buienradar';
  try{
   const saved=JSON.parse(store.getItem('buienradar.location')||'null');
   if(saved&&saved.name)city=saved.name;
  }catch(_){}
  // App entry above the map: no huge top title or duplicate logo.
  make(ui.widget.BUTTON,{x:149,y:27,w:182,h:48,
   text:String(city),text_size:24,color:WHITE,normal_color:BG,
   press_color:0x174267,radius:23,
   click_func:()=>push({url:'page/index'})});
  // A SINGLE compact glance bar: never stack a second row over the map.
  // Stale snapshots must not masquerade as current precipitation.
  const fresh=!!(data&&data.fresh);
  const temperature=fresh&&Number.isFinite(data.temperature)?
   Math.round(data.temperature)+'°':'';
  const message=fresh?status(data):'Radar · niet actueel';
  const title=temperature?temperature+'  ·  '+message:message;
  make(ui.widget.BUTTON,{x:98,y:368,w:284,h:53,
   text:title,text_size:title.length>20?21:26,color:WHITE,
   normal_color:BG,press_color:0x174267,radius:24,
   click_func:()=>push({url:'page/index'})});
 }
});
