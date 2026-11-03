// Offline colour calibration asset; real radar is downloaded directly
// from Buienradar Belgium at runtime, never from GitHub or a proxy.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
function crc32(data){
 let c=0xffffffff;
 for(const b of data){
  c^=b;
  for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);
 }
 return (c^0xffffffff)>>>0;
}
function chunk(name,bytes){
 const type=Buffer.from(name,'ascii');
 const length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);
 const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([type,bytes])));
 return Buffer.concat([length,type,bytes,crc]);
}
function create(size){
 const raw=Buffer.alloc(size*(size*3+1));
 for(let y=0;y<size;y++){
  raw[y*(size*3+1)]=0;
  for(let x=0;x<size;x++){
   const i=y*(size*3+1)+1+x*3;
   const band=Math.floor(x*3/size);
   const rgb=band===0?[220,40,58]:band===1?[54,184,103]:[54,102,241];
   if((x-10<6&&x>4)||(y>size-22&&y<size-9)){
    rgb[0]=255;rgb[1]=255;rgb[2]=255;
   }
   for(let ch=0;ch<3;ch++)raw[i+ch]=rgb[ch];
  }
 }
 const h=Buffer.alloc(13);
 h.writeUInt32BE(size,0);h.writeUInt32BE(size,4);
 h[8]=8;h[9]=2;
 return Buffer.concat([
  Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),
  chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))
 ]);
}
for(const dir of ['assets','assets/balance2']){
 const target=path.join(root,dir);
 fs.mkdirSync(target,{recursive:true});
 fs.writeFileSync(path.join(target,'icon.png'),create(256));
 fs.writeFileSync(path.join(target,'baseline.png'),create(480));
 fs.writeFileSync(path.join(target,'preview.png'),create(480));
}
console.log('Built offline calibration assets (baseline.png 480x480)');
