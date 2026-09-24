import {Box3,Mesh,MeshBasicMaterial,PerspectiveCamera,Scene,Vector3,WebGLRenderer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AssetManager} from '../../src/three/AssetManager.ts';
import {CharacterAssembler} from '../../src/three/CharacterAssembler.ts';
import {CatalogResolver} from '../../src/compatibility/resolver.ts';
import {exportCharacter} from '../../src/export/exportCharacter.ts';
import {disposeInstance,disposeTemplate} from '../../src/three/objectResources.ts';
import {fitCamera} from '../../src/three/cameraFit.ts';
import {serializeConfiguration,deserializeConfiguration} from '../../src/state/persistence.ts';
import type {StudioData} from '../../src/types/studio.ts';
export async function verifyCustomization(){
 const data=await(await fetch('/studio-data.json')).json() as StudioData;
 const resolver=new CatalogResolver(data),manager=new AssetManager(data),assembler=new CharacterAssembler((id,c)=>manager.instantiate(id,c));
 const preset=resolver.supportedPresets.find(p=>p.displayName==='Amber')!;
 let config=resolver.fromPreset(preset.id);
 for(const [slot,folder] of [['hair','Keqing-Default'],['face','Barbara-Summer'],['eyes','Barbara-Summer'],['brows','Barbara-Summer']] as const){
  const option=resolver.options(slot,config).find(a=>a.mesh.relativePath.includes(`/${folder}/`));if(!option)throw new Error('Missing compatible '+slot);
  config=resolver.select(config,slot,option.id).configuration;
 }
 config.textureAdjustments={ [config.selections.hair!]:{hue:0,saturation:1,lightness:0,color:'#ad425d'},[config.selections.eyes!]:{hue:0,saturation:1,lightness:0,color:'#248a53'}};
 config.skinTone='#b87851';
 const restored=deserializeConfiguration(serializeConfiguration(config),resolver).configuration;
 if(JSON.stringify(restored)!==JSON.stringify(config))throw new Error('Preset changed on roundtrip');
 const renderer=new WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(480,640);renderer.setClearColor('#f7f7f5');renderer.domElement.id='customization-preview';document.body.replaceChildren(renderer.domElement);
 const scene=new Scene(),camera=new PerspectiveCamera(35,480/640,.001,100);scene.add(assembler.root);
 const draw=()=>{renderer.render(scene,camera);const canvas=document.createElement('canvas');canvas.width=480;canvas.height=640;const ctx=canvas.getContext('2d')!;ctx.drawImage(renderer.domElement,0,0);return ctx.getImageData(0,0,480,640).data;};
 await assembler.setConfiguration(config);fitCamera(camera,new Box3().setFromObject(assembler.root),new Vector3(.12,.025,1));
 const before=draw();const originalImage=renderer.domElement.toDataURL();
 const hair=assembler.root.getObjectByName('hair')!;let originalMesh:Mesh|undefined;hair.traverse(o=>{if(o instanceof Mesh)originalMesh=o;});
 const plain=await manager.instantiate(config.selections.hair!,resolver.fromPreset(preset.id));let plainMesh:Mesh|undefined;plain.traverse(o=>{if(o instanceof Mesh)plainMesh=o;});
 const isolated=originalMesh!.geometry===plainMesh!.geometry && (originalMesh!.material as MeshBasicMaterial).map!==(plainMesh!.material as MeshBasicMaterial).map;
 disposeInstance(plain);
 const glb=await exportCharacter(assembler.root),loaded=await new GLTFLoader().parseAsync(glb,'');
 scene.remove(assembler.root);scene.add(loaded.scene);const after=draw();let changed=0;for(let i=0;i<before.length;i++)if(Math.abs(before[i]!-after[i]!)>3)changed++;
 const roundtripImage=renderer.domElement.toDataURL();let meshes=0,forbidden=0,maps=0;loaded.scene.traverse(o=>{if(o instanceof Mesh){meshes++;if((o.material as MeshBasicMaterial).map)maps++;}if(o.type.includes('Camera')||o.type.includes('Light'))forbidden++;});
 scene.remove(loaded.scene);disposeTemplate(loaded.scene);scene.add(assembler.root);
 const faceBox=new Box3().setFromObject(assembler.root.getObjectByName('face')!);fitCamera(camera,faceBox,new Vector3(.12,.025,1));draw();const faceImage=renderer.domElement.toDataURL();
 assembler.dispose();manager.dispose();renderer.dispose();
 return {isolated,meshes,maps,forbidden,changedRatio:changed/before.length,glbBytes:glb.byteLength,originalImage,roundtripImage,faceImage,configuration:config};
}

