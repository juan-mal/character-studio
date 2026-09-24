import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetCatalog, CompatibilityCatalog, InspectionReport, Preset } from '../../src/assets/types.ts';
import { discover, expandSource, readRecord } from './files.ts';
import { digest } from './obj.ts';

export async function validateGenerated(root: string, verifySources = false): Promise<{ assets: number; meshes: number; images: number; originalsVerified: number }> {
  const read = async (relative: string): Promise<unknown> => JSON.parse(await readFile(path.join(root, relative), 'utf8')) as unknown;
  const catalog = await read('src/generated/assets.generated.json') as AssetCatalog;
  const compatibility = await read('src/generated/compatibility.generated.json') as CompatibilityCatalog;
  const presets = await read('src/generated/presets.generated.json') as { schemaVersion: number; presets: Preset[] };
  const report = await read('reports/asset-inspection.json') as InspectionReport;
  for (const data of [catalog, compatibility, presets, report]) assert.equal(data.schemaVersion, 1, 'schemaVersion inválido');
  const assetIds = new Set(catalog.assets.map(a => a.id)), meshIds = new Set(report.meshes.map(m => m.id)), imageIds = new Set(catalog.images.map(i => i.id));
  assert.equal(assetIds.size, catalog.assets.length, 'IDs de asset duplicados');
  assert.equal(meshIds.size, report.meshes.length, 'IDs de malla duplicados');
  assert.equal(imageIds.size, catalog.images.length, 'IDs de imagen duplicados');
  assert.equal(report.summary.objFiles, report.meshes.filter(m => !m.derivedFrom).length, 'Conteo OBJ originales incorrecto');
  assert.equal(report.summary.derivedObjFiles, report.meshes.filter(m => m.derivedFrom).length, 'Conteo OBJ derivados incorrecto');
  assert.equal(report.summary.imageFiles, catalog.images.length, 'Conteo de imágenes incorrecto');
  const ref = (set: Set<string>, id: string): void => assert.ok(set.has(id), `Referencia inexistente: ${id}`);
  const registered = new Set<string>();
  for (const asset of catalog.assets) {
    ref(meshIds, asset.mesh.id);
    for (const lod of asset.lods) { ref(meshIds, lod.meshId); assert.ok(!registered.has(lod.meshId), 'Malla en más de un grupo LOD'); registered.add(lod.meshId); }
    if (asset.metadata.mainApplication) {
      assert.ok(asset.mesh.geometry.valid && !asset.mesh.excluded && asset.mesh.geometry.bounds, `Asset habilitado sin geometría válida: ${asset.name}`);
      assert.ok(asset.mesh.lod === null || asset.mesh.lod === 0, `LOD reducido habilitado: ${asset.name}`);
    }
    for (const image of asset.previewCandidates) ref(imageIds, image.imageId);
    if (asset.preview) ref(imageIds, asset.preview.imageId);
    for (const variant of asset.textureVariants) for (const ids of Object.values(variant.maps)) for (const id of ids ?? []) ref(imageIds, id);
    for (const id of asset.variants.relatedAssetIds) ref(assetIds, id);
    for (const id of asset.compatibility.morphIds) assert.ok(compatibility.morphPairs.some(p => p.id === id && (p.a === asset.id || p.b === asset.id)), `Morph no recíproco: ${id}`);
    for (const id of asset.compatibility.relationIds) assert.ok(compatibility.pieceRelations.some(p => p.id === id && (p.a === asset.id || p.b === asset.id)), `Relación no recíproca: ${id}`);
  }
  assert.equal(registered.size, meshIds.size, 'OBJ perdido al agrupar LOD');
  for (const relation of [...compatibility.morphPairs, ...compatibility.pieceRelations]) { ref(assetIds, relation.a); ref(assetIds, relation.b); }
  for (const relation of compatibility.pieceRelations) for (const id of relation.sourceMeshIds) ref(meshIds, id);
  for (const preset of presets.presets) { for (const id of [...preset.bodyAssetIds, ...preset.hairAssetIds]) ref(assetIds, id); for (const id of preset.sourceMeshIds) ref(meshIds, id); assert.equal(preset.completeCharacter, false); }
  for (const image of catalog.images) if (image.duplicateOf) { ref(imageIds, image.duplicateOf); assert.equal(image.sha256, catalog.images.find(i => i.id === image.duplicateOf)?.sha256, 'Duplicado de imagen incorrecto'); }
  const records = [...report.meshes.filter(m => !m.derivedFrom), ...report.images, ...report.materials, ...report.relatedFiles];
  const manifest = digest(records.map(f => `${f.path}\t${f.sha256}`).sort().join('\n'));
  assert.equal(manifest, report.manifestHash, 'Huella de inventario incoherente');
  let originalsVerified = 0;
  if (verifySources) {
    const { files } = await discover(root, { sources: catalog.sources });
    assert.equal(files.length, records.length, 'Inventario de originales ha cambiado');
    const byPath = new Map(records.map(r => [r.path, r]));
    for (const file of files) { const { record } = await readRecord(file); assert.equal(record.sha256, byPath.get(record.path)?.sha256, `Contenido original cambió: ${record.path}`); originalsVerified++; }
    for (const mesh of report.meshes.filter(m => m.derivedFrom)) {
      for (const id of mesh.derivedFrom!.sourceMeshIds) ref(meshIds, id);
      const source = catalog.sources.find(s => s.id === mesh.sourceId);
      assert.ok(source, 'Fuente del derivado inexistente');
      const bytes = await readFile(path.resolve(expandSource(root, source.path), mesh.relativePath));
      assert.equal(digest(bytes), mesh.sha256, `Archivo derivado incoherente: ${mesh.path}`);
    }
  }
  return { assets: assetIds.size, meshes: meshIds.size, images: imageIds.size, originalsVerified };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateGenerated(process.cwd(), process.argv.includes('--sources')).then(result => console.log(`[assets] JSON y referencias verificados: ${JSON.stringify(result)}`)).catch((error: unknown) => { console.error(`[assets] ERROR: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
