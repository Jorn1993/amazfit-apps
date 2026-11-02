// GitHub public snapshot of Buienradar's official GIF, not a new radar source.
export const RADAR_CACHE_BASE =
 'https://raw.githubusercontent.com/Jorn1993/amazfit-apps/radar-cache/radar';
export function parseFrameManifest(input,now=Date.now()){
 const data=typeof input==='string'?JSON.parse(input):input;
 if(!data||data.source!=='Buienradar.nl'||
  data.product!=='RadarMapRainWebmercatorBE'||
  !Number.isInteger(data.frameCount)||data.frameCount<3||data.frameCount>12||
  !Array.isArray(data.frames)||data.frames.length!==data.frameCount)
  throw Error('Incomplete verified Buienradar animation');
 if(!data.frames.every((f,i)=>f==='frame-'+i+'.png'))
  throw Error('Unexpected radar frame name');
 const time=Date.parse(data.generatedAt);
 if(!Number.isFinite(time)||time>now+60000||now-time>55*60000)
  throw Error('Buienradar animation is outdated');
 return {ok:true,generatedAt:data.generatedAt,frameCount:data.frameCount,
  frames:data.frames,frameDelayMs:900,source:'Buienradar.nl'};
}
export function frameUrl(name){
 if(!/^frame-(?:[0-9]|1[01])\.png$/.test(name))
  throw Error('Unsupported radar filename');
 return RADAR_CACHE_BASE+'/'+name;
}
