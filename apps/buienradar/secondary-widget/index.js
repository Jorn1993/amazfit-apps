// Buienradar Balance 2: an actual future radar preview, never historical.
// Local rain/temperature continue to come directly from Buienradar;
// the +3h precipitation layer comes from the Royal Meteorological Institute.
import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';
const store=new LocalStorage(),INK=0xf7fafc,MUTED=0xb4cad8,BG=0x071b2a;
function currentFuture(now=Date.now()){
 try{
  const d=JSON.parse(store.getItem('buienradar.future-radar.v1')||'null');
  if(!d||d.source!=='KMI'||!Number.isFinite(d.fetchedAt)||
     now-d.fetchedAt<0||now-d.fetchedAt>=12*60000||
     !Array.isArray(d.frames))return null;
  return d.frames.find(f=>f&&f.validAt>now&&
   typeof f.path==='string'&&f.path.startsWith('data://'))||null;
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
  const value=JSON.parse(store.getItem('buienradar.location')||'null');
  if(value&&value.name)return String(value.name).slice(0,20);
 }catch(_){}
 return 'Buienradar';
}
function preview(now=Date.now()){
 const frame=currentFuture(now),weather=currentWeather(now);
 const status=weather&&weather.summary120;
 let text=city();
 if(weather&&Number.isFinite(weather.temperature))text+=' · '+Math.round(weather.temperature)+'°';
 if(status)text+=' · '+(status.state==='dry'?'Droog':
  status.state==='raining'?'Regen':
  status.state==='incoming'&&Number.isFinite(status.etaMinutes)?
   'Regen over '+status.etaMinutes+'m':'');
 let time='KMI +3u';
 if(frame)time=new Date(frame.validAt).toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'});
 return {frame,title:text.slice(0,32),time};
}
SecondaryWidget({
 build(){
  const v=preview(),make=(type,props)=>ui.createWidget(type,props);
  const text=(x,y,w,h,value,size,color=INK)=>make(ui.widget.TEXT,{
   x,y,w,h,text:value,text_size:size,color,
   align_h:ui.align.CENTER_H,text_style:ui.text_style.ELLIPSIS
  });
  make(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
  make(ui.widget.IMG,{x:0,y:54,w:480,h:368,
   src:'kmi-be-map.png',auto_scale:true});
  this.rainLayer=make(ui.widget.IMG,{x:0,y:54,w:480,h:368,
   src:v.frame?.path||'kmi-clear.png',auto_scale:true});
  this.header=make(ui.widget.BUTTON,{x:110,y:43,w:260,h:55,
   text:'',normal_color:BG,press_color:0x195071,radius:25,
   click_func:()=>push({url:'page/index'})});
  this.titleLabel=text(122,48,236,44,v.title,21);
  this.timeLabel=text(156,404,168,30,v.time,23);
  this.emptyLabel=text(135,124,210,30,
   v.frame?'':'OPEN VOOR +3U RADAR',17,MUTED);
 },
 onResume(){
  if(!this.titleLabel)return;
  const v=preview();
  this.titleLabel.setProperty(ui.prop.TEXT,v.title);
  this.timeLabel.setProperty(ui.prop.TEXT,v.time);
  this.emptyLabel.setProperty(ui.prop.TEXT,v.frame?'':'OPEN VOOR +3U RADAR');
  this.rainLayer.setProperty(ui.prop.MORE,{
   x:0,y:54,w:480,h:368,src:v.frame?.path||'kmi-clear.png',auto_scale:true
  });
 }
});
