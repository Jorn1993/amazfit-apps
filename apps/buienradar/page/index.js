import * as ui from '@zos/ui';
import {setScrollMode, SCROLL_MODE_SWIPER_HORIZONTAL} from '@zos/page';
import TransferFile from '@zos/ble/TransferFile';
import {LocalStorage} from '@zos/storage';
import {BasePage} from '@zeppos/zml/base-page';

// Native horizontal swipe. Each screen is its own 480x480 VIEW_CONTAINER.
// No gesture interception or abrupt visibility switching.
const SIZE=480;
const C={
 bg:0x05090d,white:0xf7fafc,muted:0x9bb0bf,blue:0x56c7fc,
 line:0x34434e,bar:0x2f9dd8,empty:0x244052,orange:0xff9267
};
const EMPTY={ok:false,points:[],summary:null};
const storage=new LocalStorage();
function valid(n){return typeof n==='number'&&Number.isFinite(n);}
function shown(n,unit){return valid(n)?Math.round(n)+unit:'--'+unit;}
Page(BasePage({
 build(){
  this.disposed=false;this.screen=0;this.loading=false;this.rain=EMPTY;
  this.liveFrames=[];this.radarStamp=null;this.radarSyncing=false;
  this.radarPaths=Array.from({length:6},(_,i)=>'radar-frame-'+i+'.png');
  this.frameIndex=0;this.pendingFrame=null;this.pageViews=[];this.parts=[[],[],[]];
  this.bars=[];this.indicators=[];
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
  // PAGE 1 — radar is genuinely full bleed, not inset in a square card.
  this.radarWidget=create(0,ui.widget.IMG,{
   x:0,y:0,w:SIZE,h:SIZE,src:this.radarPaths[0],auto_scale:true,auto_scale_obj_fit:true
  });
  rect(0,75,23,330,55,0x0a1622,24);
  this.city=txt(0,82,26,316,49,'Antwerpen',31,C.white);
  rect(0,120,418,240,28,0x0a1622,13);
  this.radarSource=txt(0,124,421,232,23,'Buienradar.nl',14,C.white);
  // PAGE 2 — clear, large 2-hour rainfall graph.
  rect(1,140,24,200,56,0xffffff,16);
  create(1,ui.widget.IMG,{x:149,y:29,w:182,h:46,src:'buienradar-logo.png',auto_scale:true});
  txt(1,74,91,332,39,'REGENVERWACHTING',24,C.muted);
  this.rainState=txt(1,69,136,342,52,'Gegevens laden…',27,C.white);
  this.rainDetail=txt(1,81,192,318,45,'De komende 2 uur',20,C.muted);
  rect(1,62,365,358,2,C.line);
  for(let i=0;i<12;i++){
   rect(1,68+i*29,267,17,1,C.line);
   rect(1,68+i*29,314,17,1,C.line);
  }
  for(let i=0;i<24;i++)this.bars.push(
   rect(1,74+i*14,362,10,4,C.empty,3)
  );
  rect(1,66,246,3,122,C.orange);
  txt(1,57,378,75,25,'NU',17);
  txt(1,152,378,82,25,'30 min',16,C.muted);
  txt(1,260,378,85,25,'60 min',16,C.muted);
  txt(1,353,378,70,25,'2 uur',16,C.muted);
  // PAGE 3 — compact, visual information and much larger values.
  rect(2,123,23,234,61,0xffffff,17);
  create(2,ui.widget.IMG,{x:130,y:28,w:220,h:51,src:'buienradar-logo.png',auto_scale:true});
  this.detailTitle=txt(2,85,100,310,41,'HET VOLGENDE UUR',22,C.muted);
  this.weatherIcon=create(2,ui.widget.IMG,{
   x:88,y:166,w:113,h:113,src:'weather-cloud.png',auto_scale:true
  });
  this.temp=txt(2,211,167,178,98,'--°',62);
  txt(2,216,251,169,25,'GEMETEN',16,C.muted);
  rect(2,77,293,326,2,C.line);
  create(2,ui.widget.IMG,{x:84,y:307,w:67,h:67,src:'weather-drop.png',auto_scale:true});
  this.amount=txt(2,164,310,242,61,'-- mm',37,C.blue);
  create(2,ui.widget.IMG,{x:89,y:382,w:57,h:57,src:'weather-wind.png',auto_scale:true});
  this.wind=txt(2,155,375,252,60,'-- km/u',29);
  this.gusts=txt(2,165,428,220,25,'Windstoten: --',16,C.muted);
  this.station=txt(2,118,457,244,20,'',12,C.muted);
  // Small page dots on every native page: these travel with the swipe.
  for(let i=0;i<3;i++){
   const marks=[];
   for(let j=0;j<3;j++)marks.push(rect(
    i,216+j*24,454,8,8,j===i?C.white:0x6c8090,4));
   this.indicators.push(marks);
  }
  this.initRadarInbox();
  this.frameTimer=setInterval(()=>{
   if(this.screen===0)this.nextRadarFrame();
  },950);
  this.weatherTimer=setInterval(()=>{void this.refresh();},300000);
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
       this.radarSource.setProperty(ui.prop.TEXT,'Buienradar.nl · bijgewerkt');
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
  if(file)this.radarWidget.setProperty(ui.prop.MORE,{src:file});
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
  if(!d.ok||!d.summary||!Array.isArray(d.points)){
   this.rainState.setProperty(ui.prop.TEXT,'GEEN GEGEVENS');
   this.rainDetail.setProperty(ui.prop.TEXT,'Open Zepp voor een update');
   this.temp.setProperty(ui.prop.TEXT,'--°');
   this.amount.setProperty(ui.prop.TEXT,'-- mm');
   this.wind.setProperty(ui.prop.TEXT,'-- km/u');
   this.gusts.setProperty(ui.prop.TEXT,'Windstoten: --');
   this.station.setProperty(ui.prop.TEXT,'');
   for(const b of this.bars){
    b.setProperty(ui.prop.H,4);b.setProperty(ui.prop.Y,362);
    b.setProperty(ui.prop.COLOR,C.empty);
   }
   return;
  }
  this.city.setProperty(ui.prop.TEXT,d.location&&d.location.name||'Antwerpen');
  this.rainState.setProperty(ui.prop.TEXT,d.summary.headline);
  this.rainState.setProperty(ui.prop.COLOR,
   d.summary.rainingNow?C.orange:C.white);
  this.rainDetail.setProperty(ui.prop.TEXT,d.summary.detail);
  const mm=d.points.slice(0,24).map(p=>valid(p.mmh)?p.mmh:0);
  const max=Math.max(1,...mm);
  for(let i=0;i<24;i++){
   const n=mm[i]||0;
   const h=n<0.03?4:Math.max(11,Math.round(Math.sqrt(n/max)*115));
   const b=this.bars[i];
   b.setProperty(ui.prop.H,h);
   b.setProperty(ui.prop.Y,365-h);
   b.setProperty(ui.prop.COLOR,n<0.03?C.empty:C.bar);
  }
  const w=d.station||{};
  this.temp.setProperty(ui.prop.TEXT,shown(w.temperature,'°'));
  this.amount.setProperty(ui.prop.TEXT,
   valid(d.nextHourMm)?d.nextHourMm.toFixed(1)+' mm':'-- mm');
  this.wind.setProperty(ui.prop.TEXT,
   (w.direction||'--')+'  '+shown(w.windKmh,' km/u'));
  this.gusts.setProperty(ui.prop.TEXT,
   'Windstoten '+shown(w.gustKmh,' km/u'));
  this.station.setProperty(ui.prop.TEXT,w.station?
   'Meting: '+w.station:'Geen lokale meting');
  let src='weather-cloud.png';
  const description=String(w.weatherDescription||'').toLowerCase();
  if(/regen|bui|motregen|rain|drizzle|sneeuw/.test(description))
   src='weather-rain.png';
  else if(/zonnig|helder|sunny|clear/.test(description))
   src='weather-sun.png';
  this.weatherIcon.setProperty(ui.prop.MORE,{src,auto_scale:true});
 },
 storeShortcut(d){
  try{
   storage.setItem('buienradar.shortcut',JSON.stringify({
    location:d.location.name,headline:d.summary.headline,
    detail:d.summary.detail,at:Date.now()
   }));
  }catch(_){}
 },
 async refresh(){
  if(this.disposed||this.loading)return;
  this.loading=true;
  try{
   const result=await this.phone({method:'rain.forecast',params:{}},25000);
   if(this.disposed)return;
   this.rain=result&&result.ok===true?result:EMPTY;
   this.draw();
   if(this.rain.ok)this.storeShortcut(this.rain);
  }catch(_){
   this.rain=EMPTY;this.draw();
  }finally{
   this.loading=false;
   if(this.screen===0)void this.requestRadar();
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
