import { useState } from "react";
import { Icon, type IconName } from "./Icon.tsx";

interface AssetCardProps {
  title: string;
  subtitle?: string;
  previewId?: string;
  selected: boolean;
  disabled?: boolean;
  icon?: IconName;
  onSelect: () => void;
  badge?: string;
}
export function AssetCard({
  title,
  subtitle,
  previewId,
  selected,
  disabled,
  icon = "person",
  onSelect,
  badge,
}: AssetCardProps) {
  const [failed, setFailed] = useState<string>();
  return (
    <button
      type="button"
      className={`asset-card ${selected ? "is-selected" : ""}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      aria-label={title}
    >
      <span className="asset-card__image">
        {previewId && failed !== previewId ? (
          <img
            src={`/asset-files/${previewId}`}
            alt=""
            loading="lazy"
            onError={() => setFailed(previewId)}
          />
        ) : (
          <span className="asset-placeholder">
            <Icon name={icon} size={38} />
            <span>Sin miniatura</span>
          </span>
        )}
        {selected && (
          <span className="selected-check">
            <Icon name="check" size={12} />
          </span>
        )}
        {badge && <span className="card-badge">{badge}</span>}
      </span>
      <span className="asset-card__title">{title}</span>
      {subtitle && <span className="asset-card__subtitle">{subtitle}</span>}
    </button>
  );
}
