# Expanding Character Studio

## Moving the viewport

Drag with the left mouse button to move the character on screen, including up and down. Drag with the right button to orbit and use the wheel to zoom. To inspect legs, zoom in and drag the character upward. **Center camera** returns to the front view while preserving both zoom and the area you are inspecting. Use **Full body** when you want to frame the entire character again.

With a keyboard, arrow keys orbit, `Shift + Arrow` moves the framing, `+`/`-` zooms, and `Home` shows the full body. On touch, one finger orbits and two fingers orbit or zoom. Only the camera moves: character coordinates, history, and export never change. Panning has no artificial limit, so face and legs remain reachable at any zoom level.

## Two different kinds of content

| What you want to change | What you need |
| --- | --- |
| Color or design of an existing jacket | An alternate texture using the same UV layout as that body or jacket. |
| Shape of a jacket, skirt, or trousers | Another compatible 3D mesh, not only an image. |
| Hairstyle | A hair mesh, the correct atlas, and a verified fit to the head. |
| Hair color | A compatible design variant or a texture prepared for tinting. |
| Face | A mesh and texture compatible with the set's neck, eyes, and head. |
| Eyes | An independent mesh when one exists; otherwise, a facial-atlas variant. |
| Selection thumbnail | A PNG/WebP image for the asset; it never replaces the model. |
| A complete new character | A body/head/hair set and maps with demonstrated compatibility. |

Many imported static bodies include clothing, eyes, and footwear. Those surfaces cannot become independent interchangeable pieces without preparing and validating separate geometry. A texture made for another character normally uses different UVs.

## Adding files through the scanner

1. Keep a copy of the original package. Put OBJ/MTL files in a configured `mesh` source, textures in a `texture` source, and thumbnails in a `preview` source. The default locations are listed in `assets.scan.json`; subfolders and additional local sources are supported.
2. For parts prepared in a 3D tool, preserve the assembled set's scale and coordinates, UVs, and normals. Check the assembled fit. Do not place every part independently at the origin. The current scanner inspects OBJ; the loader can read GLB, but dropping a GLB into a source does not yet catalog it as a primary piece.
3. From the project root, run:

   ```powershell
   pnpm assets:scan
   pnpm assets:validate --sources
   pnpm dev
   ```

4. Review `reports/asset-inspection.md`. An asset may be inventoried while remaining pending compatibility review. A thumbnail or a similar name does not enable it.
5. Record reviewed links in `assets.reviewed.json` while retaining existing rules. `textureRules` connects mesh and image by name and hash; multiple compatible images become designs. `assetRules` can associate a preview, `tintable`, `renderSide`, and the static anime shading profile. Find actual hashes in the generated inventory.
6. Regenerate and validate again. Run `pnpm build` when distributing a compiled application so it contains new resource copies.

Do not edit `assets.generated.json`, `compatibility.generated.json`, or `presets.generated.json` manually. They are scanner output.

## What is required for a much larger selection

The scanner can inventory a large collection efficiently, but catalog eligibility remains evidence-based. Review new families against their MergedMesh references, resolve head/UV/texture relations, record evidence, and test front, profile, back, and export. Do not enable every scanned file merely because it looks related.

When compatibility cannot be established automatically, extend the scanner with a reproducible rule and test rather than forcing scale adjustments in React. A visual calibration and approval workflow would be a separate feature; it is not created by camera navigation alone.
