import * as ui from '@zos/ui';
import {setScrollMode,getSwiperIndex,SCROLL_MODE_SWIPER_HORIZONTAL} from '@zos/page';
import {LocalStorage} from '@zos/storage';
import {push} from '@zos/router';
import {onDigitalCrown,offDigitalCrown,KEY_HOME} from '@zos/interaction';
import {set as setAlarm, cancel as cancelAlarm} from '@zos/alarm';
import {BasePage} from '@zeppos/zml/base-page';
import {readFileSync} from '@zos/fs';
import {BuienradarGif} from './gif-decoder.js';
import {sampleRadar,radarDeltaRects,toCanvasRect} from './radar-canvas.js';

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
  this.rainError=null;
  this.radarSyncing=false;this.radarError=null;this.radarEpoch=0;
  this.radarDisplayed=false;this.radarRequestAt=0;this.statusTicks=0;
  this.radarStage='idle';this.currentFrame=null;this.currentFetchedAt=0;
  this.radarGifAt=0;this.radarCanvasFrames=[];this.radarWrapRects=[];
  this.radarAnimationEpoch=0;this.radarPaintEpoch=0;
  this.radarPainting=false;this.radarCanvasVisible=false;
  this.radarFrameIndex=0;this.radarDecodeError=null;
  this.pageViews=[];this.parts=[[],[],[]];
  this.bars=[];this.indicators=[];this.cityLabels=[];this.lastCrown=0;
  this.zoom=1;this.location={name:'Antwerpen',lat:51.2194,lon:4.4025};
  this.lastAlertKey=null;
  // Only the cache produced by the hardware-proven official Zepp converter.
  // Legacy GIF/native-TGA cache keys are deliberately never read.
  try{
   const old=JSON.parse(storage.getItem('buienradar.current.v2')||'null');
   const age=Date.now()-Number(old?.fetchedAt);
   if(old?.source==='Buienradar'&&old.path?.startsWith('data://')&&
      age>=0&&age<8*60000){
    this.currentFrame={path:old.path};
    this.currentFetchedAt=old.fetchedAt;
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
  // Full-bleed radar behind the compact, circle-safe controls. The screenshot
  // must never show an inset 320 x 320 square on a 480 x 480 watch.
  this.radarBase=rect(0,0,0,SIZE,SIZE,0x102532);
  this.radarWidget=create(0,ui.widget.IMG,{
   x:0,y:0,w:SIZE,h:SIZE,src:'weather-cloud.png',auto_scale:true
  });
  this.radarWidget.setProperty(ui.prop.VISIBLE,false);
  // Source GIF is decoded to genuine RGB on the watch. The official Zepp
  // CANVAS API draws those pixels; unlike the previous guessed TGA header,
  // this requires NO proprietary format conversion.
  this.radarCanvas=create(0,ui.widget.CANVAS,{x:0,y:0,w:SIZE,h:SIZE});
  this.radarCanvas.setProperty(ui.prop.VISIBLE,false);
  this.city=cityButton(0);
  rect(0,122,396,236,39,0x071a28,19);
  this.radarTime=txt(0,133,402,214,29,'BUIENRADAR · +3U',19,C.white);
  this.radarLabel=create(0,ui.widget.BUTTON,{
   x:110,y:210,w:260,h:48,text:'BUIENRADAR OPHALEN',
   text_size:17,color:C.white,normal_color:0x102839,
   press_color:0x246586,radius:22,
   click_func:()=>void this.requestRadar(true)
  });
  this.radarErrorText=txt(0,93,334,294,30,'',15,C.orange);

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
  // ZML already owns the device BLE Inbox. onReceivedFile is registered
  // by its BasePage plugin; a second raw TransferFile inbox steals files.
  this.incomingRadarFiles={};
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
   if(this.radarSyncing&&++this.statusTicks%4===0)
    void this.pollRadarStatus();
   if(++this.configTick%12===0)this.checkConfig();
  },950);
  this.weatherTimer=setInterval(()=>{void this.refresh();},300000);
  // Refresh a genuine current image every 5m; never display after 8m.
  this.radarTimer=setInterval(()=>{void this.requestRadar();},60000);
  // Restore only a very recent genuine GIF. Never resurrect old native-TGA
  // caches, which produced colour noise in previous releases.
  try{
   const previous=JSON.parse(storage.getItem('buienradar.gif.v1')||'null');
   const age=Date.now()-previous?.fetchedAt;
   if(previous?.source==='Buienradar'&&
      typeof previous.path==='string'&&previous.path.startsWith('data://')&&
      age>=0&&age<8*60000){
    this.prepareFutureRadar(previous.path,previous.fetchedAt);
   }
  }catch(_){}
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
 onReceivedFile(file){
  // The Zepp BasePage ZML callback receives files converted using the
  // official phone-side convertLib. No second TransferFile inbox.
  if(this.disposed||file?.params?.source!=='Buienradar')return;
  if(file.params.kind==='buienradar-forecast-gif'){
   this.receiveFutureRadar(file);return;
  }
  if(file.params.kind!=='buienradar-current-frame')return;
  const fetchedAt=Number(file.params.fetchedAt),now=Date.now();
  if(!Number.isFinite(fetchedAt)||fetchedAt>now+60000||
     now-fetchedAt>8*60000)return;
  const id=String(file.sessionId??file.fileName??file.filePath??fetchedAt);
  if(this.incomingRadarFiles[id])return;
  this.incomingRadarFiles[id]=true;
  const finish=state=>{
   if(this.disposed||!this.incomingRadarFiles[id])return;
   const status=state||file.readyState;
   if(status==='error'||status==='canceled'){
    delete this.incomingRadarFiles[id];
    this.radarError='BLUETOOTH: bestand niet ontvangen';
    this.radarSyncing=false;this.updateRadarLabel();return;
   }
   if(status!=='transferred')return;
   delete this.incomingRadarFiles[id];
   if(!file.filePath){
    this.radarError='BLUETOOTH: bestandspad ontbreekt';
    this.radarSyncing=false;this.updateRadarLabel();return;
   }
   // Ignore stale out-of-order transfers from an earlier refresh.
   if(fetchedAt<this.currentFetchedAt)return;
   this.currentFrame={path:file.filePath};
   this.currentFetchedAt=fetchedAt;
   this.radarStage='current-ready';
   this.radarError=null;
   try{storage.setItem('buienradar.current.v2',JSON.stringify({
    source:'Buienradar',path:file.filePath,fetchedAt
   }));}catch(_){}
   this.applyRadarFrame();
  };
  if(typeof file.on==='function')file.on('change',e=>
   finish(e?.data?.readyState||file.readyState));
  finish(file.readyState);
 },
 receiveFutureRadar(file){
  const fetchedAt=Number(file.params.fetchedAt),now=Date.now();
  if(!Number.isFinite(fetchedAt)||fetchedAt>now+60000||
     now-fetchedAt>=8*60000)return;
  const id='gif:'+String(file.sessionId??file.fileName??file.filePath??fetchedAt);
  if(this.incomingRadarFiles[id])return;
  this.incomingRadarFiles[id]=true;
  const complete=stage=>{
   if(this.disposed||!this.incomingRadarFiles[id])return;
   const status=stage||file.readyState;
   if(status==='error'||status==='canceled'){
    delete this.incomingRadarFiles[id];
    this.radarDecodeError='ANIMATIE: overdracht mislukt';
    this.updateRadarLabel();return;
   }
   if(status!=='transferred')return;
   delete this.incomingRadarFiles[id];
   if(!file.filePath){
    this.radarDecodeError='ANIMATIE: bestandspad ontbreekt';
    this.updateRadarLabel();return;
   }
   try{storage.setItem('buienradar.gif.v1',JSON.stringify({
    source:'Buienradar',path:file.filePath,fetchedAt
   }));}catch(_){}
   this.prepareFutureRadar(file.filePath,fetchedAt);
  };
  if(typeof file.on==='function')file.on('change',e=>
   complete(e?.data?.readyState||file.readyState));
  complete(file.readyState);
 },
 prepareFutureRadar(path,fetchedAt){
  if(this.disposed||!Number.isFinite(fetchedAt)||
     Date.now()-fetchedAt>=8*60000||fetchedAt<this.radarGifAt)return;
  const epoch=++this.radarAnimationEpoch;
  this.radarPaintEpoch++;
  let reader;
  try{
   const bytes=readFileSync({path});
   reader=new BuienradarGif(bytes);
   if(reader.width!==320||reader.height!==320)
    throw Error('radarformaat onverwacht');
  }catch(e){
   this.radarDecodeError='ANIMATIE: '+String(e?.message||e).slice(0,60);
   this.updateRadarLabel();return;
  }
  const frames=[];let index=0,previousPixels=null;
  const decodeNext=()=>{
   if(this.disposed||epoch!==this.radarAnimationEpoch)return;
   try{
    const frame=reader.nextFrame();
    if(!frame){
     if(frames.length<2)throw Error('te weinig toekomstige beelden');
     const first=frames[0],last=frames[frames.length-1];
     const wrap=radarDeltaRects(first.pixels,last.pixels,
      first.width,first.height);
     this.radarCanvasFrames=frames;
     this.radarWrapRects=wrap;
     this.radarGifAt=fetchedAt;
     this.radarFrameIndex=0;
     this.radarDecodeError=null;
     this.radarCanvasVisible=false;
     this.radarCanvas.setProperty(ui.prop.VISIBLE,false);
     this.applyRadarFrame();
     void this.paintRadarRects(first.rects,true,0);
     return;
    }
    // The real Buienradar GIF returns up to 17 images. Every second one
    // is selected so the BLE/watch animation keeps a modest CPU footprint.
    if(index%2===0){
     const sampled=sampleRadar(frame.rgb,frame.width,frame.height,3);
     const rects=radarDeltaRects(sampled.pixels,previousPixels,
      sampled.width,sampled.height);
     frames.push({...sampled,rects});
     previousPixels=sampled.pixels;
    }
    index++;
    if(index>24)throw Error('te veel beelden');
    setTimeout(decodeNext,15);
   }catch(e){
    this.radarDecodeError='ANIMATIE: '+String(e?.message||e).slice(0,60);
    this.updateRadarLabel();
   }
  };
  setTimeout(decodeNext,15);
 },
 hasForecastRadar(now=Date.now()){
  return !!(this.radarCanvasVisible&&this.radarCanvasFrames.length>=2&&
   now>=this.radarGifAt&&now-this.radarGifAt<8*60000);
 },
 async paintRadarRects(rects,initial=false,nextIndex=0){
  if(this.disposed||!this.radarCanvas)return false;
  const paint=++this.radarPaintEpoch;
  this.radarPainting=true;
  if(initial){
   try{this.radarCanvas.clear({x:0,y:0,w:SIZE,h:SIZE});}
   catch(e){this.radarPainting=false;this.radarDecodeError='CANVAS: clear';return false;}
  }
  const frame=this.radarCanvasFrames[nextIndex];
  if(!frame)return false;
  const zoom=this.zoom||1;
  let offset=0;
  return new Promise(resolve=>{
   const batch=()=>{
    if(this.disposed||paint!==this.radarPaintEpoch){
     this.radarPainting=false;resolve(false);return;
    }
    try{
     const end=Math.min(offset+220,rects.length);
     for(let i=offset;i<end;i++){
      const args=toCanvasRect(rects[i],frame.width,frame.height,SIZE,zoom);
      if(args)this.radarCanvas.drawRect(args);
     }
     offset=end;
     if(offset<rects.length){setTimeout(batch,15);return;}
     this.radarPainting=false;this.radarCanvasVisible=true;
     this.radarSyncing=false;this.radarError=null;
     this.radarFrameIndex=nextIndex;
     this.radarCanvas.setProperty(ui.prop.VISIBLE,true);
     this.radarWidget.setProperty(ui.prop.VISIBLE,false);
     this.updateRadarLabel();
     resolve(true);
    }catch(e){
     this.radarPainting=false;this.radarCanvasVisible=false;
     this.radarDecodeError='CANVAS: '+String(e?.message||e).slice(0,55);
     this.radarCanvas.setProperty(ui.prop.VISIBLE,false);
     this.applyRadarFrame();
     resolve(false);
    }
   };
   batch();
  });
 },
 hasCurrentRadar(now=Date.now()){
  return !!(this.currentFrame?.path&&Number.isFinite(this.currentFetchedAt)&&
   now>=this.currentFetchedAt&&now-this.currentFetchedAt<8*60000);
 },
 updateRadarLabel(){
  if(!this.radarLabel)return;
  const current=this.hasCurrentRadar(),forecast=this.hasForecastRadar();
  const stages={
   idle:'BUIENRADAR',starting:'VERBINDEN',download:'KAART DOWNLOADEN',
   convert:'KAART OMZETTEN',transfer:'KAART OVERBRENGEN',
   'gif-download':'VOORSPELLING OPHALEN',
   'gif-transfer':'VOORSPELLING OVERBRENGEN',
   transferred:'BEELD ONTVANGEN',received:'ACTUEEL'
  };
  const label=this.radarError?'OPNIEUW PROBEREN':
   this.radarSyncing?(stages[this.radarStage]||'BUIENRADAR LADEN'):
   'BUIENRADAR OPHALEN';
  this.radarLabel.setProperty(ui.prop.MORE,{
   x:current?140:107,y:current?349:210,w:current?200:266,
   h:current?36:48,text:label,text_size:current?15:17,
   normal_color:0x102839
  });
  // Never put a permanent opaque control over a real fullscreen map.
  this.radarLabel.setProperty(ui.prop.VISIBLE,
   (!current&&!forecast)||!!this.radarError);
  const error=this.radarError||this.radarDecodeError;
  this.radarErrorText?.setProperty(ui.prop.TEXT,
   error?String(error).slice(0,48):'');
  this.radarTime?.setProperty(ui.prop.TEXT,
   forecast?'BUIENRADAR · VOORUIT':current?'BUIENRADAR · ACTUEEL':
   'BUIENRADAR · RADAR');
 },
 nextRadarFrame(){
  if(!this.hasForecastRadar()){
   if(this.radarCanvasVisible){
    this.radarCanvasVisible=false;
    this.radarCanvas?.setProperty(ui.prop.VISIBLE,false);
   }
   // A once-visible CANVAS has hidden the native IMG. Restore the
   // valid current map immediately, even if it is still fresh.
   this.applyRadarFrame();
   return;
  }
  if(this.radarPainting||this.radarCanvasFrames.length<2)return;
  const next=(this.radarFrameIndex+1)%this.radarCanvasFrames.length;
  const runs=next===0?this.radarWrapRects:this.radarCanvasFrames[next].rects;
  void this.paintRadarRects(runs,false,next);
 },
 async phone(message,timeout=20000){
  if(typeof this.request!=='function')throw Error('Zepp verbinding niet beschikbaar');
  let timer;
  try{
   return await Promise.race([
    this.request(message),
    new Promise((_,reject)=>{timer=setTimeout(()=>
     reject(Error('Telefoon antwoordt niet ('+message.method+')')),timeout);})
   ]);
  }finally{if(timer!==undefined)clearTimeout(timer);}
 },
 async pollRadarStatus(){
  if(this.disposed||!this.radarSyncing)return;
  try{
   const result=await this.phone({method:'radar.status'},9000);
   if(!result?.ok)throw Error(result?.error||'Radarstatus niet bereikbaar');
   this.radarStage=result.stage||this.radarStage;
   if(result.stage==='failed'&&!this.hasCurrentRadar())
    throw Error(result.error||'Buienradar ophalen mislukt');
   if(result.stage==='current-only'){
    this.radarDecodeError='ANIMATIE: '+String(result.gifError||'niet beschikbaar');
    this.radarSyncing=false;this.updateRadarLabel();return;
   }
   if(this.hasForecastRadar()){
    this.radarSyncing=false;this.radarError=null;
    this.updateRadarLabel();return;
   }
   const elapsed=Date.now()-this.radarRequestAt;
   if(elapsed>105000){
    if(!this.hasCurrentRadar())
     throw Error('RADAR: te lang geen recent beeld');
    this.radarDecodeError='ANIMATIE: niet ontvangen of verwerkt';
    this.radarSyncing=false;
   }
   this.updateRadarLabel();
  }catch(e){
   this.radarError=String(e?.message||e);
   this.radarSyncing=false;this.updateRadarLabel();
  }
 },
 async requestRadar(force=false){
  if(this.disposed||this.radarSyncing)return;
  if(!force&&this.hasCurrentRadar()&&
     Date.now()-this.currentFetchedAt<5*60000)return;
  this.radarSyncing=true;this.radarError=null;this.radarStage='starting';
  this.radarRequestAt=Date.now();this.statusTicks=0;
  this.updateRadarLabel();
  try{
   const answer=await this.phone({method:'radar.start'},15000);
   if(!answer?.ok||answer.source!=='Buienradar')
    throw Error(answer?.error||'Buienradar niet bereikbaar');
  }catch(e){
   this.radarError=String(e?.message||e);
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
   this.rainDetail.setProperty(ui.prop.TEXT,
    (this.rainError||'Telefoon of gegevens niet beschikbaar').slice(0,55));
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
   this.rainError=this.rain.ok?null:
    String(result?.error||'Buienradar geeft geen recente gegevens');
   this.draw();
   if(this.rain.ok)this.storeShortcut(this.rain);
  }catch(e){
   this.rain=EMPTY;this.rainError=String(e?.message||e);this.draw();
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
  if(this.hasForecastRadar()&&!this.radarPainting){
   const f=this.radarCanvasFrames[this.radarFrameIndex];
   if(f)void this.paintRadarRects(radarDeltaRects(f.pixels,null,
    f.width,f.height),true,this.radarFrameIndex);
  }else this.applyRadarFrame();
 },
 applyRadarFrame(){
  if(!this.radarBase||!this.radarWidget)return;
  if(this.hasForecastRadar()){
   this.radarWidget.setProperty(ui.prop.VISIBLE,false);
   this.updateRadarLabel();return;
  }
  this.radarCanvasVisible=false;
  this.radarCanvas?.setProperty(ui.prop.VISIBLE,false);
  const factor=this.zoom||1,dim=Math.round(SIZE*factor);
  const current=this.hasCurrentRadar();
  this.radarDisplayed=current;
  if(current)this.radarWidget.setProperty(ui.prop.MORE,{
   x:Math.round((SIZE-dim)/2),y:Math.round((SIZE-dim)/2),
   w:dim,h:dim,src:this.currentFrame.path,auto_scale:true
  });
  this.radarWidget.setProperty(ui.prop.VISIBLE,current);
  this.updateRadarLabel();
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
  this.radarEpoch++;
  this.radarAnimationEpoch++;
  this.radarPaintEpoch++;
  this.incomingRadarFiles={};
  this.radarCanvasFrames=[];
 }
}));
