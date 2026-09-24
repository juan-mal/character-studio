import type { AssetDefinition, Preset } from "../assets/types.ts";

export function assetLabel(asset: AssetDefinition): string {
  return asset.name
    .replace(/_NoEmo|_Standard|_High|_LOD\d+/gi, "")
    .replace(/_BaseBody_/g, " · ")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function presetLabel(preset: Preset, index: number): string {
  return preset.displayName ?? `${preset.archetype ?? "Personaje"} · ${String(index + 1).padStart(2, "0")}`;
}
