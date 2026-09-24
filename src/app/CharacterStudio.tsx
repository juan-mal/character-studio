import { NavigationHints } from "../components/NavigationHints.tsx";
import { useMemo, useRef, useState } from "react";
import type { StudioData } from "../types/studio.ts";
import { CatalogResolver } from "../compatibility/resolver.ts";
import { useCharacterStudio } from "../hooks/useCharacterStudio.ts";
import { Header } from "../components/Header.tsx";
import { Sidebar, type CategoryId } from "../components/Sidebar.tsx";
import { OptionsPanel } from "../components/OptionsPanel.tsx";
import { Icon } from "../components/Icon.tsx";
import { Notice } from "../components/Notice.tsx";
import { RecoveryBanner } from "../components/RecoveryBanner.tsx";
import { DebugPanel } from "../components/DebugPanel.tsx";
import { categoriesFor } from "./categories.ts";
import { presetLabel } from "../utils/labels.ts";
import { MAX_CONFIGURATION_BYTES } from "../state/persistence.ts";
import { useDelayedActivity } from "../hooks/useDelayedActivity.ts";

export function CharacterStudio({ data }: { data: StudioData }) {
  const resolver = useMemo(() => new CatalogResolver(data), [data]);
  const studio = useCharacterStudio(resolver);
  const inputRef = useRef<HTMLInputElement>(null);
  const [categoryId, setCategoryId] = useState<CategoryId>("presets");
  const categories = categoriesFor(resolver, studio.configuration);
  const category =
    categories.find((item) => item.id === categoryId) ?? categories[0]!;
  const presetIndex = resolver.supportedPresets.findIndex(
    (preset) => preset.id === studio.configuration.presetId,
  );
  const preset = resolver.supportedPresets[presetIndex];
  const title = preset ? presetLabel(preset, presetIndex) : "Mi personaje";
  const disabled = studio.busy || studio.exporting;
  const showLoading = useDelayedActivity(disabled);
  const selected = resolver.selectedAssets(studio.configuration);
  const hasUntextured = selected.some(
    (asset) =>
      !studio.configuration.textureVariants[asset.id] &&
      !asset.materials.some((material) => material.maps.length),
  );
  const openImport = (): void => inputRef.current?.click();

  return (
    <div className="studio-app">
      <Header
        name={title}
        disabled={disabled}
        exporting={studio.exporting}
        onReset={studio.reset}
        onSave={studio.save}
        onImport={openImport}
        onExport={() => {
          void studio.exportGlb();
        }}
      />
      {studio.recovery && (
        <RecoveryBanner
          disabled={disabled}
          onRecover={() => {
            void studio.recover();
          }}
          onDiscard={studio.discardRecovery}
        />
      )}
      <div className="studio-layout">
        <Sidebar
          categories={categories}
          active={category.id}
          onChange={setCategoryId}
        />
        <main
          className="viewport"
          aria-label="Estudio 3D"
          aria-busy={studio.busy}
        >
          <div className="viewport-topline">
            <div className="history-controls">
              <button
                className="button button--icon"
                aria-label="Deshacer"
                title="Deshacer (Ctrl Z)"
                disabled={disabled || !studio.history.past.length}
                onClick={studio.undo}
              >
                <Icon name="undo" />
              </button>
              <button
                className="button button--icon"
                aria-label="Rehacer"
                title="Rehacer (Ctrl Shift Z)"
                disabled={disabled || !studio.history.future.length}
                onClick={studio.redo}
              >
                <Icon name="redo" />
              </button>
            </div>
          </div>
          <div className="three-container" ref={studio.containerRef} />
          <div className="viewport-notices">
            {studio.error && (
              <Notice
                kind="error"
                message={studio.error}
                onDismiss={studio.dismissError}
              />
            )}{" "}
            {studio.notice && (
              <Notice
                message={studio.notice}
                onDismiss={studio.dismissNotice}
              />
            )}
          </div>
          {showLoading && (
            <div className="loading-state" role="status">
              <span className="spinner" />
              <span>
                {studio.exporting
                  ? "Preparando personaje…"
                  : studio.ready
                    ? "Aplicando cambios…"
                    : "Preparando tu estudio…"}
              </span>
            </div>
          )}
          <div className="view-tools">
            <button
              className="button button--surface"
              disabled={!studio.ready || studio.exporting}
              onClick={() => studio.sceneRef.current?.centerView()}
              aria-label="Centrar cámara"
            >
              <Icon name="focus" size={16} />
              <span>Centrar cámara</span>
            </button>
            <span className="tool-separator" />
            <button
              className="button button--quiet"
              disabled={!studio.ready}
              onClick={() => studio.sceneRef.current?.focus("face")}
              aria-label="Acercar a la cara"
            >
              Cara
            </button>
            <button
              className="button button--quiet"
              disabled={!studio.ready}
              onClick={() => studio.sceneRef.current?.focus("full")}
              aria-label="Ver cuerpo completo"
            >
              Cuerpo completo
            </button>
          </div>
          <div className="viewport-bottomline">
            <span>
              <span className="status-dot" />
              {hasUntextured
                ? "Material neutro · sin textura verificada"
                : "Vista de estudio"}
            </span>
            <NavigationHints />
          </div>
          <DebugPanel
            debug={studio.debug}
            onChange={studio.setDebug}
            assets={selected}
          />
        </main>
        <OptionsPanel
          key={category.id}
          category={category}
          resolver={resolver}
          configuration={studio.configuration}
          disabled={disabled}
          onChange={(configuration, warnings) => {
            void studio.apply(configuration, warnings);
          }}
          onImport={openImport}
        />
      </div>
      <input
        type="file"
        ref={inputRef}
        accept=".json,application/json"
        className="visually-hidden"
        aria-label="Archivo de preset JSON"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > MAX_CONFIGURATION_BYTES) {
            studio.setError(
              "El preset supera el límite de 100 KB. Selecciona un archivo MyCharacter.json.",
            );
            return;
          }
          void file
            .text()
            .then(studio.importPreset)
            .catch(() =>
              studio.setError("No se pudo leer el archivo seleccionado."),
            );
        }}
      />
    </div>
  );
}
