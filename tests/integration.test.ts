import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runScan } from '../tools/assets/scan.ts';
import { validateGenerated } from '../tools/assets/validate.ts';
import { discover } from '../tools/assets/files.ts';
import type { AssetCatalog, CompatibilityCatalog } from '../src/assets/types.ts';

test('discovery excludes browser artifacts without excluding original images', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'character-discovery-'));
  try {
    for (const directory of ['test-results/run/resources', 'playwright-report/data', 'reports/audit', 'src/generated', 'art']) {
      await mkdir(path.join(root, directory), { recursive: true });
      await writeFile(path.join(root, directory, 'preview.png'), 'fixture');
    }
    const result = await discover(root, { sources: [{ id: 'project', path: '.', kind: 'mixed' }] });
    assert.deepEqual(result.files.map(file => file.relativePath), ['art/preview.png']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('scan is deterministic, preserves originals, handles materials and does not invent missing preset parts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'character-scan-'));
  try {
    const source = path.join(root, 'input with spaces'); await mkdir(source);
    const mesh = 'mtllib "skin material.mtl"\nusemtl skin\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n';
    const files: Record<string, string | Buffer> = {
      'Body003_Standard.obj': mesh, 'Body003_Fat.obj': mesh.replace('v 0 1 0', 'v 0 2 0'),
      'Body003_Strong.obj': mesh.replace('f 1/1 2/2 3/3', 'f 1/1 3/3 2/2'),
      'Body003_Standard_LOD1.obj': mesh, 'Face003.obj': mesh,
      'MergedMeshLod0_NPC_Male_Standard_Body003_Hair999.obj': mesh,
      'Area_Chair.obj': mesh, 'broken.obj': 'v NaN 0 0\nf 1 2 3',
      'skin material.mtl': 'newmtl skin\nmap_Kd skin color.png',
      'skin color.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64'),
    };
    for (const [name, value] of Object.entries(files)) await writeFile(path.join(source, name), value);
    const config = { sources: [{ id: 'fixture', path: 'input with spaces', kind: 'mixed' as const }] };
    await runScan(root, config, () => {});
    const outputPaths = ['src/generated/assets.generated.json', 'src/generated/compatibility.generated.json', 'src/generated/presets.generated.json', 'reports/asset-inspection.json', 'reports/asset-inspection.md'];
    const before = await Promise.all(outputPaths.map(p => readFile(path.join(root, p), 'utf8')));
    const catalog = JSON.parse(before[0]!) as AssetCatalog;
    const compatibility = JSON.parse(before[1]!) as CompatibilityCatalog;
    assert.equal(catalog.assets.find(a => a.name === 'Body003_Standard')?.metadata.textureStatus, 'referenced');
    assert.equal(catalog.assets.find(a => a.name === 'Body003_Standard')?.lods.length, 2);
    assert.equal(catalog.assets.find(a => a.name === 'Area_Chair')?.metadata.mainApplication, false);
    assert.equal(compatibility.morphPairs.filter(p => p.morphCompatibility === 'exact').length, 1);
    assert.equal(compatibility.morphPairs.filter(p => p.morphCompatibility === 'incompatible').length, 2);
    assert.ok(before[2]!.includes('Hair999_Standard'));
    assert.equal(compatibility.pieceRelations.some(r => r.kind === 'face-body' && r.confidence === 'confirmed'), false);
    await validateGenerated(root, true);
    compatibility.morphPairs[0]!.a = 'nonexistent-asset';
    await writeFile(path.join(root, outputPaths[1]!), JSON.stringify(compatibility));
    await assert.rejects(validateGenerated(root), /referencia|asset|recíproco/i);
    await runScan(root, config, () => {});
    const after = await Promise.all(outputPaths.map(p => readFile(path.join(root, p), 'utf8')));
    assert.deepEqual(after, before);
    assert.equal((await readdir(source)).length, Object.keys(files).length);
    for (const [name, value] of Object.entries(files)) assert.deepEqual(await readFile(path.join(source, name)), Buffer.from(value));
    await assert.rejects(runScan(root, { sources: [{ id: 'absent', path: 'does not exist', kind: 'mesh' }] }, () => {}), /fuente/i);
    assert.deepEqual(await readFile(path.join(root, outputPaths[0]!), 'utf8'), before[0]);
    const reviewedBody = catalog.assets.find(asset => asset.name === 'Body003_Standard')!;
    await writeFile(path.join(root, 'assets.reviewed.json'), JSON.stringify({ schemaVersion: 1, residualRules: [], textureRules: [], assetRules: [{id:'review-body',mesh:{name:reviewedBody.mesh.name,sha256:reviewedBody.mesh.sha256},renderSide:'double',shading:'anime-static',tintable:true,review:{method:'Fixture de prueba de revisión',evidence:['Superficie y textura comprobadas en el fixture.']}}] }));
    await runScan(root, config, () => {});
    const reviewed = JSON.parse(await readFile(path.join(root, outputPaths[0]!), 'utf8')) as AssetCatalog;
    assert.equal(reviewed.assets.find(asset => asset.id === reviewedBody.id)?.metadata.renderSide, 'double');
    assert.equal(reviewed.assets.find(asset => asset.id === reviewedBody.id)?.tintable, true);
    assert.equal(reviewed.assets.find(asset => asset.id === reviewedBody.id)?.metadata.shading, 'anime-static');
    await writeFile(path.join(source, 'Body003_Standard.obj'), mesh + '\n# nueva revisión\n');
    await runScan(root, config, () => {});
    const changed = JSON.parse(await readFile(path.join(root, outputPaths[0]!), 'utf8')) as AssetCatalog;
    assert.equal(changed.assets.find(asset => asset.id === reviewedBody.id)?.metadata.renderSide, undefined);
    assert.equal(changed.assets.find(asset => asset.id === reviewedBody.id)?.metadata.shading, undefined);
    assert.notEqual(changed.assets.find(asset => asset.id === reviewedBody.id)?.tintable, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
