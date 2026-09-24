import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AssetCatalog, AssetDefinition, CompatibilityCatalog, PieceRelation, Preset, TextureVariant } from '../src/assets/types.ts';
import type { StudioData } from '../src/types/studio.ts';
import { CatalogResolver } from '../src/compatibility/resolver.ts';
import { commitHistory, createHistory, redoHistory, undoHistory } from '../src/state/history.ts';
import { clearLast, deserializeConfiguration, loadLast, saveLast, serializeConfiguration } from '../src/state/persistence.ts';

const catalog = JSON.parse(readFileSync(new URL('../src/generated/assets.generated.json', import.meta.url), 'utf8')) as AssetCatalog;
const template = catalog.assets.find((asset) => asset.category === 'body');
assert.ok(template);

function asset(id: string, category: AssetDefinition['category'], archetype = 'Girl'): AssetDefinition {
  const result = structuredClone(template!);
  return {
    ...result, id, name: id, category, archetype, archetypeCandidates: [archetype],
    mesh: { ...result.mesh, id: `${id}-mesh`, category, archetype, geometry: { ...result.mesh.geometry, valid: true } },
    variants: { build: 'Standard', relatedAssetIds: [] },
    metadata: { ...result.metadata, mainApplication: true, status: 'candidate' },
    textureVariants: [], compatibility: { relationIds: [], morphIds: [] }, tintable: false,
  };
}

function relation(a: string, b: string, status: PieceRelation['status'] = 'supported'): PieceRelation {
  return { id: `${a}:${b}`, a, b, kind: 'merged-evidence', status, confidence: status === 'supported' ? 'confirmed' : 'candidate', evidence: [], metrics: {}, sourceMeshIds: [] };
}

function preset(id: string, body: string, hair: string, archetype = 'Girl'): Preset {
  return { id, name: id, archetype, buildVariant: 'Standard', sourceMeshIds: [], bodyFamily: null, hairFamily: null, bodyAssetIds: [body], hairAssetIds: [hair], missingParts: [], status: 'geometry-supported', completeCharacter: false, evidence: [] };
}

function fixture(): StudioData {
  const assets = [asset('body-a', 'body'), asset('body-b', 'body', 'Boy'), asset('hair-a', 'hair'), asset('hair-b', 'hair', 'Boy'), asset('hair-shared', 'hair'), asset('hair-candidate', 'hair'), asset('face-a', 'face'), asset('eyes-a', 'eyes'), asset('ear-a', 'ear accessories')];
  assets[2]!.variants.relatedAssetIds = ['hair-b'];
  assets[3]!.variants.relatedAssetIds = ['hair-a'];
  assets[4]!.archetype = null;
  assets[4]!.archetypeCandidates = ['Girl', 'Boy'];
  return {
    assets, images: [], materials: [], presets: [preset('preset-a', 'body-a', 'hair-a'), preset('preset-b', 'body-b', 'hair-b', 'Boy'), preset('missing-preset', 'body-gone', 'hair-a'), { ...preset('candidate-preset', 'body-a', 'hair-candidate'), status: 'candidate' }],
    compatibility: { schemaVersion: 1, morphPairs: [], pieceRelations: [relation('body-a', 'hair-a'), relation('body-b', 'hair-b'), relation('body-a', 'hair-shared'), relation('body-b', 'hair-shared'), relation('body-a', 'hair-candidate', 'candidate'), relation('body-a', 'face-a'), relation('face-a', 'eyes-a'), relation('face-a', 'ear-a')], baseBody: { assetIds: [], missingNames: [], completeCharacter: false, conclusion: '' }, limitations: [] },
  };
}

test('only presets with existing approved geometry are offered, never matching names alone', () => {
  const resolver = new CatalogResolver(fixture());
  assert.deepEqual(resolver.supportedPresets.map((entry) => entry.id), ['preset-a', 'preset-b']);
  assert.deepEqual(resolver.options('hair', resolver.defaultConfiguration()).map((entry) => entry.id), ['hair-a', 'hair-shared']);
  assert.equal(resolver.fromPreset('preset-a').selections.body, 'body-a');
  assert.equal(resolver.defaultConfiguration().selections.hair, 'hair-a');
});

test('body alternatives without their own compatibility evidence cannot enter a supported preset', () => {
  const data = fixture();
  data.presets = [{ ...preset('mixed', 'body-a', 'hair-a'), bodyAssetIds: ['body-a', 'body-b'] }];
  const resolver = new CatalogResolver(data);
  assert.deepEqual(resolver.options('body', resolver.defaultConfiguration()).map((entry) => entry.id), ['body-a']);
  const imported = resolver.normalize({ ...resolver.defaultConfiguration(), selections: { body: 'body-b', hair: 'hair-a' } });
  assert.equal(imported.configuration.selections.body, 'body-a');
  assert.equal(imported.configuration.selections.hair, 'hair-a');
});

test('the actual catalog initially offers only supported pieces and validated textures', () => {
  const compatibility = JSON.parse(readFileSync(new URL('../src/generated/compatibility.generated.json', import.meta.url), 'utf8')) as CompatibilityCatalog;
  const presets = JSON.parse(readFileSync(new URL('../src/generated/presets.generated.json', import.meta.url), 'utf8')) as { presets: Preset[] };
  const resolver = new CatalogResolver({ ...catalog, compatibility, presets: presets.presets });
  assert.ok(resolver.supportedPresets.length >= 15);
  const bodies = new Set(resolver.options('body', resolver.defaultConfiguration()).map(entry => entry.name));
  for (const name of ['Body002_Standard','Body_Amber_Default','Body_Barbara_Default','Body_Diluc_Default','Body_Kaeya_Default','Body_Jean_Default','Body_Lisa_Default','Body_Noelle_Default','Body_Bennett_Default','Body_Xiangling_Default','Body_Sucrose_Default','Body_Amber_Alternate','Body_Barbara_Summer']) assert.ok(bodies.has(name), name);
  assert.deepEqual(resolver.options('hair', resolver.defaultConfiguration()).map((entry) => entry.name).sort(), ['Hair205_Standard', 'Hair210_Standard', 'Hair213_Standard']);
  for (const item of resolver.selectedAssets(resolver.defaultConfiguration())) {
    assert.equal(resolver.canTint(item.id), false);
    assert.ok(resolver.textureOptions(item.id, resolver.defaultConfiguration()).every((variant) => variant.confidence === 'confirmed' && !variant.requiresVisualValidation));
  }
});

test('part options require a confirmed connection to a selected anchor, and conflicts win', () => {
  const data = fixture();
  const resolver = new CatalogResolver(data);
  const initial = resolver.select(resolver.defaultConfiguration(), 'face', null).configuration;
  assert.deepEqual(resolver.options('eyes', initial), []);
  assert.deepEqual(resolver.accessoryOptions(initial), []);
  const withFace = resolver.select(initial, 'face', 'face-a').configuration;
  assert.deepEqual(resolver.options('eyes', withFace).map((entry) => entry.id), ['eyes-a']);
  assert.deepEqual(resolver.accessoryOptions(withFace).map((entry) => entry.id), ['ear-a']);
  data.compatibility.pieceRelations.push(relation('hair-a', 'eyes-a', 'incompatible'));
  assert.deepEqual(new CatalogResolver(data).options('eyes', withFace), []);
});

test('preset defaults include a face and eyes only when geometry relationships confirm them', () => {
  const resolver = new CatalogResolver(fixture());
  assert.equal(resolver.fromPreset('preset-a').selections.face, 'face-a');
  assert.equal(resolver.fromPreset('preset-a').selections.eyes, 'eyes-a');
  assert.equal(resolver.fromPreset('preset-b').selections.face, undefined);
});

test('deformations require named targets in a prepared GLB, never an OBJ topology candidate', () => {
  const data = fixture();
  const configuration = new CatalogResolver(data).defaultConfiguration();
  data.compatibility.morphPairs = [{ id: 'exact', a: 'hair-a', b: 'hair-b', morphCompatibility: 'exact', candidate: false, checks: {}, reasons: [] }];
  assert.deepEqual(new CatalogResolver(data).normalize({ ...configuration, morphs: { 'hair-a': { 'hair-b': 0.5 } } }).configuration.morphs, {});
  data.assets[2]!.mesh.extension = '.glb';
  data.assets[2]!.metadata.preparedMorphTargets = ['Smile'];
  const normalized = new CatalogResolver(data).normalize({ ...configuration, morphs: { 'hair-a': { Smile: 0.5, Missing: 0.3, Invalid: 4 } } });
  assert.deepEqual(normalized.configuration.morphs, { 'hair-a': { Smile: 0.5 } });
});

test('changing body preserves confirmed selections and substitutes an explicit compatible variant', () => {
  const resolver = new CatalogResolver(fixture());
  const compatible = resolver.select(resolver.defaultConfiguration(), 'hair', 'hair-shared').configuration;
  assert.equal(resolver.select(compatible, 'body', 'body-b').configuration.selections.hair, 'hair-shared');
  const switched = resolver.select(resolver.defaultConfiguration(), 'body', 'body-b');
  assert.equal(switched.configuration.selections.hair, 'hair-b');
  assert.equal(switched.configuration.presetId, 'preset-b');
  assert.equal(switched.configuration.archetype, 'Boy');
  assert.ok(switched.warnings.length > 0);
});

test('reselecting the current body retains its chosen preset and creates no history entry', () => {
  const data = fixture();
  data.presets.push(preset('shared-preset', 'body-a', 'hair-shared'));
  const resolver = new CatalogResolver(data);
  const initial = resolver.fromPreset('shared-preset');
  const selected = resolver.select(initial, 'body', 'body-a');
  assert.deepEqual(selected.configuration, initial);
  assert.equal(commitHistory(createHistory(initial), selected.configuration).past.length, 0);
  assert.deepEqual(selected.warnings, []);
});

test('missing assets recover to preset defaults while optional removal stays removed', () => {
  const resolver = new CatalogResolver(fixture());
  const missing = { ...resolver.defaultConfiguration(), selections: { body: 'gone', hair: 'also-gone' } };
  const restored = resolver.normalize(missing);
  assert.deepEqual(restored.configuration.selections, { body: 'body-a', hair: 'hair-a' });
  assert.ok(restored.warnings.length >= 2);
  const bald = resolver.select(resolver.defaultConfiguration(), 'hair', null).configuration;
  assert.equal(bald.selections.hair, undefined);
  assert.equal(resolver.normalize(bald).configuration.selections.hair, undefined);
  assert.equal(resolver.select(bald, 'body', null).configuration.selections.body, 'body-a');
});

test('invalid direct selection cannot replace a working compatible part', () => {
  const resolver = new CatalogResolver(fixture());
  const result = resolver.select(resolver.defaultConfiguration(), 'hair', 'hair-candidate');
  assert.equal(result.configuration.selections.hair, 'hair-a');
  assert.ok(result.warnings.length);
});

test('textures need confirmed visual evidence and actual image references', () => {
  const data = fixture();
  const image = structuredClone(catalog.images[0]!);
  image.id = 'image';
  image.usage = 'texture';
  image.archetype = 'Girl';
  data.images = [image];
  const texture: TextureVariant = { id: 'texture', name: 'Verified', confidence: 'confirmed', maps: { baseColor: ['image'] }, evidence: [], requiresVisualValidation: false };
  data.assets[2]!.textureVariants = [texture, { ...texture, id: 'candidate', confidence: 'candidate' }, { ...texture, id: 'review', requiresVisualValidation: true }, { ...texture, id: 'missing-map', maps: { baseColor: ['absent-image'] } }];
  const resolver = new CatalogResolver(data);
  const config = resolver.defaultConfiguration();
  assert.deepEqual(resolver.textureOptions('hair-a', config).map((entry) => entry.id), ['texture']);
  const validated = resolver.normalize({ ...config, textureVariants: { 'hair-a': 'candidate', 'body-a': 'foreign-texture' } });
  assert.deepEqual(validated.configuration.textureVariants, { 'hair-a': 'texture' });
  assert.equal(resolver.normalize({ ...config, textureVariants: { 'hair-a': 'texture' } }).configuration.textureVariants['hair-a'], 'texture');
});

test('default textures exclude previews and mismatching archetypes while retaining a valid chosen variant', () => {
  const data = fixture();
  const templateImage = catalog.images[0]!;
  data.images = [
    { ...templateImage, id: 'preview', usage: 'preview', archetype: 'Girl' },
    { ...templateImage, id: 'boy', usage: 'texture', archetype: 'Boy' },
    { ...templateImage, id: 'girl-a', usage: 'texture', archetype: 'Girl' },
    { ...templateImage, id: 'girl-b', usage: 'texture', archetype: 'Girl' },
  ];
  data.assets[2]!.textureVariants = data.images.map((image) => ({ id: `${image.id}-variant`, name: image.id, confidence: 'confirmed', requiresVisualValidation: false, maps: { baseColor: [image.id] }, evidence: [] }));
  const resolver = new CatalogResolver(data);
  const initial = resolver.defaultConfiguration();
  assert.deepEqual(resolver.textureOptions('hair-a', initial).map((variant) => variant.id), ['girl-a-variant', 'girl-b-variant']);
  assert.equal(initial.textureVariants['hair-a'], 'girl-a-variant');
  const chosen = resolver.normalize({ ...initial, textureVariants: { 'hair-a': 'girl-b-variant' } });
  assert.equal(chosen.configuration.textureVariants['hair-a'], 'girl-b-variant');
  assert.equal(resolver.normalize({ ...initial, textureVariants: {} }).configuration.textureVariants['hair-a'], 'girl-a-variant');
});

test('only explicit tint flags accept hex colors, including per-channel flags', () => {
  const data = fixture();
  data.assets[2]!.tintable = { hair: true, eyes: false, reason: 'Verified material' };
  data.assets[0]!.tintable = false;
  const resolver = new CatalogResolver(data);
  const config = resolver.defaultConfiguration();
  assert.equal(resolver.canTint('hair-a'), true);
  assert.deepEqual(resolver.normalize({ ...config, colors: { 'hair-a': '#AbC123', 'body-a': '#ff0000' } }).configuration.colors, { 'hair-a': '#abc123' });
  assert.deepEqual(resolver.normalize({ ...config, colors: { 'hair-a': 'url(https://invalid)' } }).configuration.colors, {});
  data.assets[2]!.tintable = true;
  assert.equal(new CatalogResolver(data).canTint('hair-a'), true);
});

test('imports reject broken versions, shapes, oversized payloads, and discard untrusted extra fields', () => {
  const resolver = new CatalogResolver(fixture());
  for (const input of ['{', 'null', '[]', '{}', '{"version":2,"selections":{}}', '{"version":1,"selections":[]}']) {
    assert.throws(() => deserializeConfiguration(input, resolver));
  }
  assert.throws(() => deserializeConfiguration(' '.repeat(120_000), resolver));
  assert.throws(() => resolver.normalize({ ...resolver.defaultConfiguration(), accessories: Array.from({ length: 1000 }, () => 'ear-a') }));
  const config = deserializeConfiguration(JSON.stringify({ ...resolver.defaultConfiguration(), camera: { x: 1 }, model: 'huge-mesh', selections: { body: 'body-a', hair: 'hair-a', props: 'injected' }, morphs: { 'hair-a': { unknown: 1 } } }), resolver).configuration;
  assert.equal('camera' in config, false);
  assert.equal('props' in config.selections, false);
  assert.deepEqual(config.morphs, {});
});

test('imports reject explicit null fields, prototype keys and malformed selection values', () => {
  const resolver = new CatalogResolver(fixture());
  for (const field of ['accessories', 'textureVariants', 'colors', 'morphs']) {
    assert.throws(() => resolver.normalize({ ...resolver.defaultConfiguration(), [field]: null }));
  }
  for (const selections of [{ body: 7 }, { hair: {} }, { body: 'body-a', hair: 'x'.repeat(161) }]) {
    assert.throws(() => resolver.normalize({ ...resolver.defaultConfiguration(), selections }));
  }
  assert.throws(() => deserializeConfiguration('{"version":1,"selections":{"body":"body-a"},"colors":{"__proto__":"#ffffff"}}', resolver));
  const restored = deserializeConfiguration('{"version":1,"selections":{"body":"body-a","__proto__":{"polluted":true}},"__proto__":{"polluted":true}}', resolver);
  assert.equal('polluted' in restored.configuration, false);
  assert.equal('polluted' in {}, false);
});

test('import recovery honors a valid preset when its saved body disappeared, then becomes stable', () => {
  const resolver = new CatalogResolver(fixture());
  const result = resolver.normalize({ ...resolver.defaultConfiguration(), presetId: 'preset-b', archetype: 'incorrect', selections: { body: 'gone', hair: 'hair-a' } });
  assert.equal(result.configuration.presetId, 'preset-b');
  assert.equal(result.configuration.archetype, 'Boy');
  assert.equal(result.configuration.selections.body, 'body-b');
  assert.equal(result.configuration.selections.hair, 'hair-b');
  assert.deepEqual(resolver.normalize(result.configuration), { configuration: result.configuration, warnings: [] });
});

test('undo and redo preserve independent snapshots, clear redo on edits, and exclude camera', () => {
  const resolver = new CatalogResolver(fixture());
  const initial = { ...resolver.defaultConfiguration(), camera: { x: 1 } };
  const first = createHistory(initial);
  const changed = resolver.select(initial, 'hair', 'hair-shared').configuration;
  const second = commitHistory(first, changed);
  changed.selections.hair = 'mutated';
  initial.selections.body = 'mutated';
  assert.equal(second.present.selections.hair, 'hair-shared');
  assert.equal(second.past[0]!.selections.body, 'body-a');
  assert.equal('camera' in second.past[0]!, false);
  const undone = undoHistory(second);
  assert.equal(undone.present.selections.hair, 'hair-a');
  assert.equal(redoHistory(undone).present.selections.hair, 'hair-shared');
  assert.equal(commitHistory(undone, resolver.fromPreset('preset-b')).future.length, 0);
  assert.equal(commitHistory(second, second.present).past.length, second.past.length);
});

test('history is bounded and operations at either edge preserve the current configuration', () => {
  const resolver = new CatalogResolver(fixture());
  let history = createHistory(resolver.defaultConfiguration());
  assert.deepEqual(undoHistory(history), history);
  for (let index = 0; index < 120; index++) {
    history = commitHistory(history, resolver.fromPreset(index % 2 === 0 ? 'preset-b' : 'preset-a'));
  }
  assert.equal(history.past.length, 100);
  assert.deepEqual(redoHistory(history), history);
});

test('persistence serializes only configuration and handles unavailable or full storage', () => {
  const resolver = new CatalogResolver(fixture());
  const config = { ...resolver.defaultConfiguration(), camera: [1, 2, 3], model: { geometry: 'not-a-config' } };
  const serialized = serializeConfiguration(config);
  assert.equal(serialized.includes('camera'), false);
  assert.equal(serialized.includes('geometry'), false);
  assert.deepEqual(deserializeConfiguration(serialized, resolver).configuration, resolver.defaultConfiguration());
  const map = new Map<string, string>();
  const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
  assert.equal(loadLast(resolver, storage), null);
  assert.equal(saveLast(config, storage), true);
  assert.deepEqual(loadLast(resolver, storage)?.configuration, resolver.defaultConfiguration());
  assert.equal(clearLast(storage), true);
  assert.equal(loadLast(resolver, storage), null);
  const failingStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(saveLast(config, failingStorage), false);
  assert.equal(loadLast(resolver, failingStorage), null);
  assert.equal(clearLast(failingStorage), false);
});

test('reviewed character edits retain valid head combinations, history and preset roundtrips',()=>{
  const compatibility = JSON.parse(readFileSync(new URL('../src/generated/compatibility.generated.json', import.meta.url), 'utf8')) as CompatibilityCatalog;
  const presets = JSON.parse(readFileSync(new URL('../src/generated/presets.generated.json', import.meta.url), 'utf8')) as {presets:Preset[]};
  const resolver=new CatalogResolver({...catalog,compatibility,presets:presets.presets});
  const initial=resolver.fromPreset(resolver.supportedPresets.find(p=>p.displayName==='Amber')!.id);
  let config=initial;
  for(const [slot,folder] of [['hair','Keqing-Default'],['face','Barbara-Summer'],['eyes','Barbara-Summer']] as const){
    const option=resolver.options(slot,config).find(a=>a.mesh.relativePath.includes(`/${folder}/`));assert.ok(option);
    config=resolver.select(config,slot,option.id).configuration;
  }
  config={...config,skinTone:'#b87851',textureAdjustments:{[config.selections.hair!]:{hue:25,saturation:.8,lightness:.1,color:'#ad425d'}}};
  assert.deepEqual(deserializeConfiguration(serializeConfiguration(config),resolver).configuration,config);
  const history=commitHistory(createHistory(initial),config);
  assert.deepEqual(undoHistory(history).present,initial);assert.deepEqual(redoHistory(undoHistory(history)).present,config);
  const legacy=structuredClone(initial);delete legacy.selections.eyes;delete legacy.selections.brows;
  assert.ok(resolver.normalize(legacy).configuration.selections.eyes);assert.ok(resolver.normalize(legacy).configuration.selections.brows);
  const diluc=resolver.options('body',config).find(a=>a.name==='Body_Diluc_Default')!;
  const switched=resolver.select(config,'body',diluc.id).configuration;
  for(const slot of ['face','eyes','brows','hair'] as const)assert.ok(resolver.options(slot,switched).some(a=>a.id===switched.selections[slot]));
  assert.equal(switched.skinTone,undefined);
});
