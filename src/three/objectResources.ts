import { Material, Mesh, Object3D, SkinnedMesh, Texture } from "three";

export function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Instances own materials and cloned skeletons; the asset cache owns geometry and maps. */
export function disposeInstance(root: Object3D): void {
  const materials = new Set<Material>();
  const ownedMaps = new Set<Texture>();
  const skeletons = new Set<SkinnedMesh["skeleton"]>();
  root.traverse((object) => {
    if (object instanceof Mesh)
      materialsOf(object).forEach((material) => {materials.add(material);for(const value of Object.values(material))if(value instanceof Texture && value.userData.instanceOwned)ownedMaps.add(value);});
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
  });
  materials.forEach((material) => material.dispose());
  ownedMaps.forEach(texture=>texture.dispose());
  skeletons.forEach((skeleton) => skeleton.dispose());
  root.removeFromParent();
}

export function disposeTemplate(root: Object3D): void {
  const geometries = new Set<Mesh["geometry"]>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of materialsOf(object)) {
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
    }
  });
  disposeInstance(root);
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => {if(!texture.userData.instanceOwned)texture.dispose();});
}

export function cloneInstanceMaterials(root: Object3D): void {
  const clones = new Map<Material, Material>();
  const getClone = (material: Material) => {
    let result = clones.get(material);
    if (!result) {
      result = material.clone();
      clones.set(material, result);
    }
    return result;
  };
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(getClone)
      : getClone(object.material);
  });
}
