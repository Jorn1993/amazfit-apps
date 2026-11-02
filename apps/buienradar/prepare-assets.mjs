// Produce our own rain-cloud logo as a tiny RGBA PNG, no external fonts/assets.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const root=new URL('.',import.meta.url);
function chunk(name,payload){
 const type=Buffer.from(name),data=Buffer.concat([type,payload]);
 let crc=0xffffffff;
 for(const b of data){crc^=b;for(let i=0;i<8;i++)
  crc=crc>>>1^((crc&1)?0xedb88320:0);}
 const n=Buffer.alloc(4);n.writeUInt32BE(payload.length);
 const c=Buffer.alloc(4);c.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([n,data,c]);
}
function render(size){
 const raw=Buffer.alloc(size*(size*4+1));
 for(let y=0;y<size;y++){
  raw[y*(size*4+1)]=0;
  for(let x=0;x<size;x++){
   const u=x/size*256,v=y/size*256;
   const background=[9,27,42,255];
   const cloud=((u-107)**2+(v-107)**2<45**2)||
    ((u-151)**2+(v-99)**2<50**2)||
    ((u-181)**2+(v-128)**2<32**2)||
    (u>72&&u<185&&v>110&&v<156);
   let pixel=cloud?[229,247,255,255]:background;
   const rain=(offset)=>Math.abs((u-offset)-0.43*(v-158))<7&&v>163&&v<211;
   if(rain(88)||rain(136)||rain(184))pixel=[53,186,250,255];
   const i=y*(size*4+1)+1+x*4;
   for(let j=0;j<4;j++)raw[i+j]=pixel[j];
  }
 }
 const header=Buffer.alloc(13);
 header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),
  chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
for(const dir of ['assets','assets/balance2']){
 const dest=path.join(new URL(root).pathname,dir);
 fs.mkdirSync(dest,{recursive:true});
 fs.writeFileSync(path.join(dest,'icon.png'),render(256));
 fs.writeFileSync(path.join(dest,'preview.png'),render(480));
 fs.writeFileSync(path.join(dest,'preview_nl-NL.png'),render(480));
}
console.log('Generated Buienradar rain-cloud icon');
