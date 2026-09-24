import { cloneConfiguration } from "../character/configuration.ts";
import type { CatalogResolver } from "../compatibility/resolver.ts";
import type {
  CharacterConfiguration,
  ValidationResult,
} from "../types/studio.ts";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const MAX_CONFIGURATION_BYTES = 100_000;
export const LAST_CONFIGURATION_KEY = "character-studio:configuration:v1";

export function serializeConfiguration(
  configuration: CharacterConfiguration,
): string {
  const text = JSON.stringify(cloneConfiguration(configuration), null, 2);
  checkSize(text);
  return text;
}

export function deserializeConfiguration(
  text: string,
  resolver: CatalogResolver,
): ValidationResult {
  checkSize(text);
  let input: unknown;
  try {
    input = JSON.parse(text) as unknown;
  } catch {
    throw new Error("El archivo no contiene JSON válido.");
  }
  return resolver.normalize(input);
}

function checkSize(text: string): void {
  if (
    text.length > MAX_CONFIGURATION_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_CONFIGURATION_BYTES
  ) {
    throw new Error("La configuración supera el límite de 100 KB.");
  }
}

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function saveLast(
  configuration: CharacterConfiguration,
  storage: StorageLike | undefined = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      LAST_CONFIGURATION_KEY,
      serializeConfiguration(configuration),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadLast(
  resolver: CatalogResolver,
  storage: StorageLike | undefined = defaultStorage(),
): ValidationResult | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(LAST_CONFIGURATION_KEY);
    return text === null ? null : deserializeConfiguration(text, resolver);
  } catch {
    return null;
  }
}

export function clearLast(
  storage: StorageLike | undefined = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(LAST_CONFIGURATION_KEY);
    return true;
  } catch {
    return false;
  }
}
