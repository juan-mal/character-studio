import type { CatalogResolver } from "../compatibility/resolver.ts";
import type { CharacterConfiguration } from "../types/studio.ts";
import { assetLabel } from "../utils/labels.ts";
import { AssetCard } from "./AssetCard.tsx";
import {TextureEditor} from './TextureEditor.tsx';
import {SkinControls} from './SkinControls.tsx';

const palette = [
  { name: "Negro", color: "#191818" },
  { name: "Castaño oscuro", color: "#3b2a22" },
  { name: "Castaño", color: "#71503a" },
  { name: "Castaño claro", color: "#a07d56" },
  { name: "Rubio", color: "#d4bc83" },
  { name: "Pelirrojo", color: "#a05035" },
  { name: "Plata", color: "#d9dad6" },
];
export function MaterialsPanel({
  resolver,
  configuration,
  disabled,
  onChange,
  assetIds,
}: {
  resolver: CatalogResolver;
  configuration: CharacterConfiguration;
  disabled: boolean;
  assetIds?: string[];
  onChange: (value: CharacterConfiguration) => void;
}) {
  const assets = resolver
    .selectedAssets(configuration)
    .filter(
      (a) =>
        (!assetIds || assetIds.includes(a.id)) &&
        (resolver.textureOptions(a.id, configuration).length ||
          resolver.canTint(a.id)),
    );
  return (
    <>
      {resolver.asset(configuration.selections.body??'')?.metadata.skinReference && (!assetIds || assetIds.includes(configuration.selections.body??'')) && <SkinControls key={configuration.selections.body} value={configuration.skinTone} disabled={disabled} onApply={skinTone=>{
        const next={...configuration};if(skinTone)next.skinTone=skinTone;else delete next.skinTone;onChange(next);
      }}/>}
      {assets.map((asset) => {
        const designs = resolver.textureOptions(asset.id, configuration);
        return (
          <section className="material-section" key={asset.id}>
            {!assetIds && <h3>{assetLabel(asset)}</h3>}
            {asset.metadata.shading==='anime-static' && designs.length>0 && <TextureEditor key={asset.id} label={assetLabel(asset)} value={configuration.textureAdjustments?.[asset.id]} disabled={disabled} onApply={edit=>{
              const textureAdjustments={...configuration.textureAdjustments};
              if(edit)textureAdjustments[asset.id]=edit;else delete textureAdjustments[asset.id];
              onChange({...configuration,textureAdjustments});
            }}/>}
            {designs.length > 0 && (
              <>
                <div className="section-label">Diseño</div>
                <div className="asset-grid">
                  {designs.map((design, index) => (
                    <AssetCard
                      key={design.id}
                      title={`Diseño ${String(index + 1).padStart(2, "0")}`}
                      subtitle={design.name.replaceAll("_", " ")}
                      previewId={
                        (design.maps.baseColor ??
                          design.maps.diffuse ??
                          design.maps.albedo)?.[0]
                      }
                      selected={
                        configuration.textureVariants[asset.id] === design.id
                      }
                      disabled={disabled}
                      icon="materials"
                      onSelect={() =>
                        onChange({
                          ...configuration,
                          textureVariants: {
                            ...configuration.textureVariants,
                            [asset.id]: design.id,
                          },
                        })
                      }
                    />
                  ))}
                </div>
              </>
            )}
            {resolver.canTint(asset.id) && (
              <>
                <div className="section-label">Color</div>
                <div className="color-palette">
                  {palette.map((swatch) => (
                    <button
                      key={swatch.color}
                      className={`color-swatch ${configuration.colors[asset.id] === swatch.color ? "is-selected" : ""}`}
                      style={{ backgroundColor: swatch.color }}
                      aria-label={`Color ${swatch.name}`}
                      aria-pressed={
                        configuration.colors[asset.id] === swatch.color
                      }
                      disabled={disabled}
                      onClick={() =>
                        onChange({
                          ...configuration,
                          colors: {
                            ...configuration.colors,
                            [asset.id]: swatch.color,
                          },
                        })
                      }
                    />
                  ))}
                  <label
                    className="custom-color"
                    aria-label="Color personalizado"
                  >
                    <input
                      type="color"
                      aria-label={`Color personalizado de ${assetLabel(asset)}`}
                      value={configuration.colors[asset.id] ?? "#71503a"}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          ...configuration,
                          colors: {
                            ...configuration.colors,
                            [asset.id]: event.target.value,
                          },
                        })
                      }
                    />
                    <span>+</span>
                  </label>
                </div>
              </>
            )}
          </section>
        );
      })}
    </>
  );
}
