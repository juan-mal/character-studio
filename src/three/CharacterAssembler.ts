import { Group, type Object3D } from "three";
import type { CharacterConfiguration } from "../types/studio.ts";
import { disposeInstance } from "./objectResources.ts";

type Instantiate = (
  assetId: string,
  config: CharacterConfiguration,
) => Promise<Object3D>;

/** A prepared selection replaces the visible assembly only when every piece is ready. */
export class CharacterAssembler {
  readonly root = new Group();
  private revision = 0;
  private disposed = false;
  private readonly instantiate: Instantiate;

  constructor(instantiate: Instantiate) {
    this.instantiate = instantiate;
    this.root.name = "CharacterRoot";
  }

  async setConfiguration(config: CharacterConfiguration): Promise<boolean> {
    if (this.disposed) throw new Error("El escenario ya se cerró.");
    const revision = ++this.revision;
    const entries = Object.entries(config.selections).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    );
    entries.push(
      ...config.accessories.map((id, index): [string, string] => [
        `accessory-${index + 1}`,
        id,
      ]),
    );
    if (!entries.length)
      throw new Error("La configuración no contiene piezas.");
    const loaded = await Promise.allSettled(
      entries.map(async ([slot, id]) => {
        const object = await this.instantiate(id, config);
        const group = new Group();
        group.name = slot;
        group.userData = { slot, assetId: id };
        group.add(object);
        return group;
      }),
    );
    const groups = loaded.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const failure = loaded.find((result) => result.status === "rejected");
    if (failure || this.disposed || revision !== this.revision) {
      groups.forEach(disposeInstance);
      if (revision !== this.revision || this.disposed) return false;
      if (failure?.status === "rejected") throw failure.reason;
      return false;
    }
    const previous = [...this.root.children];
    this.root.clear();
    this.root.add(...groups);
    this.root.updateMatrixWorld(true);
    previous.forEach(disposeInstance);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.revision;
    [...this.root.children].forEach(disposeInstance);
    this.root.clear();
  }
}
