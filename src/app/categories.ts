import type { CatalogResolver } from "../compatibility/resolver.ts";
import type { StudioCategory } from "../components/Sidebar.tsx";
import type { CharacterConfiguration, CharacterSlot } from "../types/studio.ts";

const definitions: {
  id: CharacterSlot;
  label: string;
  icon: StudioCategory["icon"];
}[] = [
  { id: "body", label: "Cuerpo", icon: "body" },
  { id: "face", label: "Cara", icon: "face" },
  { id: "eyes", label: "Ojos", icon: "eyes" },
  { id: "brows", label: "Cejas", icon: "brows" },
  { id: "hair", label: "Cabello", icon: "hair" },
  { id: "top", label: "Torso", icon: "top" },
  { id: "bottom", label: "Parte inferior", icon: "bottom" },
  { id: "leftHand", label: "Mano izquierda", icon: "accessories" },
  { id: "rightHand", label: "Mano derecha", icon: "accessories" },
  { id: "shoes", label: "Calzado", icon: "shoes" },
];
export function categoriesFor(
  resolver: CatalogResolver,
  configuration: CharacterConfiguration,
): StudioCategory[] {
  const result: StudioCategory[] = [
    {
      id: "presets",
      label: "Presets",
      icon: "presets",
      count: resolver.supportedPresets.length,
    },
  ];
  for (const category of definitions) {
    const count = resolver.options(category.id, configuration).length;
    if (count) result.push({ ...category, count });
  }
  const accessories = resolver.accessoryOptions(configuration).length;
  if (accessories)
    result.push({
      id: "accessories",
      label: "Accesorios",
      icon: "accessories",
      count: accessories,
    });
  const materialOptions = resolver
    .selectedAssets(configuration)
    .filter(
      (asset) =>
        resolver.textureOptions(asset.id, configuration).length ||
        resolver.canTint(asset.id),
    );
  if (materialOptions.length)
    result.push({
      id: "materials",
      label: "Materiales",
      icon: "materials",
      count: materialOptions.length,
    });
  return result;
}
