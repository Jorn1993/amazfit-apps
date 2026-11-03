import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {BuienradarGif} from '../page/gif-decoder.js';
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
test('Bad/corrupted GIF input is rejected, not silently rendered',()=>{
 assert.throws(()=>new BuienradarGif(Uint8Array.from([1,2,3,4,5,6,7])));
 const truncated=fixture.slice(0,fixture.length-20);
 const dec=new BuienradarGif(truncated);
 assert.throws(()=>{for(let i=0;i<8;i++)dec.nextFrame();});
});
test('Real Buienradar GIF supplies moving RGB frames without homemade TGA',()=>{
 const file=process.env.BUIENRADAR_REAL_GIF;
 if(!file||!existsSync(file))return;
 const gif=new BuienradarGif(readFileSync(file));
 let num=0,changed=0,first=null,frame;
 while((frame=gif.nextFrame())!==null){
  assert.equal(frame.rgb.byteLength,frame.width*frame.height*3);
  if(!first)first=frame.rgb;
  else if(frame.rgb.some((x,i)=>x!==first[i]))changed++;
  num++;
 }
 assert.ok(num>=3&&num<=24);
 assert.ok(changed>=2);
});
