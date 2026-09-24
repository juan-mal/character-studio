import {
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  TextureSource,
  SRGBColorSpace,
  type Object3D,
  type Texture,
} from "three";
import { materialsOf } from "../three/objectResources.ts";

function pixels(
  texture: Texture,
  width: number,
  height: number,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("No se pudo preparar la transparencia para GLB.");
  context.drawImage(texture.image as CanvasImageSource, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

/** GLTF has no separate alphaMap: bake the green channel into base-color alpha on the export copy. */
export function bakeAlphaMaps(root: Object3D): void {
  const processed = new Set<MeshStandardMaterial | MeshBasicMaterial>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of materialsOf(object)) {
      if (
        !(material instanceof MeshStandardMaterial || material instanceof MeshBasicMaterial) ||
        !material.alphaMap ||
        processed.has(material)
      )
        continue;
      processed.add(material);
      const alpha = material.alphaMap;
      const base = material.map;
      if (
        base &&
        (base.channel !== alpha.channel ||
          base.flipY !== alpha.flipY ||
          base.wrapS !== alpha.wrapS ||
          base.wrapT !== alpha.wrapT ||
          !base.offset.equals(alpha.offset) ||
          !base.repeat.equals(alpha.repeat) ||
          base.rotation !== alpha.rotation ||
          !base.center.equals(alpha.center))
      ) {
        throw new Error(
          "La máscara y el color usan coordenadas distintas; no se puede exportar su transparencia con fidelidad.",
        );
      }
      const source = (base ?? alpha).image as { width: number; height: number };
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const context = canvas.getContext("2d");
      if (!context || !source.width || !source.height)
        throw new Error(
          "La textura de transparencia no tiene una imagen exportable.",
        );
      const output = context.createImageData(source.width, source.height);
      const color = base ? pixels(base, source.width, source.height) : null;
      const mask = pixels(alpha, source.width, source.height);
      for (let i = 0; i < output.data.length; i += 4) {
        output.data[i] = color?.[i] ?? 255;
        output.data[i + 1] = color?.[i + 1] ?? 255;
        output.data[i + 2] = color?.[i + 2] ?? 255;
        output.data[i + 3] = Math.round(
          ((color?.[i + 3] ?? 255) * mask[i + 1]!) / 255,
        );
      }
      context.putImageData(output, 0, 0);
      const baked: Texture = new CanvasTexture(canvas);
      baked.copy(base ?? alpha);
      baked.source = new TextureSource(canvas);
      baked.colorSpace = SRGBColorSpace;
      baked.needsUpdate = true;
      material.map = baked;
      material.alphaMap = null;
      // Source textures are clones owned by this export; releasing their GPU handles is safe.
      base?.dispose();
      alpha.dispose();
    }
  });
}
