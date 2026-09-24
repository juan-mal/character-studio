import type { FileRecord } from "../assets/types.ts";

const normalize = (path: string): string => {
  const output: string[] = [];
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!output.length) return "";
      output.pop();
    } else output.push(segment);
  }
  return output.join("/").toLowerCase();
};

/** All references resolve to opaque, registered file IDs; no client filesystem paths. */
export class InventoryResolver {
  private readonly records: FileRecord[];
  private readonly byId: Map<string, FileRecord>;

  constructor(records: FileRecord[]) {
    this.byId = new Map(records.map((record) => [record.id, record]));
    this.records = [...this.byId.values()];
  }

  url(id: string): string {
    if (!this.byId.has(id))
      throw new Error("El recurso no está registrado en el inventario.");
    return `/asset-files/${encodeURIComponent(id)}`;
  }

  resolve(
    reference: string,
    sourceId: string,
    referringFile: string,
  ): FileRecord | undefined {
    let path = reference.trim().replaceAll("\\", "/");
    try {
      path = decodeURIComponent(path);
    } catch {
      return undefined;
    }
    if (path.startsWith("/asset-files/"))
      return this.byId.get(path.slice("/asset-files/".length));
    if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("/"))
      return undefined;
    const directory = referringFile
      .replaceAll("\\", "/")
      .split("/")
      .slice(0, -1)
      .join("/");
    const relative = normalize(`${directory}/${path}`);
    const direct = this.records.find(
      (record) =>
        record.sourceId === sourceId &&
        normalize(record.relativePath) === relative,
    );
    if (direct) return direct;
    const basename = path.split("/").at(-1)?.toLowerCase();
    const fallback = this.records.filter(
      (record) =>
        record.sourceId === sourceId && record.name.toLowerCase() === basename,
    );
    return fallback.length === 1 ? fallback[0] : undefined;
  }
}
