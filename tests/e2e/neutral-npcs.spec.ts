import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('neutral NPC presets render and their exported GLB reloads', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await mkdir('reports/neutral-npcs', { recursive: true });
  await page.goto('/');
  await expect(page.getByRole('main', { name: 'Estudio 3D' })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'NPC Female · 01 · Neutral', exact: true }).click();
  await expect(page.getByRole('main', { name: 'Estudio 3D' })).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: 'NPC Female · 01 · Neutral', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Exportar GLB', exact: true })).toBeEnabled();
  for (let i = 0; i < 5; i++) {
    const result = await page.evaluate(async index => {
      const modulePath = '/tests/e2e/neutral-preview.ts';
      return (await import(modulePath) as typeof import('./neutral-preview.ts')).showNeutral(index);
    }, i);
    expect(result.vertices).toBeGreaterThan(1000);
    expect(result.bytes).toBeGreaterThan(1000);
    await page.locator('#neutral-preview canvas').screenshot({ path: `reports/neutral-npcs/${i}.png` });
  }
  expect(errors).toEqual([]);
});
