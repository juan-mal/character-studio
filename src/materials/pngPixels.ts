export interface ImagePixels {width:number;height:number;data:Uint8ClampedArray}
/** Decode RGB before browser premultiplication can discard colors under zero alpha. */
export async function decodePng(bytes:ArrayBuffer):Promise<ImagePixels> {
  const view=new DataView(bytes), raw=new Uint8Array(bytes);
  if(view.getUint32(0)!==0x89504e47)throw new Error('El editor requiere una textura PNG.');
  const width=view.getUint32(16),height=view.getUint32(20),type=raw[25];
  if(raw[24]!==8 || ![2,6].includes(type!) || raw[28]!==0 || width*height>16_777_216)throw new Error('Este formato PNG requiere preparación antes de editarse.');
  const chunks:Uint8Array[]=[];
  for(let i=8;i+12<=bytes.byteLength;){const length=view.getUint32(i);if(i+12+length>bytes.byteLength)throw new Error('PNG incompleto.');if(view.getUint32(i+4)===0x49444154)chunks.push(raw.slice(i+8,i+8+length));i+=12+length;}
  const compressed=new Uint8Array(chunks.reduce((sum,c)=>sum+c.length,0));let offset=0;
  for(const chunk of chunks){compressed.set(chunk,offset);offset+=chunk.length;}
  const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
  const unpacked=new Uint8Array(await new Response(stream).arrayBuffer());
  const channels=type===6?4:3,stride=width*channels,rows=new Uint8Array(stride*height);
  if(unpacked.length!==(stride+1)*height)throw new Error('Datos PNG incompletos.');
  const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){
    const filter=unpacked[y*(stride+1)]!;if(filter>4)throw new Error('Filtro PNG no válido.');
    for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?rows[i-channels]!:0,b=y?rows[i-stride]!:0,c=y&&x>=channels?rows[i-stride-channels]!:0;
      rows[i]=(unpacked[y*(stride+1)+1+x]!+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter]!)&255;
    }
  }
  const data=new Uint8ClampedArray(width*height*4);
  for(let p=0;p<width*height;p++){data[p*4]=rows[p*channels]!;data[p*4+1]=rows[p*channels+1]!;data[p*4+2]=rows[p*channels+2]!;data[p*4+3]=channels===4?rows[p*channels+3]!:255;}
  return {width,height,data};
}
