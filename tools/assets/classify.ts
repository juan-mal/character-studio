import type { Category, Classification, GeometryStats } from '../../src/assets/types.ts';

export function archetypeOf(name: string): string | null {
  return name.match(/(?:^|_)(MuscleMan|Female|Male|Girl|Boy|Lady|Loli|Child|VukodlakStrong|VukodlakThin)(?=_|$)/i)?.[1] ?? null;
}
export function familyOf(name: string): string | null {
  if (/BaseBody/i.test(name)) return 'BaseBody';
  const modular = name.match(/Hair_(S\d+|Default\d+)/i); if (modular) return `Hair_${modular[1]}`;
  const numbered = name.match(/(?:^|_)(Body\d+|Face\d+|Hair\d+)(?=_|$)/i);
  if (numbered) return numbered[1]!.replace(/^(body|face|hair)/i, s => s[0]!.toUpperCase() + s.slice(1).toLowerCase());
  return null;
}
export function classify(name: string, geometry: GeometryStats): Classification {
  const reasons: string[] = [], evidence: string[] = [];
  const lodMatch = name.match(/lod(\d+)(?=_|$)/i);
  const lod = lodMatch ? Number(lodMatch[1]) : null;
  const stripped = name.replace(/_?lod\d+(?=_|$)/ig, '').replace(/_High(?=_|$)/ig, '');
  const build = name.match(/(?:^|_)(Standard|Fat|Strong)(?=_|$)/i)?.[1];
  const buildVariant = build ? (build[0]!.toUpperCase() + build.slice(1).toLowerCase()) as 'Standard' | 'Fat' | 'Strong' : null;
  let category: Category = 'unknown';
  if (/^MergedMesh/i.test(name)) category = 'merged characters';
  else if (/^Eff_|^Effect|Effect|(?:^|_)Vat(?:_|$)/i.test(name)) category = 'effects';
  else if (/Chair|(?:^|_)Prop(?:s|_|$)|^Property_|^Body_(Drone|Lance|Shield)(?:_|$)/i.test(name)) category = 'props';
  else if (/^(Area|Indoor|Homeworld|Level|Environment)_/i.test(name)) category = 'environment';
  else if (/^Face_Eye|^Eyes?(?:_|$)/i.test(name)) category = 'eyes';
  else if (/^Brow|^Eyebrow/i.test(name)) category = 'brows';
  else if (/^Face/i.test(name)) category = 'face';
  else if (/^Body_Cloak/i.test(name)) category = 'other accessories';
  else if (/^Body/i.test(name)) category = 'body';
  else if (/^Hair/i.test(name)) category = 'hair';
  else if (/^Top_/i.test(name)) category = 'top';
  else if (/^Bottom_/i.test(name)) category = 'bottom';
  else if (/^Hand_/i.test(name)) category = 'hands';
  else if (/^(Shoe|Foot)_/i.test(name)) category = 'feet/shoes';
  else if (/^ArmAcc_/i.test(name)) category = 'arm accessories';
  else if (/^LegAcc_/i.test(name)) category = 'leg accessories';
  else if (/^Earwear_/i.test(name)) category = 'ear accessories';
  else if (/^NPC_Item_|^(Acc|Accessory)_/i.test(name)) category = 'other accessories';
  if (/(?:^|_)Col(?:_|$)/i.test(name)) reasons.push('Collider excluido');
  if (/^(Area|Indoor|Homeworld|Property|Eff)_|^Effect|Chair/i.test(name)) reasons.push('Regla de exclusión solicitada');
  if (['props', 'environment', 'effects', 'unknown'].includes(category)) reasons.push(`Categoría fuera del catálogo de personajes: ${category}`);
  if (!geometry.valid) reasons.push('Geometría inválida');
  if (geometry.bounds && Math.max(...geometry.bounds.dimensions) <= 0) reasons.push('Sin extensión geométrica');
  evidence.push(`Pista léxica: ${category}`, `Geometría: ${geometry.vertexCount} vértices, ${geometry.faceCount} caras`, `UV en ${(geometry.uvCoverage * 100).toFixed(1)}% de esquinas`);
  if (geometry.bounds) evidence.push(`Dimensiones observadas: ${geometry.bounds.dimensions.map(n => n.toFixed(5)).join(' × ')}; unidades no declaradas`);
  return { category, family: familyOf(name), morphFamily: stripped.replace(/_(Standard|Fat|Strong)(?=_|$)/ig, ''), archetype: archetypeOf(name), buildVariant, lod, quality: /(?:^|_)High(?:_|$)/i.test(name) ? 'high' : 'default', lodKey: stripped.toLowerCase(), excluded: reasons.length > 0, reasons, evidence };
}
export function selectPrimary<T extends { lod: number | null; quality: string; geometry: GeometryStats; name: string }>(meshes: T[]): T {
  const chosen = [...meshes].sort((a, b) => (a.lod ?? 0) - (b.lod ?? 0) || Number(b.geometry.valid) - Number(a.geometry.valid) || b.geometry.faceCount - a.geometry.faceCount || Number(b.quality === 'high') - Number(a.quality === 'high') || a.name.localeCompare(b.name, 'en'))[0];
  if (!chosen) throw new Error('Grupo LOD vacío');
  return chosen;
}
