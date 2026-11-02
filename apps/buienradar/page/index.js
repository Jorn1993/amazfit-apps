import * as ui from '@zos/ui';
import {Geolocation} from '@zos/sensor';
import {onGesture,offGesture,GESTURE_LEFT,GESTURE_RIGHT} from '@zos/interaction';
import TransferFile from '@zos/ble/TransferFile';
import {LocalStorage} from '@zos/storage';
import {BasePage} from '@zeppos/zml/base-page';

// Three full-size pages for 480px Balance 2, after user's original references.
const C={bg:0x050505,white:0xffffff,muted:0xb4b4b4,dim:0x696969,
 blue:0x54b9ff,orange:0xff704d,empty:0x202020,grid:0x404040,
 rain:0x339de2,yellow:0xffc344};
const ZERO={ok:false,points:[],summary:null};
const cache=new LocalStorage();
Page(BasePage({
 build(){
  this.disposed=false;this.loading=false;this.screen=0;this.rain=ZERO;
  this.gps=null;this.gpsTimeout=null;this.lastGps=null;
  this.radarWidget=null;this.radarAt=0;this.parts=[[],[],[]];this.bars=[];
  const add=(page,type,opts)=>{
   const w=ui.createWidget(type,opts);
   if(page!==null)this.parts[page].push(w);
   return w;
  };
  const text=(page,x,y,w,h,value,size=22,color=C.white)=>
   add(page,ui.widget.TEXT,{x,y,w,h,text:value,text_size:size,color,
    align_h:ui.align.CENTER_H,text_style:ui.text_style.WRAP});
  const rect=(page,x,y,w,h,color,radius=0)=>
   add(page,ui.widget.FILL_RECT,{x,y,w,h,color,radius});
  const button=(page,x,y,w,h,label,fn)=>add(page,ui.widget.BUTTON,
   {x,y,w,h,radius:15,normal_color:0x1b1b1b,press_color:0x333333,
    text:label,text_size:16,color:C.white,click_func:fn});
  rect(null,0,0,480,480,C.bg);
  this.city=text(null,87,29,306,48,'Buienradar',32);
  this.dots=[0,1,2].map((i)=>rect(null,211+i*27,461,10,10,C.dim,6));
  // 1. Official live Belgian radar image; never use a static screenshot.
  this.radarTime=text(0,95,83,290,25,'ACTUELE RADAR',17,C.muted);
  this.radarMessage=text(0,75,201,330,82,'Radar laden...',25,C.muted);
  this.radarSource=text(0,84,396,312,22,'Beeld: Buienradar.nl',15,C.muted);
  button(0,112,424,110,33,'VERNIEUW',()=>void this.refresh(true));
  button(0,258,424,110,33,'GPS',()=>this.useGps());
  // 2. Large precipitation timeline. Each bar covers five minutes.
  text(1,80,89,320,42,'NEERSLAG',28);
  this.rainState=text(1,76,130,328,46,'Gegevens laden...',22,C.muted);
  rect(1,65,355,348,2,C.grid);
  for(let i=0;i<12;i++)rect(1,74+i*28,218,19,1,C.grid);
  for(let i=0;i<12;i++)rect(1,74+i*28,285,19,1,C.grid);
  for(let i=0;i<24;i++){
   const bar=rect(1,82+i*14,350,9,3,C.empty,3);
   this.bars.push(bar);
  }
  rect(1,77,181,3,176,C.orange);
  text(1,59,361,78,24,'NU',16,C.white);
  text(1,153,361,90,24,'30 min',16,C.muted);
  text(1,263,361,90,24,'60 min',16,C.muted);
  text(1,355,361,70,24,'2 uur',16,C.muted);
  this.rainDetail=text(1,78,399,324,39,'Bron: Buienradar.nl',16,C.muted);
  // 3. Large next-hour figures; current weather is explicitly labelled station.
  text(2,78,97,324,39,'HET VOLGENDE UUR',26,C.muted);
  this.temp=text(2,92,158,296,71,'-- °C',47);
  text(2,115,220,250,26,'GEMETEN TEMPERATUUR',16,C.muted);
  this.amount=text(2,78,251,324,52,'-- mm',35,C.blue);
  text(2,120,303,240,23,'REGEN KOMEND UUR',16,C.muted);
  this.wind=text(2,74,342,332,47,'--  /  --',27);
  this.gusts=text(2,86,389,308,32,'Windstoten: --',19,C.muted);
  this.station=text(2,76,428,328,29,'Weerstation: niet beschikbaar',13,C.muted);
  this.initRadarInbox();
  onGesture({callback:(event)=>{
   if(event===GESTURE_LEFT&&this.screen<2){this.setPage(this.screen+1);return true;}
   if(event===GESTURE_RIGHT&&this.screen>0){this.setPage(this.screen-1);return true;}
   return false;
  }});
  this.setPage(0);
  this.timer=setInterval(()=>{void this.refresh();},5*60*1000);
  void this.refresh();
 },
 initRadarInbox(){
  try{
   this.transfer=new TransferFile();
   const inbox=this.transfer.getInbox();
   inbox.on('NEWFILE',()=>{
    const file=inbox.getNextFile();
    if(!file||!file.params||file.params.kind!=='buienradar-radar')return;
    file.on('change',event=>{
     if(this.disposed||!event||!event.data)return;
     if(event.data.readyState==='transferred'){
      // Zepp converts incoming PNG before transfer. Show only actual live file.
      const source=file.filePath;
      if(!source)return;
      if(this.radarWidget)this.radarWidget.setProperty(ui.prop.SRC,source);
      else {
       this.radarWidget=ui.createWidget(ui.widget.IMG,{
        x:62,y:100,w:356,h:296,src:source,auto_scale:true
       });
       this.parts[0].push(this.radarWidget);
      }
      this.radarMessage.setProperty(ui.prop.VISIBLE,false);
      this.radarAt=Date.now();this.setVisibility();
     }else if(event.data.readyState==='error'){
      this.radarMessage.setProperty(ui.prop.TEXT,'Radarbeeld niet bereikbaar');
     }
    });
   });
  }catch(_){this.radarMessage.setProperty(ui.prop.TEXT,'Radarverbinding ontbreekt');}
 },
 setVisibility(){
  for(let p=0;p<3;p++)for(const item of this.parts[p])
   item.setProperty(ui.prop.VISIBLE,p===this.screen&&
    (item!==this.radarMessage||!this.radarWidget));
  this.dots.forEach((dot,i)=>dot.setProperty(ui.prop.COLOR,
   i===this.screen?C.white:C.dim));
 },
 setPage(next){
  this.screen=Math.max(0,Math.min(2,next));
  this.setVisibility();
  if(this.screen===0&&(!this.radarAt||Date.now()-this.radarAt>5*60*1000))
   void this.requestRadar();
 },
 async phone(msg,timeout=20000){
  if(!this.messaging||typeof this.messaging.request!=='function')
   throw Error('Zepp telefoonverbinding ontbreekt');
  return this.messaging.request(msg,{timeout});
 },
 async requestRadar(){
  if(this.disposed||this.radarPending)return;
  this.radarPending=true;
  try{await this.phone({method:'radar.refresh'},12000);}
  catch(_){this.radarMessage.setProperty(ui.prop.TEXT,'Radarverbinding ontbreekt');}
  finally{this.radarPending=false;}
 },
 draw(){
  const d=this.rain||ZERO;
  if(!d.ok||!d.summary||!Array.isArray(d.points)){
   this.rainState.setProperty(ui.prop.TEXT,'GEEN NEERSLAGDATA');
   this.rainDetail.setProperty(ui.prop.TEXT,'Open Zepp en vernieuw');
   this.temp.setProperty(ui.prop.TEXT,'-- °C');
   this.amount.setProperty(ui.prop.TEXT,'-- mm');
   this.wind.setProperty(ui.prop.TEXT,'--  /  --');
   this.gusts.setProperty(ui.prop.TEXT,'Windstoten: --');
   this.station.setProperty(ui.prop.TEXT,'Weerstation: niet beschikbaar');
   for(const bar of this.bars){bar.setProperty(ui.prop.H,3);
    bar.setProperty(ui.prop.Y,350);bar.setProperty(ui.prop.COLOR,C.empty);}
   return;
  }
  this.city.setProperty(ui.prop.TEXT,d.location&&d.location.name||'Buienradar');
  this.rainState.setProperty(ui.prop.TEXT,d.summary.headline);
  this.rainState.setProperty(ui.prop.COLOR,d.summary.rainingNow?C.orange:C.white);
  this.rainDetail.setProperty(ui.prop.TEXT,d.summary.detail);
  const mm=d.points.slice(0,24).map(p=>Number(p.mmh)||0);
  const maximum=Math.max(1,...mm);
  mm.forEach((n,i)=>{
   const h=n<0.03?3:Math.max(12,Math.round(Math.sqrt(n/maximum)*154));
   this.bars[i].setProperty(ui.prop.H,h);
   this.bars[i].setProperty(ui.prop.Y,353-h);
   this.bars[i].setProperty(ui.prop.COLOR,n<0.03?C.empty:C.rain);
  });
  const v=d.station||{};
  const valid=x=>typeof x==='number'&&Number.isFinite(x);
  this.temp.setProperty(ui.prop.TEXT,valid(v.temperature)?
   Math.round(v.temperature)+' °C':'-- °C');
  this.amount.setProperty(ui.prop.TEXT,valid(d.nextHourMm)?
   d.nextHourMm.toFixed(1)+' mm':'-- mm');
  this.wind.setProperty(ui.prop.TEXT,(v.direction||'--')+'  '+
   (valid(v.windKmh)?Math.round(v.windKmh)+' km/u':'-- km/u'));
  this.gusts.setProperty(ui.prop.TEXT,'Windstoten: '+
   (valid(v.gustKmh)?Math.round(v.gustKmh)+' km/u':'--'));
  this.station.setProperty(ui.prop.TEXT,v.station?
   'Meting: '+v.station+' ('+v.distanceKm+' km)':'Geen weerstation in de buurt');
 },
 storeShortcut(d){
  try{
   const summ=d&&d.summary;
   if(!summ||!d.location)return;
   cache.setItem('buienradar.shortcut',JSON.stringify({
    location:d.location.name,headline:summ.headline,detail:summ.detail,
    at:Date.now()
   }));
  }catch(_){}
 },
 async refresh(forceRadar=false){
  if(this.disposed||this.loading)return;
  this.loading=true;
  try{
   const params=this.lastGps?{gps:this.lastGps}:{};
   const r=await this.phone({method:'rain.forecast',params},25000);
   if(this.disposed)return;
   this.rain=r&&r.ok===true?r:ZERO;
   this.draw();
   if(this.rain.ok)this.storeShortcut(this.rain);
   if(forceRadar||this.screen===0)void this.requestRadar();
  }catch(_){
   if(!this.disposed){this.rain=ZERO;this.draw();}
  }finally{this.loading=false;}
 },
 useGps(){
  if(this.disposed||this.gps)return;
  try{
   const gps=new Geolocation();this.gps=gps;
   this.radarMessage.setProperty(ui.prop.TEXT,'GPS-locatie bepalen...');
   const stop=()=>{
    if(this.gpsTimeout!==null){clearTimeout(this.gpsTimeout);this.gpsTimeout=null;}
    if(this.gps){try{this.gps.offChange(this.gpsCallback);this.gps.stop();}catch(_){}
     this.gps=null;}
   };
   this.gpsCallback=()=>{
    if(this.disposed)return;
    const lat=Number(gps.getLatitude({format:'DD'}));
    const lon=Number(gps.getLongitude({format:'DD'}));
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=49&&lat<=54&&lon>=2&&lon<=8){
     stop();this.lastGps={lat,lon};void this.refresh();
    }
   };
   gps.onChange(this.gpsCallback);gps.start();
   this.gpsTimeout=setTimeout(()=>{
    if(this.gps){stop();this.radarMessage.setProperty(ui.prop.TEXT,'GPS niet gevonden');}
   },25000);
   this.gpsCallback();
  }catch(_){this.gps=null;this.radarMessage.setProperty(ui.prop.TEXT,'GPS niet beschikbaar');}
 },
 onDestroy(){
  this.disposed=true;
  if(this.timer!==undefined)clearInterval(this.timer);
  if(this.gpsTimeout!==null)clearTimeout(this.gpsTimeout);
  if(this.gps){try{this.gps.offChange(this.gpsCallback);this.gps.stop();}catch(_){}}
  offGesture();
 }
}));
