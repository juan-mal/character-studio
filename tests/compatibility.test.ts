import test from 'node:test';
import assert from 'node:assert/strict';
import { parseObj } from '../tools/assets/obj.ts';
import { surfaceCoverage, junctionMetrics } from '../tools/assets/compatibility.ts';

test('merged evidence compares actual surfaces, not merely matching bounds', () => {
  const a = parseObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3\nf 1 3 4');
  const b = parseObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 4\nf 2 3 4');
  assert.equal(surfaceCoverage(a, a).triangleCoverage, 1);
  assert.equal(surfaceCoverage(a, b).vertexCoverage, 1);
  assert.equal(surfaceCoverage(a, b).triangleCoverage, 0);
});
test('junction measurements use real boundary positions', () => {
  const a = parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3').stats;
  const b = parseObj('v 0 10 0\nv 1 10 0\nv 0 11 0\nf 1 2 3').stats;
  assert.equal(junctionMetrics(a, b).minimumBoundaryDistance, 9);
  assert.equal(junctionMetrics(a, b).boundsGap, 9);
});
