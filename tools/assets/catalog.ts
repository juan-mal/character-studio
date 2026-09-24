import path from 'node:path';
import type { AssetDefinition, EvidenceLink, ImageRecord, MaterialDefinition, MaterialRecord, MeshRecord, TextureVariant } from '../../src/assets/types.ts';
import { digest } from './obj.ts';
import { selectPrimary } from './classify.ts';

export function groupMeshes(meshes: MeshRecord[]): MeshRecord[][] {
  const groups = new Map<string, MeshRecord[]>();
  for (const mesh of meshes) {
    const key = `${mesh.sourceId}/${path.posix.dirname(mesh.relativePath)}/${mesh.lodKey}`;
    const list = groups.get(key) ?? []; list.push(mesh); groups.set(key, list);
  }
  const result: MeshRecord[][] = [];
  for (const nominal of groups.values()) {
    const clusters: MeshRecord[][] = [];
    for (const mesh of [...nominal].sort((a, b) => (a.lod ?? 0) - (b.lod ?? 0) || b.geometry.faceCount - a.geometry.faceCount)) {
      const compatible = clusters.find(group => group.every(other => lodBoundsAgree(mesh, other)));
      if (compatible) compatible.push(mesh); else clusters.push([mesh]);
    }
    if (clusters.length > 1) for (const mesh of nominal) mesh.geometry.issues.push({ code: 'lod-geometry-conflict', severity: 'warning', message: 'Nombre LOD compartido con geometrías de escala/posición contradictorias; se conservan en grupos separados para revisión' });
    result.push(...clusters);
  }
  return result;
}
function lodBoundsAgree(a: MeshRecord, b: MeshRecord): boolean {
  const aa = a.geometry.bounds, bb = b.geometry.bounds;
  if (!aa || !bb) return false;
  const scale = Math.max(...aa.dimensions, ...bb.dimensions);
  return ([0, 1, 2] as const).every(k => Math.abs(aa.center[k] - bb.center[k]) <= scale * 0.15 && Math.abs(aa.dimensions[k] - bb.dimensions[k]) <= Math.max(aa.dimensions[k], bb.dimensions[k], scale * 0.05) * 0.25);
}
function materialDefinitions(mesh: MeshRecord, materials: MaterialRecord[]): { definitions: MaterialDefinition[]; uncertainFileIds: Set<string> } {
  const linked: MaterialDefinition[] = [];
  const uncertainFileIds = new Set<string>();
  for (const library of mesh.geometry.materialLibraries) {
    const expected = path.posix.normalize(path.posix.join(path.posix.dirname(mesh.relativePath), library.replaceAll('\\', '/')));
    let matches = materials.filter(m => m.sourceId === mesh.sourceId && m.relativePath.toLowerCase() === expected.toLowerCase());
    if (!matches.length) {
      matches = materials.filter(m => path.posix.basename(m.relativePath).toLowerCase() === path.posix.basename(library).toLowerCase());
      for (const match of matches) uncertainFileIds.add(match.id);
      if (matches.length === 1) mesh.geometry.issues.push({ code: 'candidate-mtl', severity: 'warning', message: `MTL encontrado solo por nombre; ruta no confirmada: ${library}` });
    }
    if (matches.length === 1) linked.push(...matches[0]!.definitions.filter(d => mesh.geometry.referencedMaterials.includes(d.name)));
    else mesh.geometry.issues.push({ code: 'unresolved-mtl', severity: 'warning', message: `MTL ausente o ambiguo: ${library}` });
  }
  for (const name of mesh.geometry.referencedMaterials) if (!linked.some(d => d.name === name)) mesh.geometry.issues.push({ code: 'unresolved-material', severity: 'warning', message: `Material sin definición: ${name}` });
  return { definitions: linked, uncertainFileIds };
}
function referenceLinks(definitions: MaterialDefinition[], materials: MaterialRecord[], images: ImageRecord[], mesh: MeshRecord, uncertainFileIds: Set<string>): EvidenceLink[] {
  const links: EvidenceLink[] = [];
  for (const definition of definitions) {
    const file = materials.find(m => m.id === definition.fileId)!;
    for (const map of definition.maps) {
      const expected = path.posix.normalize(path.posix.join(path.posix.dirname(file.relativePath), map.path));
      let matches = images.filter(i => i.usage === 'texture' && i.inspection !== 'failed' && i.sourceId === file.sourceId && i.relativePath.toLowerCase() === expected.toLowerCase());
      let direct = !uncertainFileIds.has(file.id);
      if (!matches.length) { matches = images.filter(i => i.usage === 'texture' && i.inspection !== 'failed' && path.posix.basename(i.relativePath).toLowerCase() === path.posix.basename(map.path).toLowerCase()); direct = false; }
      if (matches.length === 1) links.push({ imageId: matches[0]!.id, confidence: direct ? 'confirmed' : 'probable', evidence: [`MTL ${file.path}: ${definition.name}/${map.directive}`, direct ? 'Rutas OBJ→MTL→imagen exactas' : 'MTL o imagen recuperada solo por nombre; ruta original no encontrada', `role:${map.role}`], material: definition.name });
      else mesh.geometry.issues.push({ code: 'unresolved-texture', severity: 'warning', message: `Mapa MTL ausente o ambiguo: ${map.path}` });
    }
  }
  return links;
}
function nameLinks(mesh: MeshRecord, images: ImageRecord[], usage: 'texture' | 'preview'): EvidenceLink[] {
  return images.filter(image => {
    if (image.usage !== usage || image.inspection === 'failed') return false;
    if (mesh.archetype && image.archetype && mesh.archetype.toLowerCase() !== image.archetype.toLowerCase()) return false;
    return (mesh.family !== null && image.family?.toLowerCase() === mesh.family.toLowerCase()) || image.name.toLowerCase() === mesh.name.toLowerCase();
  }).map(image => ({ imageId: image.id, confidence: 'candidate', evidence: [image.name.toLowerCase() === mesh.name.toLowerCase() ? 'Nombre exacto' : `Identificador compartido: ${mesh.family}`, ...(path.posix.dirname(mesh.relativePath) === path.posix.dirname(image.relativePath) && mesh.sourceId === image.sourceId ? ['Misma carpeta'] : []), ...(image.archetype ? [`Arquetipo de imagen: ${image.archetype}; no demuestra el arquetipo de la malla`] : []), usage === 'preview' ? 'Miniatura candidata; no sustituye geometría' : 'Sin asignación MTL demostrada; UV requiere inspección visual'] }));
}
function textureVariants(links: EvidenceLink[], images: ImageRecord[]): TextureVariant[] {
  const groups = new Map<string, TextureVariant>();
  for (const link of links) {
    const image = images.find(i => i.id === link.imageId)!;
    const stem = image.name.replace(/(?:_Tex)?_(BaseColor|Diffuse|Albedo|Normal|Roughness|Metallic|AO|Emissive|Opacity|Mask|Lightmap|Ligntmap|SDF)$/i, '');
    const key = `${image.sourceId}/${path.posix.dirname(image.relativePath)}/${stem}/${link.material ?? ''}`;
    const variant = groups.get(key) ?? { id: digest(key).slice(0, 20), name: stem, confidence: link.confidence, maps: {}, evidence: [], requiresVisualValidation: link.confidence !== 'confirmed' };
    const role = link.evidence.find(e => e.startsWith('role:'))?.slice(5) as ImageRecord['role'] | undefined ?? image.role;
    (variant.maps[role] ??= []).push(image.id);
    if (link.confidence !== 'confirmed') { variant.requiresVisualValidation = true; variant.confidence = link.confidence; }
    variant.evidence = [...new Set([...variant.evidence, ...link.evidence])]; groups.set(key, variant);
  }
  return [...groups.values()];
}
export function buildAssets(meshes: MeshRecord[], images: ImageRecord[], materials: MaterialRecord[]): AssetDefinition[] {
  return groupMeshes(meshes).map(group => {
    const mesh = selectPrimary(group), { definitions, uncertainFileIds } = materialDefinitions(mesh, materials);
    const references = referenceLinks(definitions, materials, images, mesh, uncertainFileIds);
    const candidateLinks = mesh.geometry.uvCoverage > 0 ? nameLinks(mesh, images, 'texture').filter(link => !references.some(r => r.imageId === link.imageId)) : [];
    const variants = textureVariants([...references, ...candidateLinks], images);
    const previews = nameLinks(mesh, images, 'preview');
    const reasons = [...mesh.reasons];
    if (mesh.lod !== null && mesh.lod > 0) reasons.push('Solo existen LOD reducidos; no habilitado para aplicación principal');
    if (!mesh.geometry.uvCoverage) reasons.push('Sin UV asignadas a caras');
    const lodConflict = mesh.geometry.issues.some(i => i.code === 'lod-geometry-conflict');
    const vertexAnimation = /Vat(?:_|$)/i.test(mesh.name);
    if (lodConflict) reasons.push('Familia LOD ambigua por diferencias geométricas');
    if (vertexAnimation) reasons.push('Posible vertex animation texture: no se ha identificado el shader/animación original');
    const status = mesh.excluded ? 'excluded' : mesh.lod !== null && mesh.lod > 0 || !mesh.geometry.uvCoverage || lodConflict || vertexAnimation ? 'needs-review' : 'candidate';
    const asset: AssetDefinition = {
      id: `asset-${digest(`${mesh.sourceId}/${path.posix.dirname(mesh.relativePath)}/${mesh.lodKey}${lodConflict ? `/${mesh.name}` : ''}`).slice(0, 20)}`,
      name: mesh.name, category: mesh.category, family: mesh.family, archetype: mesh.archetype, archetypeCandidates: [], mesh,
      lods: group.map(m => ({ meshId: m.id, sourceId: m.sourceId, relativePath: m.relativePath, lod: m.lod, quality: m.quality, vertexCount: m.geometry.vertexCount, faceCount: m.geometry.faceCount, valid: m.geometry.valid })),
      preview: null, previewCandidates: previews, materials: definitions, textureVariants: variants,
      tintable: { hair: 'unknown', eyes: 'unknown', reason: 'No se ha validado máscara ni separación de material para tintado.' },
      variants: { build: mesh.buildVariant, relatedAssetIds: [] }, compatibility: { relationIds: [], morphIds: [] },
      metadata: { status, mainApplication: status === 'candidate', reasons, rigged: false, textureStatus: references.some(r => r.confidence === 'confirmed') ? 'referenced' : variants.length ? 'candidates-only' : 'missing' },
    };
    return asset;
  });
}
