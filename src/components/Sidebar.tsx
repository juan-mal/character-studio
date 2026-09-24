import type { CharacterSlot } from "../types/studio.ts";
import { Icon, type IconName } from "./Icon.tsx";

export type CategoryId =
  | "presets"
  | CharacterSlot
  | "accessories"
  | "materials";
export interface StudioCategory {
  id: CategoryId;
  label: string;
  icon: IconName;
  count: number;
}
export function Sidebar({
  categories,
  active,
  onChange,
}: {
  categories: StudioCategory[];
  active: CategoryId;
  onChange: (id: CategoryId) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-caption">CREAR</div>
      <nav aria-label="Categorías del personaje">
        {categories.map((category) => (
          <button
            className={`nav-item ${active === category.id ? "is-active" : ""}`}
            key={category.id}
            onClick={() => onChange(category.id)}
            aria-current={active === category.id ? "page" : undefined}
            aria-label={category.label}
          >
            <Icon name={category.icon} size={21} />
            <span>{category.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
