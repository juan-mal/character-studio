import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh } from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { compactObjMaterials } from '../src/three/compactObjMaterials.ts';

test('repeated material directives do not create one draw group per triangle', () => {
  const input = 'v 0 0 0\nv 1 0 0\nv 0 1 0\n' + 'usemtl body\nf 1 2 3\n'.repeat(1000);
  const original = new OBJLoader().parse(input).children[0] as Mesh;
  const compact = new OBJLoader().parse(compactObjMaterials(input)).children[0] as Mesh;
  assert.equal(original.geometry.groups.length, 1000);
  assert.equal(Array.isArray(compact.material), false);
  assert.deepEqual(compact.geometry.attributes.position!.array, original.geometry.attributes.position!.array);
  assert.deepEqual(compact.geometry.attributes.normal!.array, original.geometry.attributes.normal!.array);
});

test('material changes, object boundaries and smoothing directives are preserved', () => {
  const source = 'usemtl body\ns off\nusemtl body\ng second\nusemtl body\nusemtl hair\nusemtl body\no next\nusemtl body\n';
  assert.equal(compactObjMaterials(source), source);
});
