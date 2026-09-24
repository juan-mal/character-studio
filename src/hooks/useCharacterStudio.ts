import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogResolver } from "../compatibility/resolver.ts";
import {
  createHistory,
  commitHistory,
  undoHistory,
  redoHistory,
  type HistoryState,
} from "../state/history.ts";
import {
  clearLast,
  deserializeConfiguration,
  loadLast,
  saveLast,
  serializeConfiguration,
} from "../state/persistence.ts";
import { CharacterScene } from "../three/CharacterScene.ts";
import type {
  CharacterConfiguration,
  LoadProgress,
  StudioDebug,
} from "../types/studio.ts";
import { characterFilename, downloadBlob } from "../utils/download.ts";

export function useCharacterStudio(resolver: CatalogResolver) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CharacterScene | null>(null);
  const [history, setHistory] = useState(() =>
    createHistory(resolver.defaultConfiguration()),
  );
  const historyRef = useRef(history);
  const [recovery, setRecovery] = useState(() => loadLast(resolver));
  const recoveryRef = useRef(recovery);
  const [busy, setBusy] = useState(true);
  const busyRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<LoadProgress>({
    loaded: 0,
    total: 0,
    active: false,
  });
  const [debug, setDebugState] = useState<StudioDebug>(() => ({
    enabled: new URLSearchParams(location.search).get("debug") === "1",
    wireframe: false,
    bounds: false,
    axes: false,
  }));
  const alive = useRef(true);

  useEffect(() => {
    if (!containerRef.current) return;
    alive.current = true;
    let scene: CharacterScene;
    try {
      scene = new CharacterScene(containerRef.current, {
        data: resolver.data,
        onProgress: (value) => {
          if (alive.current) setProgress(value);
        },
        onError: (message) => {
          if (alive.current) setError(message);
        },
      });
      sceneRef.current = scene;
    } catch (reason) {
      console.error("[Character Studio] No se pudo iniciar WebGL", reason);
      setError(
        "No se pudo iniciar la vista 3D. Comprueba que tu navegador tenga aceleración gráfica.",
      );
      busyRef.current = false;
      setBusy(false);
      return;
    }
    void scene
      .setConfiguration(historyRef.current.present)
      .then(() => {
        if (!alive.current) return;
        setReady(true);
        if (!recoveryRef.current) saveLast(historyRef.current.present);
      })
      .catch((reason: unknown) => {
        if (!alive.current) return;
        console.error("[Character Studio] Carga inicial", reason);
        setError(
          "No se pudo cargar el personaje. Revisa las carpetas de origen y vuelve a elegir un preset.",
        );
      })
      .finally(() => {
        if (alive.current) {
          busyRef.current = false;
          setBusy(false);
        }
      });
    return () => {
      alive.current = false;
      sceneRef.current = null;
      scene.dispose();
    };
  }, [resolver]);

  useEffect(() => {
    sceneRef.current?.setDebug(debug);
  }, [debug, ready]);

  const applyHistory = useCallback(
    async (next: HistoryState): Promise<boolean> => {
      if (!sceneRef.current || busyRef.current) return false;
      if (next === historyRef.current && ready) return true;
      busyRef.current = true;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        await sceneRef.current.setConfiguration(next.present);
        if (!alive.current) return false;
        historyRef.current = next;
        setHistory(next);
        setReady(true);
        if (!recoveryRef.current && !saveLast(next.present))
          setNotice(
            "El personaje está listo. El navegador no permitió guardarlo automáticamente.",
          );
        return true;
      } catch (reason) {
        console.error(
          "[Character Studio] No se pudo cargar esta opción",
          reason,
        );
        if (alive.current)
          setError(
            "No se pudo cargar esta opción. Tu personaje anterior se ha conservado.",
          );
        return false;
      } finally {
        if (alive.current) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [ready],
  );

  const apply = useCallback(
    async (configuration: CharacterConfiguration, warnings: string[] = []) => {
      const result = await applyHistory(
        commitHistory(historyRef.current, configuration),
      );
      if (result && warnings.length) setNotice(warnings.join(" "));
      return result;
    },
    [applyHistory],
  );

  const undo = useCallback(() => {
    void applyHistory(undoHistory(historyRef.current));
  }, [applyHistory]);
  const redo = useCallback(() => {
    void applyHistory(redoHistory(historyRef.current));
  }, [applyHistory]);
  const reset = useCallback(() => {
    void apply(resolver.fromPreset(historyRef.current.present.presetId));
  }, [apply, resolver]);
  const recover = useCallback(async () => {
    const saved = recoveryRef.current;
    if (!saved) return;
    if (await apply(saved.configuration, saved.warnings)) {
      recoveryRef.current = null;
      setRecovery(null);
      saveLast(saved.configuration);
    }
  }, [apply]);
  const discardRecovery = useCallback(() => {
    recoveryRef.current = null;
    setRecovery(null);
    clearLast();
    if (ready) saveLast(historyRef.current.present);
  }, [ready]);
  const importPreset = useCallback(
    async (text: string) => {
      try {
        const result = deserializeConfiguration(text, resolver);
        if (await apply(result.configuration, result.warnings)) {
          recoveryRef.current = null;
          setRecovery(null);
          saveLast(result.configuration);
          if (!result.warnings.length)
            setNotice("Preset cargado. Puedes seguir editándolo.");
        }
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo leer el preset.",
        );
      }
    },
    [apply, resolver],
  );
  const save = useCallback(() => {
    downloadBlob(
      new Blob([serializeConfiguration(historyRef.current.present)], {
        type: "application/json",
      }),
      "MyCharacter.json",
    );
    setNotice(
      "Preset guardado. El archivo contiene la configuración de tu personaje.",
    );
  }, []);
  const exportGlb = useCallback(async () => {
    if (!sceneRef.current || busyRef.current || !ready) return;
    busyRef.current = true;
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const data = await sceneRef.current.exportGlb();
      downloadBlob(
        new Blob([data], { type: "model/gltf-binary" }),
        characterFilename(),
      );
      setNotice(
        "Tu personaje está listo. GLB exportado con las piezas seleccionadas.",
      );
    } catch (reason) {
      console.error("[Character Studio] Exportación GLB", reason);
      setError(
        "No se pudo exportar el personaje. Tu configuración se ha conservado.",
      );
    } finally {
      busyRef.current = false;
      setExporting(false);
    }
  }, [ready]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "z" ||
        busyRef.current
      )
        return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  return {
    containerRef,
    sceneRef,
    configuration: history.present,
    history,
    recovery,
    busy,
    ready,
    exporting,
    error,
    notice,
    progress,
    debug,
    setDebug: setDebugState,
    apply,
    undo,
    redo,
    reset,
    recover,
    discardRecovery,
    importPreset,
    save,
    exportGlb,
    setError,
    dismissError: () => setError(""),
    dismissNotice: () => setNotice(""),
  };
}
