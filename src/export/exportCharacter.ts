import {
  Mesh,
  Texture,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import {
  cloneInstanceMaterials,
  disposeTemplate,
  materialsOf,
} from "../three/objectResources.ts";
import { bakeAlphaMaps } from "./bakeAlpha.ts";
import { bakeOpaqueMaps } from "./bakeOpaque.ts";

/** SkeletonUtils preserves skeleton bindings; Mesh.clone preserves existing morph targets. */
export function createExportClone(root: Object3D): Object3D {
  const copy = clone(root);
  copy.name = "CharacterRoot";
  cloneInstanceMaterials(copy);
  const geometries = new Map<BufferGeometry, BufferGeometry>();
  const textures = new Map<Texture, Texture>();
  copy.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const sourceGeometry = object.geometry as BufferGeometry;
    let geometry = geometries.get(sourceGeometry);
    if (!geometry) {
      geometry = sourceGeometry.clone();
      geometries.set(sourceGeometry, geometry);
      // Exporter may temporarily index a non-indexed mesh or normalize its normals.
      // The visible model and asset cache must never observe those mutations.
      const normals = geometry.getAttribute("normal");
      if (normals) {
        const vector = new Vector3();
        for (let i = 0; i < normals.count; i++) {
          vector.fromBufferAttribute(normals, i);
          if (!Number.isFinite(vector.lengthSq()) || vector.lengthSq() === 0)
            vector.set(1, 0, 0);
          else vector.normalize();
          normals.setXYZ(i, vector.x, vector.y, vector.z);
        }
      }
    }
    object.geometry = geometry;
    for (const material of materialsOf(object)) {
      if ("wireframe" in material) material.wireframe = false;
      for (const [name, value] of Object.entries(material)) {
        if (!(value instanceof Texture)) continue;
        let texture = textures.get(value);
        if (!texture) {
          texture = value.clone();
          textures.set(value, texture);
        }
        Object.assign(material, { [name]: texture });
      }
    }
  });
  copy.updateMatrixWorld(true);
  return copy;
}

export async function exportCharacter(root: Object3D): Promise<ArrayBuffer> {
  if (!root.children.length)
    throw new Error("Carga un personaje antes de exportar.");
  const copy = createExportClone(root);
  try {
    bakeOpaqueMaps(copy);
    bakeAlphaMaps(copy);
    const result = await new GLTFExporter().parseAsync(copy, {
      binary: true,
      onlyVisible: true,
      trs: true,
    });
    if (!(result instanceof ArrayBuffer))
      throw new Error("No se pudo crear el archivo GLB.");
    return result;
  } finally {
    disposeTemplate(copy);
  }
}
