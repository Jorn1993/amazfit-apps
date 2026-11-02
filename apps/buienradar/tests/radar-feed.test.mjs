import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFrameManifest,frameUrl} from '../app-side/radar-feed.js';
const base={source:'Buienradar.nl',product:'RadarMapRainWebmercatorBE',
 generatedAt:new Date().toISOString(),frameCount:6,
 frames:Array.from({length:6},(_,i)=>'frame-'+i+'.png')};
test('Only verified, current official Buienradar frame manifests are accepted',()=>{
 assert.equal(parseFrameManifest(base).frameCount,6);
 assert.throws(()=>parseFrameManifest({...base,source:'Unknown'}));
 assert.throws(()=>parseFrameManifest({...base,frames:['../../secrets']}));
 assert.throws(()=>parseFrameManifest({...base,generatedAt:'2020-01-01T00:00:00Z'}));
});
test('Frame URL does not allow escaping the verified cache',()=>{
 assert.match(frameUrl('frame-0.png'),/radar-cache\/radar\/frame-0.png/);
 assert.throws(()=>frameUrl('../secrets'));
});
