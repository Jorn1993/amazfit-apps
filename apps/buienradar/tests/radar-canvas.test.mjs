import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleRadar,radarDeltaRects,toCanvasRect} from '../page/radar-canvas.js';

function makeRgb(w,h,fn){
 const a=new Uint8Array(w*h*3);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const [r,g,b]=fn(x,y);
  const i=(y*w+x)*3;a[i]=r;a[i+1]=g;a[i+2]=b;
 }
 return a;
}
function paint(target,rectangles,w,h){
 for(const run of rectangles)
  for(let y=run.y;y<run.y+run.h;y++)
   for(let x=run.x;x<run.x+run.w;x++)
    target[y*w+x]=run.color;
}
test('Downsampled Buienradar RGB retains correct green, blue and rain colours',()=>{
 const rgb=makeRgb(18,18,(x,y)=>x<6?[12,43,217]:
  x<12?[0,194,12]:[255,y*8,63]);
 const a=sampleRadar(rgb,18,18,3);
 assert.equal(a.width,6);assert.equal(a.height,6);
 assert.equal(a.pixels[0],0x0c2bd9);
 assert.equal(a.pixels[2],0x00c20c);
 assert.equal(a.pixels[5],0xff083f);
});
test('Full Canvas RLE reconstructs exact sampled frame without any guessed native image format',()=>{
 const rgb=makeRgb(24,18,(x,y)=>x<9?[33,99,12]:
  y<9?[12,99,181]:[218,1,12]);
 const a=sampleRadar(rgb,24,18,3);
 const runs=radarDeltaRects(a.pixels,null,a.width,a.height);
 const restored=new Uint32Array(a.pixels.length);
 paint(restored,runs,a.width,a.height);
 assert.deepEqual(restored,a.pixels);
 assert.ok(runs.length<a.pixels.length);
});
test('Animation delta updates only changed pixels while preserving unchanged geography',()=>{
 const frame1=sampleRadar(makeRgb(24,18,()=>[0,190,0]),24,18,3);
 const frame2=sampleRadar(makeRgb(24,18,(x,y)=>
  x>=9&&x<18&&y>=6&&y<12?[30,63,220]:[0,190,0]),24,18,3);
 const full=radarDeltaRects(frame1.pixels,null,frame1.width,frame1.height);
 const delta=radarDeltaRects(frame2.pixels,frame1.pixels,frame1.width,frame1.height);
 assert.ok(delta.length>0);
 assert.ok(delta.length<=full.length+2);
 const screen=new Uint32Array(frame1.width*frame1.height);
 paint(screen,full,frame1.width,frame1.height);
 paint(screen,delta,frame1.width,frame1.height);
 assert.deepEqual(screen,frame2.pixels);
 const back=radarDeltaRects(frame1.pixels,frame2.pixels,frame1.width,frame1.height);
 paint(screen,back,frame1.width,frame1.height);
 assert.deepEqual(screen,frame1.pixels);
});
test('Canvas geometry fits the 480×480 round watch and zooms safely',()=>{
 const full=toCanvasRect({x:0,y:0,w:80,h:80,color:0x55aa33},80,80,480,1);
 assert.deepEqual(full,{x1:0,y1:0,x2:480,y2:480,color:0x55aa33});
 const zoomed=toCanvasRect({x:20,y:20,w:40,h:40,color:1},80,80,480,1.5);
 assert.ok(zoomed.x1>=0&&zoomed.y1>=0);
 assert.ok(zoomed.x2<=480&&zoomed.y2<=480);
});
test('RGB validation rejects corrupted frames',()=>{
 assert.throws(()=>sampleRadar(new Uint8Array(100),320,320,3),/RGB lengte/);
 assert.throws(()=>radarDeltaRects(new Uint32Array(2),null,80,80),/ongeldig/);
});
