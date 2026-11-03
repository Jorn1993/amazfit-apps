import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {BuienradarGif,toZeppImage} from '../page/gif-decoder.js';
const fixture=Buffer.from('R0lGODlhIAAgAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQIZAAAACwAAAAAIAAgAAAIUwADCBxIsKDBgwgTKlzIsKHDhwgBSJxIEQDEghUzXiSYseLGgR0pfhQYcuLIACUlnkxpcSTLlSlhlpQZ8qTNmzhz6tzJs6fPn0CDCh1KtKhRoQEBACH5BAhkAAAALAAAAAAgACAAgQCAAAAAAAAAAAAAAAhTAAMIHEiwoMGDCBMqXMiwocOHDgFInEgRAMSCFTNeJJix4saBHSl+FBhy4sgAJSWeTGlxJMuVKWGWlBnypM2bOHPq3Mmzp8+fQIMKHUq0qFGeAQEAIfkECGQAAAAsAAAAACAAIACBAAD/AAAAAAAAAAAACFMAAwgcSLCgwYMIEypcyLChw4cQCQKYSLEigIgSLVrEOFDjRo4BPFYEGVLkRJImT4JMeXFlSpQvXZqEOZOkzZs4c+rcybOnz59AgwodSrSoUZIBAQA7','base64');
const rgb=(f,x,y)=>{
 const i=(y*f.width+x)*3;return [...f.rgb.slice(i,i+3)];
};
test('Decodes each moving frame of a real three-frame GIF, including disposal',()=>{
 const gif=new BuienradarGif(fixture);
 assert.equal(gif.width,32);assert.equal(gif.height,32);
 const one=gif.nextFrame(),two=gif.nextFrame(),three=gif.nextFrame();
 assert.deepEqual(rgb(one,5,5),[255,0,0]);
 assert.deepEqual(rgb(two,12,5),[0,128,0]);
 assert.deepEqual(rgb(three,18,5),[0,0,255]);
 assert.notDeepEqual(rgb(one,5,5),rgb(two,5,5));
 assert.equal(gif.nextFrame(),null);
});
test('Native 8-bit Zepp TGA has SOMH header, full palette and screen pixels',()=>{
 const gif=new BuienradarGif(fixture);
 const f=gif.nextFrame();
 const out=new Uint8Array(toZeppImage(f.width,f.height,f.rgb));
 assert.equal(out[0],46);assert.equal(out[1],1);
 assert.equal(out[2],1);assert.equal(out[16],8);assert.equal(out[17],32);
 assert.equal(String.fromCharCode(...out.slice(18,22)),'SOMH');
 assert.equal(out.length,70+1024+32*32);
 assert.notEqual(out[70+1024+5*32+5],out[70+1024+5*32+20]);
});
test('Bad/corrupted GIF input is rejected, not silently rendered',()=>{
 assert.throws(()=>new BuienradarGif(Uint8Array.from([1,2,3,4,5,6,7])));
 const truncated=fixture.slice(0,fixture.length-20);
 const dec=new BuienradarGif(truncated);
 assert.throws(()=>{for(let i=0;i<8;i++)dec.nextFrame();});
});
test('Real current Buienradar forecast GIF can be decoded into distinct native images',()=>{
 const file=process.env.BUIENRADAR_REAL_GIF;
 if(!file||!existsSync(file))return;
 const gif=new BuienradarGif(readFileSync(file));
 const imgs=[];
 let frame;
 while((frame=gif.nextFrame())!==null){
  const image=toZeppImage(frame.width,frame.height,frame.rgb);
  imgs.push(new Uint8Array(image));
 }
 assert.ok(imgs.length>=3&&imgs.length<=24,'must contain moving forecast frames');
 assert.ok(imgs.some((f,i)=>i&&Buffer.compare(f,imgs[0])!==0),'frames must not all be identical');
 writeFileSync('/tmp/buienradar-native-frame.png',imgs[Math.floor(imgs.length/2)]);
});
