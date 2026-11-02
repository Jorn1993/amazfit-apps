import * as ui from '@zos/ui';
import {back} from '@zos/router';
import {setScrollMode,SCROLL_MODE_SWIPER_HORIZONTAL} from '@zos/page';
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
const store=new LocalStorage(),BG=0x070f18,PANEL=0x102737;
Page(BasePage({
 build(){
  setScrollMode({mode:SCROLL_MODE_SWIPER_HORIZONTAL,
   options:{width:480,count:3}});
  this.views=[];
  for(let index=0;index<3;index++){
   const v=ui.createWidget(ui.widget.VIEW_CONTAINER,{
    x:0,y:0,w:480,h:480,page:index,scroll_enable:0
   });
   this.views.push(v);
   v.createWidget(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:BG});
   v.createWidget(ui.widget.TEXT,{x:115,y:44,w:250,h:49,
    text:'Kies locatie',text_size:30,color:0xffffff,
    align_h:ui.align.CENTER_H});
   for(let i=0;i<4;i++){
    const city=cities[index*4+i];
    v.createWidget(ui.widget.BUTTON,{
     x:93,y:110+i*72,w:294,h:61,text:city.name,text_size:26,
     color:0xf7fbff,normal_color:PANEL,press_color:0x21638a,
     radius:22,click_func:()=>void this.choose(city)
    });
   }
   v.createWidget(ui.widget.TEXT,{
    x:140,y:417,w:200,h:29,text:(index+1)+' / 3',
    text_size:19,color:0xa7bdcd,align_h:ui.align.CENTER_H
   });
  }
 },
 async choose(location){
  try{
   const reply=await this.messaging.request({
    method:'config.set',params:{location}
   },{timeout:15000});
   if(!reply||reply.ok!==true||!reply.location)throw Error('offline');
   store.setItem('buienradar.location',JSON.stringify(reply.location));
   back();
  }catch(_){
   // Do not claim a location is saved until phone service acknowledges it.
   // The user stays on the page to retry.
   this.views[0].createWidget(ui.widget.TEXT,{
    x:119,y:392,w:242,h:30,text:'Telefoon niet verbonden',
    text_size:18,color:0xff9a8c,align_h:ui.align.CENTER_H
   });
  }
 }
}));
