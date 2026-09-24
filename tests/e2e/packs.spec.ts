import { test, expect } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
test('inspect prepared character packs',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:480,height:640});await page.goto('/');
 await mkdir('reports/packs',{recursive:true});
 for(const name of ['Amber','Barbara']){
  const metrics=await page.evaluate(async(name)=>{const p='/tests/e2e/pack-preview.ts';return (await import(p) as typeof import('./pack-preview.ts')).previewPack(name);},name);
  await writeFile(`reports/packs/${name}.json`,JSON.stringify(metrics,null,2));
  await page.locator('#pack-preview canvas').screenshot({path:`reports/packs/${name}-full.png`});
  await page.evaluate(async()=>{const p='/tests/e2e/pack-preview.ts';await (await import(p) as typeof import('./pack-preview.ts')).facePack();});
  await page.locator('#pack-preview canvas').screenshot({path:`reports/packs/${name}-face.png`});
  await page.locator('#pack-preview canvas').focus();for(let i=0;i<26;i++)await page.keyboard.press('ArrowRight');
  await page.locator('#pack-preview canvas').screenshot({path:`reports/packs/${name}-back.png`});
  await page.keyboard.press('Home');
  await page.locator('#pack-preview canvas').screenshot({path:`reports/packs/${name}-back-full.png`});
 }
 expect(errors).toEqual([]);
});

test('new presets have previews, keep their own compatible pieces and export from the UI',async({page})=>{
 test.setTimeout(120_000);
 await page.goto('/');await expect(page.getByRole('main')).toHaveAttribute('aria-busy','false');
 const names = await page.evaluate(async()=>{
  const data = await (await fetch('/studio-data.json')).json() as import('../../src/types/studio.ts').StudioData;
  return data.presets.flatMap(preset=>preset.displayName ? [preset.displayName] : []);
 });
 expect(names.length).toBeGreaterThanOrEqual(12);
 for(const name of names){
  const card=page.getByRole('button',{name,exact:true});await expect(card.locator('img')).toBeVisible();await card.click();
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy','false');
  await page.getByRole('button',{name:'Cabello',exact:true}).click();
  expect(await page.locator('.options-panel > .panel-scroll > .asset-grid .asset-card').count()).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.options-panel > .panel-scroll > .asset-grid .asset-card[aria-pressed="true"]')).toHaveCount(1);
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar GLB',exact:true}).click();
  await (await event).saveAs(`reports/packs/${name}.glb`);
  await page.getByRole('button',{name:'Presets',exact:true}).click();
 }
 await page.screenshot({path:'reports/packs/catalog.png'});
});
