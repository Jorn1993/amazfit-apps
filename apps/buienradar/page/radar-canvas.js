// Native Zepp CANVAS radar drawing from authentic GIF RGB pixels.
// The watch has a documented drawRect API but cannot display arbitrary PNGs
// generated locally. RLE + frame deltas avoid homemade TGA image headers.
export function sampleRadar(rgb,width,height,stride=3){
 if(!Number.isInteger(width)||!Number.isInteger(height)||
    width<16||height<16||width>384||height>384||
    !Number.isInteger(stride)||stride<2||stride>8)
  throw Error('Radar pixels: afmetingen ongeldig');
 const data=rgb instanceof Uint8Array?rgb:new Uint8Array(rgb);
 if(data.length!==width*height*3)throw Error('Radar pixels: RGB lengte');
 const w=Math.ceil(width/stride),h=Math.ceil(height/stride);
 const pixels=new Uint32Array(w*h);
 for(let y=0;y<h;y++){
  const py=Math.min(height-1,y*stride+Math.floor(stride/2));
  for(let x=0;x<w;x++){
   const px=Math.min(width-1,x*stride+Math.floor(stride/2));
   const i=(py*width+px)*3;
   pixels[y*w+x]=(data[i]<<16)|(data[i+1]<<8)|data[i+2];
  }
 }
 return {width:w,height:h,pixels};
}
export function radarDeltaRects(now,previous,width,height){
 if(!now||now.length!==width*height)
  throw Error('Radarpixels ongeldig');
 if(previous&&previous.length!==now.length)
  throw Error('Radarpixels hebben ongelijke afmetingen');
 const rectangles=[];let active=new Map();
 for(let y=0;y<height;y++){
  const next=new Map();
  let x=0;
  while(x<width){
   const pos=y*width+x,color=now[pos];
   if(previous&&color===previous[pos]){x++;continue;}
   const left=x++;
   while(x<width&&now[y*width+x]===color&&
         (!previous||previous[y*width+x]!==color))x++;
   const runWidth=x-left;
   const key=left+','+runWidth+','+color;
   const prevIndex=active.get(key);
   if(prevIndex!==undefined){
    rectangles[prevIndex].h++;
    next.set(key,prevIndex);
   }else{
    const index=rectangles.length;
    rectangles.push({x:left,y,w:runWidth,h:1,color});
    next.set(key,index);
   }
  }
  active=next;
 }
 return rectangles;
}
export function toCanvasRect(r,width,height,scale=480,zoom=1){
 if(!r||!width||!height)return null;
 const dim=scale*zoom,off=(scale-dim)/2;
 const x1=Math.max(0,Math.floor(off+r.x*dim/width));
 const y1=Math.max(0,Math.floor(off+r.y*dim/height));
 const x2=Math.min(scale,Math.ceil(off+(r.x+r.w)*dim/width));
 const y2=Math.min(scale,Math.ceil(off+(r.y+r.h)*dim/height));
 return x2<=x1||y2<=y1?null:{x1,y1,x2,y2,color:r.color};
}
