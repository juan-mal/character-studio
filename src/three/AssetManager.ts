import {
  Group,
  CanvasTexture,
  TextureSource,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
  TextureLoader,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type {
  AssetDefinition,
  MaterialDefinition,
  TextureRole,
  TextureVariant,
} from "../assets/types.ts";
import type {
  CharacterConfiguration,
  LoadProgress,
  StudioData,
} from "../types/studio.ts";
import {
  applyTextureRole,
  canTint,
  createNeutralMaterial,
  isColorRole,
} from "../materials/characterMaterials.ts";
import { InventoryResolver } from "./InventoryResolver.ts";
import { PromiseCache } from "./PromiseCache.ts";
import { compactObjMaterials } from "./compactObjMaterials.ts";
import {decodePng,type ImagePixels} from '../materials/pngPixels.ts';
import {adjustPixels,neutralAdjustment} from '../materials/textureAdjustments.ts';
import {
  cloneInstanceMaterials,
  disposeInstance,
  disposeTemplate,
  materialsOf,
} from "./objectResources.ts";

import { createAnimeMaterial, prepareAnimeGeometry } from "../materials/animeStyle.ts";

const LOAD_TIMEOUT = 45_000;
const usableVariant = (variant: TextureVariant) =>
  variant.confidence === "confirmed" && !variant.requiresVisualValidation;

export class AssetManager {
  private readonly data: StudioData;
  private readonly assets: Map<string, AssetDefinition>;
  private readonly resolver: InventoryResolver;
  private readonly models = new PromiseCache<Group>();
  private readonly fileBytes = new PromiseCache<ArrayBuffer>();
  private readonly pixelSources = new PromiseCache<ImagePixels>();
  private readonly textureSources = new PromiseCache<Texture>();
  private readonly textures = new PromiseCache<Texture>();
  private readonly manager = new LoadingManager();
  private readonly controllers = new Set<AbortController>();
  private readonly pendingTextureRejects = new Set<() => void>();
  private readonly pendingModelRejects = new Set<() => void>();
  private disposed = false;
  private readonly anisotropy: number;

  constructor(data: StudioData, onProgress?: (progress: LoadProgress) => void, anisotropy = 1) {
    this.anisotropy = Math.max(1, Math.min(8, anisotropy));
    this.data = data;
    this.assets = new Map(data.assets.map((asset) => [asset.id, asset]));
    this.resolver = new InventoryResolver([
      ...data.assets.map((asset) => asset.mesh),
      ...data.images,
      ...data.materials,
    ]);
    this.manager.onStart = (_url, loaded, total) => {
      if (!this.disposed) onProgress?.({ loaded, total, active: true });
    };
    this.manager.onProgress = (_url, loaded, total) => {
      if (!this.disposed)
        onProgress?.({ loaded, total, active: loaded < total });
    };
  }

  async preload(config: CharacterConfiguration): Promise<void> {
    const ids = new Set([
      ...Object.values(config.selections),
      ...config.accessories,
    ]);
    const results = await Promise.allSettled(
      [...ids]
        .filter((id): id is string => Boolean(id))
        .map(async (id) => {
          const instance = await this.instantiate(id, config);
          disposeInstance(instance);
        }),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }

  async instantiate(
    assetId: string,
    config: CharacterConfiguration,
  ): Promise<Object3D> {
    this.assertActive();
    const asset = this.assets.get(assetId);
    if (!asset)
      throw new Error("La pieza seleccionada no existe en el inventario.");
    const template = await this.models.get(asset.mesh.id, () =>
      this.track(`mesh:${asset.mesh.id}`, () => this.loadModel(asset)),
    );
    this.assertActive();
    const instance = clone(template);
    cloneInstanceMaterials(instance);
    instance.name = asset.name;
    instance.userData = { assetId: asset.id, sourceFileId: asset.mesh.id };
    try {
      const selectedId = config.textureVariants[asset.id];
      const variant = selectedId
        ? asset.textureVariants.find((value) => value.id === selectedId)
        : undefined;
      if (selectedId && (!variant || !usableVariant(variant)))
        throw new Error(`La textura de ${asset.name} no está confirmada.`);
      if (variant) await this.applyVariant(instance, asset, variant);
      await this.applyAdjustments(instance,asset,config);
      this.assertActive();
      const color = config.colors[asset.id] ?? config.colors[asset.category];
      const tint =
        canTint(asset.tintable, asset.category) &&
        color &&
        /^#[\da-f]{6}$/i.test(color);
      instance.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        if (tint)
          for (const material of materialsOf(object))
            if (material instanceof MeshStandardMaterial)
              material.color.set(color);
        const weights = config.morphs[asset.id];
        if (
          !weights ||
          !object.morphTargetDictionary ||
          !object.morphTargetInfluences
        )
          return;
        for (const [name, weight] of Object.entries(weights)) {
          const index = object.morphTargetDictionary[name];
          if (index !== undefined && Number.isFinite(weight))
            object.morphTargetInfluences[index] = Math.max(
              0,
              Math.min(1, weight),
            );
        }
      });
      if (asset.metadata.shading === 'anime-static') instance.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const converted: Material[] = [];
        const originals = materialsOf(object);
        try {
          for (const material of originals) converted.push(material instanceof MeshStandardMaterial ? createAnimeMaterial(material) : material);
        } catch (error) {
          converted.filter(material => !originals.includes(material)).forEach(material => material.dispose());
          throw error;
        }
        originals.filter(material => !converted.includes(material)).forEach(material => material.dispose());
        object.material = Array.isArray(object.material) ? converted : converted[0]!;
        object.receiveShadow = false;
      });
      return instance;
    } catch (error) {
      disposeInstance(instance);
      throw error;
    }
  }

  private async loadModel(asset: AssetDefinition): Promise<Group> {
    const extension = asset.mesh.extension.toLowerCase().replace(/^\./, "");
    if (asset.metadata.shading === 'anime-static' && extension !== 'obj')
      throw new Error('El perfil anime estático se prepara desde OBJ; conserva el material embebido de un GLB.');
    if (extension === "glb" || extension === "gltf") {
      const file = await this.fetchFile(asset.mesh.id);
      this.assertActive();
      return this.parseGltf(
        asset,
        extension === "glb" ? file : new TextDecoder().decode(file),
      );
    }
    if (extension !== "obj")
      throw new Error(`El formato ${extension} no está soportado.`);
    const text = new TextDecoder().decode(await this.fetchFile(asset.mesh.id));
    const loader = new OBJLoader();
    // MTL is parsed for its material bindings. Only catalog-confirmed variants may load maps.
    const libraries = await Promise.all(
      asset.mesh.geometry.materialLibraries.map(async (reference) => {
        const record = this.resolver.resolve(
          reference,
          asset.mesh.sourceId,
          asset.mesh.relativePath,
        );
        if (
          !record ||
          !this.data.materials.some((material) => material.id === record.id)
        )
          return "";
        return new TextDecoder().decode(await this.fetchFile(record.id));
      }),
    );
    const mtl = libraries
      .filter(Boolean)
      .join("\n")
      .split(/\r?\n/)
      .filter(
        (line) => !/^\s*(map_\S+|bump|disp|decal|refl|norm)\s/i.test(line),
      )
      .join("\n");
    if (mtl.trim()) loader.setMaterials(new MTLLoader().parse(mtl, ""));
    const root = loader.parse(compactObjMaterials(text));
    const oldMaterials = new Set<Material>();
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const neutral = (material: Material) => {
        oldMaterials.add(material);
        const result = createNeutralMaterial(
          material.name,
          asset.metadata.renderSide === "double",
        );
        if (mtl.trim()) {
          if (
            "color" in material &&
            material.color instanceof result.color.constructor
          )
            result.color.copy(material.color as typeof result.color);
          if (
            "emissive" in material &&
            material.emissive instanceof result.emissive.constructor
          )
            result.emissive.copy(material.emissive as typeof result.emissive);
          result.opacity = material.opacity;
          result.transparent = material.transparent;
          result.side =
            asset.metadata.renderSide === "double"
              ? result.side
              : material.side;
          if ("shininess" in material && typeof material.shininess === "number")
            result.roughness = Math.sqrt(2 / (material.shininess + 2));
        }
        return result;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(neutral)
        : neutral(object.material);
    });
    try {
      if (asset.metadata.shading === 'anime-static') root.traverse(object => {
        if (object instanceof Mesh) prepareAnimeGeometry(object.geometry, asset.category === 'face');
      });
    } catch (error) {
      disposeTemplate(root);
      throw error;
    } finally {
      oldMaterials.forEach((material) => material.dispose());
    }
    return root;
  }

  private parseGltf(
    asset: AssetDefinition,
    content: ArrayBuffer | string,
  ): Promise<Group> {
    return new Promise((resolve, reject) => {
      const dependencyManager = new LoadingManager();
      let settled = false;
      const finish = (root?: Group, error?: unknown) => {
        if (settled) {
          if (root) disposeTemplate(root);
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.pendingModelRejects.delete(cancel);
        if (error) {
          dependencyManager.abort();
          reject(error);
        } else if (root) resolve(root);
      };
      const cancel = () =>
        finish(
          undefined,
          new Error("La carga GLTF se canceló al cerrar el escenario."),
        );
      const timer = setTimeout(
        () =>
          finish(undefined, new Error("El GLTF tardó demasiado en responder.")),
        LOAD_TIMEOUT,
      );
      this.pendingModelRejects.add(cancel);
      dependencyManager.setURLModifier((url) => {
        if (url.startsWith("data:") || url.startsWith("blob:")) return url;
        const record = this.resolver.resolve(
          url,
          asset.mesh.sourceId,
          asset.mesh.relativePath,
        );
        if (!record)
          throw new Error("El GLTF contiene un recurso externo no registrado.");
        return this.resolver.url(record.id);
      });
      dependencyManager.onError = () =>
        finish(undefined, new Error("No se pudo cargar un recurso del GLTF."));
      void new GLTFLoader(dependencyManager).parseAsync(content, "").then(
        (gltf) => finish(gltf.scene),
        (error) => finish(undefined, error),
      );
    });
  }

  private async applyVariant(
    root: Object3D,
    asset: AssetDefinition,
    variant: TextureVariant,
  ): Promise<void> {
    const gltfCoordinates = /\.?gltf$|\.?glb$/i.test(asset.mesh.extension);
    const maps = new Map<string, Texture>();
    const requests = Object.entries(variant.maps).flatMap(([role, imageIds]) =>
      (imageIds ?? []).map(async (imageId) => {
        if (role === "other") return;
        const texture = await this.loadTexture(
          imageId,
          role as TextureRole,
          !gltfCoordinates,
        );
        maps.set(`${role}:${imageId}`, texture);
      }),
    );
    await Promise.all(requests);
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of materialsOf(object)) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        const definition = asset.materials.find(
          (value) => value.name === material.name,
        );
        for (const [role, imageIds] of Object.entries(variant.maps)) {
          const imageId =
            imageIds?.length === 1
              ? imageIds[0]
              : this.materialImage(
                  definition,
                  role as TextureRole,
                  imageIds ?? [],
                );
          if (!imageId) continue;
          const texture = maps.get(`${role}:${imageId}`);
          if (!texture) continue;
          if (role === "AO" && !object.geometry.getAttribute("uv")) continue;
          applyTextureRole(material, role as TextureRole, texture);
        }
      }
    });
  }

  private materialImage(
    definition: MaterialDefinition | undefined,
    role: TextureRole,
    options: string[],
  ): string | undefined {
    if (!definition) return undefined;
    const file = this.data.materials.find(
      (record) => record.id === definition.fileId,
    );
    if (!file) return undefined;
    const matched = definition.maps
      .filter((map) => map.role === role)
      .map(
        (map) =>
          this.resolver.resolve(map.path, file.sourceId, file.relativePath)?.id,
      )
      .filter((id) => id && options.includes(id));
    return matched.length === 1 ? matched[0] : undefined;
  }

  private loadTexture(
    imageId: string,
    role: TextureRole,
    flipY: boolean,
  ): Promise<Texture> {
    const image = this.data.images.find(
      (record) => record.id === imageId && record.usage === "texture",
    );
    if (!image)
      return Promise.reject(
        new Error("La textura no está registrada como recurso del personaje."),
      );
    const colorSpace = isColorRole(role) ? SRGBColorSpace : NoColorSpace;
    // Different outfits can reference identical files under different IDs.
    // Share their source/GPU texture by verified content, retaining sampling semantics.
    const contentKey = image.sha256 || imageId;
    return this.textures.get(`${contentKey}:${colorSpace}:${flipY}`, async () => {
      const source = await this.textureSources.get(contentKey, () =>
        this.track(`texture:${imageId}`, () => this.loadTextureSource(imageId)),
      );
      this.assertActive();
      const texture = source.clone();
      texture.anisotropy = this.anisotropy;
      texture.colorSpace = colorSpace;
      texture.flipY = flipY;
      texture.userData.imageId = imageId;
      texture.needsUpdate = true;
      return texture;
    });
  }

  private loadTextureSource(imageId: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let blobUrl: string | undefined;
      const finish = (error?: Error, loaded?: Texture) => {
        if (settled) {
          loaded?.dispose();
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.pendingTextureRejects.delete(cancel);
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        if (error) reject(error);
        else if (loaded) resolve(loaded);
      };
      const cancel = () =>
        finish(new Error("La carga de texturas se canceló."));
      const timer = setTimeout(
        () => finish(new Error("La textura tardó demasiado en responder.")),
        LOAD_TIMEOUT,
      );
      this.pendingTextureRejects.add(cancel);
      void this.fetchFile(imageId).then(bytes=>{
        if(settled)return;
        const url=URL.createObjectURL(new Blob([bytes]));blobUrl=url;
        new TextureLoader().load(url,texture=>{URL.revokeObjectURL(url);finish(undefined,texture);},undefined,()=>{URL.revokeObjectURL(url);finish(new Error('No se pudo cargar la textura.'));});
      },error=>finish(error instanceof Error?error:new Error('No se pudo cargar la textura.')));
    });
  }

  private async fetchFile(id: string): Promise<ArrayBuffer> {
    return this.fileBytes.get(id,()=>this.fetchFileUncached(id));
  }

  private async fetchFileUncached(id: string): Promise<ArrayBuffer> {
    this.assertActive();
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT);
    try {
      const response = await fetch(this.resolver.url(id), {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`El recurso no está disponible (${response.status}).`);
      return await response.arrayBuffer();
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
  }

  private async track<T>(key: string, load: () => Promise<T>): Promise<T> {
    this.manager.itemStart(key);
    try {
      return await load();
    } catch (error) {
      this.manager.itemError(key);
      throw error;
    } finally {
      this.manager.itemEnd(key);
    }
  }

  private assertActive(): void {
    if (this.disposed)
      throw new Error("La carga se canceló al cerrar el escenario.");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controllers.forEach((controller) => controller.abort());
    this.pendingTextureRejects.forEach((cancel) => cancel());
    this.pendingModelRejects.forEach((cancel) => cancel());
    this.models.clear(disposeTemplate);
    this.fileBytes.clear(()=>{});
    this.pixelSources.clear(()=>{});
    this.textures.clear((texture) => texture.dispose());
    this.textureSources.clear((texture) => texture.dispose());
  }

  private async applyAdjustments(root:Object3D,asset:AssetDefinition,config:CharacterConfiguration):Promise<void> {
    const edit=config.textureAdjustments?.[asset.id];
    const skin=config.skinTone && asset.metadata.skinReference ? {reference:asset.metadata.skinReference,target:config.skinTone,regions:asset.metadata.skinRegions} : undefined;
    if(!edit && !skin)return;
    const materials:{material:MeshStandardMaterial;mesh:Mesh}[]=[];
    root.traverse(object=>{if(object instanceof Mesh)for(const material of materialsOf(object))if(material instanceof MeshStandardMaterial && material.map)materials.push({material,mesh:object});});
    const edited=new Map<Texture,Texture>();
    for(const {material,mesh} of materials){
      const original=material.map!;
      if(edited.has(original)){material.map=edited.get(original)!;continue;}
      const imageId=original.userData.imageId as string | undefined;
      if(!imageId)throw new Error('La textura no dispone de datos editables.');
      const pixels=await this.pixelSources.get(imageId,async()=>decodePng(await this.fetchFile(imageId)));
      this.assertActive();
      const uv=mesh.geometry.getAttribute('uv');let total=0,count=0;
      if(edit?.color && uv)for(let i=0;i<uv.count;i+=Math.max(1,Math.floor(uv.count/2048))){
        const x=Math.min(pixels.width-1,Math.max(0,Math.floor(uv.getX(i)*pixels.width)));
        const y=Math.min(pixels.height-1,Math.max(0,Math.floor((1-uv.getY(i))*pixels.height)));
        const p=(y*pixels.width+x)*4,r=pixels.data[p]!,g=pixels.data[p+1]!,b=pixels.data[p+2]!;
        total+=(Math.max(r,g,b)+Math.min(r,g,b))/510;count++;
      }
      const adjusted=adjustPixels(pixels,edit??neutralAdjustment,skin,count?{lightness:total/count,preserveNeutral:asset.category==='eyes'}:undefined);
      if(!material.transparent && !material.alphaTest && !material.alphaMap)for(let i=3;i<adjusted.data.length;i+=4)adjusted.data[i]=255;
      const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;
      const context=canvas.getContext('2d');if(!context)throw new Error('No se pudo preparar el ajuste de color.');
      context.putImageData(new ImageData(new Uint8ClampedArray(adjusted.data),pixels.width,pixels.height),0,0);
      const texture:Texture=new CanvasTexture(canvas);texture.copy(original);texture.source=new TextureSource(canvas);
      texture.userData={...original.userData,instanceOwned:true};texture.needsUpdate=true;
      edited.set(original,texture);material.map=texture;
    }
  }
}
