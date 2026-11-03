// Encode decoded RGB GIF frames as spec-compliant PNG images.
// PNGs are then converted by Zepp's OFFICIAL phone-side image.convert.
// Never write a homemade TGA/SOMH header to the watch.
const signature=[137,80,78,71,13,10,26,10];
const u32=(out,pos,value)=>{
 out[pos]=(value>>>24)&255;out[pos+1]=(value>>>16)&255;
 out[pos+2]=(value>>>8)&255;out[pos+3]=value&255;
};
function crc32(data,start,end){
 let crc=0xffffffff;
 for(let p=start;p<end;p++){
  crc^=data[p];
  for(let i=0;i<8;i++)
   crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}
function chunk(type,bytes){
 const data=new Uint8Array(bytes.length+12);
 u32(data,0,bytes.length);
 for(let i=0;i<4;i++)data[4+i]=type.charCodeAt(i);
 data.set(bytes,8);
 u32(data,data.length-4,crc32(data,4,data.length-4));
 return data;
}
function zlibStored(bytes){
 // RFC 1950 zlib wrapping RFC 1951 uncompressed deflate blocks.
 let size=6;for(let n=0;n<bytes.length;n+=65535)size+=5;
 size+=bytes.length;
 const out=new Uint8Array(size);
 out[0]=0x78;out[1]=0x01;let pos=2, a=1,b=0;
 for(let offset=0;offset<bytes.length;offset+=65535){
  const len=Math.min(65535,bytes.length-offset);
  out[pos++]=offset+len>=bytes.length?1:0;
  out[pos++]=len&255;out[pos++]=len>>8;
  out[pos++]=(~len)&255;out[pos++]=((~len)>>8)&255;
  out.set(bytes.subarray(offset,offset+len),pos);
  for(let j=offset;j<offset+len;j++){
   a=(a+bytes[j])%65521;b=(b+a)%65521;
  }
  pos+=len;
 }
 u32(out,pos,((b<<16)|a)>>>0);
 return out;
}
export function encodeRgbPng(width,height,input){
 if(!Number.isInteger(width)||!Number.isInteger(height)||
    width<16||height<16||width>480||height>480)
  throw Error('PNG: ongeldige afmetingen');
 const rgb=input instanceof Uint8Array?input:new Uint8Array(input);
 if(rgb.length!==width*height*3)throw Error('PNG: onjuiste afbeeldingsdata');
 const raw=new Uint8Array((width*3+1)*height);
 const stride=width*3;
 for(let y=0;y<height;y++){
  const line=y*(stride+1);
  raw[line]=0; // filter none
  raw.set(rgb.subarray(y*stride,(y+1)*stride),line+1);
 }
 const hdr=new Uint8Array(13);
 u32(hdr,0,width);u32(hdr,4,height);
 hdr[8]=8;hdr[9]=2; // 8bit RGB truecolour, Zepp converter supported.
 const ihdr=chunk('IHDR',hdr),idat=chunk('IDAT',zlibStored(raw));
 const end=chunk('IEND',new Uint8Array(0));
 const png=new Uint8Array(8+ihdr.length+idat.length+end.length);
 let pos=0;
 png.set(signature,pos);pos+=8;
 for(const part of [ihdr,idat,end]){
  png.set(part,pos);pos+=part.length;
 }
 return png.buffer;
}
