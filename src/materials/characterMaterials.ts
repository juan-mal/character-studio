import {
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
  type Texture,
} from "three";
import type { TextureRole } from "../assets/types.ts";

export function createNeutralMaterial(
  name = "",
  doubleSided = false,
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name,
    color: "#c6c3bc",
    roughness: 0.68,
    metalness: 0,
    side: doubleSided ? DoubleSide : FrontSide,
  });
}

export function canTint(evidence: unknown, category?: string): boolean {
  if (evidence === true) return true;
  if (!evidence || typeof evidence !== "object" || !category) return false;
  const key = ["top", "bottom", "feet/shoes"].includes(category)
    ? "clothing"
    : category;
  return (evidence as Record<string, unknown>)[key] === true;
}

export function isColorRole(role: TextureRole): boolean {
  return (
    role === "baseColor" ||
    role === "diffuse" ||
    role === "albedo" ||
    role === "emissive"
  );
}

/** Texture coordinates are not inverted here: OBJ maps retain TextureLoader's flipY=true. */
export function applyTextureRole(
  material: MeshStandardMaterial,
  role: TextureRole,
  texture: Texture,
): void {
  texture.colorSpace = isColorRole(role) ? SRGBColorSpace : NoColorSpace;
  switch (role) {
    case "baseColor":
    case "diffuse":
    case "albedo":
      material.map = texture;
      material.color.set("#ffffff");
      break;
    case "normal":
      material.normalMap = texture;
      break;
    case "roughness":
      material.roughnessMap = texture;
      material.roughness = 1;
      break;
    case "metallic":
      material.metalnessMap = texture;
      material.metalness = 1;
      break;
    case "AO":
      material.aoMap = texture;
      break;
    case "emissive":
      material.emissiveMap = texture;
      material.emissive.set("#ffffff");
      break;
    case "opacity":
      material.alphaMap = texture;
      material.transparent = true;
      material.depthWrite = false;
      break;
    case "mask":
      material.alphaMap = texture;
      material.alphaTest = 0.5;
      break;
    case "other":
      return;
  }
  material.needsUpdate = true;
}
