// A GIF89a decoder for the Zepp OS device runtime.
// Keeps the animated Buienradar forecast inside one native Zepp mini-app.
// Frames are decoded directly on the watch; no proxy or runtime GitHub cache.
const fail=message=>{throw Error('Buienradar GIF: '+message);};
class Reader{
 constructor(input){
  this.b=input instanceof Uint8Array?input:new Uint8Array(input);
  this.p=0;
 }
 byte(){if(this.p>=this.b.length)fail('onvolledig bestand');return this.b[this.p++];}
 word(){const low=this.byte();return low|(this.byte()<<8);}
 skip(n){if(this.p+n>this.b.length)fail('afgebroken blok');this.p+=n;}
 table(length){
  if(this.p+length*3>this.b.length)fail('kleurtabel afgebroken');
  const result=this.b.subarray(this.p,this.p+length*3);
  this.p+=length*3;return result;
 }
 blocks(){
  const chunks=[];let size=0;
  for(;;){
   const n=this.byte();if(!n)break;
   if(size+n>2*1024*1024)fail('afbeelding te groot');
   const start=this.p;this.skip(n);
   chunks.push(this.b.subarray(start,start+n));size+=n;
  }
  const out=new Uint8Array(size);let pos=0;
  for(const chunk of chunks){out.set(chunk,pos);pos+=chunk.length;}
  return out;
 }
}
function lzw(data,minCodeSize,expected){
 if(minCodeSize<2||minCodeSize>8)fail('ongeldige LZW');
 const clear=1<<minCodeSize,end=clear+1;
 const prefix=new Int16Array(4096),suffix=new Uint8Array(4096);
 const stack=new Uint8Array(4097),out=new Uint8Array(expected);
 let bit=0,next=end+1,bits=minCodeSize+1,old=-1,first=0,pos=0;
 function readCode(){
  if(bit+bits>data.length*8)return -1;
  const byte=bit>>3,shift=bit&7;
  let value=(data[byte]||0)|((data[byte+1]||0)<<8)|((data[byte+2]||0)<<16);
  value=(value>>>shift)&((1<<bits)-1);bit+=bits;return value;
 }
 let guard=0;
 while(guard++<expected*5+4096){
  let code=readCode();
  if(code===-1||code===end)break;
  if(code===clear){bits=minCodeSize+1;next=end+1;old=-1;continue;}
  if(code>next||code>=4096)fail('ongeldige LZW-code');
  if(old<0){
   if(code>=clear)fail('ongeldige eerste code');
   if(pos>=expected)fail('extra beelddata');
   out[pos++]=code;first=code;old=code;continue;
  }
  const incoming=code;
  let sp=0;
  if(code===next){stack[sp++]=first;code=old;}
  while(code>=clear){
   if(code>=next||sp>=4096)fail('LZW-verwijzing ongeldig');
   stack[sp++]=suffix[code];code=prefix[code];
  }
  first=code;stack[sp++]=first;
  while(sp){if(pos>=expected)fail('extra beelddata');out[pos++]=stack[--sp];}
  if(next<4096){
   prefix[next]=old;suffix[next]=first;next++;
   if(next===(1<<bits)&&bits<12)bits++;
  }
  old=incoming;
 }
 if(pos!==expected)fail('beelddata onvolledig');
 return out;
}
export class BuienradarGif{
 constructor(input){
  const r=this.r=new Reader(input);
  const sig=String.fromCharCode(...[r.byte(),r.byte(),r.byte(),r.byte(),r.byte(),r.byte()]);
  if(sig!=='GIF89a'&&sig!=='GIF87a')fail('geen GIF');
  this.width=r.word();this.height=r.word();
  if(this.width<16||this.height<16||this.width>384||this.height>384)
   fail('kaartafmetingen onjuist');
  const packed=r.byte(),bg=r.byte();r.byte(); // aspect ratio
  this.global=packed&0x80?r.table(1<<((packed&7)+1)):null;
  const color=(this.global&&bg*3+2<this.global.length)?
   [this.global[bg*3],this.global[bg*3+1],this.global[bg*3+2]]:[0,0,0];
  this.background=color;
  this.pixels=new Uint8Array(this.width*this.height*3);
  for(let i=0;i<this.pixels.length;i+=3){
   this.pixels[i]=color[0];this.pixels[i+1]=color[1];this.pixels[i+2]=color[2];
  }
  this.gce={transparent:-1,disposal:0,delay:1000};
  this.prior=null;this.count=0;
 }
 restore(){
  const p=this.prior;if(!p)return;
  if(p.disposal===3&&p.snapshot){this.pixels.set(p.snapshot);}
  else if(p.disposal===2){
   const [r,g,b]=this.background;
   for(let y=p.y;y<p.y+p.h;y++)for(let x=p.x;x<p.x+p.w;x++){
    const j=(y*this.width+x)*3;
    this.pixels[j]=r;this.pixels[j+1]=g;this.pixels[j+2]=b;
   }
  }
  this.prior=null;
 }
 nextFrame(){
  const r=this.r;
  for(;;){
   if(r.p>=r.b.length)return null;
   const type=r.byte();
   if(type===0x3b)return null;
   if(type===0x21){
    const ext=r.byte();
    if(ext===0xf9){
     if(r.byte()!==4)fail('grafisch blok');
     const packed=r.byte(),delay=r.word(),transparent=r.byte();
     if(r.byte()!==0)fail('grafisch blok');
     this.gce={transparent:packed&1?transparent:-1,
      disposal:(packed>>2)&7,delay:Math.max(150,delay*10)};
    }else r.blocks();
    continue;
   }
   if(type!==0x2c)fail('onbekend GIF-blok');
   this.restore();
   const x=r.word(),y=r.word(),w=r.word(),h=r.word(),packed=r.byte();
   if(!w||!h||x+w>this.width||y+h>this.height)fail('frame buiten kaart');
   const palette=packed&0x80?r.table(1<<((packed&7)+1)):this.global;
   if(!palette)fail('kleuren ontbreken');
   const codes=lzw(r.blocks(),r.byte?.name==='unreachable'?0:0,w*h);
   // Replaced below with correct stream ordering.
   return {x,y,w,h,packed,palette,codes};
  }
 }
}
// Encode the composite using Zepp's native indexed TGA/SOMH envelope,
// not a PNG that the watch IMG widget cannot decode directly.
export function toZeppImage(width,height,rgb){
 if(width*height*3!==rgb.length)fail('kleurlengte ongeldig');
 if(width%16||height%16)fail('beeldformaat moet per 16 pixels passen');
 const header=70,paletteBytes=256*4,total=header+paletteBytes+width*height;
 const out=new Uint8Array(total);
 out[0]=0x2e;out[1]=0x01;out[2]=0x01;
 out[6]=0x01;out[7]=0x20;out[12]=width&255;out[13]=width>>8;
 out[14]=height&255;out[15]=height>>8;out[16]=8;out[17]=0x20;
 out[18]=0x53;out[19]=0x4f;out[20]=0x4d;out[21]=0x48;
 out[22]=width&255;out[23]=height&255;
 const colors=new Map();let exact=true;
 for(let i=0;i<rgb.length;i+=3){
  const color=(rgb[i]<<16)|(rgb[i+1]<<8)|rgb[i+2];
  if(!colors.has(color)){if(colors.size===256){exact=false;break;}
   colors.set(color,colors.size);}
 }
 if(exact){
  for(const [key,n] of colors){
   const j=header+n*4;
   out[j]=key&255;out[j+1]=(key>>8)&255;out[j+2]=(key>>16)&255;out[j+3]=255;
  }
  for(let i=0;i<width*height;i++){
   const j=i*3;
   out[header+paletteBytes+i]=colors.get((rgb[j]<<16)|(rgb[j+1]<<8)|rgb[j+2]);
  }
 }else{
  for(let i=0;i<256;i++){
   const j=header+i*4;
   out[j]=Math.round((i&3)*255/3);
   out[j+1]=Math.round(((i>>2)&7)*255/7);
   out[j+2]=Math.round(((i>>5)&7)*255/7);
   out[j+3]=255;
  }
  for(let i=0;i<width*height;i++){
   const j=i*3;
   out[header+paletteBytes+i]=(rgb[j]&0xe0)|((rgb[j+1]>>3)&0x1c)|(rgb[j+2]>>6);
  }
 }
 return out.buffer;
}
