import { Box3, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Object3D, type Texture } from 'three';
import { disposeInstance, materialsOf } from '../../src/three/objectResources.ts';
import { AssetManager } from '../../src/three/AssetManager.ts';
import { CharacterAssembler } from '../../src/three/CharacterAssembler.ts';
import { CatalogResolver } from '../../src/compatibility/resolver.ts';
import { fitCamera } from '../../src/three/cameraFit.ts';
import type { StudioData } from '../../src/types/studio.ts';

export async function measureSwitches() {
  const data = await (await fetch('/studio-data.json')).json() as StudioData;
  const resolver = new CatalogResolver(data);
  const manager = new AssetManager(data);
  const assembler = new CharacterAssembler((id, config) => manager.instantiate(id, config));
  const renderer = new WebGLRenderer();
  renderer.setSize(320,480);
  const scene = new Scene(); scene.add(assembler.root);
  const camera = new PerspectiveCamera(35,2/3,0.001,100);
  const results: {name:string;coldMs:number;warmMs:number;drawCalls:number;triangles:number}[] = [];
  try {
    for (const name of ['Amber','Barbara']) {
      const preset = resolver.supportedPresets.find(p => p.displayName === name)!;
      const config = resolver.fromPreset(preset.id);
      let started = performance.now();
      await assembler.setConfiguration(config);
      const coldMs = performance.now() - started;
      fitCamera(camera,new Box3().setFromObject(assembler.root),new Vector3(0,0,1));
      renderer.render(scene,camera);
      const {calls:drawCalls,triangles} = renderer.info.render;
      started = performance.now();
      await assembler.setConfiguration(config);
      results.push({name,coldMs,warmMs:performance.now()-started,drawCalls,triangles});
    }
    const hairMaps: Texture[] = [];
    for (const displayName of ['Amber','Amber · Atuendo alternativo']) {
      const preset = resolver.supportedPresets.find(p => p.displayName === displayName)!;
      const config = resolver.fromPreset(preset.id);
      const instance: Object3D = await manager.instantiate(config.selections.hair!,config);
      instance.traverse(object => {
        if (object instanceof Mesh) for (const material of materialsOf(object)) {
          if (material instanceof MeshBasicMaterial && material.map) hairMaps.push(material.map);
        }
      });
      disposeInstance(instance);
    }
    return {switches:results,identicalOutfitTexturesShared:hairMaps.length===2 && hairMaps[0]===hairMaps[1]};
  } finally { assembler.dispose(); manager.dispose(); renderer.dispose(); renderer.forceContextLoss(); }
}
