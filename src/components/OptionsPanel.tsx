import { useState } from "react";
import type { AssetDefinition } from "../assets/types.ts";
import type { CatalogResolver } from "../compatibility/resolver.ts";
import type { CharacterConfiguration } from "../types/studio.ts";
import { assetLabel, presetLabel } from "../utils/labels.ts";
import { AssetCard } from "./AssetCard.tsx";
import { Icon } from "./Icon.tsx";
import { MaterialsPanel } from "./MaterialsPanel.tsx";
import type { StudioCategory } from "./Sidebar.tsx";

interface Props {
  category: StudioCategory;
  resolver: CatalogResolver;
  configuration: CharacterConfiguration;
  disabled: boolean;
  onChange: (
    configuration: CharacterConfiguration,
    warnings?: string[],
  ) => void;
  onImport: () => void;
}
export function OptionsPanel({
  category,
  resolver,
  configuration,
  disabled,
  onChange,
  onImport,
}: Props) {
  const [search, setSearch] = useState("");
  const preview = (asset: AssetDefinition): string | undefined =>
    asset.preview?.imageId ??
    asset.previewCandidates.find((candidate) =>
      resolver.data.images.some(
        (image) =>
          image.id === candidate.imageId &&
          (!image.archetype || image.archetype === configuration.archetype),
      ),
    )?.imageId;
  const items =
    category.id === "accessories"
      ? resolver.accessoryOptions(configuration)
      : category.id !== "presets" && category.id !== "materials"
        ? resolver.options(category.id, configuration)
        : [];
  const chosen = items.find(
    (asset) =>
      Object.values(configuration.selections).includes(asset.id) ||
      configuration.accessories.includes(asset.id),
  );
  const descriptions: Partial<Record<StudioCategory["id"], string>> = {
    presets: "Un punto de partida para tu personaje.",
    body: "La base de todas tus combinaciones.",
    face: "Encuentra la expresión de tu personaje.",
    hair: "Explora estilos para esta base.",
    materials: "El acabado está en los detalles.",
    accessories: "Los detalles que lo hacen único.",
  };
  return (
    <aside
      className="options-panel"
      aria-label={`Opciones de ${category.label}`}
    >
      <div className="panel-heading">
        <div className="eyebrow">PERSONALIZAR</div>
        <div className="panel-title">
          <h1>{category.label}</h1>
          <span className="count-badge">{category.count}</span>
        </div>
        <p>
          {descriptions[category.id] ??
            "Opciones compatibles con tu personaje."}
        </p>
      </div>
      <div className="panel-scroll">
        {category.id === "presets" ? (
          <>
            <div className="section-label section-label--row">
              <span>COLECCIÓN LOCAL</span>
              <span>{resolver.supportedPresets.length} presets</span>
            </div>
            <div className="asset-grid">
              {resolver.supportedPresets.map((preset, index) => {
                const hair = resolver.asset(preset.hairAssetIds[0] ?? "");
                return (
                  <AssetCard
                    key={preset.id}
                    title={presetLabel(preset, index)}
                    subtitle={preset.outfitLabel ?? (preset.displayName ? "Atuendo original" : `${preset.bodyFamily ?? "Base"} · ${preset.hairFamily ?? ""}`)}
                    previewId={hair ? preview(hair) : undefined}
                    selected={configuration.presetId === preset.id}
                    disabled={disabled}
                    icon="person"
                    onSelect={() => onChange(resolver.fromPreset(preset.id))}
                    badge="Verificado"
                  />
                );
              })}
            </div>
            <div className="import-card">
              <Icon name="upload" size={22} />
              <strong>Tu próximo personaje</strong>
              <p>Continúa una creación guardada en este equipo.</p>
              <button
                className="button button--outline"
                disabled={disabled}
                onClick={onImport}
              >
                Cargar preset JSON
              </button>
            </div>
          </>
        ) : category.id === "materials" ? (
          <MaterialsPanel
            resolver={resolver}
            configuration={configuration}
            disabled={disabled}
            onChange={onChange}
          />
        ) : (
          <>
            {items.length > 6 && (
              <label className="search-field">
                <Icon name="search" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar opciones"
                  aria-label="Buscar opciones"
                />
              </label>
            )}
            <div className="section-label section-label--row">
              <span>{category.id === "hair" ? "ESTILO" : "MODELO"}</span>
              <span>{configuration.archetype ?? "Actual"}</span>
            </div>
            <div className="asset-grid">
              {items
                .filter((asset) =>
                  assetLabel(asset)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((asset) => (
                  <AssetCard
                    key={asset.id}
                    title={assetLabel(asset)}
                    subtitle={
                      asset.mesh.buildVariant ?? asset.family ?? "Compatible"
                    }
                    previewId={preview(asset)}
                    selected={
                      Object.values(configuration.selections).includes(
                        asset.id,
                      ) || configuration.accessories.includes(asset.id)
                    }
                    disabled={disabled}
                    icon={category.icon}
                    onSelect={() => {
                      if (category.id === "accessories") {
                        const accessories = configuration.accessories.includes(
                          asset.id,
                        )
                          ? configuration.accessories.filter(
                              (id) => id !== asset.id,
                            )
                          : [...configuration.accessories, asset.id];
                        const normalized = resolver.normalize({
                          ...configuration,
                          accessories,
                        });
                        onChange(normalized.configuration, normalized.warnings);
                      } else if (
                        category.id !== "presets" &&
                        category.id !== "materials"
                      ) {
                        const result = resolver.select(
                          configuration,
                          category.id,
                          asset.id,
                        );
                        onChange(result.configuration, result.warnings);
                      }
                    }}
                  />
                ))}
            </div>
            {!items.some((asset) =>
              assetLabel(asset).toLowerCase().includes(search.toLowerCase()),
            ) && (
              <p className="empty-state" role="status">
                {items.length
                  ? "No hay resultados para esta búsqueda."
                  : "No hay opciones compatibles para este personaje."}
              </p>
            )}
            {chosen && (
              <div className="selected-detail">
                <span className="section-label">SELECCIONADO</span>
                <strong>{assetLabel(chosen)}</strong>
              </div>
            )}
            {chosen &&
              (resolver.canTint(chosen.id) ||
                resolver.textureOptions(chosen.id, configuration).length >
                  0) && (
                <MaterialsPanel
                  resolver={resolver}
                  configuration={configuration}
                  assetIds={[chosen.id]}
                  disabled={disabled}
                  onChange={onChange}
                />
              )}
          </>
        )}
      </div>
      <div className="panel-footer">
        <Icon name="check" size={14} />
        <span>Solo combinaciones compatibles</span>
      </div>
    </aside>
  );
}
