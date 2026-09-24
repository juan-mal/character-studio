import type { CSSProperties } from "react";

export type IconName =
  | "person"
  | "presets"
  | "body"
  | "face"
  | "eyes"
  | "brows"
  | "hair"
  | "top"
  | "bottom"
  | "shoes"
  | "accessories"
  | "materials"
  | "undo"
  | "redo"
  | "reset"
  | "save"
  | "download"
  | "upload"
  | "focus"
  | "check"
  | "close"
  | "chevron"
  | "search"
  | "info";
const paths: Record<IconName, React.ReactNode> = {
  person: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M5 21v-3a7 7 0 0 1 14 0v3" />
    </>
  ),
  presets: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  body: (
    <>
      <circle cx="12" cy="4" r="2" />
      <path d="M8 9h8l3 5M8 9l-3 5m4-5 1 6-2 7m7-13-1 6 2 7M10 15h4" />
    </>
  ),
  face: (
    <>
      <path d="M5 8a7 7 0 0 1 14 0v5c0 5-5 8-7 8s-7-3-7-8Z" />
      <path d="M8 10h1m6 0h1m-7 6c2 1 4 1 6 0" />
    </>
  ),
  eyes: (
    <>
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  brows: (
    <>
      <path d="M3 9c3-3 5-3 8-1m2 0c3-2 5-2 8 1M4 15h5m6 0h5" />
    </>
  ),
  hair: (
    <>
      <path d="M5 19V9a7 7 0 0 1 14 0v10M5 12c4 0 8-3 9-7 0 4 2 6 5 7M9 13v6m6-6v6" />
    </>
  ),
  top: (
    <>
      <path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c-1 4-7 4-8 0Z" />
    </>
  ),
  bottom: (
    <>
      <path d="M6 3h12l2 18h-6l-2-11-2 11H4Zm0 4h12" />
    </>
  ),
  shoes: (
    <>
      <path d="M4 9v10h17v-4l-9-3-3-5H4Zm8 3-2 3m5-2-2 3" />
    </>
  ),
  accessories: (
    <>
      <path d="m12 2 4 7 6 3-6 3-4 7-4-7-6-3 6-3Z" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  materials: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path
        d="M12 3v18M12 3a9 9 0 0 1 0 18"
        fill="currentColor"
        opacity=".25"
      />
    </>
  ),
  undo: (
    <>
      <path d="M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12" />
    </>
  ),
  redo: (
    <>
      <path d="m16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12" />
    </>
  ),
  reset: (
    <>
      <path d="M4 10a8 8 0 1 1 1 7M4 3v7h7" />
    </>
  ),
  save: (
    <>
      <path d="M4 3h13l3 3v15H4Z" />
      <path d="M8 3v6h8V3M8 21v-8h8v8" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" />
    </>
  ),
  focus: (
    <>
      <path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v.1" />
    </>
  ),
};
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
