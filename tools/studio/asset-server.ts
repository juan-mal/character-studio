import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type {
  AssetCatalog,
  CompatibilityCatalog,
  FileRecord,
  Preset,
} from "../../src/assets/types.ts";
import type { StudioData } from "../../src/types/studio.ts";
import { expandSource } from "../assets/files.ts";

const generated = [
  "assets.generated.json",
  "compatibility.generated.json",
  "presets.generated.json",
];
const mime: Record<string, string> = {
  ".obj": "text/plain",
  ".mtl": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
};
export interface ResourceManifest {
  data: StudioData;
  files: Map<string, { record: FileRecord; absolutePath: string }>;
}
export async function loadResourceManifest(
  root: string,
): Promise<ResourceManifest> {
  const [assets, compatibility, presets] = await Promise.all(
    generated.map(
      async (name) =>
        JSON.parse(
          await readFile(path.join(root, "src/generated", name), "utf8"),
        ) as unknown,
    ),
  );
  const catalog = assets as AssetCatalog;
  const data: StudioData = {
    assets: catalog.assets,
    images: catalog.images,
    materials: catalog.materials,
    compatibility: compatibility as CompatibilityCatalog,
    presets: (presets as { presets: Preset[] }).presets,
  };
  const records: FileRecord[] = [
    ...catalog.assets.map((a) => a.mesh),
    ...catalog.images,
    ...catalog.materials,
    ...catalog.relatedFiles,
  ];
  const files = new Map<string, { record: FileRecord; absolutePath: string }>();
  const roots = new Map(
    catalog.sources.map((source) => [
      source.id,
      expandSource(root, source.path),
    ]),
  );
  for (const record of records) {
    const sourceRoot = roots.get(record.sourceId);
    if (!sourceRoot) throw new Error(`Fuente desconocida para ${record.path}`);
    const absolutePath = path.resolve(sourceRoot, record.relativePath);
    if (!isContained(sourceRoot, absolutePath))
      throw new Error(`Asset fuera de su fuente: ${record.path}`);
    files.set(record.id, { record, absolutePath });
  }
  return { data, files };
}
export function isContained(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}
async function serveResource(
  manifest: ResourceManifest,
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): Promise<void> {
  const requestPath = (req.url ?? "").split("?")[0];
  if (requestPath === "/studio-data.json") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.end(JSON.stringify(manifest.data));
    return;
  }
  if (!requestPath?.startsWith("/asset-files/")) {
    next();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end();
    return;
  }
  const id = requestPath.slice("/asset-files/".length);
  const resource = manifest.files.get(id);
  if (!resource) {
    res.statusCode = 404;
    res.end("Recurso no encontrado");
    return;
  }
  try {
    // Re-resolve the original path to prevent a replaced symlink from opening unrelated files.
    const actual = await realpath(resource.absolutePath);
    const canonicalParent = await realpath(path.dirname(resource.absolutePath));
    if (!isContained(canonicalParent, actual))
      throw new Error("El recurso apunta fuera de su carpeta");
    const info = await stat(actual);
    if (!info.isFile()) throw new Error("El recurso no es un archivo");
    res.setHeader(
      "Content-Type",
      mime[resource.record.extension] ?? "application/octet-stream",
    );
    res.setHeader("Content-Length", info.size);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = createReadStream(actual);
    stream.on("error", () => {
      res.destroy();
    });
    stream.pipe(res);
  } catch {
    res.statusCode = 404;
    res.end(
      "El archivo original no está disponible. Ejecuta assets:scan después de revisar las fuentes.",
    );
  }
}
export function studioAssetsPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: "character-studio-local-assets",
    configResolved(config) {
      root = config.root;
    },
    async configureServer(server) {
      let manifest = await loadResourceManifest(root);
      server.middlewares.use((req, res, next) => {
        void serveResource(manifest, req, res, next);
      });
      const watched = generated.map((name) =>
        path.join(root, "src/generated", name),
      );
      server.watcher.add(watched);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onChange = (file: string): void => {
        if (!watched.includes(file)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void loadResourceManifest(root)
            .then((value) => {
              manifest = value;
              server.ws.send({ type: "full-reload" });
            })
            .catch((error) => server.config.logger.error(String(error)));
        }, 500);
      };
      server.watcher.on("change", onChange);
      server.httpServer?.once("close", () => {
        if (timer) clearTimeout(timer);
        server.watcher.off("change", onChange);
      });
    },
    async writeBundle(options) {
      const manifest = await loadResourceManifest(root);
      const outDir = path.resolve(root, options.dir ?? "dist");
      if (!isContained(root, outDir) || outDir === root)
        throw new Error(
          "La compilación debe escribir en una subcarpeta del proyecto",
        );
      const directory = path.join(outDir, "asset-files");
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(outDir, "studio-data.json"),
        JSON.stringify(manifest.data),
      );
      const resources = [...manifest.files.values()];
      // Bounded parallel copies; never write back to source directories.
      let cursor = 0;
      await Promise.all(
        Array.from({ length: 8 }, async () => {
          while (cursor < resources.length) {
            const item = resources[cursor++]!;
            await copyFile(
              item.absolutePath,
              path.join(directory, item.record.id),
            );
          }
        }),
      );
    },
    configurePreviewServer(server) {
      // Static preview sets MIME by extension, while IDs deliberately have none.
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/asset-files/"))
          res.setHeader("Cache-Control", "no-cache");
        next();
      });
    },
  };
}
