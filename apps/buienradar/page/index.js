import * as ui from '@zos/ui';
import {Geolocation} from '@zos/sensor';
import {BasePage} from '@zeppos/zml/base-page';
const COLOR={bg:0x09131d,card:0x122535,ink:0xf4fbff,muted:0x91abb9,
 blue:0x3dbbfd,blue2:0x1675aa,bar:0x2184ba,empty:0x1b394d,
 green:0x73ddb9,orange:0xffbd75,red:0xff7777};
const INITIAL={ok:false,points:[],location:null,summary:null};
Page(BasePage({
 build(){
  this.disposed=false;this.loading=false;this.rain=INITIAL;
  this.lastGps=null;this.geo=null;this.gpsTimeout=null;
  const create=(type,props)=>ui.createWidget(type,props);
  const label=(x,y,w,h,text,size,color=COLOR.ink)=>
   create(ui.widget.TEXT,{x,y,w,h,text,text_size:size,color,
    align_h:ui.align.CENTER_H,text_style:ui.text_style.WRAP});
  const button=(x,y,w,h,text,click,color=COLOR.card,size=16)=>
   create(ui.widget.BUTTON,{x,y,w,h,text,text_size:size,radius:17,
    color:COLOR.ink,normal_color:color,press_color:0x185479,click_func:click});
  create(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:COLOR.bg});
  create(ui.widget.FILL_RECT,{x:60,y:108,w:360,h:132,color:COLOR.card,radius:23});
  label(72,44,336,33,'B U I E N R A D A R',25,COLOR.blue);
  this.locationLabel=label(95,83,290,25,'Locatie laden...',16,COLOR.muted);
  this.headline=label(74,122,332,47,'REGENVERWACHTING',28);
  this.detail=label(76,178,328,43,'De komende 2 uur',16,COLOR.muted);
  label(74,252,330,25,'NEERSLAG  /  VOLGENDE 2 UUR',15,COLOR.muted);
  create(ui.widget.FILL_RECT,{x:70,y:345,w:340,h:1,color:COLOR.empty});
  this.bars=[];
  // Exactly 24 five-minute bars on the watch (2h).
  for(let i=0;i<24;i++){
   const x=75+i*14;
   const bar=create(ui.widget.FILL_RECT,
    {x,y:337,w:9,h:3,radius:3,color:COLOR.empty});
   this.bars.push(bar);
  }
  label(74,352,76,22,'NU',13,COLOR.muted);
  label(168,352,70,22,'30m',13,COLOR.muted);
  label(256,352,70,22,'60m',13,COLOR.muted);
  label(347,352,70,22,'120m',13,COLOR.muted);
  this.foot=label(75,376,330,25,'Bron: Buienradar.nl',13,COLOR.muted);
  this.syncButton=button(86,415,142,45,'VERNIEUW',
   ()=>void this.refresh(),COLOR.blue2);
  this.gpsButton=button(250,415,142,45,'GPS LOCATIE',
   ()=>this.useGps(),COLOR.card,15);
  // Forecast changes every five minutes; refresh only while app is visible.
  this.refreshTimer=setInterval(()=>{void this.refresh();},5*60*1000);
  void this.refresh();
 },
 async request(msg,timeout=18000){
  if(!this.messaging||typeof this.messaging.request!=='function')
   throw Error('Zepp telefoonverbinding ontbreekt');
  return this.messaging.request(msg,{timeout});
 },
 status(message){if(!this.disposed)this.foot.setProperty(ui.prop.TEXT,message);},
 clearGraph(){
  for(const bar of this.bars){
   bar.setProperty(ui.prop.Y,337);
   bar.setProperty(ui.prop.H,3);
   bar.setProperty(ui.prop.COLOR,COLOR.empty);
  }
 },
 render(){
  const data=this.rain||INITIAL;
  if(!data.ok||!Array.isArray(data.points)||!data.summary){
   this.locationLabel.setProperty(ui.prop.TEXT,'Locatie niet beschikbaar');
   this.headline.setProperty(ui.prop.TEXT,'GEEN DATA');
   this.headline.setProperty(ui.prop.COLOR,COLOR.muted);
   this.detail.setProperty(ui.prop.TEXT,'Verbind je telefoon en vernieuw');
   this.clearGraph();
   return;
  }
  this.locationLabel.setProperty(ui.prop.TEXT,data.location.name);
  const summary=data.summary;
  this.headline.setProperty(ui.prop.TEXT,summary.headline);
  this.headline.setProperty(ui.prop.COLOR,summary.rainingNow?COLOR.orange:
   summary.etaMinutes!==null?COLOR.blue:COLOR.green);
  this.detail.setProperty(ui.prop.TEXT,summary.detail);
  const values=data.points.slice(0,24).map(p=>p.mmh);
  const max=Math.max(1,...values);
  for(let i=0;i<24;i++){
   const amount=Number.isFinite(values[i])?values[i]:0;
   const height=amount<0.03?3:Math.max(8,Math.min(72,Math.round(
    72*Math.sqrt(amount/max))));
   const bar=this.bars[i];
   bar.setProperty(ui.prop.Y,339-height);
   bar.setProperty(ui.prop.H,height);
   bar.setProperty(ui.prop.COLOR,amount<0.03?COLOR.empty:
    amount>=2?COLOR.blue:COLOR.bar);
  }
  const stamp=data.points[0]&&data.points[0].time||'--:--';
  this.status('Vanaf '+stamp+'  ·  Bron: Buienradar.nl');
 },
 async refresh(location){
  if(this.disposed||this.loading)return;
  this.loading=true;this.status('Neerslag laden...');
  try{
   const params=location?{gps:location}:this.lastGps?{gps:this.lastGps}:{};
   const result=await this.request({method:'rain.forecast',params},22000);
   if(this.disposed)return;
   if(!result||result.ok!==true||!result.summary){
    this.rain=INITIAL;this.render();
    this.status(result&&result.error||'Probeer later opnieuw');return;
   }
   this.rain=result;this.render();
  }catch(_){
   if(!this.disposed){this.rain=INITIAL;this.render();
    this.status('Geen verbinding met Zepp / Buienradar');}
  }finally{this.loading=false;}
 },
 useGps(){
  if(this.disposed||this.geo)return;
  try{
   const gps=new Geolocation();this.geo=gps;
   this.status('GPS-locatie bepalen...');
   const stop=()=>{
    if(this.gpsTimeout!==null){clearTimeout(this.gpsTimeout);this.gpsTimeout=null;}
    if(this.geo){this.geo.offChange(this.gpsCallback);this.geo.stop();this.geo=null;}
   };
   this.gpsCallback=()=>{
    if(this.disposed)return;
    const lat=Number(gps.getLatitude({format:'DD'}));
    const lon=Number(gps.getLongitude({format:'DD'}));
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=49&&lat<=54&&lon>=2&&lon<=8){
     stop();this.lastGps={lat,lon};void this.refresh(this.lastGps);
    }
   };
   gps.onChange(this.gpsCallback);
   gps.start();
   this.gpsTimeout=setTimeout(()=>{
    if(this.geo){stop();this.status('GPS niet gevonden. Kies een stad in Zepp.');}
   },25000);
   this.gpsCallback();
  }catch(_){
   try{if(this.geo)this.geo.stop();}catch(_){}
   this.geo=null;this.status('GPS niet beschikbaar; kies een stad in Zepp');
  }
 },
 onDestroy(){
  this.disposed=true;
  if(this.refreshTimer!==undefined)clearInterval(this.refreshTimer);
  if(this.gpsTimeout!==null)clearTimeout(this.gpsTimeout);
  if(this.geo){try{this.geo.offChange(this.gpsCallback);this.geo.stop();}catch(_){}this.geo=null;}
 }
}));
