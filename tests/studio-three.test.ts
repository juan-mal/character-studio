import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, SRGBColorSpace, NoColorSpace, Bone, Skeleton, SkinnedMesh, Float32BufferAttribute, Uint16BufferAttribute } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PromiseCache } from '../src/three/PromiseCache.ts';
import { CharacterAssembler } from '../src/three/CharacterAssembler.ts';
import { applyTextureRole, canTint } from '../src/materials/characterMaterials.ts';
import { createExportClone, exportCharacter } from '../src/export/exportCharacter.ts';
import { InventoryResolver } from '../src/three/InventoryResolver.ts';
import { AssetManager } from '../src/three/AssetManager.ts';
import type { AssetCatalog, FileRecord } from '../src/assets/types.ts';
import type { CharacterConfiguration, StudioData } from '../src/types/studio.ts';

const config = (id: string): CharacterConfiguration => ({ version: 1, presetId: 'test', archetype: null, selections: { body: id }, accessories: [], colors: {}, textureVariants: {}, morphs: {} });
const piece = (name: string) => { const root = new Group(); root.name = name; root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial())); return root; };

function assetFixture(): StudioData {
  const catalog = JSON.parse(readFileSync(new URL('../src/generated/assets.generated.json', import.meta.url), 'utf8')) as AssetCatalog;
  const asset = structuredClone(catalog.assets[0]!);
  asset.id = 'asset-test';
  asset.mesh.id = 'file-test';
  asset.mesh.extension = '.obj';
  asset.mesh.geometry.materialLibraries = [];
  asset.textureVariants = [];
  asset.materials = [];
  asset.tintable = false;
  return { assets: [asset], images: [], materials: [], presets: [], compatibility: { schemaVersion: 1, morphPairs: [], pieceRelations: [], baseBody: { assetIds: [], missingNames: [], completeCharacter: false, conclusion: '' }, limitations: [] } };
}

const triangleObj = 'o body\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\nusemtl skin\nf 1/1/1 2/2/1 3/3/1\n';

test('asset manager parses real OBJ once and isolates instance materials without losing source coordinates', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    assert.equal(url, '/asset-files/file-test');
    requests++;
    return new Response(triangleObj);
  });
  const manager = new AssetManager(assetFixture());
  const [first, second] = await Promise.all([manager.instantiate('asset-test', config('asset-test')), manager.instantiate('asset-test', config('asset-test'))]);
  const a = first.children[0] as Mesh;
  const b = second.children[0] as Mesh;
  assert.equal(requests, 1);
  assert.equal(a.geometry, b.geometry);
  assert.equal(a.geometry.getAttribute('position').getX(1), 1);
  assert.equal(first.scale.x, 1);
  assert.notEqual(a.material, b.material);
  assert.equal((a.material as MeshStandardMaterial).map, null);
  (a.material as MeshStandardMaterial).color.set('#ff0000');
  assert.notEqual((b.material as MeshStandardMaterial).color.getHexString(), 'ff0000');
  manager.dispose();
});

test('asset manager retries failed mesh fetch and returns progress to idle', async t => {
  let requests = 0;
  let active = false;
  t.mock.method(globalThis, 'fetch', async () => ++requests === 1 ? new Response('', { status: 404 }) : new Response(triangleObj));
  const manager = new AssetManager(assetFixture(), progress => { active = progress.active; });
  await assert.rejects(manager.instantiate('asset-test', config('asset-test')), /404/);
  assert.equal(active, false);
  const root = await manager.instantiate('asset-test', config('asset-test'));
  assert.equal(root.children.length, 1);
  assert.equal(requests, 2);
  assert.equal(active, false);
  manager.dispose();
});

test('OBJ material conversion retains MTL color, opacity and shininess', async t => {
  const data = assetFixture();
  const mesh = data.assets[0]!.mesh;
  mesh.relativePath = 'model.obj';
  mesh.geometry.materialLibraries = ['model.mtl'];
  data.materials = [{ ...mesh, id: 'mtl-test', extension: '.mtl', relativePath: 'model.mtl', definitions: [], issues: [] }];
  t.mock.method(globalThis, 'fetch', async (url: unknown) => new Response(url === '/asset-files/mtl-test' ? 'newmtl skin\nKd 0.2 0.4 0.6\nd 0.7\nNs 48\n' : triangleObj));
  const manager = new AssetManager(data);
  const object = await manager.instantiate('asset-test', config('asset-test'));
  const material = (object.children[0] as Mesh).material as MeshStandardMaterial;
  // MTLLoader interprets Kd as sRGB and stores linear working-space values.
  assert.ok(Math.abs(material.color.r - 0.0331047666) < 0.00001);
  assert.equal(material.opacity, 0.7);
  assert.equal(material.transparent, true);
  assert.equal(material.roughness, 0.2);
  manager.dispose();
});

test('disposing during a slow OBJ load aborts work and never produces a new instance', async t => {
  let started!: () => void;
  const signalReady = new Promise<void>(resolve => { started = resolve; });
  t.mock.method(globalThis, 'fetch', (_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    started();
  }));
  const manager = new AssetManager(assetFixture());
  const pending = manager.instantiate('asset-test', config('asset-test'));
  await signalReady;
  manager.dispose();
  await assert.rejects(pending, /aborted/);
  await assert.rejects(manager.instantiate('asset-test', config('asset-test')), /canceló/);
});

test('disposing cancels pending GLTF parsing and disposes a result arriving after cancellation', async t => {
  const data = assetFixture();
  data.assets[0]!.mesh.extension = '.glb';
  t.mock.method(globalThis, 'fetch', async () => new Response(new ArrayBuffer(8)));
  let parsing!: () => void;
  const started = new Promise<void>(resolve => { parsing = resolve; });
  let complete!: (value: { scene: Group }) => void;
  t.mock.method(GLTFLoader.prototype, 'parseAsync', () => new Promise(resolve => { complete = resolve; parsing(); }));
  const manager = new AssetManager(data);
  const pending = manager.instantiate('asset-test', config('asset-test'));
  await started;
  manager.dispose();
  const late = piece('late');
  let disposedGeometry = false;
  (late.children[0] as Mesh).geometry.addEventListener('dispose', () => { disposedGeometry = true; });
  try {
    const outcome = await Promise.race([pending.then(() => 'resolved', () => 'cancelled'), new Promise<string>(resolve => setTimeout(() => resolve('still waiting'), 30))]);
    assert.equal(outcome, 'cancelled');
  } finally {
    complete({ scene: late });
    await pending.catch(() => undefined);
  }
  await Promise.resolve();
  assert.equal(disposedGeometry, true);
});

test('resource cache deduplicates pending loads and retries rejected loads', async () => {
  const cache = new PromiseCache<string>();
  let calls = 0;
  const load = () => { calls++; return Promise.resolve('mesh'); };
  assert.equal(cache.get('mesh', load), cache.get('mesh', load));
  assert.equal(await cache.get('mesh', load), 'mesh');
  assert.equal(calls, 1);
  await assert.rejects(cache.get('failed', () => Promise.reject(new Error('offline'))));
  assert.equal(await cache.get('failed', () => Promise.resolve('restored')), 'restored');
});

test('assembler retains the visible character after a failed replacement', async () => {
  const assembler = new CharacterAssembler(async id => { if (id === 'bad') throw new Error('broken'); return piece(id); });
  await assembler.setConfiguration(config('initial'));
  await assert.rejects(assembler.setConfiguration(config('bad')), /broken/);
  assert.equal(assembler.root.children[0]?.children[0]?.name, 'initial');
  assembler.dispose();
});

test('assembler commits only the latest selection when an older load finishes last', async () => {
  let finishOlder!: (value: Group) => void;
  const assembler = new CharacterAssembler(id => id === 'old' ? new Promise(resolve => { finishOlder = resolve; }) : Promise.resolve(piece(id)));
  const older = assembler.setConfiguration(config('old'));
  await assembler.setConfiguration(config('new'));
  finishOlder(piece('old'));
  assert.equal(await older, false);
  assert.equal(assembler.root.children[0]?.children[0]?.name, 'new');
  assembler.dispose();
});

test('material roles use sRGB only for color and preserve OBJ texture orientation', () => {
  const material = new MeshStandardMaterial();
  const color = new Texture();
  const normal = new Texture();
  applyTextureRole(material, 'baseColor', color);
  applyTextureRole(material, 'normal', normal);
  assert.equal(material.map, color);
  assert.equal(material.normalMap, normal);
  assert.equal(color.colorSpace, SRGBColorSpace);
  assert.equal(normal.colorSpace, NoColorSpace);
  assert.equal(color.flipY, true);
  assert.equal(normal.flipY, true);
});

test('unconfirmed tint evidence never authorizes material recoloring', () => {
  assert.equal(canTint({ hair: 'unknown', eyes: 'unknown', reason: 'unconfirmed' }), false);
  assert.equal(canTint({ hair: false, eyes: true }, 'hair'), false);
  assert.equal(canTint({ hair: true }, 'hair'), true);
  assert.equal(canTint(true), true);
  assert.equal(canTint({ clothing: true }, 'top'), true);
  assert.equal(canTint({ clothing: true }, 'hair'), false);
});

test('export clone preserves geometry and morph values while isolating materials and wireframe', () => {
  const root = piece('CharacterRoot');
  const mesh = root.children[0] as Mesh;
  mesh.morphTargetDictionary = { smile: 0 };
  mesh.morphTargetInfluences = [0.4];
  (mesh.material as MeshStandardMaterial).wireframe = true;
  const clone = createExportClone(root);
  const clonedMesh = clone.children[0] as Mesh;
  assert.notEqual(clonedMesh.geometry, mesh.geometry);
  assert.deepEqual(clonedMesh.geometry.getAttribute('position').array, mesh.geometry.getAttribute('position').array);
  assert.notEqual(clonedMesh.material, mesh.material);
  assert.equal((clonedMesh.material as MeshStandardMaterial).wireframe, false);
  assert.equal((mesh.material as MeshStandardMaterial).wireframe, true);
  assert.deepEqual(clonedMesh.morphTargetInfluences, [0.4]);
  assert.notEqual(clonedMesh.morphTargetInfluences, mesh.morphTargetInfluences);
});

test('export normalizes an isolated geometry without changing the live OBJ attributes', () => {
  const root = piece('CharacterRoot');
  const mesh = root.children[0] as Mesh;
  mesh.geometry = mesh.geometry.toNonIndexed();
  const normal = mesh.geometry.getAttribute('normal');
  normal.setXYZ(0, 0, 4, 0);
  const exported = createExportClone(root).children[0] as Mesh;
  assert.deepEqual([exported.geometry.getAttribute('normal').getX(0), exported.geometry.getAttribute('normal').getY(0), exported.geometry.getAttribute('normal').getZ(0)], [0, 1, 0]);
  assert.equal(normal.getY(0), 4);
  assert.equal(mesh.geometry.index, null);
});

test('exported GLB roundtrips existing skinning, morphs and only visible character pieces', async t => {
  class NodeFileReader {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, writable: true, value: NodeFileReader });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'FileReader', original); else Reflect.deleteProperty(globalThis, 'FileReader'); });
  const root = new Group();
  const geometry = new BoxGeometry();
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(Array.from({ length: count * 4 }, (_, i) => i % 4 === 0 ? 1 : 0), 4));
  geometry.morphAttributes.position = [geometry.getAttribute('position').clone()];
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  const bone = new Bone();
  bone.name = 'root-bone';
  root.add(mesh, bone);
  mesh.bind(new Skeleton([bone]));
  mesh.morphTargetDictionary = { smile: 0 };
  mesh.morphTargetInfluences = [0.4];
  const hidden = piece('unselected'); hidden.visible = false; root.add(hidden);
  const bytes = await exportCharacter(root);
  assert.equal(new DataView(bytes).getUint32(0, true), 0x46546c67);
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  let result: SkinnedMesh | undefined;
  gltf.scene.traverse(object => { if (object instanceof SkinnedMesh) result = object; });
  assert.ok(result);
  assert.equal(result.skeleton.bones[0]?.name, 'root-bone');
  assert.equal(result.morphTargetDictionary?.smile, 0);
  assert.ok(Math.abs((result.morphTargetInfluences?.[0] ?? 0) - 0.4) < 0.0001);
  assert.equal(gltf.scene.getObjectByName('unselected'), undefined);
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.skeleton.bones[0], bone);
});

test('resource references stay within the local inventory and reject remote or ambiguous paths', () => {
  const file = (id: string, relativePath: string): FileRecord => ({ id, relativePath, sourceId: 'pack', name: relativePath.split('/').at(-1)!, extension: '.png', sizeBytes: 1, sha256: '', path: '' });
  const resolver = new InventoryResolver([file('skin', 'textures/skin.png'), file('a', 'a/normal.png'), file('b', 'b/normal.png')]);
  assert.equal(resolver.resolve('../textures/skin.png', 'pack', 'models/body.mtl')?.id, 'skin');
  assert.equal(resolver.resolve('normal.png', 'pack', 'models/body.mtl'), undefined);
  assert.equal(resolver.resolve('https://example.com/skin.png', 'pack', 'models/body.mtl'), undefined);
  assert.equal(resolver.url('skin'), '/asset-files/skin');
  assert.throws(() => resolver.url('absent'), /inventario/);
});
