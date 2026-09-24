import { lstat, readdir, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import type { FileRecord, ScanConfig, Source } from '../../src/assets/types.ts';
import { digest } from './obj.ts';

export const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tga', '.dds', '.ktx', '.ktx2', '.hdr', '.exr', '.bmp', '.tif', '.tiff']);
const extensions = new Set(['.obj', '.mtl', '.gltf', '.glb', '.fbx', '.blend', '.dae', '.stl', '.ply', '.usd', '.usdz', '.abc', '.material', '.mat', '.shader', ...imageExtensions]);
const ignored = new Set(['.tools', '.git', 'node_modules', '.pnpm', 'dist', 'build', 'coverage', '.next']);
export interface Discovered { source: Source; absolutePath: string; relativePath: string }
export function expandSource(root: string, value: string): string { return value.startsWith('~/') || value.startsWith('~\\') ? path.resolve(homedir(), value.slice(2)) : path.resolve(root, value); }
export function parseConfig(value: unknown): ScanConfig {
  if (!value || typeof value !== 'object' || !('sources' in value) || !Array.isArray(value.sources) || !value.sources.length) throw new Error('La configuración requiere sources no vacío');
  const ids = new Set<string>(); const sources: Source[] = [];
  for (const item of value.sources as unknown[]) {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !/^[a-z0-9-]+$/i.test(item.id) || !('path' in item) || typeof item.path !== 'string' || !item.path || !('kind' in item) || !['mixed', 'mesh', 'texture', 'preview'].includes(String(item.kind))) throw new Error('Fuente inválida: se requieren id, path y kind');
    if (ids.has(item.id)) throw new Error(`Identificador de fuente duplicado: ${item.id}`);
    ids.add(item.id); sources.push({ id: item.id, path: item.path, kind: item.kind as Source['kind'] });
  }
  return { sources };
}
export async function discover(root: string, config: ScanConfig): Promise<{ files: Discovered[]; warnings: string[] }> {
  const files: Discovered[] = [], warnings: string[] = [], seen = new Set<string>();
  const generated = ['src/generated', 'reports', 'test-results', 'playwright-report'].map(directory => path.resolve(root, directory));
  const sourcePaths: { source: Source; directory: string }[] = [];
  for (const source of config.sources) {
    const directory = expandSource(root, source.path);
    try { if (!(await lstat(directory)).isDirectory()) throw new Error('No es directorio'); }
    catch { throw new Error(`No se puede leer la fuente '${source.id}' (${source.path}). Corrige assets.scan.json o utiliza --config.`); }
    sourcePaths.push({ source, directory });
  }
  async function visit(directory: string, base: string, source: Source): Promise<void> {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const absolutePath = path.join(directory, entry.name);
      if (generated.some(g => absolutePath === g)) continue;
      if (entry.isSymbolicLink()) { warnings.push(`Enlace omitido: ${source.id}/${path.relative(base, absolutePath)}`); continue; }
      if (entry.isDirectory()) { if (!ignored.has(entry.name)) await visit(absolutePath, base, source); }
      else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        const canonical = await realpath(absolutePath); const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
        if (seen.has(key)) { warnings.push(`Fuente solapada: ${source.id}/${path.relative(base, absolutePath)} ya inventariado`); continue; }
        seen.add(key); files.push({ source, absolutePath, relativePath: path.relative(base, absolutePath).replaceAll('\\', '/') });
      }
    }
  }
  // More specific roots own files when the project also encloses a configured source.
  for (const { source, directory } of sourcePaths.sort((a, b) => b.directory.length - a.directory.length)) await visit(directory, directory, source);
  return { files: files.sort((a, b) => `${a.source.id}/${a.relativePath}`.localeCompare(`${b.source.id}/${b.relativePath}`, 'en')), warnings };
}
export async function readRecord(file: Discovered): Promise<{ record: FileRecord; data: Buffer }> {
  const data = await readFile(file.absolutePath); const extension = path.extname(file.relativePath).toLowerCase();
  const key = `${file.source.id}/${file.relativePath}`;
  return { data, record: { id: digest(key).slice(0, 20), sourceId: file.source.id, relativePath: file.relativePath, path: key, name: path.basename(file.relativePath, path.extname(file.relativePath)), extension, sizeBytes: data.length, sha256: digest(data) } };
}
