import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleObj } from '../tools/content/import-neutral-npcs.ts';
import { parseObj } from '../tools/assets/obj.ts';

test('neutral NPC assembly rotates coordinates consistently and preserves negative face indices and UVs', () => {
  const source = 'v 0 0 1\nv 1 0 1\nv 0 0 2\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 -1 0\nf -3/-3/1 -2/-2/1 -1/-1/1\n';
  const result = parseObj(assembleObj([source, source]));
  assert.equal(result.stats.valid, true);
  assert.equal(result.stats.vertexCount, 6);
  assert.equal(result.stats.faceCount, 2);
  assert.equal(result.stats.uvCoverage, 1);
  assert.equal(result.stats.normalCoverage, 1);
  assert.deepEqual(result.positions[0], [0, 1, 0]);
  assert.deepEqual(result.polygons[1], [3, 4, 5]);
});
