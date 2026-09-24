import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, familyOf, selectPrimary } from '../tools/assets/classify.ts';
import { inspectImage, textureRole } from '../tools/assets/images.ts';
import { parseMtl } from '../tools/assets/materials.ts';
import { parseObj } from '../tools/assets/obj.ts';
import { buildAssets } from '../tools/assets/catalog.ts';
import type { ImageRecord, MaterialRecord, MeshRecord } from '../src/assets/types.ts';

const geometry = parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3').stats;
test('exclusion rules take priority over body/hair/face tokens', () => {
  for (const name of ['Area_Body001', 'Indoor_Hair001', 'Homeworld_Chair', 'Property_Face001', 'Eff_Face', 'EffectHair', 'Hair_Effect', 'HairEffectMesh', 'Body001_Col', 'Chair001', 'Body_Drone', 'Body_Lance']) assert.equal(classify(name, geometry).excluded, true, name);
  assert.equal(classify('Face_Eye', geometry).category, 'eyes');
  assert.equal(classify('Brow', geometry).category, 'brows');
  assert.equal(classify('polySurface1', geometry).category, 'unknown');
});
test('LOD variants and High quality are grouped without merging parts or build variants', () => {
  assert.equal(classify('Hair_S0070_Hair01_High_LOD1', geometry).lodKey, classify('Hair_S0070_Hair01', geometry).lodKey);
  assert.notEqual(classify('Body003_Standard', geometry).lodKey, classify('Body003_Fat', geometry).lodKey);
  const entries = ['Hair_S0070_Hair01', 'Hair_S0070_Hair01_High', 'Hair_S0070_Hair01_LOD1'].map(name => ({ name, ...classify(name, geometry), geometry }));
  assert.equal(selectPrimary(entries).name, 'Hair_S0070_Hair01_High');
});
test('future LOD levels cannot silently enter as highest quality', () => {
  const asset = buildAssets([fixtureMesh('Body003_Standard_LOD4')], [], [])[0]!;
  assert.equal(asset.mesh.lod, 4);
  assert.equal(asset.metadata.mainApplication, false);
});
test('family identifiers keep padding and never imply body/face compatibility', () => {
  assert.equal(familyOf('NPC_Male_Body003_Tex_Diffuse'), 'Body003');
  assert.equal(familyOf('Face003_NoEmo_Standard'), 'Face003');
  assert.equal(familyOf('Hair_S0070_HairBase01_High'), 'Hair_S0070');
  assert.notEqual(familyOf('Body01'), familyOf('Body001'));
});
test('MTL parses map paths with options and spaces and keeps non-PBR maps explicit', () => {
  const materials = parseMtl('newmtl skin\nKd 0.5 0.6 0.7\nmap_Kd -s 1 1 1 textures/skin color.png\nmap_d "alpha map.png"\nmap_Bump normal.png', 'm1');
  assert.deepEqual(materials[0]?.diffuse, [0.5, 0.6, 0.7]);
  assert.equal(materials[0]?.maps[0]?.path, 'textures/skin color.png');
  assert.equal(materials[0]?.maps[1]?.role, 'opacity');
  assert.equal(textureRole('Hair_Tex_Lightmap'), 'other');
  assert.equal(textureRole('Face_SDF'), 'other');
});
test('image headers expose dimensions and reject corrupt PNG', () => {
  const data = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64');
  assert.equal(inspectImage(data, '.png').width, 1);
  assert.equal(inspectImage(data, '.png').alpha, true);
  assert.equal(inspectImage(Buffer.from('broken'), '.png').inspection, 'failed');
});

function fixtureMesh(name: string): MeshRecord {
  const stats = parseObj('mtllib missing/skin.mtl\nusemtl skin\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3').stats;
  return { id: name, name, sourceId: 'test', relativePath: `${name}.obj`, path: `test/${name}.obj`, extension: '.obj', sizeBytes: 1, sha256: 'test', ...classify(name, stats), geometry: stats };
}
function fixtureImage(name: string, relativePath: string, usage: 'texture' | 'preview'): ImageRecord {
  return { id: name, name, sourceId: 'test', relativePath, path: `test/${relativePath}`, extension: '.png', sizeBytes: 1, sha256: 'same-content', usage, role: 'diffuse', family: familyOf(name), archetype: null, width: 1, height: 1, alpha: false, format: 'png', inspection: 'header', issues: [], duplicateOf: null };
}
test('a material found only by basename is not a confirmed texture assignment', () => {
  const material: MaterialRecord = { id: 'mtl', name: 'skin', sourceId: 'test', relativePath: 'unrelated/skin.mtl', path: 'test/unrelated/skin.mtl', extension: '.mtl', sizeBytes: 1, sha256: 'test', definitions: parseMtl('newmtl skin\nmap_Kd skin.png', 'mtl'), issues: [] };
  const assets = buildAssets([fixtureMesh('Body001')], [fixtureImage('skin', 'unrelated/skin.png', 'texture')], [material]);
  assert.equal(assets[0]?.metadata.textureStatus, 'candidates-only');
  assert.notEqual(assets[0]?.textureVariants[0]?.confidence, 'confirmed');
});
test('deduplicated preview content retains associations through every original filename', () => {
  const first = fixtureImage('Body001', 'Body001.png', 'preview'), second = fixtureImage('Body002', 'Body002.png', 'preview');
  second.duplicateOf = first.id;
  const assets = buildAssets([fixtureMesh('Body001'), fixtureMesh('Body002')], [first, second], []);
  assert.equal(assets[1]?.previewCandidates.length, 1);
});
test('nominal LOD siblings with contradictory bounds stay separate and require review', () => {
  const full = fixtureMesh('Body_LOD0'), lower = fixtureMesh('Body_LOD1');
  lower.geometry = parseObj('v 10 0 0\nv 11 0 0\nv 10 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3').stats;
  const assets = buildAssets([full, lower], [], []);
  assert.equal(assets.length, 2);
  assert.notEqual(assets[0]?.id, assets[1]?.id);
  assert.ok(assets.every(a => !a.metadata.mainApplication));
});
