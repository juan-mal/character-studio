import { slots, type CharacterConfiguration } from "../types/studio.ts";

/** Copy the serializable character contract; viewport and runtime objects never enter history. */
export function cloneConfiguration(
  configuration: CharacterConfiguration,
): CharacterConfiguration {
  return {
    version: 1,
    presetId: configuration.presetId,
    archetype: configuration.archetype,
    selections: Object.fromEntries(
      slots.flatMap((slot) => {
        const id = configuration.selections[slot];
        return id === undefined ? [] : [[slot, id]];
      }),
    ),
    accessories: [...configuration.accessories],
    textureVariants: { ...configuration.textureVariants },
    colors: { ...configuration.colors },
    ...(configuration.skinTone ? {skinTone:configuration.skinTone} : {}),
    ...(configuration.textureAdjustments ? {textureAdjustments:Object.fromEntries(Object.entries(configuration.textureAdjustments).map(([id,edit])=>[id,{...edit}]))} : {}),
    morphs: Object.fromEntries(
      Object.entries(configuration.morphs).map(([id, values]) => [
        id,
        { ...values },
      ]),
    ),
  };
}

export function sameConfiguration(
  left: CharacterConfiguration,
  right: CharacterConfiguration,
): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    }
    return value;
  };
  return (
    JSON.stringify(canonical(cloneConfiguration(left))) ===
    JSON.stringify(canonical(cloneConfiguration(right)))
  );
}
