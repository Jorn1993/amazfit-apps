import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {encodeRgbPng} from '../app-side/frame-png.js';
import {BuienradarGif} from '../page/gif-decoder.js';
function parsePng(bytes){
 const b=Buffer.from(bytes),sig=Buffer.from([137,80,78,71,13,10,26,10]);
 assert.deepEqual(b.subarray(0,8),sig);
 let pos=8,w=0,h=0,idat=[];
 while(pos<b.length){
  const n=b.readUInt32BE(pos),name=b.toString('ascii',pos+4,pos+8);
  const data=b.subarray(pos+8,pos+8+n);
  if(name==='IHDR'){
   w=data.readUInt32BE(0);h=data.readUInt32BE(4);
   assert.equal(data[8],8);assert.equal(data[9],2);
  }
  if(name==='IDAT')idat.push(data);
  pos+=12+n;
  if(name==='IEND')break;
 }
 return {w,h,raw:inflateSync(Buffer.concat(idat))};
}
test('Real 24bit RGB PNG preserves all colour channels and row boundaries',()=>{
 const w=32,h=16,rgb=new Uint8Array(w*h*3);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*3;rgb[i]=x*7;rgb[i+1]=y*15;rgb[i+2]=(x+y)*4;
 }
 const bytes=encodeRgbPng(w,h,rgb);
 const decoded=parsePng(bytes);
 assert.equal(decoded.w,w);assert.equal(decoded.h,h);
 for(let y=0;y<h;y++){
  const row=decoded.raw.subarray(y*(w*3+1),(y+1)*(w*3+1));
  assert.equal(row[0],0);
  assert.deepEqual(row.subarray(1),Buffer.from(rgb.subarray(y*w*3,(y+1)*w*3)));
 }
});
test('Reject malformed bitmap lengths',()=>{
 assert.throws(()=>encodeRgbPng(320,320,new Uint8Array(30)),/afbeeldingsdata/);
});
test('Real Buienradar GIF produces valid visually distinct PNG forecast frames',()=>{
 const name=process.env.BUIENRADAR_REAL_GIF;
 if(!name||!existsSync(name))return;
 const gif=new BuienradarGif(readFileSync(name));
 let frame,num=0,first=null,differences=0;
 while((frame=gif.nextFrame())!==null){
  if(frame.width!==320||frame.height!==320)throw Error('Unexpected GIF dimensions');
  if(num%2===0){
   const png=encodeRgbPng(frame.width,frame.height,frame.rgb);
   const d=parsePng(png),row=0;
   const px=d.raw.subarray(row*(d.w*3+1)+1,row*(d.w*3+1)+1+d.w*3);
   assert.deepEqual(px,Buffer.from(frame.rgb.subarray(0,d.w*3)));
   if(!first)first=frame.rgb;
   else if(frame.rgb.some((x,i)=>x!==first[i]))differences++;
   if(num===2)writeFileSync('/tmp/buienradar-forecast-frame.png',Buffer.from(png));
  }
  num++;
 }
 assert.ok(num>=5,'must have future images');
 assert.ok(differences>=2,'forecast frames need true source motion');
});
