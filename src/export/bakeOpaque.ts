import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  TextureSource,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
  WebGLRenderTarget,
  type Object3D,
} from "three";
import { materialsOf } from "../three/objectResources.ts";

function hasTransparentPixels(texture: Texture): boolean {
  const image = texture.image as { width: number; height: number };
  if (!image?.width || !image.height || typeof document === "undefined")
    return false;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("No se pudo comprobar la textura para exportación.");
  context.drawImage(image as CanvasImageSource, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < data.length; index += 4)
    if (data[index] !== 255) return true;
  return false;
}

/** Canvas2D discards RGB under zero alpha. Opaque materials still display that RGB.
 * Read it through WebGL with alpha forced to one before GLTFExporter's canvas encoding. */
export function bakeOpaqueMaps(root: Object3D): void {
  const materials: (MeshStandardMaterial | MeshBasicMaterial)[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh)
      for (const material of materialsOf(object))
        if (
          (material instanceof MeshStandardMaterial || material instanceof MeshBasicMaterial) &&
          material.map &&
          !material.transparent &&
          material.alphaTest === 0 &&
          !material.alphaMap
        )
          materials.push(material);
  });
  const maps = new Map<Texture, Texture>();
  let renderer: WebGLRenderer | undefined;
  try {
    for (const material of materials) {
      const original = material.map!;
      const existing = maps.get(original);
      if (existing) {
        material.map = existing;
        continue;
      }
      if (!hasTransparentPixels(original)) continue;
      renderer ??= new WebGLRenderer({ antialias: false, alpha: true });
      renderer.toneMapping = NoToneMapping;
      const image = original.image as { width: number; height: number };
      if (
        Math.max(image.width, image.height) >
        renderer.capabilities.maxTextureSize
      )
        throw new Error("La textura supera el tamaño exportable por esta GPU.");
      const texture = original.clone();
      texture.flipY = false;
      texture.offset.set(0, 0);
      texture.repeat.set(1, 1);
      texture.center.set(0, 0);
      texture.rotation = 0;
      texture.matrixAutoUpdate = true;
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      const plane = new Mesh(
        new PlaneGeometry(2, 2),
        new MeshBasicMaterial({ map: texture, toneMapped: false }),
      );
      const scene = new Scene();
      scene.add(plane);
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;
      const target = new WebGLRenderTarget(image.width, image.height, {
        depthBuffer: false,
      });
      target.texture.colorSpace = SRGBColorSpace;
      try {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        const pixels = new Uint8Array(image.width * image.height * 4);
        renderer.readRenderTargetPixels(
          target,
          0,
          0,
          image.width,
          image.height,
          pixels,
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No se pudo preparar la textura opaca.");
        context.putImageData(
          new ImageData(
            new Uint8ClampedArray(pixels),
            image.width,
            image.height,
          ),
          0,
          0,
        );
        const baked: Texture = new CanvasTexture(canvas);
        baked.copy(original);
        baked.source = new TextureSource(canvas);
        baked.colorSpace = SRGBColorSpace;
        baked.needsUpdate = true;
        maps.set(original, baked);
        material.map = baked;
      } finally {
        renderer.setRenderTarget(null);
        target.dispose();
        plane.geometry.dispose();
        plane.material.dispose();
        texture.dispose();
      }
    }
  } finally {
    for (const original of maps.keys()) original.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
