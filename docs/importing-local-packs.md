# Importing local character packs without scanning an entire drive

A curated set of locally organized character packages can be prepared from a focused source folder rather than by traversing every file on a mechanical drive. Each package keeps its body, hair, and face in the same rest pose. Its color atlases, MTL materials, and previews are copied into local ignored content folders for scanning and review.

## Resumable preparation

From the project root:

```powershell
./tools/content/Import-CharacterPacks.ps1 -Source 'F:/GI-Assets-main/GI-Assets-main/Models/Characters' -Characters Amber,Barbara -Limit 2
```

For an existing outfit, use `-Variant Summer -Characters Barbara -Limit 1` or `-Variant Alternate -Characters Amber -Limit 1` with the same source. The outfit name must match its directory; it is never silently replaced with `Default` when missing. Materials are searched in the outfit and parent directories, and ambiguous references are rejected.

The wrapper finds an installed Blender, uses two workers, records a log under `reports`, and propagates process errors. It neither installs nor downloads tools. It reads only the selected folders and processes at most ten characters per run. Conversion skips packages whose source FBX and generated results still have matching hashes.

`-Output` can prepare a batch on another drive. To add it to the current scanner, reviewed packages must be placed under the configured local content source. Never point output at original source directories.

A new character is not guaranteed to be selectable: unknown materials, absent maps, or ambiguous links stop preparation with a clear error. Do not use `-Characters` to sweep every directory without reviewing small batches first.

## Review and catalog activation

1. The script writes static OBJ files, MTL files with direct maps, copied diffuse resources, and `assembly.json` with `reviewed: false`.
2. Run `pnpm assets:scan`. Pieces enter the inventory, but the set does not yet become a selectable preset.
3. Check body, face, hair, material bounds, front/profile/back views, dimensions, and GLB export. `pnpm exec playwright test tests/e2e/expansion.spec.ts -g "prepared packs"` creates screenshots under `reports/expansion`. `node tools/content/contact-sheets.mjs` organizes them for visual review; it never activates content.
4. Record evidence and set `reviewed: true` only after that review. Relate previews by name/hash and place them in the configured preview source.
5. Run `pnpm assets:scan`, `pnpm assets:validate --sources`, and `pnpm build` when creating a distributable build.

The scanner verifies SHA-256 fingerprints for the source FBX and every prepared OBJ, MTL, and image. If the source drive is unavailable or a reviewed resource changes, the package is withdrawn from the enabled catalog on the next scan and a warning is recorded. A compiled app continues to work with its local copies and does not require the original drive at runtime.

Relationships only join pieces from the same reviewed assembly. A head or hairstyle from another character is never approved merely because its size or filename looks similar. The preset uses the real name; previews are selection images rather than texture atlases.

## Conversion and limitations

These FBX packages are imported with `global_scale=100` and converted from Blender Z-up to the editor's Y-up coordinates. This is a shared assembly transform recorded in `assembly.json` and `metadata.calibration`; individual pieces are not silently repositioned. The resulting sizes are reviewed alongside existing characters.

Surfaces are split by their body, hair, and face materials; face surfaces retain brows and eyes. Body and dress meshes may share an atlas, so assignments must be checked against material references and UVs. Effect meshes and expression overlays remain excluded. Originals retain those meshes.

Preparation is static: it does not transfer a rig, animation clips, or expressions from FBX into OBJ. Clothing and footwear remain integrated into the body unless separate meshes are prepared and reviewed. Lightmaps, SDF maps, and game-specific maps are not reinterpreted as PBR textures.

The current reviewed OBJ packages remain available when the original FBX drive is disconnected because local copied resources are hash-checked. The reviewed compatibility applies to static poses only and does not guarantee collision-free animated characters.
