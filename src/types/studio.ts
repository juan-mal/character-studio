import type {
  AssetDefinition,
  CompatibilityCatalog,
  ImageRecord,
  MaterialRecord,
  Preset,
} from "../assets/types.ts";

export const slots = [
  "body",
  "face",
  "eyes",
  "brows",
  "hair",
  "top",
  "bottom",
  "leftHand",
  "rightHand",
  "shoes",
] as const;
export type CharacterSlot = (typeof slots)[number];
export interface TextureAdjustment { hue:number; saturation:number; lightness:number; color?:string }
export interface CharacterConfiguration {
  version: 1;
  presetId: string;
  archetype: string | null;
  selections: Partial<Record<CharacterSlot, string>>;
  accessories: string[];
  textureVariants: Record<string, string>;
  colors: Record<string, string>;
  morphs: Record<string, Record<string, number>>;
  textureAdjustments?: Record<string, TextureAdjustment>;
  skinTone?: string;
}
export interface StudioData {
  assets: AssetDefinition[];
  images: ImageRecord[];
  materials: MaterialRecord[];
  compatibility: CompatibilityCatalog;
  presets: Preset[];
}
export interface ValidationResult {
  configuration: CharacterConfiguration;
  warnings: string[];
}
export interface LoadProgress {
  loaded: number;
  total: number;
  active: boolean;
}
export interface StudioDebug {
  enabled: boolean;
  wireframe: boolean;
  bounds: boolean;
  axes: boolean;
}
