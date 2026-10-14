import { CharacterScene } from '../../src/three/CharacterScene.ts';
import { CatalogResolver } from '../../src/compatibility/resolver.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Mesh } from 'three';
import type { StudioData } from '../../src/types/studio.ts';
import { disposeTemplate } from '../../src/three/objectResources.ts';

let scene: CharacterScene | undefined;
export async function showNeutral(index: number): Promise<{ name: string; vertices: number; bytes: number }> {
  const data = await (await fetch('/studio-data.json')).json() as StudioData;
  const resolver = new CatalogResolver(data);
  const preset = resolver.supportedPresets.filter(p => p.id.startsWith('neutral-'))[index];
  if (!preset) throw new Error('Neutral preset missing');
  let container = document.getElementById('neutral-preview');
  if (!container) {
    container = document.createElement('div'); container.id = 'neutral-preview';
    Object.assign(container.style, { position: 'fixed', inset: '0', zIndex: '99999', background: '#f7f7f5' });
    document.body.append(container); scene = new CharacterScene(container, { data });
  }
  if (!scene) throw new Error('Scene unavailable');
  await scene.setConfiguration(resolver.fromPreset(preset.id));
  const buffer = await scene.exportGlb();
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  let vertices = 0;
  gltf.scene.traverse(object => { if (object instanceof Mesh) vertices += object.geometry.getAttribute('position').count; });
  disposeTemplate(gltf.scene);
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return { name: preset.name, vertices, bytes: buffer.byteLength };
}
