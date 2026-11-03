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
   const min=r.byte(),codes=lzw(r.blocks(),min,w*h);
   const gce=this.gce;
   const snapshot=gce.disposal===3?this.pixels.slice():null;
   let row=0;
   const drawRow=(destY)=>{
    for(let col=0;col<w;col++){
     const index=codes[row*w+col];
     if(index===gce.transparent)continue;
     const color=index*3;
     if(color+2>=palette.length)fail('paletteindex onjuist');
     const dest=((y+destY)*this.width+x+col)*3;
     this.pixels[dest]=palette[color];
     this.pixels[dest+1]=palette[color+1];
     this.pixels[dest+2]=palette[color+2];
    }
    row++;
   };
   if(packed&0x40){
    for(const [start,step] of [[0,8],[4,8],[2,4],[1,2]])
     for(let destY=start;destY<h;destY+=step)drawRow(destY);
   }else for(let destY=0;destY<h;destY++)drawRow(destY);
   this.prior={x,y,w,h,disposal:gce.disposal,snapshot};
   this.gce={transparent:-1,disposal:0,delay:1000};
   if(++this.count>24)fail('te veel frames');
   return {width:this.width,height:this.height,
    rgb:this.pixels.slice(),delay:gce.delay};
  }
 }
}
