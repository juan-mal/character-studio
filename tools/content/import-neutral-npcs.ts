import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AssetCatalog, CompatibilityCatalog, Preset } from '../../src/assets/types.ts';
import { enrichNeutralNpcs } from '../assets/neutral-npcs.ts';
import { digest, parseObj } from '../assets/obj.ts';
import { makeReport, markdownReport } from '../assets/report.ts';

/** Rotate all parts together and offset OBJ indices without touching original files. */
export function assembleObj(parts: string[]): string {
  const out = ['# Fixed neutral NPC assembly; shared Z-up -> Y-up rotation; scale 1'];
  const offsets = [0, 0, 0];
  for (const [partIndex, source] of parts.entries()) {
    const counts = [0, 0, 0];
    out.push(`o part_${partIndex}`);
    for (const line of source.split(/\r?\n/)) {
      const tokens = line.trim().split(/\s+/);
      const directive = tokens[0];
      if (directive === 'v' || directive === 'vn') {
        const [x, y, z] = tokens.slice(1, 4).map(Number);
        if (x === undefined || y === undefined || z === undefined || ![x, y, z].every(Number.isFinite)) throw new Error('Invalid OBJ coordinate');
        out.push(`${directive} ${x} ${z} ${-y}`);
        counts[directive === 'v' ? 0 : 2]!++;
      } else if (directive === 'vt') { out.push(line.trim()); counts[1]!++; }
      else if (directive === 'f') {
        out.push('f ' + tokens.slice(1).map(token => token.split('/').map((value, index) => {
          if (!value) return '';
          const n = Number(value);
          if (!Number.isInteger(n) || n === 0 || index > 2) throw new Error('Invalid OBJ index');
          return String((n > 0 ? n : counts[index]! + n + 1) + offsets[index]!);
        }).join('/')).join(' '));
      } else if (directive === 's') out.push(line.trim());
    }
    for (let i = 0; i < 3; i++) offsets[i]! += counts[i]!;
  }
  const result = out.join('\n') + '\n';
  if (!parseObj(result).stats.valid) throw new Error('Assembled OBJ failed validation');
  return result;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const source = process.argv[2] ?? path.join(process.env.USERPROFILE ?? '', 'Downloads/Mesh');
  const directory = path.join(root, 'content/neutral-npcs');
  await mkdir(directory, { recursive: true });
  const packs = [];
  for (const sex of ['Female', 'Male']) for (const size of ['01', '02', '03']) {
    const prefix = `NPC_${sex}_Size${size}`;
    const names = ['Body', 'Clothes', 'Face', 'Hair'].map(role => `${prefix}_${role}_001_LOD0.obj`);
    try {
      const buffers = await Promise.all(names.map(name => readFile(path.join(source, name))));
      const data = assembleObj(buffers.map(buffer => buffer.toString('utf8')));
      const file = `Body_NPC_${sex}_Size${size}.obj`;
      await writeFile(path.join(directory, file), data);
      packs.push({ name: `NPC ${sex} · ${size} · Neutral`, file, sha256: digest(data), sources: names.map((name, i) => ({ name, sha256: digest(buffers[i]!) })) });
    } catch (error) { console.warn(`[NPC] ${prefix}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (!packs.length) throw new Error('No complete source sets found');
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(packs, null, 2) + '\n');
  const catalog = JSON.parse(await readFile('src/generated/assets.generated.json', 'utf8')) as AssetCatalog;
  const compatibility = JSON.parse(await readFile('src/generated/compatibility.generated.json', 'utf8')) as CompatibilityCatalog;
  const presetData = JSON.parse(await readFile('src/generated/presets.generated.json', 'utf8')) as { schemaVersion: 1; presets: Preset[] };
  const warnings: string[] = [];
  await enrichNeutralNpcs(root, catalog, presetData.presets, warnings);
  if (warnings.length) throw new Error(warnings.join('\n'));
  const meshes = catalog.assets.flatMap(asset => [asset.mesh]);
  const previous = JSON.parse(await readFile('reports/asset-inspection.json', 'utf8')) as { meshes: typeof meshes };
  const byId = new Map(previous.meshes.map(mesh => [mesh.id, mesh]));
  for (const mesh of meshes) byId.set(mesh.id, mesh);
  const report = makeReport(catalog, [...byId.values()], compatibility, presetData.presets, []);
  for (const [file, value] of Object.entries({ 'src/generated/assets.generated.json': catalog, 'src/generated/presets.generated.json': presetData, 'reports/asset-inspection.json': report })) await writeFile(file, JSON.stringify(value, null, 2) + '\n');
  await writeFile('reports/asset-inspection.md', markdownReport(report, catalog, compatibility, presetData.presets));
  console.log(`[NPC] Imported ${packs.length} fixed neutral NPC presets; original files unchanged.`);
}

if (process.argv[1]?.endsWith('import-neutral-npcs.ts')) await main();
