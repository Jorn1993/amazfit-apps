// Single-image, full-bleed diagnostic. The only remote visual source
// is the official current Buienradar Belgium PNG, converted on the phone.
import ui from '@zos/ui';
import {BasePage} from '@zeppos/zml/base-page';

const SIZE=480;
const COLORS={base:0x101e2c,ink:0xffffff,panel:0x0b202f,bad:0xffbd91};
function label(x,y,w,h,text,size=17,color=COLORS.ink){
 return ui.createWidget(ui.widget.TEXT,{
  x,y,w,h,text,text_size:size,color,align_h:ui.align.CENTER_H
 });
}
Page(BasePage({
 build(){
  this.active=true;
  this.startedAt=Date.now();
  this.lastStage='';
  this.photoReceived=false;
  this.photo=ui.createWidget(ui.widget.IMG,{
   x:0,y:0,w:SIZE,h:SIZE,src:'baseline.png',auto_scale:true
  });
  // Bundled coloured calibration image is guaranteed offline. Replacing
  // it with a real map checks the ENTIRE official Zepp image pipeline.
  ui.createWidget(ui.widget.FILL_RECT,{
   x:90,y:395,w:300,h:46,color:COLORS.panel,radius:23
  });
  this.caption=label(96,402,288,32,'TESTAFBEELD · START',17);
  this.errorText=label(74,350,332,42,'',15,COLORS.bad);
  this.retry=ui.createWidget(ui.widget.BUTTON,{
   x:164,y:48,w:152,h:40,text:'HERLAAD',text_size:16,
   color:COLORS.ink,normal_color:COLORS.panel,
   press_color:0x21475b,radius:20,
   click_func:()=>this.begin()
  });
  this.pollTimer=setInterval(()=>{void this.poll();},2000);
  setTimeout(()=>{if(this.active)void this.begin();},500);
 },
 show(message,error=false){
  this.caption?.setProperty(ui.prop.TEXT,String(message).slice(0,42));
  if(error){
   this.errorText?.setProperty(ui.prop.TEXT,String(message).slice(0,46));
  }else this.errorText?.setProperty(ui.prop.TEXT,'');
 },
 async begin(){
  if(!this.active)return;
  this.startedAt=Date.now();
  this.photoReceived=false;
  this.show('BUIENRADAR OPHALEN');
  try{
   const result=await this.request({method:'probe.start'});
   if(!result?.ok)throw Error(result?.error||'Zepp start mislukt');
   await this.poll();
  }catch(e){this.show('VERBINDING: '+String(e?.message||e),true);}
 },
 async poll(){
  if(!this.active||this.photoReceived)return;
  try{
   const s=await this.request({method:'probe.status'});
   if(!s?.ok)throw Error(s?.error||'status niet bereikbaar');
   if(s.stage==='failed'){
    this.show('FOUT: '+(s.error||'onbekend'),true);
    return;
   }
   const names={
    idle:'VERBINDEN',starting:'VERBINDEN',download:'DOWNLOADEN',
    convert:'ZEPP CONVERTEREN',transfer:'BLUETOOTH ONTVANGEN',
    sent:'VERZONDEN · WACHT OP BEELD'
   };
   this.show(names[s.stage]||String(s.stage));
   if(s.stage==='sent'&&Date.now()-this.startedAt>70000)
    this.show('FOUT: ZPK ONTVANGT GEEN BESTAND',true);
  }catch(e){this.show('STATUS: '+String(e?.message||e),true);}
 },
 onReceivedFile(file){
  if(!this.active||file?.params?.kind!=='single-native-png'||
     file?.params?.source!=='Buienradar')return;
  let finished=false;
  const display=stage=>{
   if(finished||!this.active)return;
   const state=stage||file.readyState;
   if(state==='error'||state==='canceled'){
    finished=true;this.show('BLUETOOTH: '+state,true);
    return;
   }
   if(state!=='transferred')return;
   if(!file.filePath){
    finished=true;this.show('ONTVANGST: PAD ONTBREEKT',true);
    return;
   }
   finished=true;this.photoReceived=true;
   this.photo.setProperty(ui.prop.MORE,{
    x:0,y:0,w:SIZE,h:SIZE,src:file.filePath,auto_scale:true
   });
   this.show('BUIENRADAR · ACTUEEL');
  };
  if(typeof file.on==='function')
   file.on('change',e=>display(e?.data?.readyState||file.readyState));
  display(file.readyState);
 },
 onDestroy(){
  this.active=false;
  if(this.pollTimer!==undefined)clearInterval(this.pollTimer);
 }
}));
