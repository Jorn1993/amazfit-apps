import * as ui from '@zos/ui';
import {push} from '@zos/router';
import {LocalStorage} from '@zos/storage';
import {notify} from '@zos/notification';
import {cancel as cancelAlarm} from '@zos/alarm';
import {BasePage} from '@zeppos/zml/base-page';

const store=new LocalStorage(),BG=0x070f18,PANEL=0x102737,
 WHITE=0xf6fbff,MUTED=0xafc2d0,BLUE=0x2680b1;
const LEADS=[5,15,30];
Page(BasePage({
 build(){
  const create=(type,opts)=>ui.createWidget(type,opts);
  const text=(x,y,w,h,value,size=22,color=WHITE)=>
   create(ui.widget.TEXT,{x,y,w,h,text:value,text_size:size,color,
    align_h:ui.align.CENTER_H,text_style:ui.text_style.ELLIPSIS});
  const button=(x,y,w,h,value,size,fn,active=false)=>
   create(ui.widget.BUTTON,{x,y,w,h,text:value,text_size:size,color:WHITE,
    normal_color:active?BLUE:PANEL,press_color:0x205270,radius:23,click_func:fn});
  create(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
  text(103,49,274,49,'Instellingen',31);
  // Entire location row is a single large tappable surface.
  let loc='Antwerpen';
  try{
   const data=JSON.parse(store.getItem('buienradar.location')||'null');
   if(data&&data.name)loc=data.name;
  }catch(_){}
  this.place=button(90,122,300,90,loc+'  ›',28,
   ()=>push({url:'page/locations'}));
  text(159,104,160,23,'LOCATIE',17,MUTED);
  let prefs={enabled:false,lead:15};
  try{
   const item=JSON.parse(store.getItem('buienradar.alert')||'null');
   if(item)prefs={...prefs,...item};
  }catch(_){}
  this.alert=prefs;
  text(112,241,214,38,'Regenmelding',24);
  this.alertButton=button(320,234,74,48,
   prefs.enabled?'Aan':'Uit',20,()=>this.toggleAlert(),prefs.enabled);
  this.leadText=text(155,334,170,42,prefs.lead+' min',27);
  text(153,364,174,25,'vooraf',17,MUTED);
  button(88,328,55,55,'−',31,()=>this.changeLead(-1));
  button(337,328,55,55,'+',31,()=>this.changeLead(1));
  this.gifResult=text(119,383,242,18,'',15,MUTED);
  this.gifTestButton=button(122,405,113,43,'GIF-test',17,
   ()=>void this.testGif());
  this.testButton=button(245,405,113,43,'Test melding',16,
   ()=>this.testNotification());
 },
 onResume(){
  try{
   const data=JSON.parse(store.getItem('buienradar.location')||'null');
   if(data&&data.name)this.place.setProperty(ui.prop.TEXT,data.name+'  ›');
  }catch(_){}
 },
 persist(){
  store.setItem('buienradar.alert',JSON.stringify(this.alert));
  if(!this.alert.enabled){
   const id=Number(store.getItem('buienradar.alert-alarm-id')||0);
   if(id>0)try{cancelAlarm(id);}catch(_){}
   store.setItem('buienradar.alert-alarm-id','0');
   store.setItem('buienradar.alert-key','');
  }
 },
 toggleAlert(){
  this.alert.enabled=!this.alert.enabled;
  this.alertButton.setProperty(ui.prop.MORE,{
   x:320,y:234,w:74,h:48,text:this.alert.enabled?'Aan':'Uit',
   normal_color:this.alert.enabled?BLUE:PANEL
  });
  this.persist();
 },
 changeLead(direction){
  let index=LEADS.indexOf(this.alert.lead);
  if(index<0)index=1;
  this.alert.lead=LEADS[Math.max(0,Math.min(2,index+direction))];
  this.leadText.setProperty(ui.prop.TEXT,this.alert.lead+' min');
  this.persist();
 },
 async testGif(){
  this.gifTestButton.setProperty(ui.prop.TEXT,'Bezig...');
  this.gifResult.setProperty(ui.prop.TEXT,'Buienradar GIF testen...');
  try{
   if(typeof this.request!=='function')throw Error('Geen telefoonverbinding');
   const result=await this.request({method:'radar.gifTest'});
   this.gifTestButton.setProperty(ui.prop.TEXT,result?.ok?'GIF gelezen':'GIF fout');
   this.gifResult.setProperty(ui.prop.TEXT,
    result?.ok?'Conversie OK; animatie nog niet bewezen':
     String(result?.error||'Onbekende fout').slice(0,38));
  }catch(e){
   this.gifTestButton.setProperty(ui.prop.TEXT,'GIF fout');
   this.gifResult.setProperty(ui.prop.TEXT,String(e.message||e).slice(0,38));
  }
 },
 testNotification(){
  try{
   const id=notify({
    title:'Buienradar · test',
    content:'Meldingen zijn beschikbaar op je horloge.',
    actions:[],vibrate:5
   });
   this.testButton.setProperty(ui.prop.TEXT,id>0?'Verzonden':'Niet mogelijk');
  }catch(_){this.testButton.setProperty(ui.prop.TEXT,'Niet mogelijk');}
 }
}));
