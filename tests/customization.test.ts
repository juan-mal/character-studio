import assert from 'node:assert/strict';
import test from 'node:test';
import {deflateSync} from 'node:zlib';
import {decodePng} from '../src/materials/pngPixels.ts';
import {adjustPixels,neutralAdjustment,validAdjustment} from '../src/materials/textureAdjustments.ts';
import {neckDistance} from '../tools/assets/headMixes.ts';
function png(filter:number){
 const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 const chunk=(name:string,data:Buffer)=>{const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length);b.write(name,4);data.copy(b,8);return b;};
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([filter,220,100,40,0]))),chunk('IEND',Buffer.alloc(0))]);
 return Uint8Array.from(bytes).buffer;
}
test('PNG decoding retains original RGB under zero alpha for all PNG filters',async()=>{
 for(let filter=0;filter<=4;filter++){const result=await decodePng(png(filter));assert.deepEqual([...result.data],[220,100,40,0]);}
 await assert.rejects(decodePng(png(5)),/Filtro/);
 await assert.rejects(decodePng(new ArrayBuffer(0)));
});
test('texture editing preserves source and alpha, rotates hue and leaves neutral iris highlights',()=>{
 const source={width:2,height:1,data:new Uint8ClampedArray([220,40,40,180,255,255,255,255])};
 const edited=adjustPixels(source,{...neutralAdjustment,hue:120});
 assert.ok(edited.data[1]!>edited.data[0]!);assert.equal(edited.data[3],180);
 assert.equal(source.data[0],220);
 const colorized=adjustPixels(source,{...neutralAdjustment,color:'#2266cc'},undefined,{lightness:.5,preserveNeutral:true});
 assert.ok(colorized.data[2]!>colorized.data[0]!);assert.deepEqual([...colorized.data.slice(4)],[255,255,255,255]);
 assert.deepEqual(adjustPixels(source,neutralAdjustment).data,source.data);
});
test('skin correction only touches the reviewed atlas region and rejects malformed edits',()=>{
 const source={width:2,height:1,data:new Uint8ClampedArray([255,233,209,255,255,233,209,255])};
 const edited=adjustPixels(source,neutralAdjustment,{reference:'#ffe9d1',target:'#bd8465',regions:[[0,0,.25,1]]});
 assert.notEqual(edited.data[0],source.data[0]);assert.deepEqual(edited.data.slice(4),source.data.slice(4));
 for(const invalid of [null,{hue:NaN,saturation:1,lightness:0},{hue:181,saturation:1,lightness:0},{...neutralAdjustment,color:'red'}])assert.equal(validAdjustment(invalid),false);
});
test('neck validation detects displaced surfaces even when vertex counts match',()=>{
 assert.equal(neckDistance([[0,0,0],[1,0,0]],[[0,0,0],[1,0,0]]),0);
 assert.equal(neckDistance([[0,0,0],[1,0,0]],[[0,0,.1],[1,0,.1]]),.1);
});
