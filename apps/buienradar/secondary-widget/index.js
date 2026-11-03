// Official Buienradar +3h Belgium animation: cached first image only.
// The app plays all frames; the widget shows the latest valid forecast preview.
import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';
const store=new LocalStorage(),INK=0xf7fafc,MUTED=0xb4cad8,BG=0x071b2a;
function currentForecast(now=Date.now()){
 try{
  const d=JSON.parse(store.getItem('buienradar.animation.v2')||'null');
  if(!d||d.source!=='Buienradar'||d.horizonMinutes!==180||
     !Number.isFinite(d.fetchedAt)||now<d.fetchedAt||
     now-d.fetchedAt>=12*60000||!Array.isArray(d.frames))return null;
  return d.frames.find(f=>f&&typeof f.path==='string'&&
   f.path.startsWith('data://'))||null;
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
 const frame=currentForecast(now),weather=currentWeather(now);
 const status=weather?.summary120;
 let heading=city();
 if(weather&&Number.isFinite(weather.temperature))
  heading+=' · '+Math.round(weather.temperature)+'°';
 if(status)heading+=' · '+(status.state==='dry'?'Droog':
  status.state==='raining'?'Regen':
  status.state==='incoming'&&Number.isFinite(status.etaMinutes)?
   'Regen over '+status.etaMinutes+'m':'');
 return {frame,title:heading.slice(0,32),time:'Buienradar +3u'};
}
SecondaryWidget({
 build(){
  const v=preview(),make=(type,props)=>ui.createWidget(type,props);
  const text=(x,y,w,h,value,size,color=INK)=>make(ui.widget.TEXT,{
   x,y,w,h,text:value,text_size:size,color,
   align_h:ui.align.CENTER_H,text_style:ui.text_style.ELLIPSIS
  });
  make(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
  make(ui.widget.FILL_RECT,{x:80,y:77,w:320,h:320,color:0x112b3b,radius:12});
  this.rainLayer=make(ui.widget.IMG,{x:80,y:77,w:320,h:320,
   src:v.frame?.path||'weather-cloud.png',auto_scale:true});
  this.rainLayer.setProperty(ui.prop.VISIBLE,!!v.frame);
  this.header=make(ui.widget.BUTTON,{x:110,y:43,w:260,h:55,
   text:'',normal_color:BG,press_color:0x195071,radius:25,
   click_func:()=>push({url:'page/index'})});
  this.titleLabel=text(122,48,236,44,v.title,21);
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
   x:80,y:77,w:320,h:320,src:v.frame.path,auto_scale:true
  });
  this.rainLayer.setProperty(ui.prop.VISIBLE,!!v.frame);
 }
});
