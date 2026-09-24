import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const members=['Amber-Default','Amber-Alternate','Barbara-Default','Barbara-Summer','Keqing-Default','Mona-Default','Noelle-Default','Xiangling-Default'];
test('review head exchanges in original coordinates',async({page})=>{
  test.setTimeout(180_000);await page.setViewportSize({width:400,height:540});await page.goto('/');
  await mkdir('reports/head-mixes',{recursive:true});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const cases=members.flatMap(body=>members.filter(hair=>body==='Amber-Default'||body==='Barbara-Summer'||hair==='Keqing-Default').map(hair=>({body,hair,face:members[(members.indexOf(hair)+3)%members.length]!})));
  for(const [i,entry] of cases.entries()){
    await page.evaluate(async(entry)=>{const path='/tests/e2e/pack-preview.ts';await (await import(path) as typeof import('./pack-preview.ts')).previewPack('Amber','Default',{body:entry.body,hair:entry.hair,face:entry.face,eyes:entry.face,brows:entry.face});},entry);
    await page.locator('#pack-preview canvas').screenshot({path:`reports/head-mixes/${i}-full.png`});
    await page.evaluate(async()=>{const path='/tests/e2e/pack-preview.ts';await (await import(path) as typeof import('./pack-preview.ts')).facePack();});
    await page.locator('#pack-preview canvas').screenshot({path:`reports/head-mixes/${i}-face.png`});
  }
  await writeFile('reports/head-mixes/cases.json',JSON.stringify(cases,null,2));expect(errors).toEqual([]);
});
