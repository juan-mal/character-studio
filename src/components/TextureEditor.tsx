import type {TextureAdjustment} from '../types/studio.ts';
import {neutralAdjustment} from '../materials/textureAdjustments.ts';
import {ColorPicker,hairPalette} from './ColorPicker.tsx';
const eyePalette=['#4b2c20','#897345','#367452','#428fa3','#42699c','#7968a5','#9a4949'];
export function TextureEditor({label,value,disabled,onApply}:{label:string;value?:TextureAdjustment;disabled:boolean;onApply:(value:TextureAdjustment|undefined)=>void}) {
  return <ColorPicker label={label} value={value?.color} disabled={disabled} palette={/^Eyes/i.test(label)?eyePalette:hairPalette} onChange={color=>onApply(color?{...neutralAdjustment,color}:undefined)}/>;
}
