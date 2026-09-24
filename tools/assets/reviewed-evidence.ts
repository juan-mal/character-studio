import path from 'node:path';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import type { AssetDefinition, BuildVariant, CompatibilityCatalog, ImageRecord, MeshRecord, Preset, ScanConfig, TextureRole } from '../../src/assets/types.ts';
import { buildAssets } from './catalog.ts';
import { classify } from './classify.ts';
import { surfaceCoverage } from './compatibility.ts';
import { expandSource } from './files.ts';
import { digest, parseObj, pointKey } from './obj.ts';
import type { ParsedObj } from './obj.ts';

const QUANTIZATION = 0.0001;
function triangleKey(mesh: ParsedObj, face: number[]): string {
  return face.map(i => pointKey(mesh.positions[i]!, QUANTIZATION)).sort().join('|');
}
function triangleKeys(mesh: ParsedObj): Set<string> {
  return new Set(mesh.polygons.flatMap(face => face.slice(1, -1).map((_, i) => triangleKey(mesh, [face[0]!, face[i + 1]!, face[i + 2]!]))));
}
interface Corner { v: number; t: number; n: number }
/** Subtracts only measured source triangles. It never invents, fits or scales a point. */
export function extractOriginalResidual(mergedText: string, partTexts: string[]): { text: string; layoutSignature: string; triangleCount: number } {
  const merged = parseObj(mergedText), parts = partTexts.map(parseObj);
  if (!merged.stats.valid || merged.stats.uvCoverage !== 1 || merged.stats.normalCoverage !== 1 || !parts.length) throw new Error('Se requieren geometría válida, UV y normales completas.');
  const known = new Set<string>();
  for (const part of parts) {
    if (!part.stats.valid) throw new Error('Pieza individual inválida.');
    const coverage = surfaceCoverage(part, merged);
    if (coverage.vertexCoverage !== 1 || coverage.triangleCoverage !== 1) throw new Error('La pieza no está contenida al 100% en el merged.');
    for (const key of triangleKeys(part)) known.add(key);
  }
  const uv: number[][] = [], normals: number[][] = [], faces: Corner[][] = [];
  let vertexCount = 0;
  const index = (value: string | undefined, length: number): number => {
    const number = Number(value); return number < 0 ? length + number : number - 1;
  };
  for (const raw of mergedText.replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const line = raw.split('#')[0]!.trim(), tokens = line.split(/\s+/), command = tokens.shift();
    if (command === 'v') vertexCount++;
    else if (command === 'vt') uv.push(tokens.map(Number));
    else if (command === 'vn') normals.push(tokens.map(Number));
    else if (command === 'f') {
      const polygon = tokens.map(token => { const values = token.split('/'); return { v: index(values[0], vertexCount), t: index(values[1], uv.length), n: index(values[2], normals.length) }; });
      for (let i = 1; i < polygon.length - 1; i++) {
        const triangle = [polygon[0]!, polygon[i]!, polygon[i + 1]!];
        if (!known.has(triangleKey(merged, triangle.map(c => c.v)))) faces.push(triangle);
      }
    }
  }
  if (!faces.length) throw new Error('El merged no contiene superficie residual.');
  const corners = new Map<string, number>(), records: Corner[] = [];
  const outputFaces = faces.map(face => face.map(c => {
    const key = `${c.v}/${c.t}/${c.n}`;
    let id = corners.get(key);
    if (id === undefined) { records.push(c); id = records.length; corners.set(key, id); }
    return `${id}/${id}/${id}`;
  }));
  const cornerValue = (c: Corner): string => JSON.stringify([merged.positions[c.v], uv[c.t], normals[c.n]]);
  // Cyclic rotation preserves winding; only face order and index numbering are ignored.
  const signature = faces.map(face => {
    const values = face.map(cornerValue);
    return values.map((_, i) => [...values.slice(i), ...values.slice(0, i)].join('|')).sort()[0]!;
  }).sort().join('\n');
  const text = ['# Residual de triangulos originales; sin transformar posiciones, UV ni normales.',
    'g OriginalResidual',
    ...records.map(c => `v ${merged.positions[c.v]!.join(' ')}`),
    ...records.map(c => `vt ${uv[c.t]!.join(' ')}`),
    ...records.map(c => `vn ${normals[c.n]!.join(' ')}`),
    ...outputFaces.map(f => `f ${f.join(' ')}`), ''].join('\n');
  const stats = parseObj(text).stats;
  if (!stats.valid || stats.uvCoverage !== 1 || stats.normalCoverage !== 1 || stats.triangleCount !== faces.length) throw new Error('Residual derivado inválido.');
  return { text, layoutSignature: digest(signature), triangleCount: faces.length };
}

async function safeOutput(root: string, relative: string, data: string): Promise<void> {
  let current = root;
  for (const part of path.posix.dirname(relative).split('/')) {
    current = path.join(current, part);
    try { const stat = await lstat(current); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Salida insegura: ${relative}`); }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') await mkdir(current); else throw error; }
  }
  const destination = path.resolve(root, relative);
  try { const stat = await lstat(destination); if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Salida insegura: ${relative}`); }
  catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
  await writeFile(destination, data, 'utf8');
}
export interface ReviewedEvidenceResult {
  derivedAssets: AssetDefinition[];
  derivedMeshes: MeshRecord[];
  presetHeadAssetIds: Record<string, string>;
  warnings: string[];
}
interface ResidualReviewRule {
  id: string;
  match: { archetype: string; buildVariant: BuildVariant; bodyFamily: string; hairFamilies: string[] };
  expected: { sourceCount: number; triangleCount: number; layoutSignature: string; sourceHashes: string[] };
  output: { displayName: string; meshName: string; family: string; relativePath: string };
  review: { reviewedAt: string; method: string; evidence: string[] };
}
interface TextureReviewRule {
  id: string;
  mesh: { name: string; sha256: string };
  image: { name: string; sha256: string };
  variantName: string;
  role: 'baseColor' | 'diffuse' | 'albedo';
  review: { reviewedAt: string; method: string; evidence: string[]; artifacts: string[] };
}
interface AssetReviewRule {
  id: string;
  mesh: {name: string; sha256: string};
  renderSide?: 'front' | 'double';
  shading?: 'anime-static';
  tintable?: boolean;
  preview?: {name: string; sha256: string};
  review: {method: string; evidence: string[]};
}
interface ReviewedConfig { schemaVersion: 1; residualRules: ResidualReviewRule[]; textureRules: TextureReviewRule[]; assetRules?: AssetReviewRule[] }
async function readReviewRules(root: string): Promise<ReviewedConfig> {
  let text: string;
  try { text = await readFile(path.join(root, 'assets.reviewed.json'), 'utf8'); }
  catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return { schemaVersion: 1, residualRules: [], textureRules: [] }; throw error; }
  const data = JSON.parse(text) as ReviewedConfig;
  if (data.schemaVersion !== 1 || !Array.isArray(data.residualRules)) throw new Error('assets.reviewed.json requiere schemaVersion 1 y residualRules.');
  for (const rule of data.residualRules) {
    if (!rule.id || !rule.match || !rule.expected || !rule.output || !rule.review || !Array.isArray(rule.review.evidence)) throw new Error('Regla de revisión incompleta.');
    if (!Array.isArray(rule.match.hairFamilies) || rule.match.hairFamilies.length < 2 || new Set(rule.match.hairFamilies).size !== rule.match.hairFamilies.length) throw new Error(`Familias de evidencia inválidas: ${rule.id}`);
    if (!Number.isSafeInteger(rule.expected.sourceCount) || rule.expected.sourceCount !== rule.match.hairFamilies.length || !Number.isSafeInteger(rule.expected.triangleCount) || rule.expected.triangleCount < 1) throw new Error(`Métricas revisadas inválidas: ${rule.id}`);
    if (!Array.isArray(rule.expected.sourceHashes) || rule.expected.sourceHashes.length !== rule.expected.sourceCount || new Set(rule.expected.sourceHashes).size !== rule.expected.sourceCount || ![...rule.expected.sourceHashes, rule.expected.layoutSignature].every(hash => /^[a-f0-9]{64}$/.test(hash))) throw new Error(`Hashes revisados inválidos: ${rule.id}`);
    if (!/^src\/generated\/meshes\/[a-zA-Z0-9_-]+\.obj$/.test(rule.output.relativePath) || !/^[a-zA-Z0-9_-]+$/.test(rule.output.meshName) || !rule.output.displayName || !rule.output.family) throw new Error(`Salida revisada inválida: ${rule.id}`);
  }
  if (new Set(data.residualRules.map(rule => rule.id)).size !== data.residualRules.length || new Set(data.residualRules.map(rule => rule.output.relativePath)).size !== data.residualRules.length) throw new Error('Reglas de revisión duplicadas.');
  data.textureRules ??= [];
  if (!Array.isArray(data.textureRules)) throw new Error('textureRules debe ser una lista.');
  for (const rule of data.textureRules) {
    if (!rule.id || !rule.mesh?.name || !rule.image?.name || !rule.variantName || !['baseColor', 'diffuse', 'albedo'].includes(rule.role) || ![rule.mesh.sha256, rule.image.sha256].every(hash => /^[a-f0-9]{64}$/.test(hash)) || !rule.review?.method || !Array.isArray(rule.review.evidence) || !Array.isArray(rule.review.artifacts)) throw new Error('Regla de revisión de textura inválida.');
  }
  if (new Set(data.textureRules.map(rule => rule.id)).size !== data.textureRules.length) throw new Error('Revisiones de textura duplicadas.');
  if (data.assetRules !== undefined && !Array.isArray(data.assetRules)) throw new Error('assetRules debe ser una lista.');
  for (const rule of data.assetRules ?? []) {
    if (!rule.id || !rule.mesh?.name || !/^[a-f0-9]{64}$/.test(rule.mesh.sha256) || !rule.review?.method || !rule.review.evidence?.length || (rule.renderSide !== undefined && !['front','double'].includes(rule.renderSide)) || (rule.shading !== undefined && rule.shading !== 'anime-static') || (rule.tintable !== undefined && typeof rule.tintable !== 'boolean') || (rule.preview && (!rule.preview.name || !/^[a-f0-9]{64}$/.test(rule.preview.sha256)))) throw new Error('Regla de asset revisado inválida.');
  }
  if (new Set((data.assetRules ?? []).map(rule => rule.mesh.sha256 + rule.mesh.name)).size !== (data.assetRules ?? []).length) throw new Error('Revisiones de asset duplicadas.');
  return data;
}
/** Data-driven reviewed rules are reapplied only after independently reproducing their evidence. */
export async function enrichVerifiedPresets(root: string, config: ScanConfig, assets: AssetDefinition[], meshes: MeshRecord[], images: ImageRecord[], compatibility: CompatibilityCatalog, presets: Preset[]): Promise<ReviewedEvidenceResult> {
  const result: ReviewedEvidenceResult = { derivedAssets: [], derivedMeshes: [], presetHeadAssetIds: {}, warnings: [] };
  let reviewed: ReviewedConfig;
  try { reviewed = await readReviewRules(root); }
  catch (error) { result.warnings.push(`Revisiones omitidas: ${error instanceof Error ? error.message : String(error)}`); return result; }
  if (!reviewed.residualRules.length && !reviewed.textureRules.length && !reviewed.assetRules?.length) return result;
  const projectSource = config.sources.find(source => source.id === 'project' && path.resolve(expandSource(root, source.path)) === path.resolve(root));
  for (const rule of reviewed.residualRules) try {
    if (!projectSource) throw new Error('Falta fuente project apuntando a la raíz.');
    const selected = presets.filter(p => p.status === 'geometry-supported' && p.archetype === rule.match.archetype && p.buildVariant === rule.match.buildVariant && p.bodyFamily === rule.match.bodyFamily && rule.match.hairFamilies.includes(p.hairFamily ?? ''));
    if (selected.length !== rule.expected.sourceCount || new Set(selected.map(p => p.hairFamily)).size !== rule.expected.sourceCount) throw new Error(`No se encontraron las ${rule.expected.sourceCount} combinaciones revisadas.`);
    const read = async (mesh: MeshRecord): Promise<string> => {
      const source = config.sources.find(s => s.id === mesh.sourceId);
      if (!source) throw new Error(`Fuente ausente: ${mesh.sourceId}`);
      const data = await readFile(path.resolve(expandSource(root, source.path), mesh.relativePath));
      if (digest(data) !== mesh.sha256) throw new Error(`El original cambió durante la inspección: ${mesh.name}`);
      return data.toString('utf8');
    };
    const evidence: { preset: Preset; merged: MeshRecord; body: AssetDefinition; hair: AssetDefinition; residual: ReturnType<typeof extractOriginalResidual> }[] = [];
    for (const preset of [...selected].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (preset.sourceMeshIds.length !== 1 || preset.bodyAssetIds.length !== 1 || preset.hairAssetIds.length !== 1) throw new Error('La combinación revisada es ambigua.');
      const merged = meshes.find(m => m.id === preset.sourceMeshIds[0]), body = assets.find(a => a.id === preset.bodyAssetIds[0]), hair = assets.find(a => a.id === preset.hairAssetIds[0]);
      if (!merged || !body || !hair) throw new Error('Falta una fuente de evidencia.');
      if (!rule.expected.sourceHashes.includes(merged.sha256)) throw new Error(`El merged no coincide con la revisión registrada: ${merged.name}`);
      const residual = extractOriginalResidual(await read(merged), [await read(body.mesh), await read(hair.mesh)]);
      if (residual.triangleCount !== rule.expected.triangleCount) throw new Error(`Cambió el residual revisado: se esperaban ${rule.expected.triangleCount} triángulos.`);
      evidence.push({ preset, merged, body, hair, residual });
    }
    const first = evidence[0]!;
    if (!evidence.every(row => row.body.id === first.body.id) || new Set(evidence.map(row => row.merged.sha256)).size !== rule.expected.sourceCount) throw new Error('Las fuentes revisadas no son independientes o no comparten cuerpo.');
    if (!evidence.every(row => row.residual.layoutSignature === rule.expected.layoutSignature)) throw new Error('Los merged no comparten posiciones, UV, normales y winding exactamente idénticos al residual revisado.');
    const relativePath = rule.output.relativePath;
    const sources = evidence.map(row => ({ meshId: row.merged.id, sourceId: row.merged.sourceId, relativePath: row.merged.relativePath, sha256: row.merged.sha256 }));
    const text = sources.map(source => `# Source ${source.sourceId}/${source.relativePath} sha256=${source.sha256}`).join('\n') + '\n' + first.residual.text;
    const geometry = parseObj(text).stats, name = rule.output.meshName;
    const mesh: MeshRecord = { id: digest(`project/${relativePath}`).slice(0, 20), sourceId: 'project', relativePath, path: `project/${relativePath}`, name, extension: '.obj', sizeBytes: Buffer.byteLength(text), sha256: digest(text), ...classify(name, geometry), family: rule.output.family, morphFamily: rule.output.family, lod: 0, quality: 'high', geometry, derivedFrom: { method: 'subtract-original-triangles', sourceMeshIds: sources.map(source => source.meshId) } };
    const asset = buildAssets([mesh], images, [])[0]!;
    asset.name = rule.output.displayName;
    const provenance = [`Regla revisada ${rule.id}: ${rule.review.method} (${rule.review.reviewedAt}).`, 'Resta de cuerpo y pelo con 100% de posiciones y triángulos contenidos; cuantización 0.0001.', `Residual de ${rule.expected.triangleCount} triángulos idéntico en posiciones, UV, normales y orientación entre ${rule.expected.sourceCount} merged.`, ...rule.review.evidence, ...sources.map(source => `Fuente ${source.meshId}; SHA-256 ${source.sha256}`)];
    mesh.evidence.push(...provenance); asset.metadata.reasons.push(...provenance);
    const relation = { id: `derived-head-${digest(asset.id + first.body.id).slice(0, 16)}`, a: asset.id, b: first.body.id, kind: 'face-body' as const, confidence: 'confirmed' as const, status: 'supported' as const, evidence: provenance, metrics: { quantization: QUANTIZATION, bodyVertexCoverage: 1, bodyTriangleCoverage: 1, hairVertexCoverage: 1, hairTriangleCoverage: 1, residualTriangleCount: rule.expected.triangleCount, identicalSourceCount: rule.expected.sourceCount }, sourceMeshIds: sources.map(source => source.meshId) };
    await safeOutput(root, relativePath, text);
    await safeOutput(root, relativePath.replace(/\.obj$/, '.provenance.json'), JSON.stringify({ schemaVersion: 1, reviewedRuleId: rule.id, method: 'subtract-original-triangles', quantization: QUANTIZATION, sources, removedParts: evidence.map(row => ({ bodyMeshId: row.body.mesh.id, bodySha256: row.body.mesh.sha256, hairMeshId: row.hair.mesh.id, hairSha256: row.hair.mesh.sha256 })), derivedSha256: mesh.sha256, layoutSignature: first.residual.layoutSignature, evidence: provenance }, null, 2) + '\n');
    assets.push(asset); meshes.push(mesh); compatibility.pieceRelations.push(relation);
    asset.compatibility.relationIds.push(relation.id); first.body.compatibility.relationIds.push(relation.id);
    for (const row of evidence) { result.presetHeadAssetIds[row.preset.id] = asset.id; row.preset.evidence.push(`Superficie original recuperada: ${asset.id}; composición geométrica con cuerpo y pelo en coordenadas originales. Textura y rig requieren evidencia aparte.`); }
    result.derivedAssets.push(asset); result.derivedMeshes.push(mesh);
  } catch (error) { result.warnings.push(`Residual derivado omitido (${rule.id}): ${error instanceof Error ? error.message : String(error)}`); }
  for (const rule of reviewed.textureRules) try {
    const matches = assets.filter(asset => asset.mesh.name === rule.mesh.name && asset.mesh.sha256 === rule.mesh.sha256);
    const imageMatches = images.filter(image => image.name === rule.image.name && image.sha256 === rule.image.sha256 && image.usage === 'texture' && image.inspection !== 'failed');
    if (matches.length !== 1 || imageMatches.length !== 1) throw new Error('Malla/imagen ausente, cambiada o ambigua respecto a los hashes revisados.');
    const asset = matches[0]!, image = imageMatches[0]!;
    for (const file of [asset.mesh, image]) {
      const source = config.sources.find(candidate => candidate.id === file.sourceId);
      if (!source || digest(await readFile(path.resolve(expandSource(root, source.path), file.relativePath))) !== file.sha256) throw new Error('El archivo cambió después del inventario.');
    }
    if (!asset.mesh.geometry.valid || asset.mesh.geometry.uvCoverage !== 1) throw new Error('La malla revisada requiere UV completas.');
    // Promote only the inspected color image. A neighboring Lightmap/SDF remains unreviewed.
    asset.textureVariants = asset.textureVariants.map(variant => ({ ...variant, maps: Object.fromEntries(Object.entries(variant.maps).map(([role, ids]) => [role, ids.filter(id => id !== image.id)]).filter(([, ids]) => (ids as string[]).length)) as Partial<Record<TextureRole, string[]>> })).filter(variant => Object.keys(variant.maps).length > 0);
    asset.textureVariants.push({ id: `reviewed-${digest(rule.id).slice(0, 20)}`, name: rule.variantName, confidence: 'confirmed', maps: { [rule.role]: [image.id] }, requiresVisualValidation: false, evidence: [`reviewed-confirmed: ${rule.review.method} (${rule.review.reviewedAt}); regla ${rule.id}.`, 'Asociación visual de UV revisada; no es una referencia MTL ni prueba del material original.', `SHA-256 malla ${rule.mesh.sha256}; imagen ${rule.image.sha256}`, ...rule.review.evidence, ...rule.review.artifacts.map(artifact => `Inspección: ${artifact}`)] });
    asset.metadata.textureStatus = 'reviewed';
    asset.metadata.reasons = [...new Set([...asset.metadata.reasons, ...rule.review.evidence])];
  } catch (error) { result.warnings.push(`Textura revisada omitida (${rule.id}): ${error instanceof Error ? error.message : String(error)}`); }
  for (const rule of reviewed.assetRules ?? []) try {
    const matches = assets.filter(asset => asset.mesh.name === rule.mesh.name && asset.mesh.sha256 === rule.mesh.sha256 && asset.mesh.geometry.valid);
    if (matches.length !== 1) throw new Error('Malla ausente, modificada o ambigua.');
    const asset = matches[0]!;
    const source = config.sources.find(source => source.id === asset.mesh.sourceId);
    if (!source || digest(await readFile(path.resolve(expandSource(root, source.path), asset.mesh.relativePath))) !== rule.mesh.sha256) throw new Error('La malla cambió tras la inspección.');
    if (rule.preview) {
      const previews = images.filter(image => image.name === rule.preview!.name && image.sha256 === rule.preview!.sha256 && image.usage === 'preview' && image.inspection !== 'failed');
      if (previews.length !== 1) throw new Error('Preview ausente, modificado o ambiguo.');
      asset.preview = {imageId: previews[0]!.id, confidence: 'confirmed', evidence: [rule.review.method, ...rule.review.evidence]};
    }
    if (rule.renderSide) asset.metadata.renderSide = rule.renderSide;
    if (rule.shading) asset.metadata.shading = rule.shading;
    if (rule.tintable !== undefined) asset.tintable = rule.tintable;
    asset.metadata.reasons.push(`Revisión ${rule.id}: ${rule.review.method}`, ...rule.review.evidence);
  } catch (error) { result.warnings.push(`Revisión de asset omitida (${rule.id}): ${error instanceof Error ? error.message : String(error)}`); }
  return result;
}
