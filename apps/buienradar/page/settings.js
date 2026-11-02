import * as ui from '@zos/ui';
import {back} from '@zos/router';
import {LocalStorage} from '@zos/storage';
import {BasePage} from '@zeppos/zml/base-page';
import {notify} from '@zos/notification';
import {cancel as cancelAlarm} from '@zos/alarm';

const cities=[
 {name:'Antwerpen',lat:51.2194,lon:4.4025},
 {name:'Brussel',lat:50.8503,lon:4.3517},
 {name:'Gent',lat:51.0543,lon:3.7174},
 {name:'Brugge',lat:51.2093,lon:3.2247},
 {name:'Leuven',lat:50.8798,lon:4.7005},
 {name:'Hasselt',lat:50.9307,lon:5.3325},
 {name:'Mechelen',lat:51.0259,lon:4.4775},
 {name:'Kortrijk',lat:50.827,lon:3.265},
 {name:'Luik',lat:50.6326,lon:5.5797},
 {name:'Amsterdam',lat:52.3676,lon:4.9041},
 {name:'Rotterdam',lat:51.9244,lon:4.4777},
 {name:'Maastricht',lat:50.8514,lon:5.691}
];
const bg=0x07121d,white=0xf6fbff,muted=0x9bb0be,blue=0x3daee0;
const storage=new LocalStorage();
Page(BasePage({
 build(){
  const make=(type,params)=>ui.createWidget(type,params);
  const label=(x,y,w,h,value,size=23,color=white)=>
   make(ui.widget.TEXT,{x,y,w,h,text:value,text_size:size,color,
    align_h:ui.align.CENTER_H,text_style:ui.text_style.WRAP});
  const button=(x,y,w,h,value,click,active=false)=>
   make(ui.widget.BUTTON,{x,y,w,h,text:value,text_size:22,color:white,
    normal_color:active?0x176b99:0x182f3e,press_color:0x285779,
    radius:20,click_func:click});
  make(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:bg});
  label(96,42,288,48,'INSTELLINGEN',30);
  label(106,109,268,30,'LOCATIE',19,muted);
  let selected=cities[0];
  try{
   const l=JSON.parse(storage.getItem('buienradar.location')||'null');
   selected=cities.find(c=>c.name===l.name)||selected;
  }catch(_){}
  this.selected=cities.indexOf(selected);
  this.place=label(125,147,230,53,selected.name,29);
  button(71,148,52,52,'‹',()=>this.pick(-1));
  button(357,148,52,52,'›',()=>this.pick(1));
  make(ui.widget.FILL_RECT,{x:88,y:218,w:304,h:2,color:0x293e4b});
  label(91,236,298,33,'REGENMELDING',20,muted);
  let alert={enabled:false,lead:15};
  try{alert={...alert,...JSON.parse(storage.getItem('buienradar.alert')||'{}')};}catch(_){}
  this.alert=alert;
  this.alertButton=button(135,272,210,51,alert.enabled?'AAN':'UIT',
   ()=>this.toggleAlert(),alert.enabled);
  this.leadText=label(124,337,232,40,alert.lead+' MIN VOORAF',23,white);
  button(70,332,53,53,'−',()=>this.changeLead(-1));
  button(357,332,53,53,'+',()=>this.changeLead(1));
  this.status=label(72,384,336,28,'',17,muted);
  button(88,415,142,48,'TEST',()=>this.testNotification());
  button(248,415,145,48,'OPSLAAN',()=>void this.save(),true);
 },
 pick(delta){
  this.selected=(this.selected+delta+cities.length)%cities.length;
  this.place.setProperty(ui.prop.TEXT,cities[this.selected].name);
 },
 toggleAlert(){
  this.alert.enabled=!this.alert.enabled;
  this.alertButton.setProperty(ui.prop.MORE,{
   x:135,y:272,w:210,h:51,text:this.alert.enabled?'AAN':'UIT',
   normal_color:this.alert.enabled?0x176b99:0x182f3e
  });
 },
 changeLead(direction){
  const choices=[5,15,30],i=choices.indexOf(this.alert.lead);
  this.alert.lead=choices[Math.max(0,Math.min(2,i+direction))];
  this.leadText.setProperty(ui.prop.TEXT,this.alert.lead+' MIN VOORAF');
 },
 testNotification(){
  try{
   const id=notify({
    title:'Buienradar · test',
    content:'Meldingen van Buienradar zijn beschikbaar op dit horloge.',
    actions:[{text:'Open radar',file:'page/index'}],
    vibrate:5
   });
   this.status.setProperty(ui.prop.TEXT,id>0?
    'Test naar meldingen gestuurd':'Melding geweigerd');
  }catch(_){this.status.setProperty(ui.prop.TEXT,'Melding niet beschikbaar');}
 },
 async save(){
  const selected=cities[this.selected];
  this.status.setProperty(ui.prop.TEXT,'Opslaan...');
  try{
   const reply=await this.messaging.request({
    method:'config.set',params:{location:selected}
   },{timeout:15000});
   if(!reply||reply.ok!==true)throw Error('Zepp niet verbonden');
   storage.setItem('buienradar.location',JSON.stringify(reply.location));
   storage.setItem('buienradar.alert',JSON.stringify(this.alert));
   if(!this.alert.enabled){
    const id=Number(storage.getItem('buienradar.alert-alarm-id')||0);
    if(id>0){
     try{cancelAlarm(id);}catch(_){}
     storage.setItem('buienradar.alert-alarm-id','0');
    }
   }
   this.status.setProperty(ui.prop.TEXT,'Opgeslagen');
   back();
  }catch(_){
   // Never claim remote city save succeeded if the phone did not acknowledge.
   this.status.setProperty(ui.prop.TEXT,'Geen verbinding met Zepp');
  }
 }
}));
