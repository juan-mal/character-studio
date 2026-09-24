# Character Studio design

## Scope

Character Studio is a local React, TypeScript, Vite, and Three.js application driven by the Phase 1 generated catalogs. It uses no remote services, external HDR, or additional state/3D frameworks.

## Decisions

The editor uses a three-column desktop layout: quiet navigation, a large scene, and a 360 px option panel. It follows a neutral palette, local Inter/system typography, 10 px rounded corners, and a 64 px header. Tablet layouts compact the navigation; mobile uses a bottom panel. Categories are derived from compatible options rather than from a hardcoded model list.

The catalog exposes only pieces supported by reviewed geometry and material evidence. Unconfirmed relationships stay outside incompatible controls. Material with no confirmed texture is presented neutrally and its limitation remains visible.

## Modules and contracts

- `src/types/studio.ts`: strict catalog data and a minimal, versioned configuration serialized through IDs.
- `src/compatibility`, `src/state`, `src/character`: conservative resolver, fallbacks, validation, history without camera state, and small optional persistence.
- `src/three`, `src/materials`, `src/export`: persistent renderer, geometry and texture caches, OBJ/MTL/GLB loading, lazy loading, per-instance materials, safe cloning, and GLB export.
- `src/components`, `src/app`, `src/styles`: accessible UI, derived categories, notifications, and responsive presentation. A selection commits only after its resources load, so the previous valid character remains visible during failures.
- The local Vite plugin serves catalogued resources through an allowlist and copies them into `dist` without editing originals or using absolute client paths.

## Verification

Unit tests cover compatibility, state transitions, undo/redo, preset validation, fallbacks, and serialization. Browser tests verify loading, available options, camera behavior, actions, downloads, responsive layouts, and exported GLB re-import through `GLTFLoader`. Features that are not enabled by catalog evidence are tested through contract fixtures and documented as unavailable in the active catalog.
