import type { StudioData } from '../types/studio.ts';

export async function loadStudioData(signal?: AbortSignal): Promise<StudioData> {
  const response = await fetch('/studio-data.json', { signal });
  if (!response.ok) throw new Error('No se pudo abrir el catálogo. Ejecuta pnpm assets:scan e inténtalo de nuevo.');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('assets' in value) || !Array.isArray(value.assets) || !('presets' in value) || !Array.isArray(value.presets) || !('compatibility' in value)) throw new Error('El catálogo local no tiene un formato válido.');
  return value as StudioData;
}
