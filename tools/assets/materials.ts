import type { MaterialDefinition, TextureRole, Vec3 } from '../../src/assets/types.ts';
import { tokens } from './obj.ts';

const roles: Record<string, TextureRole> = { map_kd: 'diffuse', map_d: 'opacity', norm: 'normal', map_kn: 'normal', map_pr: 'roughness', map_pm: 'metallic', map_ao: 'AO', map_ke: 'emissive' };
function mapPath(value: string): string {
  const parts = tokens(value); let i = 0;
  while (parts[i]?.startsWith('-')) {
    const option = parts[i++]!;
    if (['-o', '-s', '-t'].includes(option)) { for (let k = 0; k < 3 && parts[i] !== undefined && Number.isFinite(Number(parts[i])); k++) i++; }
    else i += option === '-mm' ? 2 : 1;
  }
  return parts.slice(i).join(' ').replaceAll('\\', '/');
}
export function parseMtl(text: string, fileId: string): MaterialDefinition[] {
  const definitions: MaterialDefinition[] = []; let current: MaterialDefinition | undefined;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.split('#')[0]!.trim(); if (!line) continue;
    const [directive = '', ...rest] = line.split(/\s+/); const key = directive.toLowerCase(), value = rest.join(' ');
    if (key === 'newmtl') { current = { name: value, fileId, maps: [], diffuse: null, opacity: null }; definitions.push(current); }
    else if (current) {
      if (key.startsWith('map_') || ['bump', 'norm', 'disp', 'decal', 'refl'].includes(key)) current.maps.push({ directive, role: roles[key] ?? 'other', path: mapPath(value) });
      else if (key === 'kd' && rest.length >= 3 && rest.slice(0, 3).every(v => Number.isFinite(Number(v)))) current.diffuse = rest.slice(0, 3).map(Number) as Vec3;
      else if (['d', 'tr'].includes(key) && Number.isFinite(Number(rest.at(-1)))) current.opacity = key === 'tr' ? 1 - Number(rest.at(-1)) : Number(rest.at(-1));
    }
  }
  return definitions;
}
