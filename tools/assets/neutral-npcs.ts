import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AssetCatalog, MeshRecord, Preset } from '../../src/assets/types.ts';
import { buildAssets } from './catalog.ts';
import { classify } from './classify.ts';
import { digest, parseObj } from './obj.ts';

interface NeutralPack { name: string; file: string; sha256: string; sources: { name: string; sha256: string }[] }

/** Fixed untextured assemblies do not authorize cross-character modular swaps. */
export async function enrichNeutralNpcs(root: string, catalog: AssetCatalog, presets: Preset[], warnings: string[]): Promise<void> {
  const manifestPath = path.join(root, 'content/neutral-npcs/manifest.json');
  const manifest = await readFile(manifestPath, 'utf8').catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (!manifest) return;
  const packs = JSON.parse(manifest) as NeutralPack[];
  for (const pack of packs) {
    try {
      if (path.basename(pack.file) !== pack.file || !/^Body_NPC_.*\.obj$/.test(pack.file)) throw new Error('Invalid neutral NPC filename');
      const relativePath = `content/neutral-npcs/${pack.file}`;
      const data = await readFile(path.join(root, relativePath));
      if (digest(data) !== pack.sha256) throw new Error('Neutral NPC fingerprint changed');
      const geometry = parseObj(data.toString('utf8')).stats;
      if (!geometry.valid || geometry.uvCoverage !== 1) throw new Error('Invalid neutral NPC geometry');
      const name = path.basename(pack.file, '.obj');
      const mesh: MeshRecord = {
        id: digest(`project/${relativePath}`).slice(0, 20), sourceId: 'project', relativePath,
        path: `project/${relativePath}`, name, extension: '.obj', sizeBytes: data.length, sha256: pack.sha256,
        ...classify(name, geometry), geometry,
      };
      let asset = catalog.assets.find(a => a.mesh.path === mesh.path);
      if (!asset) { asset = buildAssets([mesh], [], [])[0]; if (asset) catalog.assets.push(asset); }
      if (!asset) throw new Error('Unable to create neutral NPC asset');
      asset.metadata.calibration = { fbxImportScale: 1, axes: 'Source Z-up to Y-up: (x, y, z) -> (x, z, -y); no per-part translation or scale', staticRestPose: true };
      const reason = 'Fixed untextured NPC assembly; not a verified interchangeable modular family.';
      if (!asset.metadata.reasons.includes(reason)) asset.metadata.reasons.push(reason);
      asset.tintable = true;
      const id = `neutral-${digest(pack.file).slice(0, 16)}`;
      if (!presets.some(p => p.id === id)) presets.push({
        id, name: pack.name, displayName: pack.name, archetype: `neutral-${pack.file}`, buildVariant: null,
        sourceMeshIds: [asset.mesh.id], bodyFamily: pack.name, hairFamily: null,
        bodyAssetIds: [asset.id], hairAssetIds: [], missingParts: [], status: 'geometry-supported', completeCharacter: false,
        evidence: ['Single fixed mesh assembled from local body, clothing, face and hair in original coordinates.',
          'No textures, rig or animation; modular swaps are intentionally unavailable.',
          ...pack.sources.map(source => `${source.name}: SHA256 ${source.sha256}`)],
      });
    } catch (error) { warnings.push(`Neutral NPC ${pack.name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
}
