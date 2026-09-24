import { test, expect } from "@playwright/test";
import type { StudioData } from "../../src/types/studio.ts";

test("slow loads show feedback; cached changes and no-op selections do not flash a loader", async ({
  page,
}) => {
  const data = (await (
    await page.request.get("/studio-data.json")
  ).json()) as StudioData;
  const hair = data.assets.find((asset) => asset.name === "Hair205_Standard")!;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/asset-files/${hair.mesh.id}`, async (route) => {
    await blocked;
    await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Cabello", exact: true }).click();
  const canvas = page.locator("canvas");
  const before = await canvas.screenshot();
  await canvas.focus();
  await canvas.press("ArrowRight");
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(false);
  await expect(
    page.getByRole("button", { name: "Deshacer", exact: true }),
  ).toBeDisabled();
  await canvas.press("Home");
  await page.getByRole("button", { name: "Hair 205", exact: true }).click();
  await expect(page.locator(".loading-state")).toBeVisible();
  release();
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  await page.unroute(`**/asset-files/${hair.mesh.id}`);
  await page.evaluate(() => {
    const observer = new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (
            node instanceof HTMLElement &&
            (node.matches(".loading-state") ||
              node.querySelector(".loading-state"))
          )
            document.body.dataset.loaderFlashed = "true";
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole("button", { name: "Hair 210", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Hair 210", exact: true }).click();
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-loader-flashed",
    "true",
  );
});
