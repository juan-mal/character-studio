import { enrichAssemblies } from "./assemblies.ts";
import {enrichHeadMixes} from './headMixes.ts';
import { lstat, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetCatalog, FileRecord, ImageRecord, MaterialRecord, MeshRecord, ScanConfig } from '../../src/assets/types.ts';
import { archetypeOf, classify, familyOf } from './classify.ts';
import { buildAssets } from './catalog.ts';
import { buildCompatibility } from './compatibility.ts';
import { discover, imageExtensions, parseConfig, readRecord } from './files.ts';
import { inspectImage, textureRole } from './images.ts';
import { parseMtl } from './materials.ts';
import { parseObj } from './obj.ts';
import { makeReport, markdownReport } from './report.ts';
import { enrichVerifiedPresets } from './reviewed-evidence.ts';

async function safeDirectory(root: string, relative: string): Promise<void> {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try { const stat = await lstat(current); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Salida insegura: ${relative}`); }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') await mkdir(current); else throw error; }
  }
}
async function writeOutputs(root: string, outputs: Record<string, string>): Promise<void> {
  for (const relative of ['src/generated', 'reports']) await safeDirectory(root, relative);
  for (const relative of Object.keys(outputs)) {
    try { if ((await lstat(path.join(root, relative))).isSymbolicLink()) throw new Error(`Salida es enlace: ${relative}`); }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  const staged: { temporary: string; destination: string }[] = [];
  try {
    for (const [relative, value] of Object.entries(outputs)) {
      const destination = path.join(root, relative), temporary = `${destination}.${process.pid}.tmp`;
      await writeFile(temporary, value, { encoding: 'utf8', flag: 'wx' }); staged.push({ temporary, destination });
    }
    for (const file of staged) await rename(file.temporary, file.destination);
  } finally { for (const file of staged) await unlink(file.temporary).catch(() => {}); }
}
export async function runScan(root: string, config: ScanConfig, log: (message: string) => void = console.log): Promise<void> {
  config = parseConfig(config);
  const lockPath = path.join(root, '.assets-scan.lock');
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Ya hay un scanner activo o un bloqueo residual (.assets-scan.lock). Comprueba que no hay otro proceso antes de retirarlo.'); });
  try {
    const { files, warnings } = await discover(root, config);
    if (!files.length) throw new Error('No se encontraron assets en las fuentes configuradas');
    log(`[assets] ${files.length} archivos relacionados en ${config.sources.length} fuentes. Leyendo originales…`);
    const meshes: MeshRecord[] = [], images: ImageRecord[] = [], materials: MaterialRecord[] = [], relatedFiles: FileRecord[] = [];
    let count = 0;
    for (const file of files) {
      const { record, data } = await readRecord(file);
      if (record.extension === '.obj') {
        const geometry = parseObj(data.toString('utf8')).stats;
        if (geometry.uvCoverage < 1) geometry.issues.push({ code: 'incomplete-uv', severity: 'warning', message: `UV asignadas a ${(geometry.uvCoverage * 100).toFixed(1)}% de esquinas` });
        if (geometry.normalCoverage < 1) geometry.issues.push({ code: 'incomplete-normals', severity: 'warning', message: `Normales asignadas a ${(geometry.normalCoverage * 100).toFixed(1)}% de esquinas` });
        meshes.push({ ...record, ...classify(record.name, geometry), geometry });
        count++; if (count % 200 === 0) log(`[assets] ${count} OBJ inspeccionados`);
      } else if (record.extension === '.mtl') materials.push({ ...record, definitions: parseMtl(data.toString('utf8'), record.id), issues: [] });
      else if (imageExtensions.has(record.extension)) images.push({ ...record, usage: file.source.kind === 'preview' || /(?:^|_)(UI|Preview|Thumb|Thumbnail|Icon)(?:_|$)/i.test(record.name) || /(?:^|\/)(sprites?|previews?|thumbnails?)(?:\/|$)/i.test(record.relativePath) ? 'preview' : 'texture', role: textureRole(record.name), family: familyOf(record.name), archetype: archetypeOf(record.name), ...inspectImage(data, record.extension), duplicateOf: null });
      else relatedFiles.push(record);
    }
    const imageHashes = new Map<string, string>();
    for (const image of images) { const key = `${image.usage}/${image.sha256}`; image.duplicateOf = imageHashes.get(key) ?? null; if (!image.duplicateOf) imageHashes.set(key, image.id); }
    log(`[assets] ${meshes.length} OBJ, ${images.length} imágenes, ${materials.length} MTL. Contrastando compatibilidad…`);
    const assets = buildAssets(meshes, images, materials);
    const { compatibility, presets } = await buildCompatibility(root, config.sources, assets, meshes);
    const reviewed = await enrichVerifiedPresets(root, config, assets, meshes, images, compatibility, presets);
    warnings.push(...reviewed.warnings);
    const catalog: AssetCatalog = { schemaVersion: 1, sources: config.sources, assets, images, materials, relatedFiles };
    await enrichAssemblies(root, catalog, compatibility, presets, warnings);
    await enrichHeadMixes(root,catalog,compatibility,warnings);
    const report = makeReport(catalog, meshes, compatibility, presets, warnings);
    const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
    await writeOutputs(root, {
      'src/generated/assets.generated.json': json(catalog),
      'src/generated/compatibility.generated.json': json(compatibility),
      'src/generated/presets.generated.json': json({ schemaVersion: 1, presets }),
      'reports/asset-inspection.json': json(report),
      'reports/asset-inspection.md': markdownReport(report, catalog, compatibility, presets),
    });
    log(`[assets] Finalizado: ${report.summary.mainCharacterPieces} piezas candidatas, ${report.summary.excludedObjFiles} OBJ excluidos, ${report.summary.exactMorphPairs} pares morph exactos. Informe: reports/asset-inspection.md`);
  } finally { await lock.close(); await unlink(lockPath); }
}
async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(a => a !== '--');
  if (args.includes('--help')) { console.log('Uso: pnpm assets:scan [--config ruta.json]\nFuentes: assets.scan.json; rutas relativas al proyecto o ~/...\nSalidas: src/generated y reports. Originales de solo lectura.'); return; }
  if (args.length && (args.length !== 2 || args[0] !== '--config')) throw new Error('Argumentos inválidos. Usa --help.');
  const root = process.cwd(), configPath = path.resolve(root, args[1] ?? 'assets.scan.json');
  const config = parseConfig(JSON.parse(await readFile(configPath, 'utf8')) as unknown);
  await runScan(root, config);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error: unknown) => { console.error(`[assets] ERROR: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
