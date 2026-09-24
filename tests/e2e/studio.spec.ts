import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { StudioData } from "../../src/types/studio.ts";

async function ready(page: Page) {
  await expect(page.getByRole("main", { name: "Estudio 3D" })).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "Exportar GLB", exact: true }),
  ).toBeEnabled();
}

test("real catalog editing, history, persistence and embedded GLB export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Girl · 02", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Ojos", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("input[type=color]")).toHaveCount(0);
  for (const category of ["Cuerpo", "Cara"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: category, exact: true })
      .click();
    await expect(
      page.locator(".options-panel .asset-card").first(),
    ).toHaveAttribute("aria-pressed", "true");
    await page.locator(".options-panel .asset-card").first().click();
    await ready(page);
  }
  await expect(
    page.getByRole("button", { name: "Deshacer", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cabello", exact: true }).click();
  const styles = page.locator(
    ".options-panel > .panel-scroll > .asset-grid .asset-card",
  );
  await expect(styles).toHaveCount(3);
  await styles.nth(2).click();
  await ready(page);
  await expect(styles.nth(2)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await ready(page);
  await expect(styles.nth(1)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Rehacer", exact: true }).click();
  await ready(page);
  await expect(styles.nth(2)).toHaveAttribute("aria-pressed", "true");
  await styles.nth(1).click();
  await ready(page);
  await page.getByRole("button", { name: "Diseño 02", exact: true }).click();
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Diseño 02", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "reports/inspection/studio-hair-blonde.png" });
  const canvas = page.locator("canvas");
  const before = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2, {
    steps: 12,
  });
  await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, -250);
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(false);
  await page.getByRole("button", { name: "Acercar a la cara" }).click();
  await page.screenshot({ path: "reports/inspection/studio-face.png" });
  await page.getByRole("button", { name: "Centrar cámara" }).click();
  const savedEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Guardar preset", exact: true })
    .click();
  const saved = await savedEvent;
  expect(saved.suggestedFilename()).toBe("MyCharacter.json");
  const savedPath = (await saved.path())!;
  const original = await readFile(savedPath, "utf8");
  expect(original.length).toBeLessThan(10000);
  await page.getByRole("button", { name: "Restablecer personaje" }).click();
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Diseño 01", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator("input[type=file]").setInputFiles({
    name: "MyCharacter.json",
    mimeType: "application/json",
    buffer: Buffer.from(original),
  });
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Diseño 02", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const glbEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar GLB", exact: true }).click();
  const glbDownload = await glbEvent;
  expect(glbDownload.suggestedFilename()).toMatch(
    /^Character_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.glb$/,
  );
  const glb = await readFile((await glbDownload.path())!);
  await glbDownload.saveAs("reports/inspection/verified-character.glb");
  expect(glb.readUInt32LE(0)).toBe(0x46546c67);
  expect(glb.readUInt32LE(8)).toBe(glb.length);
  const json = JSON.parse(
    glb.subarray(20, 20 + glb.readUInt32LE(12)).toString(),
  ) as {
    nodes: { name?: string }[];
    images: { bufferView?: number; uri?: string }[];
    cameras?: unknown[];
    meshes: unknown[];
  };
  expect(json.nodes[0]?.name).toBe("CharacterRoot");
  expect(json.cameras).toBeUndefined();
  expect(json.images.length).toBe(3);
  expect(
    json.images.every((image) => image.bufferView !== undefined && !image.uri),
  ).toBe(true);
  expect(json.meshes.length).toBe(3);
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole("region", { name: "Recuperar sesión" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recuperar", exact: true }).click();
  await ready(page);
  await page.getByRole("button", { name: "Cabello", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Diseño 02", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "reports/inspection/studio-desktop.png" });
  expect(errors).toEqual([]);
});

test("mobile layout and import validation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await ready(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect((await page.locator("canvas").boundingBox())!.height).toBeGreaterThan(
    230,
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar aviso" }).click();
  await page.screenshot({ path: "reports/inspection/studio-mobile.png" });
});

test("dynamic opacity is embedded without mutating visible textures", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  const result = await page.evaluate(async () => {
    const exportPath = "/src/export/exportCharacter.ts";
    const scenePath = "/tests/e2e/browser-fixtures.ts";
    const { exportCharacter } = (await import(
      exportPath
    )) as typeof import("../../src/export/exportCharacter.ts");
    const { CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry } =
      (await import(scenePath)) as typeof import("three");
    const color = document.createElement("canvas");
    color.width = 2;
    color.height = 2;
    const ctx = color.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 2, 2);
    const mask = document.createElement("canvas");
    mask.width = 2;
    mask.height = 2;
    const maskCtx = mask.getContext("2d")!;
    maskCtx.fillStyle = "#008000";
    maskCtx.fillRect(0, 0, 2, 2);
    const material = new MeshStandardMaterial({
      map: new CanvasTexture(color),
      alphaMap: new CanvasTexture(mask),
      transparent: true,
    });
    const root = new Group();
    root.add(new Mesh(new PlaneGeometry(), material));
    const buffer = await exportCharacter(root);
    const view = new DataView(buffer);
    const jsonLength = view.getUint32(12, true);
    const doc = JSON.parse(
      new TextDecoder().decode(buffer.slice(20, 20 + jsonLength)),
    ) as {
      images: { bufferView: number }[];
      bufferViews: { byteOffset?: number; byteLength: number }[];
    };
    const imageView = doc.bufferViews[doc.images[0]!.bufferView]!;
    const offset = 28 + jsonLength + (imageView.byteOffset ?? 0);
    const image = await createImageBitmap(
      new Blob([buffer.slice(offset, offset + imageView.byteLength)], {
        type: "image/png",
      }),
    );
    const output = document.createElement("canvas");
    output.width = 2;
    output.height = 2;
    const outputCtx = output.getContext("2d")!;
    outputCtx.drawImage(image, 0, 0);
    return {
      pixel: [...outputCtx.getImageData(0, 0, 1, 1).data],
      unchanged:
        material.map!.image === color && material.alphaMap!.image === mask,
    };
  });
  expect(result.unchanged).toBe(true);
  expect(result.pixel).toEqual([255, 0, 0, 128]);
});

test("failed OBJ keeps the current character and retries without duplicate cached loads", async ({
  page,
}) => {
  const requested = new Map<string, number>();
  page.on("request", (request) => {
    if (request.url().includes("/asset-files/"))
      requested.set(request.url(), (requested.get(request.url()) ?? 0) + 1);
  });
  const response = await page.request.get("/studio-data.json");
  const data = (await response.json()) as StudioData;
  const target = data.assets.find(
    (asset) => asset.name === "Hair205_Standard",
  )!;
  await page.route(`**/asset-files/${target.mesh.id}`, (route) =>
    route.fulfill({ status: 503, body: "Simulated test failure" }),
  );
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Cabello", exact: true }).click();
  const styles = page.locator(
    ".options-panel > .panel-scroll > .asset-grid .asset-card",
  );
  await styles.nth(0).click();
  await ready(page);
  await expect(page.getByRole("alert")).toContainText(
    "Tu personaje anterior se ha conservado",
  );
  await expect(styles.nth(1)).toHaveAttribute("aria-pressed", "true");
  await page.unroute(`**/asset-files/${target.mesh.id}`);
  await styles.nth(0).click();
  await ready(page);
  await expect(styles.nth(0)).toHaveAttribute("aria-pressed", "true");
  await styles.nth(1).click();
  await ready(page);
  const body = data.assets.find((asset) => asset.name === "Body002_Standard")!;
  expect(
    requested.get(`http://127.0.0.1:5173/asset-files/${body.mesh.id}`),
  ).toBe(1);
  const saved = await page.evaluate(() =>
    localStorage.getItem("character-studio:configuration:v1"),
  );
  const config = JSON.parse(saved!) as { selections: Record<string, string> };
  config.selections.hair = "asset-removed";
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "old.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(config)),
    });
  await ready(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.locator(
      ".options-panel > .panel-scroll > .asset-grid .asset-card[aria-pressed=true]",
    ),
  ).toHaveCount(1);
});

test("tablet debug helpers do not affect configuration history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/?debug=1");
  await ready(page);
  await page.getByText("Inspector de desarrollo", { exact: true }).click();
  await page.getByRole("checkbox", { name: "bounds", exact: true }).check();
  await page.getByRole("checkbox", { name: "axes", exact: true }).check();
  await page.getByRole("checkbox", { name: "wireframe", exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Deshacer", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1024);
  await page.screenshot({ path: "reports/inspection/studio-tablet-debug.png" });
  expect(errors).toEqual([]);
});
