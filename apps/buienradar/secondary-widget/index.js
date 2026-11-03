// Buienradar — one elegant header, otherwise an unobstructed radar.
// The actual per-frame radar clock is baked into the source image at y≈398-443.
// Never overlay that region or label stale precipitation as a stale radar.
import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';

const store=new LocalStorage();
const BG=0x081e2d,WHITE=0xf6fafc,SOFT=0xb8cfdb;
const FRESH_MS=8*60*1000;
function read(now=Date.now()){
 try{
  const d=JSON.parse(store.getItem('buienradar.overview.v3')||'null');
  if(!d||!Number.isFinite(d.at)||!d.summary120)return null;
  const age=now-d.at;
  if(age<0||age>24*3600000)return null;
  return {...d,fresh:age<=FRESH_MS};
 }catch(_){return null;}
}
function forecastText(data){
 if(!data||!data.fresh)return null;
 const s=data.summary120;
 if(s.state==='dry')return 'Droog';
 if(s.state==='raining')return 'Regen';
 if(s.state==='incoming'&&Number.isFinite(s.etaMinutes))
  return 'Regen in '+s.etaMinutes+' min';
 return null;
}
function radarPreview(now=Date.now()){
 try{
  const cache=JSON.parse(store.getItem('buienradar.radar-frames.v1')||'null');
  const stamp=Date.parse(cache&&cache.generatedAt);
  const age=now-stamp;
  if(cache&&Array.isArray(cache.frames)&&cache.frames.length&&
   age>=0&&age<35*60000){
   const selected=cache.mode==='snapshot'?0:
    Math.min(2,cache.frames.length-1);
   const path=cache.frames[selected];
   if(typeof path==='string'&&path.startsWith('data://'))
    return {path,fresh:true};
  }
 }catch(_){}
 return {path:'radar-frame-2.png',fresh:false};
}
function presentation(){
 const data=read();
 let city=data&&data.location||'Buienradar';
 try{
  const loc=JSON.parse(store.getItem('buienradar.location')||'null');
  if(loc&&loc.name)city=loc.name;
 }catch(_){}
 const temp=data&&Number.isFinite(data.temperature)?
  Math.round(data.temperature)+'°':null;
 const state=forecastText(data);
 let subtitle;
 if(data&&data.fresh){
  subtitle=[temp,state].filter(Boolean).join(' · ')||'Weer bijwerken';
 }else if(temp){
  subtitle=temp+' · laatst bekend';
 }else{
  subtitle='Open voor weer';
 }
 return {city:String(city).slice(0,23),subtitle,
  color:data&&data.fresh?WHITE:SOFT};
}
SecondaryWidget({
 build(){
  const v=presentation();
  const make=(type,props)=>ui.createWidget(type,props);
  make(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
  // Prefer the latest verified frame delivered directly by the phone.
  // The bundled picture is an offline archive, NOT automatically current.
  const radar=radarPreview();
  this.radarImage=make(ui.widget.IMG,{x:0,y:0,w:480,h:480,
   src:radar.path,auto_scale:true});
  this.radarFresh=radar.fresh;
  // Single circular-safe capsule. No widget UI is drawn over y>=390, so
  // the full source-frame time (y≈398-443) stays visible.
  this.header=make(ui.widget.BUTTON,{x:116,y:46,w:248,h:82,
   text:'',text_size:24,color:WHITE,normal_color:BG,
   press_color:0x174267,radius:33,
   click_func:()=>push({url:'page/index'})});
  const label=(x,y,w,h,text,size,color)=>
   make(ui.widget.TEXT,{x,y,w,h,text,text_size:size,color,
    align_h:ui.align.CENTER_H,text_style:ui.text_style.ELLIPSIS});
  this.locationLabel=label(136,55,208,34,v.city,26,WHITE);
  this.weatherLabel=label(124,93,232,29,v.subtitle,21,v.color);
  this.radarAgeLabel=label(160,140,160,23,
   this.radarFresh?'':'RADARARCHIEF',16,SOFT);
 },
 // Zepp does not automatically rebuild SecondaryWidget after returning from
 // the main app. Read the shared LocalStorage again when the tile is focused.
 onResume(){
  if(!this.locationLabel||!this.weatherLabel)return;
  const v=presentation();
  this.locationLabel.setProperty(ui.prop.TEXT,v.city);
  this.weatherLabel.setProperty(ui.prop.TEXT,v.subtitle);
  this.weatherLabel.setProperty(ui.prop.COLOR,v.color);
  const radar=radarPreview();
  this.radarFresh=radar.fresh;
  this.radarImage.setProperty(ui.prop.MORE,{src:radar.path,
   x:0,y:0,w:480,h:480,auto_scale:true});
  this.radarAgeLabel.setProperty(ui.prop.TEXT,
   radar.fresh?'':'RADARARCHIEF');
 }
});
