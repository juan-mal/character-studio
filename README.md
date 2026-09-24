# Character Studio

Character Studio is a local 3D character editor built with React, TypeScript, Vite, and Three.js. It includes an evidence-based asset scanner, a catalog-driven editor with history, portable JSON presets, and binary GLB export with embedded textures.

The editor keeps visible RGB data from opaque maps even when the source PNG includes transparent alpha. Export preparation works on an isolated copy, so it never changes materials visible in the editor. Machine-specific audits, screenshots, and reports are created locally under `reports/` and are not published.

## Asset availability

Game-derived meshes, textures, previews, generated reports, and build output are deliberately excluded from this repository. To use the editor, provide assets that you are permitted to use, configure their local locations in `assets.scan.json`, and run the scanner. The original source files are never edited, moved, or uploaded by the project.

## Quick start

Requirements: Node.js 22.18 or later and pnpm. Windows is supported.

```sh
pnpm install
pnpm assets:scan
pnpm assets:validate --sources
pnpm dev
```

Open `http://127.0.0.1:5173`.

- Drag with the left mouse button to move the framing vertically or horizontally.
- Drag with the right mouse button to orbit the character.
- Use the wheel to zoom.
- `Ctrl/Cmd + Z` undoes and `Ctrl/Cmd + Shift + Z` redoes.
- Saving downloads `MyCharacter.json`; loading validates it and uses compatible fallbacks for stale asset references.

`pnpm build` creates `dist` with independent resource copies. `pnpm preview` serves that build on `http://127.0.0.1:4173`. The application has no runtime dependency on a CDN, external HDR, API, or remote fonts.

## Current enabled content

The local reviewed catalog currently enables **19 presets and 17 body/outfit configurations**, including the initial NPC combinations and several reviewed character packages with alternate outfits. Packages retain their original texture atlases. Head swaps require geometry and visual review; outfits are selected through Presets or Body and are not yet independent clothing items.

The catalog only exposes content with compatible, reviewed evidence. Items found by the scanner but lacking confirmation remain registered for future work without being shown as selectable combinations.

## Anime rendering

Reviewed static pieces use `metadata.shading: "anime-static"`, declared through `assets.reviewed.json` or a reviewed FBX assembly manifest. This profile preserves original color maps, uses vertex-color painted lighting, and applies unlit materials so that faces stay softer than body and hair without photographic ACES contrast or dark PBR reflections. The floor retains a separate contact shadow.

The profile exports through `COLOR_0` and `KHR_materials_unlit`, without editor-specific shaders. It is a portable approximation for reviewed static OBJ assets, not a reconstruction of an original game's dynamic shader pipeline. It does not reproduce facial SDF, packed lightmaps, camera-dependent rim light, rigging, or animation. Unreviewed maps keep their normal material treatment; filenames never enable the anime profile by themselves.

## Adding content

Read the practical guides before enabling additional assets:

- [Adding models, clothing, textures, and previews](docs/adding-content.md)
- [Importing local character packs](docs/importing-local-packs.md)
- [Asset scanner design](docs/asset-scanner-design.md)
- [Character Studio design](docs/character-studio-design.md)

The source locations are configured in `assets.scan.json`: use `mesh` for OBJ/MTL files, `texture` for maps, `preview` for thumbnails, or `mixed` for combined folders. Add originals to these locations and run:

```sh
pnpm assets:scan
pnpm assets:validate --sources
pnpm build
```

Do not edit `assets.generated.json`, `compatibility.generated.json`, or `presets.generated.json` by hand. They are generated outputs. `assets.reviewed.json` is where reproducible, hash-locked review rules belong.

### Hair

Provide the highest-quality mesh and its maps. Check UVs, normals, root position, scale, and fit to the head from front, side, and back. If a MergedMesh reference exists, include it: the scanner compares body/hair surfaces instead of trusting names. A candidate without confirmed compatibility is cataloged but hidden.

### Bodies and faces

Provide OBJ/MTL files and genuine Standard/Fat/Strong variants separately. A new preset is offered only when its individual pieces exist and reviewed surfaces support the combination. The camera fits bounds rather than per-character magic scale factors. Equal vertex counts never make morph targets valid.

For faces, verify the neck, eyes, ears, UVs, and original coordinates as an assembled set. `Face001` does not imply `Body001`. Automatic spatial inspection produces candidates only; a new face needs explicit compatibility evidence before it can be selected.

### Clothing textures and previews

When an MTL links a map directly, the scanner records that assignment. Otherwise add a `textureRules` entry to `assets.reviewed.json` using verified mesh and image SHA-256 hashes, a role, a variant name, and UV-review evidence. Multiple rules for the same mesh create selectable designs without changing geometry or UVs. Do not treat Lightmap or SDF maps as albedo, roughness, or normal maps.

Previews are selection thumbnails only. Add them through a `preview` source and confirm them with an `assetRules` entry when needed. The UI uses `object-fit: contain`; missing previews get a neutral placeholder and never trigger a 3D thumbnail render.

`assetRules` also supports `tintable: true/false` and `renderSide: "front"/"double"`. Enable tinting only after verifying that multiplying the texture does not recolor integrated skin or accessories. The editor clones per-instance materials and never alters a shared source material.

## Camera, export, and current limits

Changing a piece preserves the current camera orientation. Changing archetype, losing the model outside the viewport, or pressing **Full body** frames the whole character. **Center camera** restores the front view while preserving the active zoom distance and the area currently being inspected. Camera controls never affect undo/redo or model transforms.

`Export GLB` exports only `CharacterRoot`: selected visible geometry, materials, embedded textures, and any existing skin/morph data. It excludes editor cameras, lights, helpers, hidden objects, and alternative meshes. The current OBJ collection is static and does not contain rigs, weights, animations, or prepared runtime morph targets.

`?debug=1` enables asset names, dimensions, bounds, axes, and wireframe helpers. Debug helpers never enter an exported GLB.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests use local scanned assets and cover editing, texture designs, camera controls, history, import/recovery, responsive layouts, cache behavior, and the downloaded GLB. The GLB is loaded again with `GLTFLoader` to validate its geometry and embedded resources. Test reports are written locally and ignored by Git.

## Generated outputs

- `src/generated/assets.generated.json`: logical assets, primary mesh, all LODs, materials, texture variants, and previews.
- `src/generated/compatibility.generated.json`: morph pairs, piece relations, MergedMesh evidence, and BaseBody analysis.
- `src/generated/presets.generated.json`: observed combinations, present pieces, and absent pieces.
- `reports/asset-inspection.json`: complete OBJ inventory, metrics, issues, and SHA-256 hashes.
- `reports/asset-inspection.md`: readable findings and recommendations.
- `src/assets/types.ts`: strict TypeScript contracts for generated data.

Generated paths use `sourceId` plus `relativePath`. Resolve the source from `sources`, expand `~`, then combine it with `relativePath`. The readable `path` field is not a public URL; the Vite plugin serves allowed inventory resources by ID and copies them during builds.

## Scanner guarantees and boundaries

- `metadata.mainApplication` means a candidate has valid geometry, UVs, highest-quality LOD selection, and no LOD conflict. It does not mean a complete, textured, animatable character.
- Exact morph compatibility requires equal vertex and face counts, ordered face indices, identical complete UVs, and compatible normal-index distribution. `probable` preserves topology with missing evidence; `incompatible` blocks direct morphing.
- MergedMesh confirmation requires matching quantized geometry and triangle evidence for both pieces. Names, folders, and bounding boxes remain candidates until that evidence exists.
- BaseBody checks open-border proximity, scale, and positions; it does not certify a complete seam, normals, rigging, or anatomical coverage.
- Direct OBJ → MTL → image links are confirmed material evidence. Name-only matches remain candidates. PNG, JPEG, WebP, and TGA headers are inspected, but game-specific shader behavior is not reconstructed.
- OBJ does not carry usable skeleton weights. Missing normals or UV references are recorded; the scanner does not repair or delete original files.

## Safety and reproducibility

The scanner writes only to `src/generated`, `reports`, and a temporary root lock. Outputs are written to temporary files and replaced by rename. If a scan is interrupted during publication, run it again. The lock prevents concurrent scans; if `.assets-scan.lock` remains after interruption, first ensure no scanner process is still running.

Outputs are deterministic for the same inventory and configuration. `pnpm assets:validate` verifies cross-references, counts, LODs, and fingerprints; `--sources` rereads originals and compares their hashes. Source symlinks are ignored, output directories cannot be symlinks, and MTL references outside the configured inventory are not followed.
