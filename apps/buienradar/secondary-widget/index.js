// Fullscreen latest verified current Buienradar Belgium observation.
// Never show historical or unverified animated radar caches.
import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';
const store=new LocalStorage(),INK=0xf7fafc,MUTED=0xb4cad8,BG=0x071b2a;
function currentObservation(now=Date.now()){
 try{
  const d=JSON.parse(store.getItem('buienradar.current.v2')||'null');
  if(!d||d.source!=='Buienradar'||!Number.isFinite(d.fetchedAt)||
     now<d.fetchedAt||now-d.fetchedAt>=8*60000||
     typeof d.path!=='string'||!d.path.startsWith('data://'))return null;
  return {path:d.path};
 }catch(_){return null;}
}
function currentWeather(now=Date.now()){
 try{
  const d=JSON.parse(store.getItem('buienradar.overview.v3')||'null');
  if(!d||now-d.at<0||now-d.at>8*60000)return null;
  return d;
 }catch(_){return null;}
}
function city(){
 try{
  const data=JSON.parse(store.getItem('buienradar.location')||'null');
  if(data?.name)return String(data.name).slice(0,20);
 }catch(_){}
 return 'Buienradar';
}
function preview(now=Date.now()){
 const frame=currentObservation(now);
 const weather=currentWeather(now);
 const status=weather?.summary120;
 let heading=city();
 if(weather&&Number.isFinite(weather.temperature))
  heading+=' · '+Math.round(weather.temperature)+'°';
 if(status)heading+=' · '+(status.state==='dry'?'Droog':
  status.state==='raining'?'Regen':
  status.state==='incoming'&&Number.isFinite(status.etaMinutes)?
   'Regen over '+status.etaMinutes+'m':'');
 return {frame,title:heading.slice(0,32),time:frame?'Buienradar · actueel':'Buienradar'};
}
SecondaryWidget({
 build(){
  const v=preview(),make=(type,props)=>ui.createWidget(type,props);
  const text=(x,y,w,h,value,size,color=INK)=>make(ui.widget.TEXT,{
   x,y,w,h,text:value,text_size:size,color,
   align_h:ui.align.CENTER_H,text_style:ui.text_style.ELLIPSIS
  });
  make(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
  // Full-screen watch widget; the circular display clips the image edges.
  make(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:0x112b3b});
  this.rainLayer=make(ui.widget.IMG,{x:0,y:0,w:480,h:480,
   src:v.frame?.path||'weather-cloud.png',auto_scale:true});
  this.rainLayer.setProperty(ui.prop.VISIBLE,!!v.frame);
  this.header=make(ui.widget.BUTTON,{x:110,y:43,w:260,h:55,
   text:'',normal_color:BG,press_color:0x195071,radius:25,
   click_func:()=>push({url:'page/index'})});
  this.titleLabel=text(122,48,236,44,v.title,21);
  make(ui.widget.FILL_RECT,{x:116,y:397,w:248,h:41,color:BG,radius:20});
  this.timeLabel=text(129,403,222,30,v.time,21);
  this.emptyLabel=text(121,216,238,40,
   v.frame?'':'OPEN VOOR RADAR',17,MUTED);
 },
 onResume(){
  if(!this.titleLabel)return;
  const v=preview();
  this.titleLabel.setProperty(ui.prop.TEXT,v.title);
  this.timeLabel.setProperty(ui.prop.TEXT,v.time);
  this.emptyLabel.setProperty(ui.prop.TEXT,v.frame?'':'OPEN VOOR RADAR');
  if(v.frame)this.rainLayer.setProperty(ui.prop.MORE,{
   x:0,y:0,w:480,h:480,src:v.frame.path,auto_scale:true
  });
  this.rainLayer.setProperty(ui.prop.VISIBLE,!!v.frame);
 }
});
