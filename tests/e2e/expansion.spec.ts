import {test,expect} from '@playwright/test';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';

test('prepared packs render for visual review',async({page})=>{
  test.setTimeout(120_000);
  await mkdir('reports/expansion',{recursive:true});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:480,height:640});await page.goto('/');
  for(const folder of await readdir('content/characters')) {
    const pack=JSON.parse(await readFile(`content/characters/${folder}/assembly.json`,'utf8')) as {name:string;variant:string};
    const metrics=await page.evaluate(async(pack)=>{
      const path='/tests/e2e/pack-preview.ts';
      return (await import(path) as typeof import('./pack-preview.ts')).previewPack(pack.name,pack.variant);
    },pack);
    expect(metrics.length).toBeGreaterThanOrEqual(3);
    await writeFile(`reports/expansion/${folder}.json`,JSON.stringify(metrics,null,2));
    await page.locator('#pack-preview canvas').screenshot({path:`reports/expansion/${folder}-full.png`});
    await page.evaluate(async()=>{const path='/tests/e2e/pack-preview.ts';await (await import(path) as typeof import('./pack-preview.ts')).facePack();});
    await page.locator('#pack-preview canvas').screenshot({path:`reports/expansion/${folder}-face.png`});
    await page.locator('#pack-preview canvas').focus();
    for(let i=0;i<26;i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Home');
    await page.locator('#pack-preview canvas').screenshot({path:`reports/expansion/${folder}-back.png`});
  }
  expect(errors).toEqual([]);
});

test('imported characters use a bounded number of draw calls and fast cached switches',async({page})=>{
  await page.goto('/');
  const results=await page.evaluate(async()=>{const path='/tests/e2e/performance-runtime.ts';return (await import(path) as typeof import('./performance-runtime.ts')).measureSwitches();});
  await mkdir('reports/expansion',{recursive:true});
  await writeFile('reports/expansion/performance.json',JSON.stringify(results,null,2));
  for(const result of results.switches){expect(result.drawCalls).toBeLessThanOrEqual(6);expect(result.warmMs).toBeLessThan(200);expect(result.triangles).toBeGreaterThan(10_000);}
  expect(results.identicalOutfitTexturesShared).toBe(true);
});
