import test from 'node:test';
import assert from 'node:assert/strict';
import {distanceKm,nearestStation,nextHourRain,RADAR_BE} from '../app-side/weather.js';
const loc={lat:51.22,lon:4.4};
test('Official radar endpoint is static-image Belgian variant, not a placeholder',()=>{
 assert.match(RADAR_BE,/image\.buienradar\.nl\/2\.0\/image\/single\/RadarMapRainWebmercatorBE/);
 assert.match(RADAR_BE,/width=320/);
});
test('Next-hour forecast is derived only from first 12 real 5-minute buckets',()=>{
 assert.equal(nextHourRain(Array.from({length:24},()=>({mmh:1}))),1);
 assert.equal(nextHourRain([{mmh:1}]),null);
});
test('Nearest station named and distance labelled, absent when unreasonably far',()=>{
 const feed={actual:{stationmeasurements:[
  {lat:51.25,lon:4.41,stationname:'Local',temperature:17,winddirection:'W',
   windspeed:4,windgusts:10},
  {lat:52.2,lon:5,stationname:'Further',temperature:14}
 ]}};
 const s=nearestStation(feed,loc);
 assert.equal(s.station,'Local');
 assert.equal(s.temperature,17);
 assert.equal(s.windKmh,14.4);
 assert.equal(s.gustKmh,36);
 assert.ok(s.distanceKm<10);
 assert.equal(nearestStation(feed,{lat:49,lon:7.9}),null);
 assert.ok(distanceKm(51,4,52,4)>100);
});
test('No synthetic station details for malformed official feed',()=>{
 assert.equal(nearestStation({},loc),null);
 assert.equal(nearestStation({actual:{stationmeasurements:[]}},loc),null);
});
