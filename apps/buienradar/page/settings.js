import * as ui from '@zos/ui';
import {back} from '@zos/router';
import {LocalStorage} from '@zos/storage';
import {BasePage} from '@zeppos/zml/base-page';

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
   make(ui.widget.BUTTON,{x,y,w,h,text:value,text_size:20,color:white,
    normal_color:active?0x196d9e:0x152c3b,press_color:0x285779,
    radius:19,click_func:click});
  make(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:bg});
  label(89,42,302,43,'INSTELLINGEN',29);
  label(99,113,282,27,'LOCATIE',16,muted);
  let selected=cities[0];
  try{
   const l=JSON.parse(storage.getItem('buienradar.location')||'null');
   selected=cities.find(c=>c.name===l.name)||selected;
  }catch(_){}
  this.selected=cities.indexOf(selected);
  this.place=label(119,149,245,51,selected.name,26);
  button(67,150,55,49,'‹',()=>this.pick(-1));
  button(365,150,55,49,'›',()=>this.pick(1));
  label(100,229,280,29,'REGENMELDING',17,muted);
  let alert={enabled:false,lead:15};
  try{alert={...alert,...JSON.parse(storage.getItem('buienradar.alert')||'{}')};}catch(_){}
  this.alert=alert;
  this.alertButton=button(112,266,256,50,alert.enabled?'AAN':'UIT',
   ()=>this.toggleAlert(),alert.enabled);
  this.leadText=label(90,337,300,36,'Meld '+alert.lead+' min vooraf',20,white);
  button(54,337,65,46,'−',()=>this.changeLead(-1));
  button(361,337,65,46,'+',()=>this.changeLead(1));
  this.status=label(78,397,324,29,'',16,muted);
  button(150,430,180,44,'OPSLAAN',()=>void this.save(),true);
 },
 pick(delta){
  this.selected=(this.selected+delta+cities.length)%cities.length;
  this.place.setProperty(ui.prop.TEXT,cities[this.selected].name);
 },
 toggleAlert(){
  this.alert.enabled=!this.alert.enabled;
  this.alertButton.setProperty(ui.prop.MORE,{
   x:112,y:266,w:256,h:50,text:this.alert.enabled?'AAN':'UIT',
   normal_color:this.alert.enabled?0x196d9e:0x152c3b
  });
 },
 changeLead(direction){
  const choices=[5,15,30],i=choices.indexOf(this.alert.lead);
  this.alert.lead=choices[Math.max(0,Math.min(2,i+direction))];
  this.leadText.setProperty(ui.prop.TEXT,'Meld '+this.alert.lead+' min vooraf');
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
   this.status.setProperty(ui.prop.TEXT,'Opgeslagen');
   back();
  }catch(_){
   // Never claim remote city save succeeded if the phone did not acknowledge.
   this.status.setProperty(ui.prop.TEXT,'Geen verbinding met Zepp');
  }
 }
}));
