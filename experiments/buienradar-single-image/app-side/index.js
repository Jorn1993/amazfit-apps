// Minimal Zepp 3+ image-transfer test. Based on the official Zepp
// application/3.0/download sample, NOT the existing Buienradar GIF pipeline.
// No GIF decoder, no custom TGA, no external image converter / server.
import {BaseSideService,convertLib} from '@zeppos/zml/base-side';

const SOURCE='https://image.buienradar.nl/2.0/image/single/RadarMapRainBE'+
 '?width=320&height=320&renderBackground=True&renderBranding=False'+
 '&renderText=False';
const FILE='data://download/zepp-probe-buienradar.png';
const MAX_MS=60000;
let running=false;
let current={stage:'idle',error:null,updatedAt:0,convertedSize:null};
function state(stage,error=null){
 current={...current,stage,error,updatedAt:Date.now()};
}
function deadline(promise,ms,label){
 return new Promise((resolve,reject)=>{
  let completed=false;
  const timer=setTimeout(()=>{
   if(completed)return;
   completed=true;reject(Error(label+': timeout'));
  },ms);
  Promise.resolve(promise).then(value=>{
   if(completed)return;
   completed=true;clearTimeout(timer);resolve(value);
  },err=>{
   if(completed)return;
   completed=true;clearTimeout(timer);reject(err);
  });
 });
}
function download(context,url){
 return deadline(new Promise((resolve,reject)=>{
  let task;
  try{
   // Zepp/ZML's official example uses BaseSideService.this.download().
   task=context.download(url,{headers:{},timeout:MAX_MS,filePath:FILE});
   if(!task)throw Error('Geen Zepp downloadtaak');
   task.onSuccess=event=>{
    if(Number(event?.statusCode)!==200)
     return reject(Error('Buienradar HTTP '+event?.statusCode));
    const path=event?.filePath||event?.tempFilePath;
    if(!path)return reject(Error('Download zonder bestandspad'));
    resolve(path);
   };
   task.onFail=event=>reject(Error(
    'Zepp download '+(event?.code??'')+' '+(event?.message||'mislukt')));
  }catch(e){reject(e);}
 }),MAX_MS+5000,'Buienradar-download');
}
function transfer(context,path){
 return deadline(new Promise((resolve,reject)=>{
  let task;
  try{
   // BaseSideService.this.sendFile() and watch-side
   // BasePage.onReceivedFile() are demonstrated by zeppos-samples.
   task=context.sendFile(path,{
    kind:'single-native-png',source:'Buienradar',
    fetchedAt:Date.now(),probeId:991936821
   });
   if(!task||typeof task.on!=='function')
    throw Error('Zepp sendFile start niet');
   let done=false;
   const complete=status=>{
    if(done)return;
    if(status==='transferred'){done=true;resolve();}
    else if(status==='error'||status==='canceled'){
     done=true;reject(Error('Bluetooth: '+status));
    }
   };
   task.on('change',event=>complete(event?.data?.readyState||task.readyState));
   complete(task.readyState);
  }catch(e){reject(e);}
 }),65000,'Bluetooth-overdracht');
}
async function doProbe(context){
 try{
  state('download');
  // Cache buster prevents an accidentally reused historic source image.
  const file=await download(context,SOURCE+'&stamp='+Math.floor(Date.now()/60000));
  state('convert');
  // Official Zepp SideService converter, output is device-native binary.
  const converted=await deadline(convertLib.convert({filePath:file}),
   30000,'Zepp image.convert');
  if(!converted?.targetFilePath)
   throw Error('Zepp convert: ontbrekend targetFilePath');
  if(converted?.options?.size!==undefined&&
     Number(converted.options.size)<=0)
   throw Error('Zepp convert: leeg resultaat');
  current.convertedSize=converted?.options?.size??null;
  state('transfer');
  await transfer(context,converted.targetFilePath);
  state('sent');
 }catch(e){
  state('failed',String(e?.message||e).slice(0,130));
 }finally{
  running=false;
 }
}
AppSideService(BaseSideService({
 onInit(){state('idle');},
 onRequest(req,res){
  if(req?.method==='probe.status'){
   res(null,{ok:true,...current,busy:running});
   return;
  }
  if(req?.method==='probe.start'){
   if(running){
    res(null,{ok:true,alreadyRunning:true,...current});
    return;
   }
   running=true;current.convertedSize=null;
   state('starting');
   res(null,{ok:true,started:true});
   void doProbe(this);
   return;
  }
  res(null,{ok:false,error:'Onbekende methode'});
 }
}));
