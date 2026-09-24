import type { AssetCatalog, AssetDefinition, CompatibilityCatalog, InspectionReport, MeshRecord, Preset } from '../../src/assets/types.ts';
import { digest } from './obj.ts';

export function makeReport(catalog: AssetCatalog, meshes: MeshRecord[], compatibility: CompatibilityCatalog, presets: Preset[], warnings: string[]): InspectionReport {
  const { assets, images, materials, relatedFiles } = catalog;
  const candidates = assets.filter(a => a.metadata.mainApplication && a.category !== 'merged characters');
  const categories: Record<string, number> = {};
  for (const mesh of meshes) categories[mesh.category] = (categories[mesh.category] ?? 0) + 1;
  const families = new Map<string, string[]>();
  for (const asset of assets) if (asset.family && !asset.mesh.excluded) { const list = families.get(asset.family) ?? []; list.push(asset.id); families.set(asset.family, list); }
  const summary = {
    objFiles: meshes.filter(m => !m.derivedFrom).length, derivedObjFiles: meshes.filter(m => m.derivedFrom).length, logicalAssets: assets.length, characterPieceObjFiles: meshes.filter(m => !m.derivedFrom && !m.excluded && m.category !== 'merged characters').length,
    mainCharacterPieces: candidates.length, excludedObjFiles: meshes.filter(m => m.excluded).length,
    excludedPropsObjFiles: meshes.filter(m => m.category === 'props' && m.excluded).length,
    excludedEnvironmentObjFiles: meshes.filter(m => m.category === 'environment' && m.excluded).length,
    excludedEffectsObjFiles: meshes.filter(m => m.category === 'effects' && m.excluded).length,
    reducedLodFiles: meshes.filter(m => m.lod !== null && m.lod > 0).length,
    assetsMissingFullQuality: assets.filter(a => a.mesh.lod !== null && a.mesh.lod > 0).length,
    assetsWithLodConflicts: assets.filter(a => a.mesh.geometry.issues.some(i => i.code === 'lod-geometry-conflict')).length,
    assetsNeedingReview: assets.filter(a => a.metadata.status === 'needs-review').length,
    bodies: candidates.filter(a => a.category === 'body').length, faces: candidates.filter(a => a.category === 'face').length,
    hairs: candidates.filter(a => a.category === 'hair').length, baseBodyPieces: compatibility.baseBody.assetIds.length,
    mergedLod0Files: meshes.filter(m => m.category === 'merged characters' && m.lod === 0).length,
    presets: presets.length, geometrySupportedPresets: presets.filter(p => p.status === 'geometry-supported').length,
    incompletePresets: presets.filter(p => p.status === 'incomplete').length,
    materialFiles: materials.length, objWithMaterialReferences: meshes.filter(m => m.geometry.materialLibraries.length || m.geometry.referencedMaterials.length).length,
    imageFiles: images.length, textureFiles: images.filter(i => i.usage === 'texture').length,
    previewFiles: images.filter(i => i.usage === 'preview').length, uniquePreviewFiles: images.filter(i => i.usage === 'preview' && !i.duplicateOf).length,
    duplicateImages: images.filter(i => i.duplicateOf).length, piecesWithPreviewCandidates: candidates.filter(a => a.previewCandidates.length).length,
    exactMorphPairs: compatibility.morphPairs.filter(p => p.morphCompatibility === 'exact').length,
    probableMorphPairs: compatibility.morphPairs.filter(p => p.morphCompatibility === 'probable').length,
    incompatibleMorphPairs: compatibility.morphPairs.filter(p => p.morphCompatibility === 'incompatible').length,
    invalidObjFiles: meshes.filter(m => !m.geometry.valid).length,
  };
  const files = [...meshes.filter(m => !m.derivedFrom), ...images, ...materials, ...relatedFiles];
  return { schemaVersion: 1, summary, categories, families: [...families].map(([family, assetIds]) => ({ family, assetIds })).sort((a, b) => a.family.localeCompare(b.family, 'en')), meshes, images, materials, relatedFiles,
    assetsWithoutTexture: candidates.filter(a => a.metadata.textureStatus === 'missing').map(a => a.id),
    assetsWithoutConfirmedTexture: candidates.filter(a => a.metadata.textureStatus !== 'referenced' && a.metadata.textureStatus !== 'reviewed').map(a => a.id),
    assetsWithoutPreview: candidates.filter(a => !a.preview && !a.previewCandidates.length).map(a => a.id),
    problematicFiles: [...meshes.map(m => ({ id: m.id, path: m.path, issues: m.geometry.issues })), ...images.map(i => ({ id: i.id, path: i.path, issues: i.issues })), ...materials.map(m => ({ id: m.id, path: m.path, issues: m.issues }))].filter(f => f.issues.length),
    warnings, manifestHash: digest(files.map(f => `${f.path}\t${f.sha256}`).sort().join('\n')),
    recommendations: [
      'Elegir primero una combinación respaldada por MergedMesh y validar visualmente las costuras, la escala y las texturas.',
      'Recuperar materiales/shaders originales o crear asignaciones revisadas. Los nombres de texturas no garantizan arquetipo ni layout UV.',
      'Revisar candidatos exact de morph después de importar conservando orden de vértices, triangulación y splits de UV/normales.',
      'Mantener NPC numerados y BaseBody/Hair_S como sistemas distintos hasta demostrar sus uniones; no asociar Face001 con Body001 por número.',
      'Resolver piezas ausentes y variantes cuyo único archivo sea LOD1/2/3 antes de habilitarlas en la aplicación principal.',
      'Obtener un rig común si se necesita animación; para GLB estático aún se necesitan materiales y validación de ensamblaje.',
      'Usar sprites solamente como miniaturas; validar sus asociaciones candidatas y conservar duplicados en metadatos.',
    ],
  };
}
const escape = (value: string): string => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
function table(headers: string[], rows: (string | number)[][]): string { return [headers.join(' | '), headers.map(() => '---').join(' | '), ...rows.map(row => row.map(v => escape(String(v))).join(' | '))].map(line => `| ${line} |`).join('\n'); }
function assetTable(assets: AssetDefinition[]): string {
  return table(['Pieza', 'Estado', 'Vértices / caras', 'Dimensiones X/Y/Z', 'Y min–max', 'Texturas candidatas', 'Previews candidatos'], assets.map(a => [a.name, a.metadata.status, `${a.mesh.geometry.vertexCount} / ${a.mesh.geometry.faceCount}`, a.mesh.geometry.bounds?.dimensions.map(n => n.toFixed(4)).join(' / ') ?? '—', a.mesh.geometry.bounds ? `${a.mesh.geometry.bounds.min[1].toFixed(4)} – ${a.mesh.geometry.bounds.max[1].toFixed(4)}` : '—', a.textureVariants.length, a.previewCandidates.length]));
}
export function markdownReport(report: InspectionReport, catalog: AssetCatalog, compatibility: CompatibilityCatalog, presets: Preset[]): string {
  const { assets } = catalog, s = report.summary;
  const name = (id: string): string => assets.find(a => a.id === id)?.name ?? id;
  const sections: string[] = ['# Inspección de assets — Fase 1',
    'Informe generado por `pnpm assets:scan`. Originales de solo lectura. Unidades de OBJ desconocidas. **Candidato utilizable no significa personaje validado o listo para GLB.**',
    '## Inventario real',
    table(['Medida', 'Resultado'], [
      ['OBJ originales encontrados (todos los LOD)', s.objFiles!], ['OBJ derivados con procedencia registrada', s.derivedObjFiles!], ['Piezas de personaje OBJ originales (todos los LOD, sin merged)', s.characterPieceObjFiles!],
      ['Piezas candidatas en máxima calidad', s.mainCharacterPieces!], ['OBJ excluidos', s.excludedObjFiles!], ['Props excluidos', s.excludedPropsObjFiles!],
      ['Entorno / efectos excluidos', `${s.excludedEnvironmentObjFiles} / ${s.excludedEffectsObjFiles}`], ['LOD1/2/3 conservados en metadatos', s.reducedLodFiles!],
      ['Assets sin máxima calidad', s.assetsMissingFullQuality!], ['Cuerpos / caras / cabellos', `${s.bodies} / ${s.faces} / ${s.hairs}`],
      ['Piezas BaseBody', s.baseBodyPieces!], ['MergedMesh LOD0', s.mergedLod0Files!], ['Combinaciones detectadas / respaldadas geométricamente', `${s.presets} / ${s.geometrySupportedPresets}`],
      ['Archivos MTL / OBJ con referencias a material', `${s.materialFiles} / ${s.objWithMaterialReferences}`], ['Imágenes / texturas', `${s.imageFiles} / ${s.textureFiles}`],
      ['Previews (archivos / contenido único)', `${s.previewFiles} / ${s.uniquePreviewFiles}`], ['Piezas sin candidato de textura', report.assetsWithoutTexture.length],
      ['Piezas sin textura confirmada por MTL o revisión UV', report.assetsWithoutConfirmedTexture.length], ['Piezas sin candidato de preview', report.assetsWithoutPreview.length],
      ['Pares morph exact / probable / incompatible', `${s.exactMorphPairs} / ${s.probableMorphPairs} / ${s.incompatibleMorphPairs}`], ['OBJ inválidos', s.invalidObjFiles!],
    ]),
    '## Cómo interpretar el catálogo',
    '- `metadata.mainApplication`: geometría válida, categoría candidata, UV en caras y archivo de máxima calidad. No garantiza texturizado, rig ni ensamblaje.\n- `exact`: misma conectividad ordenada, UV e índices UV completos; candidato técnico a morph.\n- `probable`: topología coincide pero falta evidencia completa de UV/layout.\n- `incompatible`: difiere topología/UV o, para relaciones entre piezas, el montaje directo en coordenadas originales no está respaldado.\n- `confirmed` en MergedMesh exige coincidencia de geometría de ambas piezas.\n- Texturas y miniaturas basadas en nombre están en `candidate`; `preview` permanece vacío hasta confirmación.\n- Las variantes `_High` se comparan por número de caras; LOD reducidos no sustituyen silenciosamente una máxima calidad ausente.',
    '## Derivados y texturas revisadas',
    'Las reglas de assets.reviewed.json se vuelven a comprobar contra hashes de mallas, imágenes y evidencia geométrica. Si cambia una fuente, la asociación deja de confirmarse. Los archivos derivados se escriben aparte y conservan procedencia; los originales no se modifican.',
    table(['Derivado', 'Fuentes', 'Método'], report.meshes.filter(mesh => mesh.derivedFrom).map(mesh => [mesh.path, mesh.derivedFrom!.sourceMeshIds.length, mesh.derivedFrom!.method])),
    table(['Pieza', 'Diseño revisado', 'Imágenes'], assets.flatMap(asset => asset.textureVariants.filter(variant => variant.confidence === 'confirmed' && !variant.requiresVisualValidation).map(variant => [asset.name, variant.name, Object.values(variant.maps).flat().map(id => catalog.images.find(image => image.id === id)?.name ?? id).join(', ')]))),
    'La revisión de textura confirma su aplicación visual sobre las UV originales; no reconstruye el shader original ni autoriza tintado arbitrario.',
    '## Familias detectadas', report.families.map(f => `${f.family} (${f.assetIds.length})`).join(', '),
    '## Hallazgos que condicionan la siguiente fase',
    `- **${s.geometrySupportedPresets} combinaciones respaldadas por geometría:** ${presets.filter(p => p.status === 'geometry-supported').map(p => p.name).join('; ') || 'ninguna'}.\n- **Piezas de máxima calidad ausentes en presets:** ${[...new Set(presets.flatMap(p => p.missingParts))].join(', ') || 'ninguna'}.\n- **${s.assetsWithLodConflicts} assets con conflictos de agrupación LOD:** diferencias en posición o dimensiones impiden agruparlos con seguridad. Permanecen registrados y fuera de la selección principal.\n- **${s.exactMorphPairs} pares morph exactos.** Tener igual número de vértices no basta; consultar índices y UV en la tabla de morphs.\n- **${report.assetsWithoutConfirmedTexture.length} piezas sin textura confirmada.** Los candidatos por nombre requieren revisión del layout UV.\n- **${s.invalidObjFiles} OBJ inválidos:** sus índices referencian datos inexistentes u otros errores estructurales; no se reparan los originales.`,
    '## Personajes y presets observados',
    table(['Combinación', 'Merged de evidencia', 'Estado', 'Piezas individuales ausentes'], presets.map(p => [p.name, p.sourceMeshIds.length, p.status, p.missingParts.join(', ') || 'Ninguna entre cuerpo/cabello; cara y accesorios sin resolver'])),
    'Los presets describen combinaciones encontradas. Ninguno se declara personaje completo. Los detalles de cobertura de vértices/triángulos están en compatibility.generated.json.',
    '## Cuerpos', 'Estas tablas incluyen piezas pendientes de revisión y excluidas, además de las candidatas del resumen.', assetTable(assets.filter(a => a.category === 'body')),
    '## Caras, ojos y cejas', assetTable(assets.filter(a => ['face', 'eyes', 'brows'].includes(a.category))),
    `Se compararon ${compatibility.pieceRelations.filter(r => r.kind === 'face-body').length} pares cara/cuerpo por límites, altura relativa y bordes. Ninguno se confirma solo por número de familia. Las coincidencias espaciales necesitan revisión visual del cuello.`,
    '## Cabellos', assetTable(assets.filter(a => a.category === 'hair')),
    '## BaseBody: escala y uniones', compatibility.baseBody.conclusion,
    assetTable(assets.filter(a => compatibility.baseBody.assetIds.includes(a.id))),
    table(['Unión aproximada', 'Distancia mínima (muestras)', 'Muestras cercanas', 'Estado'], compatibility.pieceRelations.filter(r => r.kind === 'basebody-junction' && r.status === 'supported').map(r => [`${name(r.a)} ↔ ${name(r.b)}`, (r.metrics.minimumBoundaryDistance ?? 0).toFixed(6), r.metrics.nearBoundarySamples ?? 0, r.confidence])),
    '## Morph targets e incompatibilidades',
    table(['A', 'B', 'Resultado', 'Evidencia / diferencias'], compatibility.morphPairs.map(p => [name(p.a), name(p.b), p.morphCompatibility, p.reasons.join(', ')])),
    '## Texturas y previews',
    'Asignación MTL = evidencia explícita. Coincidencia de familia/arquetipo/carpeta = candidata. Varios arquetipos pueden reutilizar un identificador; se conservan las alternativas sin elegir una arbitrariamente. Lightmap y SDF permanecen en `other`. Las dimensiones y transparencia se inspeccionan por cabecera; no se reconstruyen shaders.',
    table(['Uso / rol', 'Archivos'], [...new Set(catalog.images.map(i => `${i.usage}/${i.role}`))].sort().map(key => [key, catalog.images.filter(i => `${i.usage}/${i.role}` === key).length])),
    '### Piezas sin candidato de textura', report.assetsWithoutTexture.map(name).join(', ') || 'Ninguna.',
    '### Piezas sin candidato de preview', report.assetsWithoutPreview.map(name).join(', ') || 'Ninguna.',
    '### Assets que solo tienen LOD reducido', assets.filter(a => a.mesh.lod !== null && a.mesh.lod > 0).map(a => `${a.name} (LOD${a.mesh.lod})`).join(', ') || 'Ninguno.',
    '### Grupos LOD con geometría contradictoria', assets.filter(a => a.mesh.geometry.issues.some(i => i.code === 'lod-geometry-conflict')).map(a => a.name).join(', ') || 'Ninguno.',
    '## Archivos problemáticos',
    report.problematicFiles.length ? table(['Archivo', 'Problemas'], report.problematicFiles.map(f => [f.path, [...new Set(f.issues.map(i => `${i.code}: ${i.message}`))].join('; ')])) : 'No se detectaron errores de estructura o referencias. Esto no sustituye validación visual.',
    '## Categorías y exclusiones', table(['Categoría', 'OBJ (incluye LOD)'], Object.entries(report.categories)),
    '<details>\n<summary>Listado completo de OBJ excluidos</summary>\n\n' + table(['Archivo', 'Motivo'], report.meshes.filter(m => m.excluded).map(m => [m.path, m.reasons.join('; ')])) + '\n\n</details>',
    '## Recomendaciones', report.recommendations.map(r => `- ${r}`).join('\n'),
    '## Límites de la inspección', compatibility.limitations.map(l => `- ${l}`).join('\n'),
    ...(report.warnings.length ? ['## Avisos de descubrimiento', report.warnings.map(w => `- ${w}`).join('\n')] : []),
    '## Reproducibilidad', `Huella SHA-256 del inventario de rutas y contenidos originales: \`${report.manifestHash}\`. No se incluyen fechas variables para permitir comparar ejecuciones idénticas. El JSON contiene un registro por OBJ con dimensiones, centro, conteos, LOD y hashes.`,
  ];
  return sections.join('\n\n') + '\n';
}
