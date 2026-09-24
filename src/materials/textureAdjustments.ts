import {Color,SRGBColorSpace} from 'three';
import type {TextureAdjustment} from '../types/studio.ts';
import type {ImagePixels} from './pngPixels.ts';
export const neutralAdjustment:TextureAdjustment={hue:0,saturation:1,lightness:0};
function rgbHsl(r:number,g:number,b:number,out:{h:number;s:number;l:number}):void {
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  out.l=(max+min)/2;out.s=d===0?0:d/(1-Math.abs(2*out.l-1));
  out.h=d===0?0:((max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)/6);
}
function writeHsl(data:Uint8ClampedArray,i:number,h:number,s:number,l:number):void {
  const a=s*Math.min(l,1-l);
  for(let channel=0;channel<3;channel++){const k=([0,8,4][channel]!+h*12)%12;data[i+channel]=(l-a*Math.max(-1,Math.min(k-3,9-k,1)))*255;}
}
export function validAdjustment(value:unknown):value is TextureAdjustment {
  if(!value || typeof value!=='object')return false;
  const v=value as Record<string,unknown>;
  return [['hue',-180,180],['saturation',0,2],['lightness',-0.5,0.5]].every(([key,min,max])=>typeof v[key as string]==='number' && Number.isFinite(v[key as string]) && (v[key as string] as number)>=(min as number) && (v[key as string] as number)<=(max as number)) && (v.color===undefined || typeof v.color==='string' && /^#[\da-f]{6}$/i.test(v.color));
}
/** Source is immutable. Alpha, shading and fine lines survive edits; no shared material mutation. */
export function adjustPixels(source:ImagePixels,edit:TextureAdjustment,skin?:{reference:string;target:string;regions?:number[][]},visible?:{lightness:number;preserveNeutral:boolean}):ImagePixels {
  const data=new Uint8ClampedArray(source.data),hsl={h:0,s:0,l:0};
  const target=edit.color?new Color(edit.color).getHSL({h:0,s:0,l:0},SRGBColorSpace):undefined;
  const skinSource=skin?new Color(skin.reference).getHSL({h:0,s:0,l:0},SRGBColorSpace):undefined;
  const skinTarget=skin?new Color(skin.target).getHSL({h:0,s:0,l:0},SRGBColorSpace):undefined;
  let average=0,count=0;
  if(target)for(let i=0;i<data.length;i+=64){average+=(Math.max(data[i]!,data[i+1]!,data[i+2]!)+Math.min(data[i]!,data[i+1]!,data[i+2]!))/510;count++;}
  average=Math.max(0.05,average/Math.max(1,count));
  if(visible)average=Math.max(0.05,visible.lightness);
  const general=Boolean(target)||edit.hue!==0||edit.saturation!==1||edit.lightness!==0;
  for(let i=0;i<data.length;i+=4){
    const u=(i/4%source.width)/source.width,v=Math.floor(i/4/source.width)/source.height;
    const inSkin=Boolean(skinSource && skinTarget && (!skin?.regions || skin.regions.some(r=>u>=r[0]! && v>=r[1]! && u<=r[2]! && v<=r[3]!)));
    if(!general&&!inSkin)continue;
    rgbHsl(data[i]!/255,data[i+1]!/255,data[i+2]!/255,hsl);
    let {h,s,l}=hsl,changed=general;
    if(inSkin && skinSource && skinTarget){
      const distance=Math.min(Math.abs(h-skinSource.h),1-Math.abs(h-skinSource.h));
      const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
      const weight=(1-smooth(.045,.12,distance))*smooth(.015,.12,s)*smooth(.18,.42,l);
      if(weight>0){
        const shift=((skinTarget.h-skinSource.h+1.5)%1)-.5;
        h=(h+shift*weight+1)%1;
        s=Math.min(1,s+weight*(skinTarget.s-s));
        l=Math.min(.98,l*(1+weight*(skinTarget.l/Math.max(.1,skinSource.l)-1)));changed=true;
      }
    }
    if(!changed)continue;
    if(target && !(visible?.preserveNeutral && (s<0.08 || l>0.94 || l<0.08))){h=target.h;s=target.s;l=Math.min(0.98,l*target.l/average);}
    h=(h+edit.hue/360+1)%1;s=Math.max(0,Math.min(1,s*edit.saturation));l=Math.max(0,Math.min(1,l+edit.lightness));
    writeHsl(data,i,h,s,l);
  }
  return {...source,data};
}
