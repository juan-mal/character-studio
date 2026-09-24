import {
  Component,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type { StudioData } from "../types/studio.ts";
import { loadStudioData } from "../assets/studio-data.ts";
import { CharacterStudio } from "./CharacterStudio.tsx";
import { Icon } from "../components/Icon.tsx";

class StudioBoundary extends Component<
  { children: ReactNode },
  { message: string }
> {
  state = { message: "" };
  static getDerivedStateFromError() {
    return {
      message:
        "No se pudo abrir el estudio. Comprueba el catálogo local y vuelve a intentarlo.",
    };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Character Studio]", error, info.componentStack);
  }
  render() {
    return this.state.message ? (
      <StartupState error={this.state.message} />
    ) : (
      this.props.children
    );
  }
}
function StartupState({ error }: { error?: string }) {
  return (
    <main className="startup-state">
      <span className="brand-mark">
        <Icon name="person" size={24} />
      </span>
      <h1>Character Studio</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button
            className="button button--primary"
            onClick={() => location.reload()}
          >
            Volver a intentar
          </button>
          <small>
            Verifica las fuentes locales y ejecuta <code>pnpm assets:scan</code>
            .
          </small>
        </>
      ) : (
        <>
          <span className="spinner" />
          <p>Abriendo tu colección local…</p>
        </>
      )}
    </main>
  );
}
export function App() {
  const [data, setData] = useState<StudioData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void loadStudioData(controller.signal)
      .then(setData)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "No se pudo abrir el catálogo.",
          );
      });
    return () => controller.abort();
  }, []);
  return (
    <StudioBoundary>
      {data ? <CharacterStudio data={data} /> : <StartupState error={error} />}
    </StudioBoundary>
  );
}
