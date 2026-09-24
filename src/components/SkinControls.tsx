import {ColorPicker} from './ColorPicker.tsx';
const skinPalette=['#ffe9d1','#e6b58e','#b87851','#714831'];
export function SkinControls({value,disabled,onApply}:{value?:string;disabled:boolean;onApply:(color:string|undefined)=>void}) {
  return <section className="material-section"><h3>Piel</h3><p className="texture-editor__hint">Rostro y zonas de piel preparadas del cuerpo.</p><ColorPicker label="piel" value={value} disabled={disabled} palette={skinPalette} onChange={onApply}/></section>;
}
