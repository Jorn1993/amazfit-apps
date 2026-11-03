import test from 'node:test';
import assert from 'node:assert/strict';
import {kmiDate,kmiForecastUrl,parseFutureFrames} from '../app-side/future-radar.js';

const source='https://app.meteo.be/services/appv4/?s=getIncaImage&i=202611031750&k=valid';
test('Daily token URL uses the validated KMI service',()=>{
 const d=new Date('2026-11-03T15:30:00Z');
 assert.equal(kmiDate(d),'03/11/2026');
 const url=kmiForecastUrl({lat:51.2194,lon:4.4025},d);
 assert.match(url,/^https:\/\/app\.meteo\.be\/services\/appv4\/\?s=getForecasts/);
 assert.match(url,/&k=[a-f0-9]{32}$/);
});
test('Parser keeps only the future, on-domain PNG frame URLs',()=>{
 const now=Date.parse('2026-11-03T15:30:00Z');
 const frames=Array.from({length:24},(_,i)=>({
  time:new Date(now+(i-3)*600000).toISOString(),uri:source
 }));
 frames[5].uri='https://untrusted.example/evil';
 const chosen=parseFutureFrames({animation:[{sequence:frames}]},now);
 assert.ok(chosen.length>=3&&chosen.length<=9);
 assert.ok(chosen.every(f=>f.validAt>now&&f.uri.startsWith('https://app.meteo.be/')));
 assert.ok(chosen.every((f,i)=>i===0||f.validAt>chosen[i-1].validAt));
});
test('Expired or missing future frames produce no fake radar',()=>{
 const now=Date.now();
 assert.throws(()=>parseFutureFrames({animation:[{sequence:[]}]},now));
 assert.throws(()=>parseFutureFrames({animation:[{
  sequence:Array.from({length:4},(_,i)=>({
   time:new Date(now-(i+1)*600000).toISOString(),uri:source
  }))
 }]},now));
});
