import * as ui from '@zos/ui';
import {setScrollMode, SCROLL_MODE_SWIPER_HORIZONTAL} from '@zos/page';
import TransferFile from '@zos/ble/TransferFile';
import {LocalStorage} from '@zos/storage';
import {push} from '@zos/router';
import {set as setAlarm, cancel as cancelAlarm} from '@zos/alarm';
import {BasePage} from '@zeppos/zml/base-page';

// Native horizontal swipe. Each screen is its own 480x480 VIEW_CONTAINER.
// No gesture interception or abrupt visibility switching.
const SIZE=480;
const C={
 bg:0x05090d,white:0xf7fafc,muted:0x9bb0bf,blue:0x56c7fc,
 line:0x34434e,bar:0x2f9dd8,empty:0x244052,orange:0xff9267
};
const EMPTY={ok:false,points:[],summary:null};
const MAX_AGE=8*60*1000;
function forecastFresh(d,now=Date.now()){
 return !!(d&&d.ok===true&&Number.isFinite(d.updatedAt)&&
  now>=d.updatedAt-60000&&now-d.updatedAt<=MAX_AGE&&
  Array.isArray(d.points)&&d.points.length>=24&&d.summary1h&&d.summary2h);
}
function headline(s){
 if(!s)return 'GEEN GEGEVENS';
 if(s.state==='dry')return 'DROOG';
 if(s.state==='raining')return 'HET REGENT';
 return 'REGEN OVER '+s.etaMinutes+' MIN';
}
function amount(s,hours){
 if(!s)return 'Geen recente voorspelling';
 return s.totalMm.toFixed(1).replace('.',',')+' mm · '+(hours===1?'komend uur':'komende 2 uur');
}
const storage=new LocalStorage();
function valid(n){return typeof n==='number'&&Number.isFinite(n);}
function shown(n,unit){return valid(n)?Math.round(n)+unit:'--'+unit;}
// Solar elevation, not a fixed 19:00 cutoff: Belgium can have daylight
// well after 21:00 in summer and darkness in late afternoon in winter.
function isNightAt(lat,lon,date=new Date()){
 if(!valid(lat)||!valid(lon))return false;
 const year=date.getUTCFullYear();
 const first=Date.UTC(year,0,1),utc=date.getTime();
 const day=Math.floor((utc-first)/86400000)+1;
 const min=date.getUTCHours()*60+date.getUTCMinutes();
 const gamma=2*Math.PI/365*(day-1+(min/60-12)/24);
 const eq=229.18*(0.000075+0.001868*Math.cos(gamma)-
  0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-
  0.040849*Math.sin(2*gamma));
 const dec=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-
  0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-
  0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
 const hourAngle=(min+eq+4*lon)/4*Math.PI/180-Math.PI;
 const latitude=lat*Math.PI/180;
 const sinAlt=Math.sin(latitude)*Math.sin(dec)+
  Math.cos(latitude)*Math.cos(dec)*Math.cos(hourAngle);
 return sinAlt<Math.sin(-0.833*Math.PI/180);
}
Page(BasePage({
 build(){
  this.disposed=false;this.screen=0;this.loading=false;this.rain=EMPTY;
  this.liveFrames=[];this.radarStamp=null;this.radarSyncing=false;
  this.radarPaths=Array.from({length:6},(_,i)=>'radar-frame-'+i+'.png');
  this.frameIndex=0;this.pendingFrame=null;this.pageViews=[];this.parts=[[],[],[]];
  this.bars=[];this.indicators=[];
  this.zoom=1;this.location={name:'Antwerpen',lat:51.2194,lon:4.4025};
  this.lastAlertKey=null;
  try{
   const saved=JSON.parse(storage.getItem('buienradar.radar-frames.v1')||'null');
   const time=Date.parse(saved&&saved.generatedAt);
   if(saved&&Array.isArray(saved.frames)&&saved.frames.length>=3&&
    time>0&&Date.now()-time<45*60000&&
    saved.frames.every(p=>typeof p==='string'&&p.startsWith('data://'))){
    this.radarPaths=saved.frames;
    this.radarStamp=saved.generatedAt;
   }
  }catch(_){}
  setScrollMode({mode:SCROLL_MODE_SWIPER_HORIZONTAL,options:{
   width:SIZE,count:3,modeParams:{on_page:(index)=>{
    if(this.disposed)return;
    this.screen=index;this.paintIndicators();
    if(index===0)void this.requestRadar();
   }}
  }});
  const create=(page,type,props)=>{
   const w=this.pageViews[page].createWidget(type,props);
   this.parts[page].push(w);return w;
  };
  const rect=(page,x,y,w,h,color,radius=0)=>
   create(page,ui.widget.FILL_RECT,{x,y,w,h,color,radius});
  const txt=(page,x,y,w,h,value,size=22,color=C.white)=>
   create(page,ui.widget.TEXT,{x,y,w,h,text:value,text_size:size,color,
    align_h:ui.align.CENTER_H,text_style:ui.text_style.WRAP});
  for(let i=0;i<3;i++){
   const view=ui.createWidget(ui.widget.VIEW_CONTAINER,{
    x:0,y:0,w:SIZE,h:SIZE,page:i,scroll_enable:0
   });
   this.pageViews.push(view);
   rect(i,0,0,SIZE,SIZE,C.bg);
  }
  // Design v0.8: a single scale, one typographic hierarchy, and safe
  // content bounds inside a 480px circular watch (radius 240).
  // PAGE 1 — full-screen animated radar. Only two compact controls.
  this.radarWidget=create(0,ui.widget.IMG,{
   x:0,y:0,w:SIZE,h:SIZE,src:this.radarPaths[0],
   auto_scale:true,auto_scale_obj_fit:true
  });
  rect(0,161,25,158,46,0x081c2a,23);
  this.city=txt(0,168,30,144,36,'Antwerpen',24,C.white);
  this.markerPieces=[
   rect(0,0,0,18,3,0xffd850),rect(0,0,0,18,3,0xffd850),
   rect(0,0,0,3,18,0xffd850),rect(0,0,0,3,18,0xffd850)
  ];
  this.zoomIn=create(0,ui.widget.BUTTON,{x:397,y:166,w:48,h:48,
   text:'+',text_size:30,color:C.white,normal_color:0x091e2d,
   press_color:0x1b4c66,radius:23,click_func:()=>this.changeZoom(1)});
  this.zoomOut=create(0,ui.widget.BUTTON,{x:397,y:224,w:48,h:48,
   text:'−',text_size:30,color:C.white,normal_color:0x091e2d,
   press_color:0x1b4c66,radius:23,click_func:()=>this.changeZoom(-1)});
  this.placeMarker();

  // PAGE 2 — one uncluttered focal point, controls at the same scale.
  this.rainTitle=txt(1,149,51,182,44,'REGEN',35,C.white);
  this.horizon=2;
  this.horizonOne=create(1,ui.widget.BUTTON,{x:113,y:111,w:122,h:47,
   text:'1 UUR',text_size:20,color:C.white,normal_color:0x162e40,
   press_color:0x1c4b67,radius:22,click_func:()=>this.setHorizon(1)});
  this.horizonTwo=create(1,ui.widget.BUTTON,{x:245,y:111,w:122,h:47,
   text:'2 UUR',text_size:20,color:C.white,normal_color:0x236b95,
   press_color:0x205a79,radius:22,click_func:()=>this.setHorizon(2)});
  this.rainState=txt(1,67,167,346,61,'LADEN…',38,C.white);
  this.rainDetail=txt(1,100,227,280,38,'',23,C.muted);
  rect(1,79,369,322,2,C.line);
  for(let i=0;i<24;i++){
   this.bars.push(rect(1,86+i*13,366,9,4,C.empty,3));
  }
  this.graphTicks=[
   txt(1,85,386,69,29,'NU',19,C.white),
   txt(1,160,386,78,29,'30 min',18,C.muted),
   txt(1,251,386,78,29,'60 min',18,C.muted),
   txt(1,337,386,74,29,'2 uur',18,C.muted)
  ];

  // PAGE 3 — one hero and two balanced glance cards. No text below y=401.
  this.detailTitle=txt(2,149,49,183,48,'WEER',35,C.white);
  this.settingsButton=create(2,ui.widget.BUTTON,{x:365,y:100,w:53,h:48,
   text:'⚙',text_size:28,color:C.white,normal_color:0x162e40,
   press_color:0x286280,radius:22,
   click_func:()=>push({url:'page/settings'})});
  rect(2,80,131,320,143,0x102838,29);
  this.weatherIcon=create(2,ui.widget.IMG,{
   x:102,y:146,w:110,h:110,src:'weather-cloud.png',auto_scale:true
  });
  this.temp=txt(2,212,142,162,90,'--°',72,C.white);
  txt(2,222,231,142,31,'NU',20,C.muted);

  // Equal panels yield visibly intentional alignment and prevent clipping.
  rect(2,85,286,147,110,0x102838,24);
  rect(2,247,286,148,110,0x102838,24);
  create(2,ui.widget.IMG,{
   x:105,y:302,w:41,h:41,src:'weather-drop.png',auto_scale:true
  });
  this.amount=txt(2,138,300,90,48,'--',30,C.blue);
  txt(2,100,353,119,27,'1 UUR',18,C.muted);
  create(2,ui.widget.IMG,{
   x:261,y:302,w:38,h:38,src:'weather-wind.png',auto_scale:true
  });
  this.wind=txt(2,292,299,97,48,'--',28,C.white);
  this.gusts=txt(2,252,352,139,28,'',17,C.muted);
  this.station=txt(2,169,421,141,18,'',12,C.muted);

  // Native swiper remains. Dots are intentionally visible above bottom arc.
  for(let i=0;i<3;i++){
   const marks=[];
   for(let j=0;j<3;j++)marks.push(rect(
    i,216+j*24,453,8,8,j===i?C.white:0x587081,4));
   this.indicators.push(marks);
  }
  this.initRadarInbox();
  this.configTick=0;
  this.lastConfigSignature=String(storage.getItem('buienradar.location')||'')+'|'+
   String(storage.getItem('buienradar.alert')||'');
  this.frameTimer=setInterval(()=>{
   if(this.screen===0)this.nextRadarFrame();
   if(++this.configTick%12===0)this.checkConfig();
  },950);
  this.weatherTimer=setInterval(()=>{void this.refresh();},300000);
  void this.readLocation();
  void this.refresh();
 },
 paintIndicators(){
  for(let i=0;i<3;i++){
   const marks=this.indicators[i]||[];
   for(let j=0;j<marks.length;j++)
    marks[j].setProperty(ui.prop.COLOR,i===j?C.white:0x6c8090);
  }
 },
 initRadarInbox(){
  try{
   this.transfer=new TransferFile();
   const inbox=this.transfer.getInbox(),handled={};
   const handle=()=>{
    const file=inbox.getNextFile();
    if(!file||!file.params||file.params.kind!=='buienradar-frame')return;
    const index=Number(file.params.frameIndex);
    if(!Number.isInteger(index)||index<0||index>=12)return;
    const id=String(file.sessionId||file.fileName||file.filePath||'')+':'+index;
    if(handled[id])return;
    const entry={file,done:false,load:()=>{
     if(this.disposed||!file.filePath||this.radarStamp!==file.params.generatedAt)return;
     this.liveFrames[index]=file.filePath;
     const ready=this.liveFrames.filter(Boolean).length;
     // Never switch to an incomplete download by replacing the existing frames.
     if(ready>=2){
      const contiguous=[];
      for(const p of this.liveFrames){if(!p)break;contiguous.push(p);}
      if(contiguous.length>=2){
       this.radarPaths=contiguous;
       // Radar is visually uninterrupted: no overlay status text.
       try{storage.setItem('buienradar.radar-frames.v1',JSON.stringify({
        frames:this.radarPaths,generatedAt:this.radarStamp
       }));}catch(_){}
      }
     }
     if(this.pendingFrame&&this.pendingFrame.index===index){
      this.pendingFrame.resolve();this.pendingFrame=null;
     }
    }};
    handled[id]=entry;
    if(file.readyState==='transferred'){entry.load();entry.done=true;return;}
    if(typeof file.on==='function')file.on('change',event=>{
     const state=event&&event.data&&event.data.readyState||file.readyState;
     if(state==='transferred'){entry.load();entry.done=true;}
     else if(state==='error'||state==='canceled'){
      if(this.pendingFrame&&this.pendingFrame.index===index){
       this.pendingFrame.reject(Error('BLE ontvangst mislukt'));this.pendingFrame=null;
      }
     }
    });
   };
   const sweep=()=>{
    for(const entry of Object.values(handled))
     if(!entry.done&&entry.file.readyState==='transferred'){
      entry.load();entry.done=true;
     }
   };
   inbox.on('NEWFILE',()=>{handle();sweep();});
   inbox.on('FILE',()=>{sweep();handle();sweep();});
  }catch(_){/* Offline bundled animation remains playable. */}
 },
 nextRadarFrame(){
  if(this.disposed||!this.radarPaths.length)return;
  this.frameIndex=(this.frameIndex+1)%this.radarPaths.length;
  const file=this.radarPaths[this.frameIndex];
  if(file){
   const z=this.zoom||1;
   const mx=this.markerX||217,my=this.markerY||209;
   this.radarWidget.setProperty(ui.prop.MORE,{
    x:z===1?0:Math.round(240-mx*z),
    y:z===1?0:Math.round(240-my*z),
    w:Math.round(SIZE*z),h:Math.round(SIZE*z),
    src:file,auto_scale:true
   });
  }
 },
 async phone(msg,timeout=20000){
  if(!this.messaging||typeof this.messaging.request!=='function')
   throw Error('Zepp telefoonverbinding ontbreekt');
  return this.messaging.request(msg,{timeout});
 },
 async downloadSingleFrame(index){
  const res=await this.phone({method:'radar.frame',params:{index}},10000);
  if(!res||res.ok!==true)throw Error(res&&res.error||'Frame niet beschikbaar');
  if(this.liveFrames[index])return;
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{
    if(this.pendingFrame&&this.pendingFrame.index===index)this.pendingFrame=null;
    reject(Error('Frameoverdracht verlopen'));
   },46000);
   this.pendingFrame={index,
    resolve:()=>{clearTimeout(timer);resolve();},
    reject:e=>{clearTimeout(timer);reject(e);}
   };
   if(this.liveFrames[index]){
    this.pendingFrame.resolve();this.pendingFrame=null;
   }
  });
 },
 async requestRadar(){
  if(this.disposed||this.radarSyncing)return;
  this.radarSyncing=true;
  try{
   const manifest=await this.phone({method:'radar.manifest'},15000);
   if(!manifest||manifest.ok!==true||!manifest.frameCount)return;
   if(manifest.generatedAt===this.radarStamp&&this.radarPaths.length>=3)return;
   this.radarStamp=manifest.generatedAt;
   this.liveFrames=new Array(manifest.frameCount).fill(null);
   // Refresh silently; pre-installed loop remains visible throughout.
   for(let i=0;i<manifest.frameCount&&!this.disposed;i++)
    try{await this.downloadSingleFrame(i);}
    catch(_){break;}
  }catch(_){}finally{this.radarSyncing=false;}
 },
 draw(){
  if(this.disposed)return;
  const d=this.rain||EMPTY;
  if(!forecastFresh(d)){
   this.scheduleRainAlert(EMPTY);
   // Keep last snapshot for offline widget; it is marked stale there.
   // A location change explicitly clears that old city's snapshot. 
   this.rainState.setProperty(ui.prop.TEXT,'GEEN RECENTE DATA');
   this.rainDetail.setProperty(ui.prop.TEXT,'Open de app opnieuw');
   this.temp.setProperty(ui.prop.TEXT,'--°');
   this.amount.setProperty(ui.prop.TEXT,'-- mm');
   this.wind.setProperty(ui.prop.TEXT,'-- km/u');
   this.gusts.setProperty(ui.prop.TEXT,'');
   this.station.setProperty(ui.prop.TEXT,'');
   for(const b of this.bars){
    b.setProperty(ui.prop.H,4);b.setProperty(ui.prop.Y,362);
    b.setProperty(ui.prop.COLOR,C.empty);
   }
   return;
  }
  const received=d.location||this.location;
  this.location=received;
  this.city.setProperty(ui.prop.TEXT,received.name||'Antwerpen');
  this.placeMarker();
  this.scheduleRainAlert(d);
  this.renderForecast();
  const w=d.station||{};
  this.temp.setProperty(ui.prop.TEXT,shown(w.temperature,'°'));
  this.amount.setProperty(ui.prop.TEXT,
   valid(d.nextHourMm)?d.nextHourMm.toFixed(1).replace('.',',')+' mm':'--');
  this.wind.setProperty(ui.prop.TEXT,
   valid(w.windKmh)?Math.round(w.windKmh)+' km/u':'--');
  this.gusts.setProperty(ui.prop.TEXT,
   w.direction?String(w.direction).slice(0,4):'');
  this.station.setProperty(ui.prop.TEXT,'');
  let src='weather-cloud.png';
  const description=String(w.weatherDescription||'').toLowerCase();
  if(/regen|bui|motregen|rain|drizzle|sneeuw/.test(description))
   src='weather-rain.png';
  else if(/zonnig|helder|sunny|clear/.test(description))
   src=isNightAt(this.location&&this.location.lat,
    this.location&&this.location.lon)?'weather-moon.png':'weather-sun.png';
  this.weatherIcon.setProperty(ui.prop.MORE,{src,auto_scale:true});
 },
 storeShortcut(d){
  try{
   if(!forecastFresh(d))return;
   const w=d.station||{};
   storage.setItem('buienradar.overview.v3',JSON.stringify({
    at:d.updatedAt,location:d.location.name,summary120:d.summary2h,
    points:d.points.slice(0,24).map(p=>({mmh:p.mmh})),
    temperature:valid(w.temperature)?w.temperature:null,
    windKmh:valid(w.windKmh)?w.windKmh:null,
    direction:w.direction||null
   }));
  }catch(_){}
 },
 async refresh(){
  if(this.disposed||this.loading)return;
  this.loading=true;
  try{
   const result=await this.phone({method:'rain.forecast',params:{}},25000);
   if(this.disposed)return;
   this.rain=forecastFresh(result)?result:EMPTY;
   this.draw();
   if(this.rain.ok)this.storeShortcut(this.rain);
  }catch(_){
   this.rain=EMPTY;this.draw();
  }finally{
   this.loading=false;
   if(this.screen===0)void this.requestRadar();
  }
 },
 checkConfig(){
  const key=String(storage.getItem('buienradar.location')||'')+'|'+
   String(storage.getItem('buienradar.alert')||'');
  if(key===this.lastConfigSignature)return;
  this.lastConfigSignature=key;
  this.lastAlertKey=null;
  // Prevent the full-screen widget from showing weather from a previous city.
  storage.setItem('buienradar.overview.v3','');
  try{
   const loc=JSON.parse(storage.getItem('buienradar.location')||'null');
   if(loc&&loc.name){this.location=loc;
    this.city.setProperty(ui.prop.TEXT,loc.name);this.placeMarker();}
  }catch(_){}
  void this.refresh();
 },
 async readLocation(){
  try{
   const saved=JSON.parse(storage.getItem('buienradar.location')||'null');
   if(saved&&saved.name)this.location=saved;
  }catch(_){}
  try{
   const r=await this.phone({method:'config.get'},9000);
   if(r&&r.ok&&r.location){
    this.location=r.location;
    storage.setItem('buienradar.location',JSON.stringify(r.location));
   }
  }catch(_){}
  if(this.city){
   this.city.setProperty(ui.prop.TEXT,this.location.name||'Antwerpen');
   this.placeMarker();
  }
 },
 placeMarker(){
  if(!this.markerPieces||!this.location)return;
  // Belgium raster is not supplied with an official geo-affine transform.
  // These points are a visually corrected, indicative map calibration.
  // Do NOT display this as exact GPS positioning.
  const loc=this.location;
  // Calibrated visually against the official 480px Belgium raster;
  // keep this as an indicative point until authoritative bounds exist.
  const px=Math.max(46,Math.min(434,246+(loc.lon-4.4025)*75));
  const py=Math.max(63,Math.min(425,198-(loc.lat-51.2194)*102));
  this.markerX=px;this.markerY=py;
  const x=this.zoom===1?px:240,y=this.zoom===1?py:240;
  const left=Math.round(x-9),top=Math.round(y-9);
  const shapes=[[left,top,18,3],[left,top+15,18,3],
   [left,top,3,18],[left+15,top,3,18]];
  shapes.forEach((v,i)=>this.markerPieces[i].setProperty(ui.prop.MORE,{
   x:v[0],y:v[1],w:v[2],h:v[3],color:0xffd850
  }));
 },
 changeZoom(direction){
  const steps=[1,1.3,1.6,2];
  const index=steps.indexOf(this.zoom||1);
  this.zoom=steps[Math.max(0,Math.min(steps.length-1,index+direction))];
  const x=this.markerX||217,y=this.markerY||209;
  const width=Math.round(SIZE*this.zoom),left=Math.round(240-x*this.zoom);
  const top=Math.round(240-y*this.zoom);
  this.radarWidget.setProperty(ui.prop.MORE,{
   x:left,y:top,w:width,h:width,
   src:this.radarPaths[this.frameIndex]||this.radarPaths[0],auto_scale:true
  });
  this.placeMarker();
 },
 renderForecast(){
   const sum=forecastFresh(this.rain)?
    (this.horizon===1?this.rain.summary1h:this.rain.summary2h):null;
   this.rainState.setProperty(ui.prop.TEXT,headline(sum));
   this.rainState.setProperty(ui.prop.COLOR,!sum?C.muted:
    sum.state==='raining'?C.orange:sum.state==='incoming'?C.blue:C.white);
   this.rainDetail.setProperty(ui.prop.TEXT,amount(sum,this.horizon));
   this.renderBars();
 },
 setHorizon(hours){
  this.horizon=hours===1?1:2;
  const labels=this.horizon===1?['NU','15 min','30 min','60 min']:
   ['NU','30 min','60 min','2 uur'];
  this.graphTicks.forEach((tick,i)=>tick.setProperty(ui.prop.TEXT,labels[i]));
  this.horizonOne.setProperty(ui.prop.MORE,{x:113,y:111,w:122,h:47,
   normal_color:this.horizon===1?0x236b95:0x162e40});
  this.horizonTwo.setProperty(ui.prop.MORE,{x:245,y:111,w:122,h:47,
   normal_color:this.horizon===2?0x236b95:0x162e40});
  this.renderForecast();
 },
 renderBars(){
  const points=forecastFresh(this.rain)?this.rain.points:[];
  const count=this.horizon===1?12:24;
  const nums=points.slice(0,count).map(p=>valid(p.mmh)?p.mmh:0);
  const mx=Math.max(1,...nums);
  for(let i=0;i<24;i++){
   const b=this.bars[i];
   if(i>=count||i>=nums.length){
    b.setProperty(ui.prop.VISIBLE,false);continue;
   }
   b.setProperty(ui.prop.VISIBLE,true);
   const n=nums[i],height=n<0.03?4:Math.max(11,Math.round(Math.sqrt(n/mx)*89));
   const x=86+i*(this.horizon===1?26:13);
   b.setProperty(ui.prop.MORE,{x,y:369-height,w:this.horizon===1?16:9,
    h:height,color:n<0.03?C.empty:C.bar,radius:3});
  }
 },
 scheduleRainAlert(d){
  let prefs;
  try{prefs=JSON.parse(storage.getItem('buienradar.alert')||'null');}catch(_){}
  const prior=Number(storage.getItem('buienradar.alert-alarm-id')||0);
  if(!prefs||!prefs.enabled||!forecastFresh(d)){
   if(prior>0){try{cancelAlarm(prior);}catch(_){}}
   storage.setItem('buienradar.alert-alarm-id','0');
   this.lastAlertKey=null;
   return;
  }
  // Raintext is 5-minute nowcast only; no claim of long-range live monitoring.
  const onset=d.points.findIndex(p=>valid(p.mmh)&&p.mmh>=0.03);
  if(onset<=0){
   if(prior>0){try{cancelAlarm(prior);}catch(_){}}
   storage.setItem('buienradar.alert-alarm-id','0');
   this.lastAlertKey=null;return;
  }
  const lead=[5,15,30].includes(prefs.lead)?prefs.lead:15;
  const onsetAt=Date.now()+onset*5*60000;
  const key=String(Math.round(onsetAt/(5*60000)))+'-'+(d.location&&d.location.name);
  if(key===this.lastAlertKey&&prior>0)return;
  if(prior>0){try{cancelAlarm(prior);}catch(_){}}
  storage.setItem('buienradar.alert-alarm-id','0');
  const sec=Math.max(3,Math.round((onsetAt-Date.now()-lead*60000)/1000));
  if(sec>2*3600)return;
  const id=setAlarm({url:'app-service/rain-alert',delay:sec,store:true,
   param:JSON.stringify({place:d.location&&d.location.name||'Buienradar',
    onsetAt,lead,plannedAt:Date.now()})});
  if(id>0){
   this.lastAlertKey=key;
   storage.setItem('buienradar.alert-alarm-id',String(id));
  }
 },
 onDestroy(){
  this.disposed=true;
  if(this.frameTimer!==undefined)clearInterval(this.frameTimer);
  if(this.weatherTimer!==undefined)clearInterval(this.weatherTimer);
  if(this.pendingFrame)this.pendingFrame.reject(Error('App gesloten'));
  this.pendingFrame=null;
 }
}));
