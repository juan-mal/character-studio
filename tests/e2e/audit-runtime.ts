import {
  Box3,
  Color,
  FrontSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AssetManager } from "../../src/three/AssetManager.ts";
import { CharacterAssembler } from "../../src/three/CharacterAssembler.ts";
import { CatalogResolver } from "../../src/compatibility/resolver.ts";
import {
  disposeInstance,
  disposeTemplate,
} from "../../src/three/objectResources.ts";
import { exportCharacter } from "../../src/export/exportCharacter.ts";
import { fitCamera } from "../../src/three/cameraFit.ts";
import type {
  CharacterConfiguration,
  StudioData,
} from "../../src/types/studio.ts";

function describe(root: Group) {
  const meshes: {
    asset: string;
    vertices: number;
    triangles: number;
    bounds: number[];
    maps: number;
    color: string;
    opacity: number;
    transparent: boolean;
    side: number;
    unlit: boolean;
    colorVertices: number;
  }[] = [];
  let forbidden = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (
      object.type.includes("Camera") ||
      object.type.includes("Light") ||
      !object.visible
    )
      forbidden++;
    if (!(object instanceof Mesh)) return;
    const material = (Array.isArray(object.material) ? object.material[0] : object.material) as MeshStandardMaterial;
    const box = new Box3().setFromObject(object);
    let parent = object.parent;
    while (parent && !parent.userData.assetId) parent = parent.parent;
    meshes.push({
      asset: String(parent?.userData.assetId ?? ""),
      vertices: object.geometry.getAttribute("position").count,
      triangles:
        (object.geometry.index?.count ??
          object.geometry.getAttribute("position").count) / 3,
      bounds: [...box.min.toArray(), ...box.max.toArray()],
      maps: material.map ? 1 : 0,
      color: material.color.getHexString(),
      opacity: material.opacity,
      transparent: material.transparent,
      side: material.side,
      unlit: material instanceof MeshBasicMaterial,
      colorVertices: object.geometry.getAttribute('color')?.count ?? 0,
    });
  });
  return { meshes, forbidden };
}

export async function auditRuntime(
  configuration: CharacterConfiguration,
  downloadedGlb: string,
) {
  const data = (await (await fetch("/studio-data.json")).json()) as StudioData;
  const resolver = new CatalogResolver(data);
  const manager = new AssetManager(data);
  const assembler = new CharacterAssembler((id, config) =>
    manager.instantiate(id, config),
  );
  const renderer = new WebGLRenderer({
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(320, 480);
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color("#f7f7f5");
  scene.add(new HemisphereLight(0xffffff, 0x888888, 3), assembler.root);
  const camera = new PerspectiveCamera(35, 320 / 480, 0.001, 1000);
  const draw = () => {
    renderer.render(scene, camera);
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(renderer.domElement, 0, 0);
    return ctx.getImageData(0, 0, 320, 480).data;
  };
  const memory = () => ({
    ...renderer.info.memory,
    programs: renderer.info.programs?.length ?? 0,
  });
  try {
    // Three r186 initializes an internal DFG LUT on the first PBR draw.
    // Prime that renderer-owned resource before establishing the disposal baseline.
    const probe = new Mesh(new PlaneGeometry(), new MeshStandardMaterial());
    probe.position.z = -2;
    scene.add(probe);
    draw();
    scene.remove(probe);
    probe.geometry.dispose();
    probe.material.dispose();
    draw();
    const baselineMemory = memory();
    await assembler.setConfiguration(configuration);
    fitCamera(
      camera,
      new Box3().setFromObject(assembler.root),
      new Vector3(0.12, 0.025, 1),
    );
    const original = describe(assembler.root);
    const originalPixels = draw();
    const originalImage = renderer.domElement.toDataURL();
    const sideReview: { asset: string; changedChannels: number }[] = [];
    for (const preset of resolver.supportedPresets) {
      await assembler.setConfiguration(resolver.fromPreset(preset.id));
      for (const slot of assembler.root.children) {
        let changedChannels = 0;
        for (const direction of [
          new Vector3(0, 0, 1),
          new Vector3(1, -0.25, 0.5),
          new Vector3(0, 0, -1),
        ]) {
          fitCamera(
            camera,
            new Box3().setFromObject(assembler.root),
            direction,
          );
          const before = draw();
          const saved: {
            material: MeshStandardMaterial;
            side: MeshStandardMaterial["side"];
          }[] = [];
          slot.traverse((object) => {
            if (object instanceof Mesh) {
              for (const material of (Array.isArray(object.material) ? object.material : [object.material]) as MeshStandardMaterial[]) {
                saved.push({ material, side: material.side });
                material.side = FrontSide;
                material.needsUpdate = true;
              }
            }
          });
          const after = draw();
          before.forEach((value, index) => {
            if (Math.abs(value - after[index]!) > 5) changedChannels++;
          });
          saved.forEach(({ material, side }) => {
            material.side = side;
            material.needsUpdate = true;
          });
        }
        sideReview.push({
          asset: String(slot.userData.assetId),
          changedChannels,
        });
      }
    }
    await assembler.setConfiguration(configuration);
    fitCamera(
      camera,
      new Box3().setFromObject(assembler.root),
      new Vector3(0.12, 0.025, 1),
    );
    const buffer = Uint8Array.from(atob(downloadedGlb), (character) =>
      character.charCodeAt(0),
    ).buffer;
    const roundtrip = await new GLTFLoader().parseAsync(buffer, "");
    const exported = describe(roundtrip.scene);
    scene.remove(assembler.root);
    scene.add(roundtrip.scene);
    const exportedPixels = draw();
    let difference = 0;
    let maxPixelDifference = 0;
    const regions = new Float64Array(20 * 30);
    for (let i = 0; i < originalPixels.length; i++) {
      const delta = Math.abs(originalPixels[i]! - exportedPixels[i]!);
      difference += delta;
      maxPixelDifference = Math.max(maxPixelDifference, delta);
      const pixel = Math.floor(i / 4);
      const region = Math.floor((pixel % 320) / 16) + Math.floor(Math.floor(pixel / 320) / 16) * 20;
      regions[region] = regions[region]! + delta / (16 * 16 * 4);
    }
    const roundtripImage = renderer.domElement.toDataURL();
    scene.remove(roundtrip.scene);
    disposeTemplate(roundtrip.scene);
    scene.add(assembler.root);
    // Explicit tint evidence is synthetic in this test only; production catalog remains unchanged.
    const hair = resolver.asset(configuration.selections.hair!)!;
    const colorConfig = {
      ...configuration,
      colors: { ...configuration.colors, [hair.id]: "#123456" },
    };
    const untinted = await manager.instantiate(hair.id, colorConfig);
    const oldTint = hair.tintable;
    hair.tintable = true;
    const tinted = await manager.instantiate(hair.id, colorConfig);
    hair.tintable = oldTint;
    const firstMesh = (root: Group | import("three").Object3D): Mesh => {
      let result: Mesh | undefined;
      root.traverse((object) => {
        if (object instanceof Mesh) result ??= object;
      });
      return result!;
    };
    const first = firstMesh(untinted),
      second = firstMesh(tinted);
    const materialA = first.material as MeshStandardMaterial,
      materialB = second.material as MeshStandardMaterial;
    const alternate = resolver.textureOptions(hair.id, configuration)[1]!;
    const designed = await manager.instantiate(hair.id, {
      ...configuration,
      textureVariants: {
        ...configuration.textureVariants,
        [hair.id]: alternate.id,
      },
    });
    const third = firstMesh(designed);
    const tintRoot = new Group();
    tintRoot.add(tinted);
    const tintGlb = await new GLTFLoader().parseAsync(
      await exportCharacter(tintRoot),
      "",
    );
    const tintMaterial = firstMesh(tintGlb.scene)
      .material as MeshStandardMaterial;
    const materialIsolation = {
      unconfirmedTintIgnored: materialA.color.getHexString() === "ffffff",
      confirmedTint: materialB.color.getHexString(),
      exportedTint: tintMaterial.color.getHexString(),
      materialCloned: materialA !== materialB,
      mapPreserved: materialA.map === materialB.map && !!tintMaterial.map,
      geometryPreserved:
        first.geometry === second.geometry && first.geometry === third.geometry,
      designChanged:
        (third.material as MeshStandardMaterial).map !== materialA.map,
      uvPreserved:
        first.geometry.getAttribute("uv") === third.geometry.getAttribute("uv"),
    };
    disposeTemplate(tintGlb.scene);
    disposeInstance(untinted);
    disposeInstance(tintRoot);
    disposeInstance(designed);
    const variantChecks: {preset: string; meanPixelDifference: number}[] = [];
    for (const preset of resolver.supportedPresets) {
      const base = resolver.fromPreset(preset.id);
      const hairId = base.selections.hair!;
      const configurations = [base, ...resolver.textureOptions(hairId,base).slice(1).map(variant=>({...base,textureVariants:{...base.textureVariants,[hairId]:variant.id}}))];
      for (const selected of configurations) {
        await assembler.setConfiguration(selected);
        fitCamera(camera,new Box3().setFromObject(assembler.root),new Vector3(0.12,0.025,1));
        const before = draw();
        const loaded = await new GLTFLoader().parseAsync(await exportCharacter(assembler.root),'');
        scene.remove(assembler.root);scene.add(loaded.scene);
        const after = draw();
        let delta=0;before.forEach((value,index)=>{delta+=Math.abs(value-after[index]!);});
        variantChecks.push({preset:preset.id,meanPixelDifference:delta/before.length});
        scene.remove(loaded.scene);disposeTemplate(loaded.scene);scene.add(assembler.root);
      }
    }
    const warmup = async () => {
      for (const preset of resolver.supportedPresets) {
        await assembler.setConfiguration(resolver.fromPreset(preset.id));
        draw();
      }
    };
    await warmup();
    const warmMemory = memory();
    const started = performance.now();
    for (let cycle = 0; cycle < 12; cycle++) await warmup();
    const stressMemory = memory();
    const elapsed = performance.now() - started;
    const instances = describe(assembler.root).meshes.length;
    assembler.dispose();
    manager.dispose();
    // Cache cleanup awaits fulfilled/in-flight promises; measure after those disposers run.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    renderer.render(scene, camera);
    return {
      original,
      exported,
      materialIsolation,
      variantChecks,
      meanPixelDifference: difference / originalPixels.length,
      maxPixelDifference,
      maxRegionDifference: Math.max(...regions),
      roundtripImage,
      originalImage,
      sideReview,
      baselineMemory,
      warmMemory,
      stressMemory,
      disposedMemory: memory(),
      instances,
      elapsed,
      swaps: resolver.supportedPresets.length * 12,
    };
  } finally {
    assembler.dispose();
    manager.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
