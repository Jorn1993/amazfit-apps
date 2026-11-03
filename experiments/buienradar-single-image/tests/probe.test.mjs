import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
test('One current real Buienradar Belgium PNG, not animated GIF',()=>{
 const s=read('app-side/index.js');
 assert.match(s,/image\.buienradar\.nl\/2\.0\/image\/single\/RadarMapRainBE/);
 assert.ok(!/image\/animation|buienradar\.nl\/gif|KMI|githubusercontent/.test(s));
});
test('Uses official Zepp sample-supported download convert sendFile chain',()=>{
 const s=read('app-side/index.js'),p=read('page/index.js');
 assert.match(s,/context\.download\(/);
 assert.match(s,/convertLib\.convert\(/);
 assert.match(s,/context\.sendFile\(/);
 assert.match(p,/onReceivedFile\(file\)/);
 assert.match(p,/file\.filePath/);
 assert.match(p,/src:file\.filePath/);
});
test('Distinct app ID and exactly one page, no existing app overwrite',()=>{
 const a=JSON.parse(read('app.json'));
 assert.equal(a.app.appId,991936821);
 assert.deepEqual(a.targets.balance2.module.page.pages,['page/index']);
 assert.ok(!a.targets.balance2.module['secondary-widget']);
 assert.equal(a.targets.balance2.designWidth,480);
});
test('Full-bleed 480x480 preview and independent status',()=>{
 const s=read('page/index.js');
 assert.match(s,/const SIZE=480;/);
 assert.match(s,/w:SIZE,h:SIZE,src:'baseline\.png'/);
 assert.match(s,/w:SIZE,h:SIZE,src:file\.filePath/);
 assert.match(s,/FOUT:/);
});
