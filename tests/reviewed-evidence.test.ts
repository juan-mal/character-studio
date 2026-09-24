import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOriginalResidual } from '../tools/assets/reviewed-evidence.ts';
import { parseObj } from '../tools/assets/obj.ts';

const vertices = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nvt 0 0\nvt 1 0\nvt 0 1\nvt 0.25 0.75\nvn 0 0 1\nvn 0 1 0\n';
const base = vertices + 'f 1/1/1 2/2/1 3/3/1\n';
const merged = base + 'f 1/4/2 3/3/2 4/2/2\n';
test('residual subtraction preserves source coordinates, corner UV, normals and winding', () => {
  const result = extractOriginalResidual(merged, [base]);
  assert.equal(result.triangleCount, 1);
  const parsed = parseObj(result.text);
  assert.deepEqual(parsed.positions, [[0, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.match(result.text, /vt 0.25 0.75\nvt 0 1\nvt 1 0/);
  assert.match(result.text, /vn 0 1 0\nvn 0 1 0\nvn 0 1 0/);
  assert.equal(parsed.stats.uvCoverage, 1);
  assert.equal(parsed.stats.normalCoverage, 1);
  const reversed = extractOriginalResidual(base + 'f 1/4/2 4/2/2 3/3/2\n', [base]);
  assert.notEqual(reversed.layoutSignature, result.layoutSignature);
});
test('residual extraction refuses absent part triangles and incomplete source UV', () => {
  assert.throws(() => extractOriginalResidual(merged, [vertices + 'f 2/2/1 3/3/1 4/4/1']), /100%/);
  assert.throws(() => extractOriginalResidual(merged.replace('1/4/2', '1//2'), [base]), /UV/);
});
test('layout signature detects UV changes even with identical geometry', () => {
  const original = extractOriginalResidual(merged, [base]);
  const changed = extractOriginalResidual(merged.replace('vt 0.25 0.75', 'vt 0.5 0.75'), [base]);
  assert.notEqual(original.layoutSignature, changed.layoutSignature);
});
