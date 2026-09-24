import { Icon } from "./Icon.tsx";

export function Notice({
  message,
  kind = "info",
  onDismiss,
}: {
  message: string;
  kind?: "info" | "error";
  onDismiss?: () => void;
}) {
  return (
    <div
      className={`notice notice--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon name="info" size={16} />
      <span>{message}</span>
      {onDismiss && (
        <button
          className="button button--icon"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
        >
          <Icon name="close" size={15} />
        </button>
      )}
    </div>
  );
}
