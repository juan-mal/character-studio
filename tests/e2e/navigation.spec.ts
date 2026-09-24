import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decodePng } from '../../src/materials/pngPixels.ts';

async function characterHeight(image: Buffer): Promise<number> {
  const bytes = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer;
  const pixels = await decodePng(bytes);
  let minY = pixels.height, maxY = -1;
  for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++) {
    const offset = (y * pixels.width + x) * 4;
    const distance = Math.abs(pixels.data[offset]! - 247) + Math.abs(pixels.data[offset + 1]! - 247) + Math.abs(pixels.data[offset + 2]! - 245);
    if (distance > 70) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  return maxY - minY + 1;
}

test('left drag moves framing, right drag rotates, zoom and pan do not modify the saved character', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy','false');
  const save = async () => {
    const event = page.waitForEvent('download');
    await page.getByRole('button',{name:'Guardar preset',exact:true}).click();
    return readFile((await (await event).path())!,'utf8');
  };
  const configuration = await save();
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width/2, y = box.y + box.height/2;
  const initial = await canvas.screenshot();
  await page.mouse.move(x,y);
  await page.mouse.down({button:'left'});
  await page.mouse.move(x,y-110,{steps:15});
  await page.mouse.up({button:'left'});
  await expect.poll(async ()=>(await canvas.screenshot()).equals(initial)).toBe(false);
  const panned = await canvas.screenshot();
  await page.mouse.move(x,y);
  await page.mouse.down({button:'right'});
  await page.mouse.move(x+100,y,{steps:15});
  await page.mouse.up({button:'right'});
  await expect.poll(async ()=>(await canvas.screenshot()).equals(panned)).toBe(false);
  await page.mouse.wheel(0,-350);
  await canvas.focus();
  await canvas.press('Shift+ArrowDown');
  const zoomedHeight = await characterHeight(await canvas.screenshot());
  await expect(page.getByRole('button',{name:'Deshacer',exact:true})).toBeDisabled();
  expect(await save()).toBe(configuration);
  await page.getByRole('button',{name:'Centrar cámara',exact:true}).click();
  const centeredHeight = await characterHeight(await canvas.screenshot());
  expect(Math.abs(centeredHeight - zoomedHeight) / zoomedHeight).toBeLessThan(.03);
  expect(errors).toEqual([]);
});
