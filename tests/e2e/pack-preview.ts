import { CharacterScene } from '../../src/three/CharacterScene.ts';
import type { StudioData, CharacterConfiguration } from '../../src/types/studio.ts';
let active: CharacterScene | undefined;
export async function previewPack(name: string, variant = 'Default', overrides:Partial<Record<'body'|'hair'|'face'|'eyes'|'brows',string>> = {}) {
 active?.dispose();document.getElementById('pack-preview')?.remove();
 const data = await (await fetch('/studio-data.json')).json() as StudioData;
 const selected=data.assets.filter(a=>['body','hair','face','eyes','brows'].includes(a.category) && a.mesh.relativePath.startsWith(`content/characters/${overrides[a.category as keyof typeof overrides]??`${name}-${variant}`}/`));
 const config:CharacterConfiguration={version:1,presetId:'inspection',archetype:'Girl',selections:{},accessories:[],textureVariants:{},colors:{},morphs:{}};
 for(const asset of selected){
  if(!['body','hair','face','eyes','brows'].includes(asset.category))continue;
  config.selections[asset.category as 'body'|'hair'|'face'|'eyes'|'brows']=asset.id;
  asset.metadata.shading='anime-static';asset.metadata.renderSide='double';
  const texture=asset.textureVariants.find(v=>v.confidence==='confirmed'&&!v.requiresVisualValidation);
  if(!texture)throw new Error('Missing texture '+asset.name);
  config.textureVariants[asset.id]=texture.id;
 }
 const container=document.createElement('div');container.id='pack-preview';Object.assign(container.style,{position:'fixed',inset:'0',zIndex:'99999',background:'#f7f7f5'});document.body.append(container);
 active=new CharacterScene(container,{data});await active.setConfiguration(config);
 await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 return selected.map(a=>({name:a.name,bounds:a.mesh.geometry.bounds,triangles:a.mesh.geometry.triangleCount}));
}
export async function facePack(){active?.focus('face');await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));}
