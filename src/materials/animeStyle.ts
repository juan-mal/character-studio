import {
  Float32BufferAttribute,
  MathUtils,
  MeshBasicMaterial,
  Vector3,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three';

/** A portable, fixed character-light rig. Linear vertex colors survive GLB as COLOR_0.
 * Lighting is deliberately independent of the editor lights, like a painted anime asset.
 * This profile is only enabled for reviewed static meshes, never inferred from filenames. */
const keyDirection = new Vector3(-0.45, 0.65, 1).normalize();
const bodyShadow = [0.63, 0.59, 0.69] as const;
const faceShadow = [0.86, 0.79, 0.81] as const;

export function prepareAnimeGeometry(geometry: BufferGeometry, face: boolean): void {
  if (geometry.userData.animeLighting === 1) return;
  const normals = geometry.getAttribute('normal');
  if (!normals) throw new Error('El acabado anime requiere normales.');
  if (geometry.morphAttributes.position?.length || geometry.getAttribute('skinIndex'))
    throw new Error('El acabado anime estático no debe aplicarse a una malla animable.');
  const source = geometry.getAttribute('color');
  const colors = new Float32Array(normals.count * 3);
  const normal = new Vector3();
  const shadow = face ? faceShadow : bodyShadow;
  for (let i = 0; i < normals.count; i++) {
    normal.fromBufferAttribute(normals, i).normalize();
    // The face's painted eyes/nose should not acquire physically based dark sockets.
    const lit = MathUtils.smoothstep(normal.dot(keyDirection), -0.12, 0.22);
    for (let channel = 0; channel < 3; channel++) {
      const original = source ? source.getComponent(i, channel) : 1;
      colors[i * 3 + channel] = original * MathUtils.lerp(shadow[channel]!, 1, lit);
    }
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.userData.animeLighting = 1;
}

export function createAnimeMaterial(source: MeshStandardMaterial): MeshBasicMaterial {
  if (source.normalMap || source.roughnessMap || source.metalnessMap || source.aoMap || source.emissiveMap || source.emissive.getHex() !== 0)
    throw new Error('Este acabado anime necesita una revisión específica de los mapas PBR o emisivos.');
  const material = new MeshBasicMaterial({
    name: source.name,
    color: source.color.clone(),
    map: source.map,
    alphaMap: source.alphaMap,
    opacity: source.opacity,
    transparent: source.transparent,
    alphaTest: source.alphaTest,
    side: source.side,
    depthWrite: source.depthWrite,
    depthTest: source.depthTest,
    vertexColors: true,
    toneMapped: false,
    wireframe: source.wireframe,
  });
  material.userData = { ...source.userData, characterStudioStyle: 'anime-static-v1' };
  return material;
}
