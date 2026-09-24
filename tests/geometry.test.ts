import test from 'node:test';
import assert from 'node:assert/strict';
import { parseObj, compareMorph } from '../tools/assets/obj.ts';

const square = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nvn 0 0 1\ng panel\nf 1/1/1 2/2/1 3/3/1\nf 1/1/1 3/3/1 4/4/1\n';
test('counts geometry and resolves negative indices to the same topology', () => {
  const a = parseObj(square).stats;
  const b = parseObj(square.replace('1/1/1 3/3/1 4/4/1', '-4/-4/-1 -2/-2/-1 -1/-1/-1')).stats;
  assert.equal(a.vertexCount, 4); assert.equal(a.faceCount, 2);
  assert.deepEqual(a.bounds?.dimensions, [1, 1, 0]); assert.deepEqual(a.centroid, [0.5, 0.5, 0]);
  assert.equal(a.boundaryVertexCount, 4); assert.equal(a.groupCount, 1);
  assert.equal(a.topologyHash, b.topologyHash); assert.equal(a.uvCoverage, 1);
});
test('equal vertex counts cannot hide changed face order or connectivity', () => {
  const a = parseObj(square).stats;
  const b = parseObj(square.replace('1/1/1 3/3/1 4/4/1', '2/2/1 3/3/1 4/4/1')).stats;
  assert.equal(compareMorph(a, b).morphCompatibility, 'incompatible');
});
test('same topology and UV with displaced vertices is an exact technical candidate', () => {
  const a = parseObj(square).stats;
  const b = parseObj(square.replace('v 1 1 0', 'v 2 1 0')).stats;
  assert.equal(compareMorph(a, b).morphCompatibility, 'exact');
});
test('UV reorder or changed coordinates reject exact morph compatibility', () => {
  const a = parseObj(square).stats;
  assert.equal(compareMorph(a, parseObj(square.replace('2/2/1', '2/3/1')).stats).morphCompatibility, 'incompatible');
  assert.equal(compareMorph(a, parseObj(square.replace('vt 1 1', 'vt 0.8 1')).stats).morphCompatibility, 'incompatible');
});
test('missing UV yields probable rather than exact', () => {
  const a = parseObj(square.replace(/\/\d\/1/g, '')).stats;
  assert.equal(a.hasUV, true); assert.equal(a.uvCoverage, 0);
  assert.equal(compareMorph(a, a).morphCompatibility, 'probable');
});
test('invalid indices and non-finite positions are not usable geometry', () => {
  for (const text of [square.replace('4/4/1', '9/4/1'), square.replace('v 0 0 0', 'v NaN 0 0'), square.replace('1/1/1', '0/1/1')]) {
    const a = parseObj(text).stats;
    assert.equal(a.valid, false); assert.equal(compareMorph(a, a).morphCompatibility, 'incompatible');
  }
});
test('supports comments, polygons, BOM, continuations and mtllib with spaces', () => {
  const a = parseObj('\uFEFFmtllib "my materials.mtl"\n' + square.replace('f 1/1/1 2/2/1 3/3/1\nf 1/1/1 3/3/1 4/4/1', 'f 1/1/1 2/2/1 \\\n3/3/1 4/4/1 # quad')).stats;
  assert.equal(a.faceCount, 1); assert.equal(a.triangleCount, 2);
  assert.deepEqual(a.materialLibraries, ['my materials.mtl']); assert.equal(a.valid, true);
});
test('rejects malformed face tokens instead of dropping extra index components', () => {
  const malformed = parseObj(square.replace('1/1/1', '1/1/1/garbage')).stats;
  assert.equal(malformed.valid, false);
  assert.equal(compareMorph(malformed, malformed).morphCompatibility, 'incompatible');
});
test('homogeneous coordinate overflow marks the file invalid without crashing', () => {
  const malformed = parseObj(square.replace('v 1 0 0', 'v 1e308 0 0 1e-308')).stats;
  assert.equal(malformed.valid, false);
});
