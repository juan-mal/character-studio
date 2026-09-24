import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { AssetDefinition, CompatibilityCatalog, GeometryStats, MeshRecord, PieceRelation, Preset, Source } from '../../src/assets/types.ts';
import { compareMorph, digest, distance, parseObj, pointKey } from './obj.ts';
import type { ParsedObj } from './obj.ts';
import { expandSource } from './files.ts';

function triangleKeys(mesh: ParsedObj): Set<string> {
  const keys = new Set<string>();
  for (const face of mesh.polygons) for (let i = 1; i < face.length - 1; i++) keys.add([face[0]!, face[i]!, face[i + 1]!].map(index => pointKey(mesh.positions[index]!, 0.0001)).sort().join('|'));
  return keys;
}
export function surfaceCoverage(part: ParsedObj, merged: ParsedObj): { vertexCoverage: number; triangleCoverage: number } {
  const mergedVertices = new Set(merged.positions.map(p => pointKey(p, 0.0001))), partVertices = new Set(part.positions.map(p => pointKey(p, 0.0001)));
  const mergedTriangles = triangleKeys(merged), partTriangles = triangleKeys(part);
  return {
    vertexCoverage: partVertices.size ? [...partVertices].filter(p => mergedVertices.has(p)).length / partVertices.size : 0,
    triangleCoverage: partTriangles.size ? [...partTriangles].filter(p => mergedTriangles.has(p)).length / partTriangles.size : 0,
  };
}
export function junctionMetrics(a: GeometryStats, b: GeometryStats): Record<string, number | null> {
  if (!a.bounds || !b.bounds) return { boundsGap: null, minimumBoundaryDistance: null, nearBoundarySamples: 0, scaleRatio: null };
  const scaleA = Math.max(...a.bounds.dimensions), scaleB = Math.max(...b.bounds.dimensions);
  const tolerance = Math.max(scaleA, scaleB) * 0.005;
  let minimum = Infinity, near = 0;
  for (const pa of a.boundarySamples) {
    let nearest = Infinity;
    for (const pb of b.boundarySamples) nearest = Math.min(nearest, distance(pa, pb));
    minimum = Math.min(minimum, nearest); if (nearest <= tolerance) near++;
  }
  const gap = Math.hypot(...([0, 1, 2] as const).map(k => Math.max(0, a.bounds!.min[k] - b.bounds!.max[k], b.bounds!.min[k] - a.bounds!.max[k])));
  return { boundsGap: gap, minimumBoundaryDistance: Number.isFinite(minimum) ? minimum : null, nearBoundarySamples: near, sampleTolerance: tolerance, scaleRatio: scaleB ? scaleA / scaleB : null };
}
function link(assets: AssetDefinition[], relations: PieceRelation[], relation: PieceRelation): void {
  relations.push(relation);
  for (const asset of assets) if (asset.id === relation.a || asset.id === relation.b) asset.compatibility.relationIds.push(relation.id);
}
function inferMorphs(assets: AssetDefinition[]): CompatibilityCatalog['morphPairs'] {
  const pairs: CompatibilityCatalog['morphPairs'] = [];
  const eligible = assets.filter(a => !a.mesh.excluded && a.mesh.buildVariant !== null);
  for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) {
    const a = eligible[i]!, b = eligible[j]!;
    if (a.mesh.morphFamily.toLowerCase() !== b.mesh.morphFamily.toLowerCase() || a.mesh.sourceId !== b.mesh.sourceId || path.posix.dirname(a.mesh.relativePath) !== path.posix.dirname(b.mesh.relativePath) || (a.mesh.lod ?? 0) !== (b.mesh.lod ?? 0) || a.mesh.buildVariant === b.mesh.buildVariant) continue;
    const pair = { id: `morph-${digest(a.id + b.id).slice(0, 16)}`, a: a.id, b: b.id, ...compareMorph(a.mesh.geometry, b.mesh.geometry) };
    pairs.push(pair); a.compatibility.morphIds.push(pair.id); b.compatibility.morphIds.push(pair.id);
    a.variants.relatedAssetIds.push(b.id); b.variants.relatedAssetIds.push(a.id);
  }
  return pairs;
}
const baseNames = ['Top_BaseBody_Upper01', 'Bottom_BaseBody_Lower01', 'Hand_BaseBody_HandL01', 'Hand_BaseBody_HandR01', 'Shoe_BaseBody_FootL01', 'Shoe_BaseBody_FootR01', 'ArmAcc_BaseBody_ArmL01', 'ArmAcc_BaseBody_ArmR01', 'LegAcc_BaseBody_LegL01', 'LegAcc_BaseBody_LegR01', 'Earwear_BaseBody_Ear01', 'Earwear_BaseBody_Ear02'];
function inferJunctions(assets: AssetDefinition[], relations: PieceRelation[]): CompatibilityCatalog['baseBody'] {
  const base = assets.filter(a => a.family === 'BaseBody' && !a.mesh.excluded);
  for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++) {
    const a = base[i]!, b = base[j]!, metrics = junctionMetrics(a.mesh.geometry, b.mesh.geometry);
    const touching = (metrics.nearBoundarySamples ?? 0) >= 3 && (metrics.minimumBoundaryDistance ?? Infinity) < (metrics.sampleTolerance ?? 0);
    const materialShared = a.mesh.geometry.referencedMaterials.some(m => b.mesh.geometry.referencedMaterials.includes(m));
    link(assets, relations, { id: `junction-${digest(a.id + b.id).slice(0, 16)}`, a: a.id, b: b.id, kind: 'basebody-junction', confidence: touching ? 'probable' : 'unresolved', status: touching ? 'supported' : 'unresolved', metrics, sourceMeshIds: [], evidence: ['Convención BaseBody compartida', 'Comparación en coordenadas originales sin reescalar ni alinear', `Bordes soldados a 1e-6; hasta 128 muestras por pieza; tolerancia relativa 0.5%`, materialShared ? 'Material referenciado compartido' : 'Sin evidencia de material compartido', 'Proximidad no demuestra continuidad completa ni cobertura anatómica'] });
  }
  const missingNames = baseNames.filter(name => !base.some(a => a.mesh.lodKey === name.toLowerCase()));
  const count = relations.filter(r => r.kind === 'basebody-junction' && r.status === 'supported').length;
  return { assetIds: base.map(a => a.id), missingNames, completeCharacter: false, conclusion: `${base.length}/12 piezas esperadas encontradas; ${count} parejas con proximidad de bordes. ${count ? 'Hay evidencia espacial de un sistema modular común.' : 'El nombre compartido no demuestra uniones.'} No se ha demostrado personaje completo: no hay cabeza BaseBody identificada, rig ni validación de todas las costuras.` };
}
function inferFaces(assets: AssetDefinition[], relations: PieceRelation[]): void {
  const bodies = assets.filter(a => a.category === 'body' && a.metadata.mainApplication);
  for (const face of assets.filter(a => a.category === 'face' && a.metadata.mainApplication)) for (const body of bodies) {
    const metrics = junctionMetrics(face.mesh.geometry, body.mesh.geometry);
    const fb = face.mesh.geometry.bounds!, bb = body.mesh.geometry.bounds!;
    const relativeHeight = bb.dimensions[1] ? fb.dimensions[1] / bb.dimensions[1] : Infinity;
    const near = (metrics.boundsGap ?? Infinity) < bb.dimensions[1] * 0.1 && fb.center[1] > bb.min[1] + bb.dimensions[1] * 0.65 && relativeHeight > 0.03 && relativeHeight < 0.6;
    const variantConflict = face.mesh.buildVariant !== null && body.mesh.buildVariant !== null && face.mesh.buildVariant !== body.mesh.buildVariant;
    link(assets, relations, { id: `face-${digest(face.id + body.id).slice(0, 16)}`, a: face.id, b: body.id, kind: 'face-body', confidence: near && !variantConflict ? 'candidate' : 'unresolved', status: near && !variantConflict ? 'candidate' : 'incompatible', sourceMeshIds: [], metrics: { ...metrics, relativeHeight: Number.isFinite(relativeHeight) ? relativeHeight : null }, evidence: ['Comparación espacial con eje Y como vertical provisional; sin asociación por número de familia', near ? 'Escala y posición aproximadas plausibles' : 'Escala o posición original no respalda montaje directo', ...(variantConflict ? ['Complexiones nominales distintas'] : []), 'Sin validación de cuello, colisiones o rig; incompatible se refiere únicamente a montaje directo en coordenadas originales'] });
  }
}
export async function buildCompatibility(root: string, sources: Source[], assets: AssetDefinition[], meshes: MeshRecord[]): Promise<{ compatibility: CompatibilityCatalog; presets: Preset[] }> {
  const pieceRelations: PieceRelation[] = [], presets: Preset[] = [];
  const cache = new Map<string, ParsedObj>();
  async function load(mesh: MeshRecord): Promise<ParsedObj> {
    const found = cache.get(mesh.id); if (found) return found;
    const source = sources.find(s => s.id === mesh.sourceId)!;
    const parsed = parseObj(await readFile(path.resolve(expandSource(root, source.path), mesh.relativePath), 'utf8'));
    cache.set(mesh.id, parsed); return parsed;
  }
  const merged = meshes.filter(m => m.category === 'merged characters' && m.lod === 0 && m.geometry.valid);
  const grouped = new Map<string, MeshRecord[]>();
  for (const mesh of merged) {
    const body = mesh.name.match(/(?:^|_)(Body\d+)(?=_|$)/i)?.[1] ?? null;
    const hair = mesh.name.match(/(?:^|_)(Hair\d+)(?=_|$)/i)?.[1] ?? null;
    const key = `${mesh.archetype}/${mesh.buildVariant}/${body}/${hair}`;
    const list = grouped.get(key) ?? []; list.push(mesh); grouped.set(key, list);
  }
  for (const [key, group] of grouped) {
    const representative = group[0]!, bodyFamily = representative.name.match(/(?:^|_)(Body\d+)(?=_|$)/i)?.[1] ?? null, hairFamily = representative.name.match(/(?:^|_)(Hair\d+)(?=_|$)/i)?.[1] ?? null;
    const find = (family: string | null, category: string): AssetDefinition[] => assets.filter(a => a.category === category && a.family?.toLowerCase() === family?.toLowerCase() && a.mesh.buildVariant === representative.buildVariant && !a.mesh.excluded && (a.mesh.lod ?? 0) === 0 && (!a.archetype || a.archetype.toLowerCase() === representative.archetype?.toLowerCase()));
    const bodies = find(bodyFamily, 'body'), hairs = find(hairFamily, 'hair');
    const missingParts = [...(!bodies.length ? [`${bodyFamily ?? 'Body desconocido'}_${representative.buildVariant ?? 'sin variante'}`] : []), ...(!hairs.length ? [`${hairFamily ?? 'Hair desconocido'}_${representative.buildVariant ?? 'sin variante'}`] : [])];
    let supported = false;
    for (const body of bodies) for (const hair of hairs) {
      let bestScore = -1, bestMetrics: Record<string, number> = {}; const supporting: string[] = [];
      for (const mergedMesh of group) {
        const target = await load(mergedMesh), bodyMatch = surfaceCoverage(await load(body.mesh), target), hairMatch = surfaceCoverage(await load(hair.mesh), target);
        const score = Math.min(bodyMatch.triangleCoverage, hairMatch.triangleCoverage);
        if (score > bestScore) { bestScore = score; bestMetrics = { bodyVertexCoverage: bodyMatch.vertexCoverage, bodyTriangleCoverage: bodyMatch.triangleCoverage, hairVertexCoverage: hairMatch.vertexCoverage, hairTriangleCoverage: hairMatch.triangleCoverage, quantization: 0.0001 }; }
        if (score >= 0.95 && Math.min(bodyMatch.vertexCoverage, hairMatch.vertexCoverage) >= 0.98) supporting.push(mergedMesh.id);
      }
      const proven = supporting.length > 0; supported ||= proven;
      link(assets, pieceRelations, { id: `merged-${digest(key + body.id + hair.id).slice(0, 16)}`, a: body.id, b: hair.id, kind: 'merged-evidence', confidence: proven ? 'confirmed' : 'candidate', status: proven ? 'supported' : 'candidate', sourceMeshIds: group.map(m => m.id), metrics: bestMetrics, evidence: [`MergedMeshLod0 declara ${representative.archetype}/${representative.buildVariant}/${bodyFamily}/${hairFamily}`, 'Ambos OBJ individuales de la variante exacta existen en máxima calidad', proven ? `Geometría de ambas piezas contenida en ${supporting.length} merged (≥95% triángulos y ≥98% posiciones)` : 'La geometría original no confirma contención suficiente; el nombre aporta solo un indicio', 'No demuestra rig, continuidad de cuello, ausencia de penetraciones ni personaje completo'] });
      for (const asset of [body, hair]) if (representative.archetype && !asset.archetypeCandidates.includes(representative.archetype)) asset.archetypeCandidates.push(representative.archetype);
    }
    presets.push({ id: `preset-${digest(key).slice(0, 16)}`, name: [representative.archetype, representative.buildVariant, bodyFamily, hairFamily].filter(Boolean).join(' / '), archetype: representative.archetype, buildVariant: representative.buildVariant, sourceMeshIds: group.map(m => m.id), bodyFamily, hairFamily, bodyAssetIds: bodies.map(a => a.id), hairAssetIds: hairs.map(a => a.id), missingParts, status: missingParts.length ? 'incomplete' : supported ? 'geometry-supported' : 'candidate', completeCharacter: false, evidence: ['Combinación extraída de nombres de archivos realmente encontrados', 'Cara y accesorios mencionados en el nombre no se consideran resueltos automáticamente; no es un preset listo para exportar'] });
  }
  const baseBody = inferJunctions(assets, pieceRelations); inferFaces(assets, pieceRelations);
  return { presets, compatibility: { schemaVersion: 1, morphPairs: inferMorphs(assets), pieceRelations, baseBody, limitations: ['Categorías semánticas inferidas; las métricas no identifican anatomía con certeza.', 'Exact en morph significa conectividad y UV idénticas; verificar correspondencia semántica y layout del GLB futuro.', 'El OBJ no aporta rig, pesos, unidades ni transformaciones de escena.', 'Las relaciones espaciales se calculan sin alinear ni reescalar; no prueban compatibilidad animada.', 'Texturas y previews sin referencia explícita siguen siendo candidatos; Lightmap/SDF no se reinterpretan como PBR.', 'Inspección de imagen por cabecera/chunks; no equivale a decodificación visual completa.'] } };
}
