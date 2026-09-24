import type {
  AssetDefinition,
  Category,
  ImageRecord,
  Preset,
  TextureVariant,
} from "../assets/types.ts";
import { cloneConfiguration } from "../character/configuration.ts";
import {validAdjustment} from '../materials/textureAdjustments.ts';
import {
  slots,
  type CharacterConfiguration,
  type CharacterSlot,
  type StudioData,
  type ValidationResult,
} from "../types/studio.ts";

const ACCESSORY_CATEGORIES: ReadonlySet<Category> = new Set([
  "arm accessories",
  "leg accessories",
  "ear accessories",
  "other accessories",
]);
const RECORD_LIMIT = 128;
const ACCESSORY_LIMIT = 64;
const ID_LIMIT = 160;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= ID_LIMIT &&
    value !== "__proto__" &&
    value !== "prototype" &&
    value !== "constructor"
  );
}

function slotFor(asset: AssetDefinition): CharacterSlot | undefined {
  if (asset.category === "feet/shoes") return "shoes";
  if (asset.category === "hands") {
    if (/(?:HandL|LeftHand|Hand_Left)(?:\d|_|$)/i.test(asset.name))
      return "leftHand";
    if (/(?:HandR|RightHand|Hand_Right)(?:\d|_|$)/i.test(asset.name))
      return "rightHand";
    return undefined;
  }
  return slots.find((slot) => slot === asset.category);
}

function emptyConfiguration(preset: Preset): CharacterConfiguration {
  return {
    version: 1,
    presetId: preset.id,
    archetype: preset.archetype,
    selections: {},
    accessories: [],
    textureVariants: {},
    colors: {},
    morphs: {},
  };
}

export class CatalogResolver {
  public readonly data: StudioData;
  private readonly assetsById: Map<string, AssetDefinition>;
  private readonly imagesById: Map<string, ImageRecord>;
  private readonly supportedEdges = new Map<string, Set<string>>();
  private readonly incompatibleEdges = new Map<string, Set<string>>();
  private readonly presets: Preset[];

  constructor(data: StudioData) {
    this.data = data;
    this.assetsById = new Map(data.assets.map((asset) => [asset.id, asset]));
    this.imagesById = new Map(data.images.map((image) => [image.id, image]));
    for (const relation of data.compatibility.pieceRelations) {
      const edges =
        relation.status === "incompatible"
          ? this.incompatibleEdges
          : relation.status === "supported" &&
              relation.confidence === "confirmed"
            ? this.supportedEdges
            : undefined;
      if (!edges) continue;
      for (const [a, b] of [
        [relation.a, relation.b],
        [relation.b, relation.a],
      ] as const) {
        const adjacent = edges.get(a) ?? new Set<string>();
        adjacent.add(b);
        edges.set(a, adjacent);
      }
    }
    this.presets = data.presets.filter((preset) => {
      if (
        preset.status !== "geometry-supported" ||
        preset.missingParts.length ||
        !preset.bodyAssetIds.length
      )
        return false;
      if (
        !preset.bodyAssetIds.every(
          (id) =>
            this.usable(this.asset(id)) && this.asset(id)?.category === "body",
        )
      )
        return false;
      if (
        !preset.hairAssetIds.every(
          (id) =>
            this.usable(this.asset(id)) && this.asset(id)?.category === "hair",
        )
      )
        return false;
      return preset.bodyAssetIds.some((body) =>
        this.presetSupportsBody(preset, body),
      );
    });
  }

  get supportedPresets(): Preset[] {
    return [...this.presets];
  }

  asset(id: string): AssetDefinition | undefined {
    return this.assetsById.get(id);
  }

  defaultConfiguration(): CharacterConfiguration {
    const preset = [...this.presets].sort((a, b) => {
      const score = (candidate: Preset): number => {
        const config = this.fromPreset(candidate.id);
        return Object.keys(config.textureVariants).length / Math.max(1, Object.keys(config.selections).length);
      };
      return score(b) - score(a);
    })[0];
    if (!preset)
      throw new Error(
        "El catálogo no contiene un preset con geometría compatible confirmada.",
      );
    return this.fromPreset(preset.id);
  }

  fromPreset(id: string): CharacterConfiguration {
    const preset = this.presets.find((candidate) => candidate.id === id);
    if (!preset)
      throw new Error(
        "El preset solicitado no tiene compatibilidad confirmada.",
      );
    const result = emptyConfiguration(preset);
    const body = preset.bodyAssetIds.find((bodyId) =>
      this.presetSupportsBody(preset, bodyId),
    );
    if (body) result.selections.body = body;
    const hair = preset.hairAssetIds[0];
    if (hair) result.selections.hair = hair;
    for (const slot of ["face", "eyes", "brows"] as const) {
      const available = this.options(slot, result).find(asset=>preset.sourceMeshIds.includes(asset.mesh.id)) ?? this.options(slot, result)[0];
      if (available) result.selections[slot] = available.id;
    }
    for (const selected of this.selectedAssets(result)) {
      const texture = this.textureOptions(selected.id, result)[0];
      if (texture) result.textureVariants[selected.id] = texture.id;
    }
    return result;
  }

  options(
    slot: CharacterSlot,
    configuration: CharacterConfiguration,
  ): AssetDefinition[] {
    if (slot === "body") {
      const ids = new Set(
        this.presets.flatMap((preset) =>
          preset.bodyAssetIds.filter((id) =>
            this.presetSupportsBody(preset, id),
          ),
        ),
      );
      return this.data.assets.filter(
        (asset) => ids.has(asset.id) && this.usable(asset),
      );
    }
    const context = cloneConfiguration(configuration);
    delete context.selections[slot];
    const anchors = this.anchoredAssets(context);
    return this.data.assets.filter(
      (asset) => slotFor(asset) === slot && this.isCompatible(asset, anchors) && (!asset.metadata.calibration || !['face','hair','eyes','brows'].includes(slot) || anchors.every(anchor=>this.connected(asset.id,anchor.id))),
    );
  }

  accessoryOptions(configuration: CharacterConfiguration): AssetDefinition[] {
    const anchors = this.anchoredAssets(configuration);
    return this.data.assets.filter(
      (asset) =>
        ACCESSORY_CATEGORIES.has(asset.category) &&
        this.isCompatible(
          asset,
          anchors.filter((anchor) => anchor.id !== asset.id),
        ),
    );
  }

  textureOptions(
    assetId: string,
    configuration: CharacterConfiguration,
  ): TextureVariant[] {
    const asset = this.asset(assetId);
    if (
      !asset ||
      !this.selectedAssets(configuration).some(
        (selected) => selected.id === assetId,
      )
    )
      return [];
    return asset.textureVariants.filter((variant) => {
      const maps = Object.values(variant.maps).flat();
      return (
        variant.confidence === "confirmed" &&
        !variant.requiresVisualValidation &&
        maps.length > 0 &&
        maps.every((id) => {
          const image = this.imagesById.get(id);
          return (
            image?.usage === "texture" &&
            (!image.archetype ||
              !configuration.archetype ||
              image.archetype === configuration.archetype)
          );
        })
      );
    });
  }

  canTint(assetId: string): boolean {
    const asset = this.asset(assetId);
    if (!asset || !this.usable(asset)) return false;
    if (typeof asset.tintable === "boolean") return asset.tintable;
    if (asset.category === "hair") return asset.tintable.hair === true;
    if (asset.category === "eyes") return asset.tintable.eyes === true;
    if (["top", "bottom", "feet/shoes"].includes(asset.category))
      return asset.tintable.clothing === true;
    return false;
  }

  selectedAssets(configuration: CharacterConfiguration): AssetDefinition[] {
    const ids = new Set([
      ...slots.flatMap((slot) => configuration.selections[slot] ?? []),
      ...configuration.accessories,
    ]);
    return [...ids].flatMap((id) => {
      const asset = this.asset(id);
      return asset && this.usable(asset) ? [asset] : [];
    });
  }

  select(
    configuration: CharacterConfiguration,
    slot: CharacterSlot,
    assetId: string | null,
  ): ValidationResult {
    const base = this.normalize(configuration);
    if (assetId === null) {
      if (slot === "body")
        return {
          ...base,
          warnings: [
            ...base.warnings,
            "El personaje necesita un cuerpo compatible.",
          ],
        };
      delete base.configuration.selections[slot];
    } else {
      if (
        !this.options(slot, base.configuration).some(
          (asset) => asset.id === assetId,
        )
      ) {
        return {
          ...base,
          warnings: [
            ...base.warnings,
            "La pieza solicitada no es compatible con la selección actual.",
          ],
        };
      }
      if (base.configuration.selections[slot] === assetId) return base;
      base.configuration.selections[slot] = assetId;
      if (slot === "body") {
        const preset = this.presets.find((candidate) =>
          this.presetSupportsBody(candidate, assetId),
        );
        if (preset) base.configuration.presetId = preset.id;
      }
    }
    const result = this.normalize(base.configuration);
    return {
      configuration: result.configuration,
      warnings: [...base.warnings, ...result.warnings],
    };
  }

  normalize(input: unknown): ValidationResult {
    const source = this.validateShape(input);
    const warnings: string[] = [];
    const requested = source.selections as Record<string, string>;
    const requestedPreset = this.presets.find(
      (preset) => preset.id === source.presetId,
    );
    const bodyPreset = this.presets.find((preset) =>
      this.presetSupportsBody(preset, requested.body ?? ""),
    );
    const preset =
      bodyPreset &&
      (!requestedPreset ||
        !this.presetSupportsBody(requestedPreset, requested.body ?? ""))
        ? bodyPreset
        : (requestedPreset ?? this.presets[0]);
    if (!preset)
      throw new Error(
        "El catálogo no contiene un preset compatible para recuperar esta configuración.",
      );
    if (source.presetId !== preset.id)
      warnings.push(
        "Se recuperó un preset compatible disponible en el catálogo.",
      );
    const fallback = this.fromPreset(preset.id);
    const result = emptyConfiguration(preset);
    result.selections.body = bodyPreset
      ? requested.body
      : fallback.selections.body;
    if (result.selections.body !== requested.body)
      warnings.push(
        "El cuerpo ausente o incompatible se sustituyó por el cuerpo del preset.",
      );
    for (const slot of slots) {
      if (slot === "body" || requested[slot] === undefined) continue;
      const id = requested[slot]!;
      const options = this.options(slot, result);
      const original = this.asset(id);
      const next =
        options.find((asset) => asset.id === id) ??
        options.find((asset) =>
          original?.variants.relatedAssetIds.includes(asset.id),
        ) ??
        options.find((asset) => asset.id === fallback.selections[slot]) ??
        options[0];
      if (next) result.selections[slot] = next.id;
      if (next?.id !== id)
        warnings.push(
          `Se ${next ? "sustituyó" : "retiró"} una pieza ausente o incompatible de ${slot}.`,
        );
    }
    for (const id of source.accessories as string[]) {
      if (result.accessories.includes(id)) continue;
      if (this.accessoryOptions(result).some((asset) => asset.id === id))
        result.accessories.push(id);
      else
        warnings.push("Se retiró un accesorio sin compatibilidad confirmada.");
    }
    for(const slot of ['eyes','brows'] as const) {
      if(!result.selections[slot] && fallback.selections[slot]) {
        const option=this.options(slot,result).find(asset=>asset.id===fallback.selections[slot]) ?? this.options(slot,result)[0];
        if(option)result.selections[slot]=option.id;
      }
    }
    const selectedIds = new Set(
      this.selectedAssets(result).map((asset) => asset.id),
    );
    for (const [assetId, textureId] of Object.entries(
      source.textureVariants as Record<string, string>,
    )) {
      if (
        selectedIds.has(assetId) &&
        this.textureOptions(assetId, result).some(
          (variant) => variant.id === textureId,
        )
      )
        result.textureVariants[assetId] = textureId;
      else
        warnings.push(
          "Se retiró una textura ausente o pendiente de validación visual.",
        );
    }
    for (const assetId of selectedIds) {
      if (result.textureVariants[assetId] !== undefined) continue;
      const texture = this.textureOptions(assetId, result)[0];
      if (texture) result.textureVariants[assetId] = texture.id;
    }
    for (const [assetId, color] of Object.entries(
      source.colors as Record<string, string>,
    )) {
      if (
        selectedIds.has(assetId) &&
        this.canTint(assetId) &&
        /^#[0-9a-f]{6}$/i.test(color)
      )
        result.colors[assetId] = color.toLowerCase();
      else
        warnings.push(
          "Se retiró un color no válido o aplicado a un material sin tintado confirmado.",
        );
    }
    for (const [assetId, targets] of Object.entries(
      source.morphs as Record<string, Record<string, number>>,
    )) {
      for (const [targetId, weight] of Object.entries(targets)) {
        const asset = this.asset(assetId);
        const prepared =
          asset &&
          /^(?:\.)?gl(?:b|tf)$/i.test(asset.mesh.extension) &&
          asset.metadata.preparedMorphTargets?.includes(targetId);
        if (
          selectedIds.has(assetId) &&
          prepared &&
          Number.isFinite(weight) &&
          weight >= 0 &&
          weight <= 1
        ) {
          result.morphs[assetId] ??= {};
          result.morphs[assetId][targetId] = weight;
        } else
          warnings.push(
            "Se retiró una deformación sin correspondencia exacta confirmada.",
          );
      }
    }
    if(source.textureAdjustments && record(source.textureAdjustments)) {
      for(const [id,edit] of Object.entries(source.textureAdjustments))if(selectedIds.has(id) && validAdjustment(edit)) {
        result.textureAdjustments ??= {};
        result.textureAdjustments[id]={hue:edit.hue,saturation:edit.saturation,lightness:edit.lightness,...(edit.color?{color:edit.color}: {})};
      }
    }
    if(typeof source.skinTone==='string' && this.asset(result.selections.body??'')?.metadata.skinReference) result.skinTone=source.skinTone;
    return { configuration: result, warnings };
  }

  private usable(asset: AssetDefinition | undefined): asset is AssetDefinition {
    return (
      asset !== undefined &&
      asset.metadata.mainApplication &&
      asset.metadata.status !== "excluded" &&
      !asset.mesh.excluded &&
      asset.mesh.geometry.valid
    );
  }

  private connected(a: string, b: string): boolean {
    return this.supportedEdges.get(a)?.has(b) === true;
  }
  private conflicts(a: string, b: string): boolean {
    return this.incompatibleEdges.get(a)?.has(b) === true;
  }

  private presetSupportsBody(preset: Preset, bodyId: string): boolean {
    return (
      preset.bodyAssetIds.includes(bodyId) &&
      preset.hairAssetIds.every(
        (hair) => this.connected(bodyId, hair) && !this.conflicts(bodyId, hair),
      )
    );
  }

  private isCompatible(
    asset: AssetDefinition,
    anchors: AssetDefinition[],
  ): boolean {
    return (
      this.usable(asset) &&
      anchors.some((anchor) => this.connected(asset.id, anchor.id)) &&
      anchors.every((anchor) => !this.conflicts(asset.id, anchor.id))
    );
  }

  private anchoredAssets(
    configuration: CharacterConfiguration,
  ): AssetDefinition[] {
    const selected = this.selectedAssets(configuration);
    const body = selected.find(
      (asset) =>
        asset.id === configuration.selections.body &&
        this.presets.some((preset) =>
          this.presetSupportsBody(preset, asset.id),
        ),
    );
    if (!body) return [];
    const anchors = [body];
    for (let changed = true; changed; ) {
      changed = false;
      for (const asset of selected) {
        if (!anchors.includes(asset) && this.isCompatible(asset, anchors)) {
          anchors.push(asset);
          changed = true;
        }
      }
    }
    return anchors;
  }

  private validateShape(
    input: unknown,
  ): Record<string, unknown> & { selections: Record<string, unknown> } {
    if (!record(input) || input.version !== 1 || !record(input.selections))
      throw new Error(
        "Configuración no válida: se requiere version 1 y un objeto selections.",
      );
    if (Object.keys(input.selections).length > RECORD_LIMIT)
      throw new Error("La configuración contiene demasiadas selecciones.");
    for (const slot of slots) {
      if (
        input.selections[slot] !== undefined &&
        !validId(input.selections[slot])
      )
        throw new Error(`Selección no válida en ${slot}.`);
    }
    if (input.presetId !== undefined && !validId(input.presetId))
      throw new Error("El identificador del preset no es válido.");
    if (
      input.archetype !== undefined &&
      input.archetype !== null &&
      !validId(input.archetype)
    )
      throw new Error("El arquetipo no es válido.");
    const accessories: unknown =
      input.accessories === undefined ? [] : input.accessories;
    if (
      !Array.isArray(accessories) ||
      accessories.length > ACCESSORY_LIMIT ||
      !accessories.every(validId)
    )
      throw new Error(
        "La lista de accesorios no es válida o supera el límite.",
      );
    const result = { ...input, selections: input.selections, accessories };
    if(input.skinTone!==undefined && (typeof input.skinTone!=='string' || !/^#[\da-f]{6}$/i.test(input.skinTone)))throw new Error('El color de piel no es válido.');
    if(input.textureAdjustments!==undefined && (!record(input.textureAdjustments) || Object.keys(input.textureAdjustments).length>RECORD_LIMIT || !Object.entries(input.textureAdjustments).every(([id,edit])=>validId(id)&&validAdjustment(edit))))throw new Error('Los ajustes de textura no son válidos.');
    for (const field of ["textureVariants", "colors", "morphs"] as const) {
      const values: unknown = input[field] === undefined ? {} : input[field];
      if (!record(values) || Object.keys(values).length > RECORD_LIMIT)
        throw new Error(`El campo ${field} no es válido o supera el límite.`);
      for (const [id, value] of Object.entries(values)) {
        if (!validId(id))
          throw new Error(
            `El campo ${field} contiene un identificador no válido.`,
          );
        if (field === "morphs") {
          if (
            !record(value) ||
            Object.keys(value).length > RECORD_LIMIT ||
            !Object.entries(value).every(
              ([target, weight]) =>
                validId(target) && typeof weight === "number",
            )
          )
            throw new Error(
              "Las deformaciones no tienen una estructura válida.",
            );
        } else if (typeof value !== "string" || value.length > ID_LIMIT)
          throw new Error(`El campo ${field} contiene un valor no válido.`);
      }
      Object.assign(result, { [field]: values });
    }
    return result;
  }
}
