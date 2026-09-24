export function RecoveryBanner({
  disabled,
  onRecover,
  onDiscard,
}: {
  disabled: boolean;
  onRecover: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="recovery-banner"
      role="region"
      aria-label="Recuperar sesión"
    >
      <div>
        <strong>Recuperar personaje guardado</strong>
      </div>
      <div className="recovery-actions">
        <button
          className="button button--quiet"
          disabled={disabled}
          onClick={onDiscard}
        >
          Omitir
        </button>
        <button
          className="button button--primary"
          disabled={disabled}
          onClick={onRecover}
        >
          Recuperar
        </button>
      </div>
    </div>
  );
}
