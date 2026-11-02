import test from 'node:test';
import assert from 'node:assert/strict';
import {intensity,parseRaintext,describe,normalLocation} from '../app-side/rain.js';
const make=(values,start=600)=>{
 return values.map((v,i)=>{
   const t=(start+i*5)%1440;
   return String(v).padStart(3,'0')+'|'+String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
 }).join('\n');
};
test('Converts Buienradar data to millimetres per hour',()=>{
 assert.equal(intensity(0),0);
 assert.equal(intensity(109),1);
 assert.throws(()=>intensity(300));
});
test('Parses 24 five-minute buckets and midnight rollover',()=>{
 const p=parseRaintext(make(Array(24).fill(0),23*60+15));
 assert.equal(p.length,24);
 assert.equal(p[9].time,'00:00');
 assert.equal(describe(p).headline,'HET BLIJFT DROOG');
});
test('Detects rain and onset without forecasting imaginary values',()=>{
 const wet=Array(24).fill(0);
 wet[4]=109;wet[5]=109;
 let result=describe(parseRaintext(make(wet)));
 assert.equal(result.headline,'REGEN OP KOMST');
 assert.equal(result.etaMinutes,20);
 assert.equal(result.totalMm,0.17);
 wet.fill(109);
 result=describe(parseRaintext(make(wet)));
 assert.equal(result.headline,'HET REGENT');
 assert.match(result.detail,/geen droge periode/);
});
test('Rejects truncated, malformed, or irregular responses',()=>{
 assert.throws(()=>parseRaintext('000|12:00'));
 assert.throws(()=>parseRaintext(make(Array(24).fill(0)).replace('10:05','10:06')));
 assert.throws(()=>parseRaintext(make(Array(24).fill(0)).replace('000|10:00','999|10:00')));
});
test('Coordinates are verified and rounded before network calls',()=>{
 assert.deepEqual(normalLocation({name:'Gent',lat:51.0543,lon:3.7174}),
  {name:'Gent',lat:51.0543,lon:3.7174});
 assert.throws(()=>normalLocation({name:'Outside',lat:0,lon:0}));
});
