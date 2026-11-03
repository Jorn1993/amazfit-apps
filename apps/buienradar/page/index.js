import * as ui from '@zos/ui';
import {setScrollMode,getSwiperIndex,SCROLL_MODE_SWIPER_HORIZONTAL} from '@zos/page';
import TransferFile from '@zos/ble/TransferFile';
import {LocalStorage} from '@zos/storage';
import {push} from '@zos/router';
import {onDigitalCrown,offDigitalCrown,KEY_HOME} from '@zos/interaction';
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
  this.radarFrames=[];this.radarTimes=[];this.radarFetchedAt=0;
  this.radarSyncing=false;this.radarError=null;this.radarEpoch=0;
  this.frameIndex=0;this.pendingFrame=null;
  this.pageViews=[];this.parts=[[],[],[]];
  this.bars=[];this.indicators=[];this.cityLabels=[];this.lastCrown=0;
  this.zoom=1;this.location={name:'Antwerpen',lat:51.2194,lon:4.4025};
  this.lastAlertKey=null;
  try{
   const old=JSON.parse(storage.getItem('buienradar.future-radar.v1')||'null');
   if(old&&old.source==='KMI'&&Date.now()-old.fetchedAt>=0&&
      Date.now()-old.fetchedAt<12*60000&&Array.isArray(old.frames)){
    const current=old.frames.filter(f=>f&&f.path&&f.validAt>Date.now()&&
     typeof f.path==='string'&&f.path.startsWith('data://'));
    if(current.length){
     this.radarFrames=current;this.radarTimes=current.map(f=>f.validAt);
     this.radarFetchedAt=old.fetchedAt;
    }
   }
  }catch(_){}
  // The documented horizontal swiper takes width and count only.
  // The active (1-based) page is read from getSwiperIndex().
  setScrollMode({mode:SCROLL_MODE_SWIPER_HORIZONTAL,
   options:{width:SIZE,count:3}});
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
  // One consistent, circle-safe layout system. No floating gear or map
  // controls. Tap the city on ANY screen for settings.
  const cityButton=(page)=>{
   const button=create(page,ui.widget.BUTTON,{
    x:151,y:26,w:178,h:50,text:'Antwerpen',text_size:24,
    color:C.white,normal_color:page===0?0x071a28:0x112737,
    press_color:0x244c64,radius:24,
    click_func:()=>push({url:'page/settings'})
   });
   this.cityLabels.push(button);return button;
  };
  // KMI official 3h future PNG overlays, over a matching bundled Belgian
  // map. No bundled historical rain images are ever shown.
  this.radarBase=create(0,ui.widget.IMG,{
   x:0,y:54,w:SIZE,h:368,src:'kmi-be-map.png',auto_scale:true
  });
  this.radarWidget=create(0,ui.widget.IMG,{
   x:0,y:54,w:SIZE,h:368,src:'kmi-clear.png',auto_scale:true
  });
  this.city=cityButton(0);
  this.radarTime=txt(0,174,402,132,36,'KMI +3u',23,C.white);
  this.radarLabel=create(0,ui.widget.BUTTON,{
   x:123,y:91,w:234,h:49,text:'VOORSPELLING LADEN',
   text_size:17,color:C.white,normal_color:0x102839,
   press_color:0x246586,radius:22,
   click_func:()=>void this.requestRadar(true)
  });
  this.applyRadarFrame();
  this.updateRadarLabel();

  // RAIN — large status, simple horizon selector, uncluttered chart.
  cityButton(1);
  this.horizon=2;
  this.rainState=txt(1,49,112,382,61,'LADEN…',36,C.white);
  this.rainDetail=txt(1,73,180,334,39,'',23,C.muted);
  this.horizonOne=create(1,ui.widget.BUTTON,{x:113,y:232,w:122,h:50,
   text:'1 uur',text_size:23,color:C.white,normal_color:0x132a3a,
   press_color:0x275a78,radius:24,click_func:()=>this.setHorizon(1)});
  this.horizonTwo=create(1,ui.widget.BUTTON,{x:245,y:232,w:122,h:50,
   text:'2 uur',text_size:23,color:C.white,normal_color:0x266c91,
   press_color:0x275a78,radius:24,click_func:()=>this.setHorizon(2)});
  rect(1,83,377,314,2,C.line);
  for(let i=0;i<24;i++)this.bars.push(
   rect(1,87+i*13,374,9,3,C.empty,3));
  this.graphTicks=[
   txt(1,86,393,58,29,'Nu',19,C.white),
   txt(1,160,393,74,29,'30m',19,C.muted),
   txt(1,250,393,74,29,'60m',19,C.muted),
   txt(1,339,393,57,29,'2u',19,C.muted)
  ];

  // WEATHER — open hero, two lightweight glance cards, no extra gear.
  cityButton(2);
  this.weatherIcon=create(2,ui.widget.IMG,{
   x:102,y:141,w:113,h:113,src:'weather-cloud.png',auto_scale:true
  });
  this.temp=txt(2,213,137,166,104,'--°',76,C.white);
  txt(2,214,235,165,28,'NU',20,C.muted);
  rect(2,85,286,148,109,0x112839,25);
  rect(2,247,286,148,109,0x112839,25);
  create(2,ui.widget.IMG,{x:137,y:299,w:41,h:41,
   src:'weather-drop.png',auto_scale:true});
  this.amount=txt(2,93,338,133,47,'-- mm',30,C.blue);
  this.rainPeriod=txt(2,106,373,107,21,'1 UUR',18,C.muted);
  create(2,ui.widget.IMG,{x:301,y:299,w:39,h:39,
   src:'weather-wind.png',auto_scale:true});
  this.wind=txt(2,251,338,141,46,'--',29,C.white);
  this.gusts=txt(2,259,374,126,23,'',18,C.muted);
  this.station=txt(2,177,418,128,18,'',13,C.muted);

  // Subtle page dots, same position across all pages.
  for(let i=0;i<3;i++){
   const dots=[];
   for(let j=0;j<3;j++)dots.push(rect(
    i,216+j*24,456,8,8,i===j?C.white:0x4d6676,4));
   this.indicators.push(dots);
  }
  // Watch crown is the radar zoom control, rather than small on-map buttons.
  try{onDigitalCrown({callback:(key,degree)=>{
   if(key!==KEY_HOME||this.screen!==0||this.disposed)return;
   const now=Date.now();
   if(now-this.lastCrown<180)return;
   this.lastCrown=now;
   this.changeZoom(degree<0?1:-1);
  }});}catch(_){}
  this.initRadarInbox();
  this.configTick=0;
  this.lastConfigSignature=String(storage.getItem('buienradar.location')||'')+'|'+
   String(storage.getItem('buienradar.alert')||'');
  this.frameTimer=setInterval(()=>{
   // Zepp's documented getSwiperIndex is 1-based. modeParams callbacks
   // alone are not a supported reliable way to track the active page.
   try{
    const current=getSwiperIndex();
    if(Number.isInteger(current)&&current>=1&&current<=3)
     this.screen=current-1;
   }catch(_){}
   if(this.screen===0){
    this.updateRadarLabel();
    this.nextRadarFrame();
   }
   if(++this.configTick%12===0)this.checkConfig();
  },950);
  this.weatherTimer=setInterval(()=>{void this.refresh();},300000);
  this.radarTimer=setInterval(()=>{void this.requestRadar();},300000);
  void this.requestRadar();
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
    if(!file?.params||file.params.kind!=='future-radar-frame'||
       file.params.source!=='KMI')return;
    const idx=Number(file.params.frameIndex);
    const validAt=Number(file.params.validAt);
    if(!Number.isInteger(idx)||idx<0||idx>=12||
      !Number.isFinite(validAt)||validAt<=Date.now())return;
    const id=String(file.sessionId||file.fileName||file.filePath||idx)+'/'+idx;
    let record=handled[id];
    if(!record){record={file,done:false};handled[id]=record;}
    else if(file.filePath)record.file=file;
    const process=()=>{
     const item=record.file;
     if(record.done||!item.filePath||item.readyState!=='transferred')return;
     // Accept only frames belonging to the current verified time sequence.
     if(this.radarTimes[idx]!==validAt)return;
     const frame={path:item.filePath,validAt,
      time:file.params.validTime};
     this.radarFrames[idx]=frame;
     record.done=true;
     this.saveRadarCache();
     this.applyRadarFrame();
     this.updateRadarLabel();
     if(this.pendingFrame&&this.pendingFrame.index===idx){
      this.pendingFrame.resolve();this.pendingFrame=null;
     }
    };
    record.process=process;
    process();
    if(typeof file.on==='function')file.on('change',process);
   };
   const sweep=()=>{
    for(const record of Object.values(handled))
     if(!record.done&&record.file.readyState==='transferred')
      record.process?.();
   };
   inbox.on('NEWFILE',()=>{handle();sweep();});
   inbox.on('FILE',()=>{handle();sweep();});
  }catch(e){this.radarError='ONTVANGST: '+String(e.message||e);}
 },
 isRadarFresh(){
  return this.radarFetchedAt>0&&
   Date.now()-this.radarFetchedAt>=0&&
   Date.now()-this.radarFetchedAt<12*60000&&
   this.radarFrames.some(f=>f&&f.validAt>Date.now());
 },
 updateRadarLabel(){
  if(!this.radarLabel)return;
  const good=this.isRadarFresh();
  let caption='';
  if(!good){
   if(this.radarSyncing)caption='VOORSPELLING LADEN';
   else if(this.radarError)caption='OPHALEN MISLUKT · TIK';
   else caption='VOORSPELLING OPHALEN';
  }
  this.radarLabel.setProperty(ui.prop.TEXT,caption);
  this.radarLabel.setProperty(ui.prop.VISIBLE,!good);
 },
 saveRadarCache(){
  try{
   if(!this.radarFetchedAt)return;
   storage.setItem('buienradar.future-radar.v1',JSON.stringify({
    source:'KMI',fetchedAt:this.radarFetchedAt,
    frames:this.radarFrames.filter(f=>f&&f.path&&f.validAt>Date.now())
   }));
  }catch(_){}
 },
 nextRadarFrame(){
  if(!this.isRadarFresh())return;
  const frames=this.radarFrames.filter(f=>f&&f.validAt>Date.now());
  if(frames.length<2)return;
  this.frameIndex=(this.frameIndex+1)%frames.length;
  this.applyRadarFrame();
 },
 async phone(message,timeout=20000){
  if(!this.messaging?.request)throw Error('Geen Zepp telefoonverbinding');
  return this.messaging.request(message,{timeout});
 },
 async downloadFutureFrame(index){
  const t=this.radarTimes[index];
  if(!Number.isFinite(t)||t<=Date.now())return;
  // Set up the waiter BEFORE requesting transfer, preventing a BLE race.
  let resolvePending,rejectPending;
  const waiter=new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{
    if(this.pendingFrame?.index===index)this.pendingFrame=null;
    reject(Error('OVERDRACHT: radarframe ontbreekt'));
   },36000);
   resolvePending=()=>{clearTimeout(timeout);resolve();};
   rejectPending=e=>{clearTimeout(timeout);reject(e);};
  });
  this.pendingFrame={index,resolve:resolvePending,reject:rejectPending};
  const result=await this.phone({method:'radar.frame',params:{index}},11000);
  if(!result?.ok){
   this.pendingFrame=null;
   // Avoid unhandled rejection if the service declines before the waiter is used.
   resolvePending();
   throw Error(result?.error||'TRANSFER: radarframe niet gestart');
  }
  await waiter;
 },
 async requestRadar(force=false){
  if(this.disposed||this.radarSyncing)return;
  // A valid cached future frame is immediately usable: never clear it
  // on startup while fetching a replacement in the background.
  if(!force&&this.isRadarFresh()&&this.radarFrames.some(Boolean))return;
  this.radarSyncing=true;this.radarError=null;this.updateRadarLabel();
  try{
   const answer=await this.phone({method:'radar.forecast'},17000);
   if(!answer?.ok||!Array.isArray(answer.frames)||!answer.frames.length)
    throw Error(answer?.error||'Geen toekomstige radar beschikbaar');
   const times=answer.frames.map(f=>Number(f.validAt));
   if(times.some(t=>!Number.isFinite(t))||times[0]<=Date.now())
    throw Error('Geen geldige toekomstige radartijden');
   this.radarTimes=times;
   this.radarFetchedAt=Number(answer.fetchedAt);
   this.radarFrames=new Array(times.length).fill(null);
   this.frameIndex=0;
   this.applyRadarFrame(); // blank but never display old pixels
   for(let i=0;i<times.length&&!this.disposed;i++){
    if(times[i]<=Date.now())continue;
    try{await this.downloadFutureFrame(i);}
    catch(e){
     if(this.radarFrames.filter(Boolean).length===0)throw e;
     break; // Partial valid future animation is better than stale data.
    }
   }
  }catch(e){
   this.radarError=String(e.message||e);
  }finally{
   this.radarSyncing=false;this.updateRadarLabel();
  }
 },
 draw(){
  if(this.disposed)return;
  const d=this.rain||EMPTY;
  if(!forecastFresh(d)){
   this.scheduleRainAlert(EMPTY);
   // Keep last snapshot for offline widget; it is marked stale there.
   // A location change explicitly clears that old city's snapshot. 
   this.rainState.setProperty(ui.prop.TEXT,'GEEN RECENTE DATA');
   this.rainDetail.setProperty(ui.prop.TEXT,'Telefoon of gegevens niet beschikbaar');
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
  this.updateCityLabels(received.name||'Antwerpen');
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
    this.updateCityLabels(loc.name);}
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
   this.updateCityLabels(this.location.name||'Antwerpen');
  }
 },
 updateCityLabels(name){
  const display=String(name||'Antwerpen').slice(0,20);
  for(const label of this.cityLabels)label.setProperty(ui.prop.TEXT,display);
 },
 changeZoom(direction){
  const steps=[1,1.25,1.5,1.85];
  const current=steps.indexOf(this.zoom||1);
  this.zoom=steps[Math.max(0,Math.min(steps.length-1,current+direction))];
  this.applyRadarFrame();
 },
 applyRadarFrame(){
  if(!this.radarBase||!this.radarWidget)return;
  const factor=this.zoom||1;
  const w=Math.round(480*factor),h=Math.round(368*factor);
  const geometry={x:Math.round((480-w)/2),y:Math.round(54+(368-h)/2),
   w,h,auto_scale:true};
  this.radarBase.setProperty(ui.prop.MORE,geometry);
  const available=this.radarFrames.filter(f=>f&&f.validAt>Date.now());
  const fresh=this.isRadarFresh()&&available.length>0;
  const frame=fresh?available[this.frameIndex%available.length]:null;
  this.radarWidget.setProperty(ui.prop.MORE,{
   ...geometry,src:frame?.path||'kmi-clear.png'
  });
  if(this.radarTime){
   const clock=frame?(() => {
    const t=new Date(frame.validAt);
    return String(t.getHours()).padStart(2,'0')+':'+
      String(t.getMinutes()).padStart(2,'0');
   })():'KMI +3u';
   this.radarTime.setProperty(ui.prop.TEXT,clock);
  }
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
  const labels=this.horizon===1?['Nu','15m','30m','60m']:
   ['Nu','30m','60m','2u'];
  this.graphTicks.forEach((tick,i)=>tick.setProperty(ui.prop.TEXT,labels[i]));
  this.horizonOne.setProperty(ui.prop.MORE,{x:113,y:232,w:122,h:50,
   normal_color:this.horizon===1?0x266c91:0x132a3a});
  this.horizonTwo.setProperty(ui.prop.MORE,{x:245,y:232,w:122,h:50,
   normal_color:this.horizon===2?0x266c91:0x132a3a});
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
   const n=nums[i],height=n<0.03?3:Math.max(12,Math.round(Math.sqrt(n/mx)*75));
   const x=87+i*(this.horizon===1?26:13);
   b.setProperty(ui.prop.MORE,{x,y:377-height,w:this.horizon===1?16:9,
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
   storage.setItem('buienradar.alert-key','');
   this.lastAlertKey=null;
   return;
  }
  // Raintext is 5-minute nowcast only; no claim of long-range live monitoring.
  const onset=d.points.findIndex(p=>valid(p.mmh)&&p.mmh>=0.03);
  if(onset<=0){
   if(prior>0){try{cancelAlarm(prior);}catch(_){}}
   storage.setItem('buienradar.alert-alarm-id','0');
   storage.setItem('buienradar.alert-key','');
   this.lastAlertKey=null;return;
  }
  const lead=[5,15,30].includes(prefs.lead)?prefs.lead:15;
  // Anchor the predicted onset to the source forecast, not each rendering
  // time: otherwise every refresh shifts the same rain event forward.
  const onsetAt=d.updatedAt+onset*5*60000;
  const key=String(Math.round(onsetAt/(5*60000)))+'-'+
   (d.location&&d.location.name)+'-'+lead;
  if(prior>0&&storage.getItem('buienradar.alert-key')===key)return;
  if(prior>0){try{cancelAlarm(prior);}catch(_){}}
  storage.setItem('buienradar.alert-alarm-id','0');
  storage.setItem('buienradar.alert-key','');
  const untilAlert=onsetAt-Date.now()-lead*60000;
  // Never turn a missed alert into a new immediate alert.
  // This matters when a stale forecast arrives after its alert time.
  if(untilAlert<=0||untilAlert>2*3600000)return;
  const sec=Math.max(3,Math.ceil(untilAlert/1000));
  const id=setAlarm({url:'app-service/rain-alert',delay:sec,store:true,
   param:JSON.stringify({place:d.location&&d.location.name||'Buienradar',
    onsetAt,lead,plannedAt:Date.now()})});
  if(id>0){
   this.lastAlertKey=key;
   storage.setItem('buienradar.alert-key',key);
   storage.setItem('buienradar.alert-alarm-id',String(id));
  }
 },
 onDestroy(){
  this.disposed=true;
  try{offDigitalCrown();}catch(_){}
  if(this.frameTimer!==undefined)clearInterval(this.frameTimer);
  if(this.weatherTimer!==undefined)clearInterval(this.weatherTimer);
  if(this.radarTimer!==undefined)clearInterval(this.radarTimer);
  if(this.pendingFrame)this.pendingFrame.reject(Error('App gesloten'));
  this.pendingFrame=null;
 }
}));
