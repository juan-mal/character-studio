import {useEffect,useRef,useState} from 'react';
interface EyeDropperResult {sRGBHex:string}
interface EyeDropperConstructor {new():{open():Promise<EyeDropperResult>}}
export const hairPalette=['#191818','#3b2a22','#71503a','#a07d56','#d4bc83','#a05035','#d9dad6'];
const colorNames=['Negro','Castaño oscuro','Castaño','Castaño claro','Rubio','Cobrizo','Plata'];

/** Coalesce native color input events; retain the last value while a texture is loading. */
export function ColorPicker({label,value,palette=hairPalette,disabled,onChange}:{label:string;value?:string;palette?:string[];disabled:boolean;onChange:(color:string|undefined)=>void}) {
  const input=useRef<HTMLInputElement>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const current=useRef({disabled,onChange});
  const [message,setMessage]=useState('');
  useEffect(()=>{current.current={disabled,onChange};},[disabled,onChange]);
  useEffect(()=>{if(input.current)input.current.value=value??'#bda58a';},[value]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  function choose(color:string|undefined,delay=0){
    if(input.current && color)input.current.value=color;
    clearTimeout(timer.current);
    const commit=()=>{if(current.current.disabled){timer.current=setTimeout(commit,100);return;}current.current.onChange(color);};
    timer.current=setTimeout(commit,delay);
  }
  const Dropper=(window as Window & {EyeDropper?:EyeDropperConstructor}).EyeDropper;
  async function sample(){
    if(!Dropper)return;
    try{const result=await new Dropper().open();choose(result.sRGBHex);setMessage('');}
    catch(error){if(!(error instanceof DOMException && error.name==='AbortError'))setMessage('No se pudo tomar el color. Usa el selector.');}
  }
  return <div className="texture-editor">
    <div className="color-palette">{palette.map((color,index)=><button key={color} className="color-swatch" style={{backgroundColor:color}} disabled={disabled} aria-label={`${label}: ${palette===hairPalette?colorNames[index]:color}`} aria-pressed={value===color} onClick={()=>choose(color)}/>)}</div>
    <label className="texture-editor__color">Personalizado
      <input ref={input} type="color" aria-label={`Color de ${label}`} defaultValue={value??'#bda58a'} disabled={disabled} onChange={event=>choose(event.currentTarget.value,250)}/>
    </label>
    <div className="texture-editor__actions">
      {Dropper && <button className="button button--outline" disabled={disabled} aria-label={`Tomar color de pantalla para ${label}`} onClick={()=>void sample()}>⌾ Tomar color</button>}
      <button className="button button--ghost" disabled={disabled} onClick={()=>choose(undefined)}>Original</button>
    </div>
    <p className="texture-editor__hint">Los cambios se aplican automáticamente.</p>
    {message && <p role="status">{message}</p>}
  </div>;
}
