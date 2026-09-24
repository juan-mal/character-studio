import type { AssetDefinition } from "../assets/types.ts";
import type { StudioDebug } from "../types/studio.ts";

export function DebugPanel({
  debug,
  onChange,
  assets,
}: {
  debug: StudioDebug;
  onChange: (value: StudioDebug) => void;
  assets: AssetDefinition[];
}) {
  if (!debug.enabled) return null;
  return (
    <details className="debug-panel">
      <summary>Inspector de desarrollo</summary>
      <div className="debug-toggles">
        {(["bounds", "axes", "wireframe"] as const).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={debug[key]}
              onChange={(event) =>
                onChange({ ...debug, [key]: event.target.checked })
              }
            />
            {key}
          </label>
        ))}
      </div>
      {assets.map((asset) => (
        <div className="debug-asset" key={asset.id}>
          <strong>{asset.name}</strong>
          <code>{asset.id}</code>
          <span>Familia: {asset.family ?? "—"}</span>
          <span>
            Dimensiones:{" "}
            {asset.mesh.geometry.bounds?.dimensions
              .map((value) => value.toFixed(3))
              .join(" × ")}
          </span>
          <span>
            {asset.compatibility.relationIds.length} relaciones documentadas
          </span>
        </div>
      ))}
    </details>
  );
}
