import {notify} from '@zos/notification';
import {LocalStorage} from '@zos/storage';

const storage=new LocalStorage();
// One-shot notification based on a fresh 2-hour nowcast received while app was open.
// This App Service does NOT pretend to fetch the internet in the background.
AppService({
 onInit(options){
  try{
   const prefs=JSON.parse(storage.getItem('buienradar.alert')||'null');
   if(!prefs||prefs.enabled!==true)return;
   // Zepp versions may supply the timer payload as a string or wrapped
   // object. Accept both forms, but never notify from unvalidated data.
   const wrapped=options&&typeof options==='object'?
    (options.param||options.params||options):options;
   const data=typeof wrapped==='string'?JSON.parse(wrapped):wrapped;
   const now=Date.now();
   if(!data||!Number.isFinite(data.onsetAt)||
    !Number.isFinite(data.plannedAt)||now-data.plannedAt>2*3600000||
    data.onsetAt<now-5*60000||data.onsetAt>now+40*60000)return;
   const content='Volgens de laatste voorspelling regen rond '+new Date(data.onsetAt).toLocaleTimeString('nl-BE',{
    hour:'2-digit',minute:'2-digit'
   })+' in '+String(data.place||'jouw buurt').slice(0,28);
   const id=notify({
    title:'Regen op komst',content,
    actions:[],vibrate:5
   });
   if(id<=0)console.log('[Buienradar] notification rejected');
  }catch(_){}
 }
});
