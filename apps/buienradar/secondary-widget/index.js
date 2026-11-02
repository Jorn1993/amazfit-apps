// Buienradar Balance 2 widget — mini dashboard rather than a second app.
// Radar stays visible without a recent forecast. Forecast data is timestamped
// and never labelled current if the app has not refreshed it.
import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';

const store=new LocalStorage();
const BG=0x071722,PANEL=0x0d2535,WHITE=0xf5f9fc,
 SOFT=0xb0c7d6,BLUE=0x58c7f7,DIM=0x6c8799;
const TTL=8*60*1000;
function snapshot(now=Date.now()){
 try{
  const data=JSON.parse(store.getItem('buienradar.overview.v3')||'null');
  if(!data||!Number.isFinite(data.at)||!data.summary120||
   !Array.isArray(data.points)||data.points.length<24)return null;
  const age=now-data.at;
  if(age<0||age>24*3600000)return null;
  return {...data,fresh:age<=TTL};
 }catch(_){return null;}
}
const num=n=>typeof n==='number'&&Number.isFinite(n)?
 Math.round(n).toString():'--';
const state=sum=>!sum?'OPEN BUIENRADAR':
 sum.state==='dry'?'DROOG':
 sum.state==='raining'?'HET REGENT':
 sum.state==='incoming'&&Number.isFinite(sum.etaMinutes)?
  'REGEN OVER '+sum.etaMinutes+' MIN':'REGENVERWACHTING';
SecondaryWidget({
 build(){
  const d=snapshot(),current=!!(d&&d.fresh),sum=current?d.summary120:null;
  const add=(type,properties)=>ui.createWidget(type,properties);
  const text=(x,y,w,h,value,font,color=WHITE)=>add(ui.widget.TEXT,{
   x,y,w,h,text:value,text_size:font,color,
   align_h:ui.align.CENTER_H,text_style:ui.text_style.ELLIPSIS
  });
  add(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
  // Tap target behind all visuals. Zepp widgets cannot fetch live BLE data.
  add(ui.widget.BUTTON,{x:78,y:36,w:325,h:367,
   text:'',normal_color:BG,press_color:0x1a3e55,radius:29,
   click_func:()=>push({url:'page/index'})});
  add(ui.widget.IMG,{x:0,y:0,w:480,h:480,
   src:'radar-frame-2.png',auto_scale:true});
  add(ui.widget.FILL_RECT,{x:155,y:29,w:170,h:45,color:BG,radius:22});
  let city=d&&d.location||'Buienradar';
  try{
   const selected=JSON.parse(store.getItem('buienradar.location')||'null');
   if(selected&&selected.name)city=selected.name;
  }catch(_){}
  text(164,34,152,35,String(city),25);

  // Lower dashboard is a deliberate, well-proportioned circle-safe panel.
  add(ui.widget.FILL_RECT,{x:78,y:214,w:324,h:193,color:PANEL,radius:29});
  const title=state(sum);
  text(93,223,294,43,title,title.length>19?24:29);
  const secondary=current?
   sum.totalMm.toFixed(1).replace('.',',')+' mm  /  2 uur':
   d?'LAATSTE VERWACHTING':'OPEN VOOR NIEUWE DATA';
  text(111,266,258,27,secondary,19,current?SOFT:DIM);

  // 24 aligned bars; when stale, show muted historic shape without claiming live rain.
  const points=d?d.points.slice(0,24):[];
  const max=Math.max(1,...points.map(p=>Number(p.mmh)||0));
  for(let i=0;i<24;i++){
   const value=Number(points[i]&&points[i].mmh)||0;
   const height=value<0.03?3:Math.max(7,Math.round(Math.sqrt(value/max)*39));
   add(ui.widget.FILL_RECT,{x:100+i*12,y:352-height,
    w:8,h:height,color:!current?DIM:value<0.03?0x355365:BLUE,
    radius:3});
  }
  add(ui.widget.FILL_RECT,{x:99,y:357,w:286,h:2,color:0x29485b});
  const t=d?num(d.temperature)+'°':'--°';
  const wind=d?((d.direction||'')+' '+num(d.windKmh)+' km/u'):'-- km/u';
  text(113,365,109,34,t,30,current?WHITE:SOFT);
  text(225,369,159,29,wind,21,current?WHITE:SOFT);
 }
});
