import { Icon } from "./Icon.tsx";

interface HeaderProps {
  name: string;
  disabled: boolean;
  exporting: boolean;
  onReset: () => void;
  onSave: () => void;
  onImport: () => void;
  onExport: () => void;
}
export function Header({
  name,
  disabled,
  exporting,
  onReset,
  onSave,
  onImport,
  onExport,
}: HeaderProps) {
  return (
    <header className="app-header">
      <a className="brand" href="/" aria-label="Character Studio, inicio">
        <span className="brand-mark">
          <Icon name="person" size={19} />
        </span>
        <span>
          Character <strong>Studio</strong>
        </span>
      </a>
      <div className="document-name">
        <span className="document-dot" />
        {name}
      </div>
      <div className="header-actions">
        <button
          className="button button--quiet reset-button"
          disabled={disabled}
          onClick={onReset}
          aria-label="Restablecer personaje"
        >
          <Icon name="reset" />
          <span>Restablecer</span>
        </button>
        <button
          className="button button--icon import-button"
          disabled={disabled}
          onClick={onImport}
          aria-label="Cargar preset"
          title="Cargar preset"
        >
          <Icon name="upload" />
        </button>
        <button
          className="button button--outline save-button"
          disabled={disabled}
          onClick={onSave}
          aria-label="Guardar preset"
        >
          <Icon name="save" />
          <span>Guardar</span>
        </button>
        <button
          className="button button--primary"
          disabled={disabled || exporting}
          onClick={onExport}
          aria-label="Exportar GLB"
        >
          <Icon name="download" />
          <span>{exporting ? "Preparando…" : "Exportar GLB"}</span>
        </button>
      </div>
    </header>
  );
}
