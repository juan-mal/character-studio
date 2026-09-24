import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { CharacterConfiguration } from "../../src/types/studio.ts";
import AxeBuilder from "@axe-core/playwright";

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1024, 768],
  [390, 844],
]) {
  test(`audit viewport ${width}x${height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        (message.type() === "error" || message.type() === "warning") &&
        !message.text().includes("GPU stall due to ReadPixels")
      )
        errors.push(message.text());
    });
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/");
    await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width!);
    await expect(
      page.getByRole("button", { name: "Restablecer personaje" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cabello", exact: true }).click();
    await page.screenshot({
      path: `reports/audit/viewport-${width}x${height}.png`,
    });
    expect(
      (await page.locator("canvas").boundingBox())!.height,
    ).toBeGreaterThan(230);
    expect(errors).toEqual([]);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    await writeFile(
      `reports/audit/accessibility-${width}.json`,
      JSON.stringify(accessibility.violations, null, 2),
    );
    expect(
      accessibility.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });
}

test("downloaded GLB roundtrip, exact JSON restoration and bounded resource stress", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  const firstEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Guardar preset", exact: true })
    .click();
  const file = await firstEvent;
  const text = await readFile((await file.path())!, "utf8");
  const config = JSON.parse(text) as CharacterConfiguration;
  await page.getByRole("button", { name: "Girl · 03", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Rehacer", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  await page.locator("input[type=file]").setInputFiles({
    name: "original.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  const secondEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Guardar preset", exact: true })
    .click();
  expect(
    JSON.parse(await readFile((await (await secondEvent).path())!, "utf8")),
  ).toEqual(config);
  const glbEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar GLB", exact: true }).click();
  const downloaded = await glbEvent;
  await mkdir('reports/audit', {recursive:true});
  await downloaded.saveAs('reports/audit/character-roundtrip.glb');
  const downloadedGlb = (await readFile((await downloaded.path())!)).toString(
    "base64",
  );
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/asset-files/")) requests.push(request.url());
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const before = await cdp.send("Performance.getMetrics");
  const result = await page.evaluate(
    async ({ config, downloadedGlb }) => {
      const modulePath = "/tests/e2e/audit-runtime.ts";
      const { auditRuntime } = (await import(
        modulePath
      )) as typeof import("./audit-runtime.ts");
      return auditRuntime(config, downloadedGlb);
    },
    { config, downloadedGlb },
  );
  await cdp.send("HeapProfiler.collectGarbage");
  const after = await cdp.send("Performance.getMetrics");
  await mkdir("reports/audit", { recursive: true });
  await writeFile(
    "reports/audit/glb-roundtrip.png",
    Buffer.from(result.roundtripImage.split(",")[1]!, "base64"),
  );
  await writeFile(
    "reports/audit/glb-original.png",
    Buffer.from(result.originalImage.split(",")[1]!, "base64"),
  );
  await writeFile(
    "reports/audit/runtime.json",
    JSON.stringify(
      {
        ...result,
        roundtripImage: undefined,
        originalImage: undefined,
        requests,
        browserBefore: before,
        browserAfter: after,
      },
      null,
      2,
    ),
  );
  expect(result.exported.forbidden).toBe(0);
  expect(result.exported.meshes.length).toBe(3);
  for (let i = 0; i < 3; i++) {
    const original = result.original.meshes[i]!;
    const exported = result.exported.meshes[i]!;
    expect(exported.triangles).toBe(original.triangles);
    expect(exported.maps).toBe(original.maps);
    expect(exported.color).toBe(original.color);
    expect(original.unlit).toBe(true);
    expect(exported.unlit).toBe(true);
    expect(exported.colorVertices).toBe(original.vertices);
    original.bounds.forEach((value, j) =>
      expect(exported.bounds[j]).toBeCloseTo(value, 5),
    );
  }
  expect(result.meanPixelDifference).toBeLessThan(0.01);
  // Tiny edge rasterization differences are tolerated; a dark facial region is not.
  expect(result.maxRegionDifference).toBeLessThan(1);
  expect(result.materialIsolation).toEqual({
    unconfirmedTintIgnored: true,
    confirmedTint: "123456",
    exportedTint: "123456",
    materialCloned: true,
    mapPreserved: true,
    geometryPreserved: true,
    designChanged: true,
    uvPreserved: true,
  });
  expect(result.variantChecks.length).toBeGreaterThanOrEqual(16);
  expect(result.variantChecks.every(check=>check.meanPixelDifference<0.01)).toBe(true);
  expect(result.warmMemory).toEqual(result.stressMemory);
  expect(result.disposedMemory).toEqual(result.baselineMemory);
  expect(result.instances).toBe(5);
  expect(new Set(requests).size).toBe(requests.length);
  expect(errors).toEqual([]);
});
